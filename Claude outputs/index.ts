import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy, extractText } from "https://esm.sh/unpdf@0.12.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = "openai/gpt-oss-120b";

// General resume review, v2. v1 shipped a scorecard + a flat "fixes" list.
// This version adds the actual point of the tool: a red-ink, in-manuscript
// critique — structured "edits" anchored to exact spans of the student's own
// resume text, so the frontend can mark them up inline (strikethroughs,
// insertions, margin comments) instead of just handing back abstract advice.
// Feedback is also tailored to the student's own major/school/class
// year/GPA, and both the scoring and the tailoring are grounded in an
// explicit rubric below rather than left to free-form model judgment.
// Per-scholarship tailored review is still a deliberate phase 2, not built
// here. PDF-only for now — DOC/DOCX text extraction in Deno is unreliable
// enough that shipping it half-working would be worse than asking for a PDF.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const EDIT_TYPES = ["cut", "rewrite", "add", "note"];
const EDIT_CATEGORIES = ["ats_readability", "clarity", "impact", "completeness", "tailoring"];
const PRIORITIES = ["high", "medium", "low"];

// The rubric below is the "credibility" layer: instead of letting the model
// freelance what makes a resume good, it's handed the same framework a
// campus career-center coach would use, plus an explicit field-emphasis
// table so tailoring by major is consistent rather than improvised per call.
const REVIEW_SYSTEM_PROMPT = `You are an experienced career coach giving a college student a red-ink, in-manuscript critique of their resume ahead of scholarship and internship applications. You mark up their actual resume text the way a coach would with a red pen — cutting weak lines, rewriting weak bullets, and adding margin notes — not just handing back generic advice.

You will be given: (1) the student's major, school, class year, and GPA, and (2) the plain-text contents of their resume (extracted from a PDF, so original formatting/whitespace is lost — judge structure from section headers and line breaks only, never fault them for PDF-extraction artifacts).

RUBRIC (use this, not your own freeform judgment, to decide what's wrong and what's tailored):
- Bullet quality ("impact"): a strong bullet states an action verb + a concrete task + a measurable result or scope ("Led X, resulting in Y% / $Y / N people/hours"). A bullet that only lists a duty with no outcome is weak — rewrite it, don't just flag it.
- ATS readability ("ats_readability"): standard section headers (EDUCATION, EXPERIENCE, PROJECTS, SKILLS, etc.), consistent date formatting, no evidence of tables/columns/graphics described in the text, no walls of unstructured text.
- Clarity ("clarity"): concise, active voice, no jargon the reader has to decode, no redundant phrasing.
- Completeness ("completeness"): contact info, education (with GPA if 3.0+), experience/activities, skills, and — for technical majors — a projects section. Missing expected sections should generate an "add" edit, not just a lowered score.
- Tailoring to the student ("tailoring"): at least one edit must speak directly to THIS student's stated major and class year, using this field-emphasis guide:
  - Computer Science / Engineering / Math: technical stack, links to GitHub/portfolio, project scale and measurable impact.
  - Business / Economics: leadership roles, quantified business impact (revenue, efficiency, growth %), competitions.
  - Biology / Nursing / Pre-Med / Health Sciences: certifications, clinical/lab hours, patient- or research-facing experience.
  - Psychology / Sociology / Political Science / Communications / English: research, writing samples, publications, advocacy or policy-relevant internships.
  - Education: classroom, tutoring, or mentorship experience, relevant certifications.
  - Any other major: use judgment but stay concrete to that field.
  Also calibrate expectations to class year and GPA — do not expect senior-level accomplishments from an early-year student, and call out a strong GPA (3.5+) as worth surfacing if it isn't already visible.

Return ONLY valid JSON (no markdown fences, no commentary outside the JSON) matching exactly this shape:
{
  "overall_score": <integer 0-100>,
  "category_scores": {
    "ats_readability": <integer 0-100>,
    "clarity": <integer 0-100>,
    "impact": <integer 0-100>,
    "completeness": <integer 0-100>
  },
  "summary": "<one to two sentence overview of where this resume stands>",
  "tailored_note": "<1-3 sentences speaking directly to this student's own major, class year, and stats — what to prioritize given their field>",
  "edits": [
    {
      "type": "cut" | "rewrite" | "add" | "note",
      "anchor": "<a SHORT (roughly 8-100 characters) substring COPIED EXACTLY, character-for-character, from the resume text below — this is how the app locates what you're marking up, so it must match verbatim, not be paraphrased>",
      "replacement": "<for 'rewrite': the improved version of the anchor text. for 'add': new text to insert right after the anchor. for 'cut' and 'note': empty string>",
      "comment": "<one short sentence, red-ink margin-note style, explaining the why>",
      "category": "ats_readability" | "clarity" | "impact" | "completeness" | "tailoring",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Rules for edits:
- Give between 6 and 14 edits, covering a mix of categories — do not produce only one category.
- Include at least one "tailoring" edit specific to the student's stated major.
- Include at least one "add" edit if an expected section or common detail (dates, links, quantification) is missing.
- Every "anchor" MUST be copied verbatim from the resume text — do not paraphrase, summarize, or invent text that isn't there. If you cannot find exact text to anchor a structural comment to, anchor it to the nearest real heading or line and use type "note".
- Be specific and reference what's actually on the page — never generic filler advice.
- Be encouraging but honest — this is a college student early in their career, not a seasoned professional.`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (!GROQ_API_KEY) {
    return jsonResponse(
      { error: "not_configured", message: "Resume review isn't set up yet. Add a GROQ_API_KEY secret to enable it." },
      500,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "unauthorized", message: "Missing authorization." }, 401);
    }

    // Scoped to the caller's own JWT, purely to resolve who they are.
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "unauthorized", message: "Not authenticated." }, 401);
    }
    const userId = userData.user.id;

    // Service-role client for storage + DB writes, independent of RLS.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Full profile now, not just resume_url — major/school/class year/GPA
    // are what make the "tailored" half of the critique possible.
    const { data: profile, error: profileError } = await admin
      .from("student_profiles")
      .select("resume_url, major, school, graduation_year, gpa")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.resume_url) {
      return jsonResponse(
        { error: "no_resume", message: "Upload a resume on your Profile page first." },
        400,
      );
    }

    const resumePath: string = profile.resume_url;
    const ext = (resumePath.split(".").pop() || "").toLowerCase();
    if (ext !== "pdf") {
      return jsonResponse(
        {
          error: "unsupported_format",
          message: "Resume review currently supports PDF only. Re-upload your resume as a PDF on your Profile page, then try again.",
        },
        400,
      );
    }

    // Throttle: a double-click or an eager "re-run" shouldn't burn a second
    // Groq call (free-tier rate limits) or write a near-duplicate row. If the
    // same user's most recent review for this exact file is under 20s old,
    // just hand back that one instead of generating a new one.
    const { data: recent } = await admin
      .from("resume_reviews")
      .select("*")
      .eq("user_id", userId)
      .eq("resume_path", resumePath)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 20_000) {
      return jsonResponse({ review: recent });
    }

    const { data: fileBlob, error: downloadError } = await admin.storage.from("resumes").download(resumePath);
    if (downloadError || !fileBlob) {
      throw downloadError || new Error("Could not download resume file.");
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const resumeText = (text || "").trim();

    if (resumeText.length < 40) {
      return jsonResponse(
        {
          error: "empty_text",
          message: "We couldn't read any text from this PDF — it may be a scanned image. Export a text-based PDF from Word or Google Docs and try again.",
        },
        400,
      );
    }

    // Truncated text is what actually gets sent to (and quoted back by) the
    // model — store this exact string so the frontend can anchor edits
    // against precisely what the model saw, not the full original text.
    const submittedText = resumeText.slice(0, 12000);

    const majorLabel = profile.major || "an undeclared major";
    const schoolLabel = profile.school || "their school";
    const gradYearLabel = profile.graduation_year ? `Class of ${profile.graduation_year}` : "an unspecified class year";
    const gpaLabel = profile.gpa != null ? Number(profile.gpa).toFixed(1) : "an unspecified GPA";
    const studentContext = `Student context: ${majorLabel} major at ${schoolLabel}, ${gradYearLabel}, GPA ${gpaLabel}.`;

    // Groq's free tier is fast but not instant — bound the call so a stalled
    // upstream request fails fast with a clear message instead of riding out
    // the edge function's own wall-clock limit.
    const groqController = new AbortController();
    const groqTimeout = setTimeout(() => groqController.abort(), 25_000);

    let groqRes: Response;
    try {
      groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: groqController.signal,
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: REVIEW_SYSTEM_PROMPT },
            { role: "user", content: `${studentContext}\n\nResume text:\n\n${submittedText}` },
          ],
        }),
      });
    } catch (fetchErr) {
      console.error("Groq request failed:", fetchErr);
      return jsonResponse(
        { error: "review_timeout", message: "Resume review is taking too long right now. Please try again." },
        504,
      );
    } finally {
      clearTimeout(groqTimeout);
    }

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API error:", groqRes.status, errText);
      return jsonResponse(
        { error: "review_failed", message: "Resume review is temporarily unavailable. Please try again shortly." },
        502,
      );
    }

    const groqJson = await groqRes.json();
    const content = groqJson?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from review model.");

    // response_format: json_object should guarantee raw JSON, but models
    // occasionally wrap it in a markdown fence anyway — strip that before
    // parsing rather than failing the whole review over a formatting slip.
    const cleanedContent = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedContent);
    } catch {
      console.error("Unparseable review model output:", content.slice(0, 500));
      throw new Error("Review model returned invalid JSON.");
    }

    const categoryScores = {
      ats_readability: clampScore(parsed?.category_scores?.ats_readability),
      clarity: clampScore(parsed?.category_scores?.clarity),
      impact: clampScore(parsed?.category_scores?.impact),
      completeness: clampScore(parsed?.category_scores?.completeness),
    };
    const overallScore = clampScore(
      parsed.overall_score ??
        (categoryScores.ats_readability + categoryScores.clarity + categoryScores.impact + categoryScores.completeness) / 4,
    );

    // Edits are the actual red-ink layer — validate defensively since the
    // whole markup UI depends on well-formed anchors, not just readable JSON.
    const edits = Array.isArray(parsed.edits)
      ? parsed.edits
          .filter((e: any) => e && typeof e.anchor === "string" && e.anchor.trim().length >= 3)
          .slice(0, 20)
          .map((e: any) => ({
            type: EDIT_TYPES.includes(e?.type) ? e.type : "note",
            anchor: String(e.anchor).slice(0, 300),
            replacement: String(e?.replacement || "").slice(0, 500),
            comment: String(e?.comment || "").slice(0, 400),
            category: EDIT_CATEGORIES.includes(e?.category) ? e.category : "clarity",
            priority: PRIORITIES.includes(e?.priority) ? e.priority : "medium",
          }))
      : [];
    const summary = String(parsed.summary || "").slice(0, 500);
    const tailoredNote = String(parsed.tailored_note || "").slice(0, 600);

    const { data: inserted, error: insertError } = await admin
      .from("resume_reviews")
      .insert({
        user_id: userId,
        resume_path: resumePath,
        overall_score: overallScore,
        category_scores: categoryScores,
        fixes: [],
        edits,
        summary,
        tailored_note: tailoredNote,
        resume_text: submittedText,
        model: `groq/${GROQ_MODEL}`,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return jsonResponse({ review: inserted });
  } catch (err) {
    console.error("resume-review error:", err);
    return jsonResponse(
      { error: "internal_error", message: "Something went wrong generating your review. Please try again." },
      500,
    );
  }
});
