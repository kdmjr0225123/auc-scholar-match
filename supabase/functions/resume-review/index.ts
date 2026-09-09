import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocumentProxy, extractText } from "https://esm.sh/unpdf@0.12.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = "openai/gpt-oss-120b";

// General resume review, v1. Scope: one holistic scorecard + fixes for
// whatever resume the student has on file (see student_profiles.resume_url).
// Per-scholarship tailored review is a deliberate phase 2, not built here.
// PDF-only for now — DOC/DOCX text extraction in Deno is unreliable enough
// that shipping it half-working would be worse than asking for a PDF.

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

const REVIEW_SYSTEM_PROMPT = `You are an experienced career coach reviewing a college student's resume ahead of scholarship and internship applications.

Read the resume text the user gives you and return ONLY valid JSON (no markdown fences, no commentary outside the JSON) matching exactly this shape:
{
  "overall_score": <integer 0-100>,
  "category_scores": {
    "ats_readability": <integer 0-100>,
    "clarity": <integer 0-100>,
    "impact": <integer 0-100>,
    "completeness": <integer 0-100>
  },
  "summary": "<one to two sentence overview of where this resume stands>",
  "fixes": [
    { "priority": "high" | "medium" | "low", "title": "<short fix title, under 10 words>", "detail": "<1-2 sentence actionable explanation>" }
  ]
}

Rules:
- ats_readability: how cleanly an applicant tracking system / scholarship reviewer could parse the structure, section headers, and formatting choices as described in the text.
- clarity: how easy the writing is to read and understand quickly.
- impact: whether bullet points show concrete outcomes (numbers, results, scope) rather than just listing duties.
- completeness: whether expected sections are present and sufficiently filled in (contact info, education, experience/activities, skills) for a college student applying to scholarships.
- Give between 3 and 6 fixes, ordered highest priority first.
- Be specific: reference actual bullet points, sections, or gaps you saw, not generic advice.
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

    const { data: profile, error: profileError } = await admin
      .from("student_profiles")
      .select("resume_url")
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
            { role: "user", content: `Resume text:\n\n${resumeText.slice(0, 12000)}` },
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
    const fixes = Array.isArray(parsed.fixes)
      ? parsed.fixes.slice(0, 8).map((f: any) => ({
          priority: ["high", "medium", "low"].includes(f?.priority) ? f.priority : "medium",
          title: String(f?.title || "").slice(0, 120),
          detail: String(f?.detail || "").slice(0, 400),
        }))
      : [];
    const summary = String(parsed.summary || "").slice(0, 500);

    const { data: inserted, error: insertError } = await admin
      .from("resume_reviews")
      .insert({
        user_id: userId,
        resume_path: resumePath,
        overall_score: overallScore,
        category_scores: categoryScores,
        fixes,
        summary,
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
