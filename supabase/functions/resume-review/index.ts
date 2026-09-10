import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy, extractText } from "https://esm.sh/unpdf@0.12.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = "openai/gpt-oss-120b";

// General resume review, v3 — the "credibility layer" on top of v2's red-ink
// critique. v1 shipped a scorecard + a flat "fixes" list. v2 added
// in-manuscript, anchored red-ink edits tailored to the student's major.
//
// v3 exists because this tool is meant to be institutionalized — sat in
// front of career-services staff and school partners, not just students —
// so an LLM's raw, self-reported score is no longer good enough on its own.
// Two structural changes:
//
// 1. The model no longer gets the final say on the top-line number. It
//    still judges the four rubric categories, but `overall_score` is always
//    RECOMPUTED here as a fixed weighted formula over those categories
//    (see CATEGORY_WEIGHTS) — the model can't hand back an arbitrary number
//    disconnected from its own sub-scores, and the formula is the same for
//    every student, every time.
// 2. A small set of DETERMINISTIC, code-computed facts about the resume
//    (contact info present, standard sections found, how numeric/quantified
//    the writing is) are checked against the LLM's category scores and used
//    to floor/cap them — see applyDeterministicGuardrails. These facts can't
//    be hallucinated, and they double as the "understanding layer" the
//    frontend shows students so the score isn't a black box: it's part
//    rubric judgment, part checkable fact.
//
// Every edit's anchor is also re-verified server-side against the exact
// text the model saw (not just shape-validated) — an edit that can't be
// located in the resume text is dropped rather than shipped to the client,
// so the manuscript markup is never showing something it can't back up.
//
// rubric_version is stored per row so scoring methodology is versioned and
// auditable as it evolves, which matters once this is used across schools.

const RUBRIC_VERSION = "1.0";

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

// Fixed weights the platform uses to turn four category scores into one
// top-line number. Impact is weighted highest because a resume with weak,
// un-quantified bullets is the single most common reason a strong student
// gets screened out — the same reasoning a campus career coach would use.
const CATEGORY_WEIGHTS = {
  ats_readability: 0.25,
  clarity: 0.2,
  impact: 0.3,
  completeness: 0.25,
} as const;

function computeOverallScore(categoryScores: Record<string, number>): number {
  const weighted =
    categoryScores.ats_readability * CATEGORY_WEIGHTS.ats_readability +
    categoryScores.clarity * CATEGORY_WEIGHTS.clarity +
    categoryScores.impact * CATEGORY_WEIGHTS.impact +
    categoryScores.completeness * CATEGORY_WEIGHTS.completeness;
  return clampScore(weighted);
}

// Section headers we check for by plain regex — deliberately simple and
// deliberately NOT LLM-judged, so this can never be talked into a false
// positive. Order doubles as the "sections_expected" list shown to students.
const SECTION_PATTERNS: Record<string, RegExp> = {
  education: /\beducation\b/i,
  experience: /\b(experience|employment|work history)\b/i,
  skills: /\bskills?\b/i,
  projects: /\bprojects?\b/i,
};
const CORE_SECTIONS = ["education", "experience"];

interface DeterministicChecks {
  has_contact_info: boolean;
  sections_found: string[];
  sections_expected: string[];
  quantified_terms_per_100_words: number;
  word_count: number;
  anchors_verified: number;
  anchors_total: number;
}

function computeDeterministicChecks(resumeText: string): Omit<DeterministicChecks, "anchors_verified" | "anchors_total"> {
  const words = resumeText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const hasContactInfo =
    /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(resumeText) || /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(resumeText);

  const sectionsFound = Object.keys(SECTION_PATTERNS).filter((key) => SECTION_PATTERNS[key].test(resumeText));

  // How numeric/quantified the writing is, normalized per 100 words rather
  // than "per bullet" — PDF text extraction here merges pages and drops
  // line breaks, so bullet boundaries aren't reliably detectable from plain
  // text alone. Word-count normalization is honest about what we can
  // actually measure.
  const quantMatches = resumeText.match(/\$\d[\d,.]*|\d+(\.\d+)?%|\b\d{2,}\b/g) || [];
  const quantifiedTermsPer100Words = wordCount > 0 ? Math.round(((quantMatches.length / wordCount) * 100 + Number.EPSILON) * 10) / 10 : 0;

  return {
    has_contact_info: hasContactInfo,
    sections_found: sectionsFound,
    sections_expected: Object.keys(SECTION_PATTERNS),
    quantified_terms_per_100_words: quantifiedTermsPer100Words,
    word_count: wordCount,
  };
}

// Cross-checks the LLM's category scores against the facts above and caps
// (never raises) any score a fact directly contradicts. This is the
// "airtight" guarantee: no matter what the model says, a resume with no
// contact info can't score high on completeness, and a resume with almost
// no numbers in it can't score high on impact.
function applyDeterministicGuardrails(
  categoryScores: Record<string, number>,
  checks: Omit<DeterministicChecks, "anchors_verified" | "anchors_total">,
): Record<string, number> {
  const capped = { ...categoryScores };
  const missingCore = CORE_SECTIONS.filter((s) => !checks.sections_found.includes(s));

  if (!checks.has_contact_info) {
    capped.completeness = Math.min(capped.completeness, 55);
  }
  if (missingCore.length > 0) {
    capped.completeness = Math.min(capped.completeness, 60);
    capped.ats_readability = Math.min(capped.ats_readability, 65);
  }
  if (checks.quantified_terms_per_100_words < 0.5) {
    capped.impact = Math.min(capped.impact, 70);
  } else if (checks.quantified_terms_per_100_words < 1.5) {
    capped.impact = Math.min(capped.impact, 82);
  }
  return capped;
}

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
- Be encouraging but honest — this is a college student early in their career, not a seasoned professional.

Score the four categories honestly and independently — you do not need to compute an overall score yourself, the platform derives it from your category scores using a fixed formula.`;

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
    // against precisely what the model saw, not the full original text, and
    // so the deterministic checks below are computed on the same text the
    // model judged.
    const submittedText = resumeText.slice(0, 12000);
    const deterministicChecks = computeDeterministicChecks(submittedText);

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
          // Lowered from 0.4 — a scoring tool that's meant to be trusted by
          // institutions needs to give the same student roughly the same
          // score on repeated runs of the same resume, not drift with
          // sampling noise.
          temperature: 0.2,
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

    const rawCategoryScores = {
      ats_readability: clampScore(parsed?.category_scores?.ats_readability),
      clarity: clampScore(parsed?.category_scores?.clarity),
      impact: clampScore(parsed?.category_scores?.impact),
      completeness: clampScore(parsed?.category_scores?.completeness),
    };

    // Cross-check the model's own scores against checkable facts before
    // trusting them, then derive the one top-line number from a fixed
    // formula — never from whatever number the model happened to write.
    const categoryScores = applyDeterministicGuardrails(rawCategoryScores, deterministicChecks);
    const overallScore = computeOverallScore(categoryScores);

    // Edits are the actual red-ink layer — validate defensively since the
    // whole markup UI depends on well-formed anchors, not just readable JSON.
    const candidateEdits = Array.isArray(parsed.edits)
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

    // Re-verify every anchor actually appears in the exact text the model
    // was given (exact match, then case-insensitive fallback — same rule
    // the frontend uses to place markup). An edit that can't be located is
    // dropped here rather than shipped to the client: the manuscript view
    // should never show a critique it can't actually point to.
    const anchorsTotal = candidateEdits.length;
    const edits = candidateEdits.filter((e) => {
      if (submittedText.includes(e.anchor)) return true;
      return submittedText.toLowerCase().includes(e.anchor.toLowerCase());
    });
    const anchorsVerified = edits.length;

    const checks: DeterministicChecks = {
      ...deterministicChecks,
      anchors_verified: anchorsVerified,
      anchors_total: anchorsTotal,
    };

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
        rubric_version: RUBRIC_VERSION,
        checks,
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
