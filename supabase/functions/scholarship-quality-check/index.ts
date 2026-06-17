import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The 4 niched schools this platform serves. The "school" enum in the DB
// only contains these 4 values, so any populated eligible_schools array
// already satisfies the "applicable to our schools" gate by construction.
// An EMPTY eligible_schools array means "open to everyone" (which trivially
// includes these 4), so that also passes. What we actually need to guard
// against is a scholarship having NO eligibility_rules row at all, which
// silently makes it unmatchable on the dashboard regardless of how it scores.
const HBCU_SCHOOLS = ["morehouse", "spelman", "clark_atlanta", "morris_brown"];

const MIN_MONTHS_REMAINING = 2;
const FETCH_TIMEOUT_MS = 9000;

const CAPTCHA_MARKERS = [
  "captcha",
  "are you a human",
  "are you human",
  "verify you are human",
  "cloudflare",
  "recaptcha",
  "hcaptcha",
  "checking your browser",
];

interface Scholarship {
  id: string;
  name: string;
  description: string | null;
  award_amount: number | null;
  provider: string | null;
  deadline: string | null;
  application_url: string | null;
  is_active: boolean | null;
  pipeline_status: string | null;
}

interface EligibilityRule {
  id: string;
  scholarship_id: string;
  eligible_schools: string[] | null;
}

interface RunResult {
  scholarship_id: string;
  scholarship_name: string;
  passed: boolean;
  link_status: string;
  reason: string;
}

function monthsFromNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

// Gate 1: deadline must be at least MIN_MONTHS_REMAINING out.
function checkDeadline(deadline: string | null): { ok: boolean; reason?: string } {
  if (!deadline) return { ok: false, reason: "Missing deadline" };
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return { ok: false, reason: "Invalid deadline" };
  const now = new Date();
  if (d < now) return { ok: false, reason: `Deadline already passed (${deadline})` };
  const threshold = monthsFromNow(MIN_MONTHS_REMAINING);
  if (d < threshold) {
    return { ok: false, reason: `Deadline within ${MIN_MONTHS_REMAINING} months (${deadline}) — needs more runway` };
  }
  return { ok: true };
}

// Gate 2: must resolve to at least one of the 4 niched schools, or be open.
function checkSchoolEligibility(rules: EligibilityRule | null): { ok: boolean; reason?: string } {
  if (!rules) return { ok: true };
  const schools = rules.eligible_schools ?? [];
  if (schools.length === 0) return { ok: true };
  const overlaps = schools.some((s) => HBCU_SCHOOLS.includes(s));
  if (!overlaps) {
    return { ok: false, reason: `Eligible schools (${schools.join(", ")}) don't include Morehouse, Spelman, Clark Atlanta, or Morris Brown` };
  }
  return { ok: true };
}

// Gate 3: URL must return a real 200, not be CAPTCHA-walled, and not
// silently redirect off to a generic homepage on a different host.
async function checkLink(url: string | null): Promise<{ ok: boolean; status: string; reason?: string }> {
  if (!url) return { ok: false, status: "broken", reason: "Missing application URL" };

  let originalHost = "";
  try {
    originalHost = new URL(url).hostname;
  } catch {
    return { ok: false, status: "broken", reason: "Malformed application URL" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ElevaidPipelineBot/1.0)" },
    });
    clearTimeout(timeout);

    if (res.status === 404 || res.status === 410) {
      return { ok: false, status: "broken", reason: `URL returns ${res.status}` };
    }
    if (res.status >= 400) {
      return { ok: false, status: "broken", reason: `URL returns HTTP ${res.status}` };
    }

    const finalUrl = res.url || url;
    let finalHost = originalHost;
    let finalPath = "";
    try {
      const parsed = new URL(finalUrl);
      finalHost = parsed.hostname;
      finalPath = parsed.pathname;
    } catch {
      // keep defaults
    }

    // Redirected to a different domain's root — almost always means the
    // deep link died and the site bounced us to its homepage.
    if (finalHost !== originalHost && (finalPath === "" || finalPath === "/")) {
      return { ok: false, status: "redirected", reason: `Redirected off-site to homepage (${finalHost})` };
    }

    const bodyText = (await res.text()).slice(0, 20000).toLowerCase();
    if (CAPTCHA_MARKERS.some((m) => bodyText.includes(m))) {
      return { ok: false, status: "captcha", reason: "CAPTCHA / bot-check wall detected" };
    }

    // Same-host redirect to bare root is a softer signal of a dead deep
    // link (e.g. /scholarships/123 -> /), still worth removing.
    if (finalPath === "" || finalPath === "/") {
      const originalPath = (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return "/";
        }
      })();
      if (originalPath !== "/" && originalPath !== "") {
        return { ok: false, status: "redirected", reason: "Redirected to site root instead of the scholarship page" };
      }
    }

    return { ok: true, status: "ok" };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: "timeout", reason: "Request timed out" };
    }
    return { ok: false, status: "broken", reason: `URL unreachable: ${String(err)}` };
  }
}

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Evaluate anything currently live, plus anything new/unevaluated.
  const { data: scholarships, error: fetchError } = await supabase
    .from("scholarships")
    .select("*")
    .or("is_active.eq.true,pipeline_status.eq.pending");

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  if (!scholarships || scholarships.length === 0) {
    await supabase.from("pipeline_logs").insert({
      scholarships_checked: 0,
      scholarships_approved: 0,
      scholarships_quarantined: 0,
      scholarships_deactivated: 0,
      status: "clean",
      notes: "No scholarships to evaluate",
    });
    return new Response(JSON.stringify({ message: "No scholarships to evaluate" }), { status: 200 });
  }

  let approved = 0;
  let quarantined = 0;
  let deactivated = 0;
  const runResults: RunResult[] = [];
  const noteLines: string[] = [];

  for (const scholarship of scholarships as Scholarship[]) {
    // Ensure every scholarship has an eligibility_rules row. Without one,
    // the student dashboard's matching logic silently drops it — it would
    // never surface to anyone even if it passes every other gate.
    const { data: existingRules } = await supabase
      .from("eligibility_rules")
      .select("*")
      .eq("scholarship_id", scholarship.id)
      .maybeSingle();

    let rules = existingRules as EligibilityRule | null;
    if (!rules) {
      const { data: created } = await supabase
        .from("eligibility_rules")
        .insert({
          scholarship_id: scholarship.id,
          eligible_schools: [],
          eligible_majors: [],
          keywords: [],
        })
        .select()
        .single();
      rules = created as EligibilityRule;
    }

    const deadlineCheck = checkDeadline(scholarship.deadline);
    const schoolCheck = checkSchoolEligibility(rules);

    // Don't bother validating the link if the deadline has already fully
    // passed — that's terminal regardless of what the URL does.
    const deadlinePassed = scholarship.deadline ? new Date(scholarship.deadline) < new Date() : true;
    const linkCheck = deadlinePassed
      ? { ok: false, status: "unchecked", reason: undefined as string | undefined }
      : await checkLink(scholarship.application_url);

    const failures = [deadlineCheck, schoolCheck, linkCheck]
      .filter((c) => !c.ok)
      .map((c) => c.reason)
      .filter(Boolean) as string[];

    const passed = failures.length === 0;

    if (passed) {
      approved++;
      await supabase
        .from("scholarships")
        .update({
          is_active: true,
          pipeline_status: "approved",
          quarantine_reason: null,
          link_status: "ok",
          link_checked_at: new Date().toISOString(),
        })
        .eq("id", scholarship.id);
    } else {
      if (deadlinePassed) deactivated++;
      else quarantined++;
      noteLines.push(`${scholarship.name}: ${failures.join(" | ")}`);

      // Log the audit record BEFORE deleting — pipeline_runs.scholarship_id
      // is ON DELETE SET NULL specifically so this history survives the
      // scholarship's removal, with scholarship_name denormalized here so
      // "what was this and why did it go" stays answerable afterward.
      await supabase.from("pipeline_runs").insert({
        scholarship_id: scholarship.id,
        scholarship_name: scholarship.name,
        passed: false,
        link_status: linkCheck.status,
        reason: failures.join(" | "),
      });

      // Hard delete rather than soft-quarantine: a scholarship that fails
      // any gate should not linger in the inventory at all. Cascades to
      // its eligibility_rules row automatically.
      await supabase.from("scholarships").delete().eq("id", scholarship.id);
      continue;
    }

    runResults.push({
      scholarship_id: scholarship.id,
      scholarship_name: scholarship.name,
      passed,
      link_status: linkCheck.status,
      reason: passed ? "Passed all gates" : failures.join(" | "),
    });
  }

  if (runResults.length > 0) {
    await supabase.from("pipeline_runs").insert(
      runResults.map((r) => ({
        scholarship_id: r.scholarship_id,
        scholarship_name: r.scholarship_name,
        passed: r.passed,
        link_status: r.link_status,
        reason: r.reason,
      })),
    );
  }

  await supabase.from("pipeline_logs").insert({
    scholarships_checked: scholarships.length,
    scholarships_approved: approved,
    scholarships_quarantined: quarantined,
    scholarships_deactivated: deactivated,
    status: quarantined > 0 || deactivated > 0 ? "issues_found" : "clean",
    notes: noteLines.length > 0 ? noteLines.join("\n") : `All ${scholarships.length} scholarships passed`,
  });

  return new Response(
    JSON.stringify({
      checked: scholarships.length,
      approved,
      quarantined,
      deactivated,
    }),
    { status: 200 },
  );
});
