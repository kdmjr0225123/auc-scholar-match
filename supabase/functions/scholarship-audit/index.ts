import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Pipeline v1 gate. Runs on staged rows (promote / hold / reject) and on live
// rows (deactivate on failure). Live rows are never deleted: deactivation keeps
// student_applications links and an audit trail.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HBCU_SCHOOLS = ["morehouse", "spelman", "clark_atlanta", "morris_brown"];
const MIN_RUNWAY_DAYS = 7; // students need at least a week to apply
const MIN_DESC_LEN = 40;
const MAX_AWARD = 500_000;
const FETCH_TIMEOUT = 12000;
const CONCURRENCY = 5;

const AGGREGATOR_DOMAINS = [
  "scholarships360.org", "scholarships.com", "niche.com", "unigo.com", "cappex.com",
  "fastweb.com", "scholarshipowl.com", "studentscholarships.org", "bold.org", "lenny.ai",
  "sallie.com", "sofi.com",
];

// Verified provider portals (login-gated or CDN-fronted). Body inspection skipped.
const TRUSTED_DOMAINS = ["scholarships.tmcf.org", "tmcf.org", "hbcuconnect.com", "www.hbcuconnect.com"];

const NOT_OPEN_PHRASES = [
  "next cycle opens", "applications open in", "applications will open", "opening soon",
  "coming soon", "check back", "currently closed", "applications are closed",
  "no longer accepting applications", "not currently accepting",
];

const CAPTCHA_MARKERS = [
  "captcha", "are you a human", "are you human", "verify you are human", "recaptcha",
  "hcaptcha", "checking your browser", "just a moment", "enable javascript and cookies", "ddos-guard",
];

// ClickFix-style malware pages (incident 2026-09-29): fake verification that asks
// the visitor to open the Run dialog and paste a clipboard command.
const MALWARE_MARKERS = [
  /win\s*\+\s*r/i, /windows\s*(key)?\s*\+\s*r/i, /press\s+ctrl\s*\+\s*v.{0,80}(enter|run)/i,
  /powershell\s+-(e|enc|w)/i, /mshta\s+http/i,
];

const BROKEN_FORMAT_PATTERNS = [/<[^>]{1,60}>/, /&(amp|lt|gt|nbsp|quot);/, /\\n|\\t|\\r/, /\s{4,}/];

// Eligibility rules for current AUC undergraduates.
const INELIGIBLE_RULES: { re: RegExp; reason: string }[] = [
  { re: /\b(tmcf|thurgood marshall college fund)[- ]member\b/i, reason: "Restricted to TMCF member schools (AUC schools are UNCF members)" },
  { re: /\b(tmcf|thurgood marshall college fund)\b.{0,120}\bmember (school|institution|college|universit|hbcu)/i, reason: "Restricted to TMCF member schools (AUC schools are UNCF members)" },
  { re: /\bmember (school|institution|college|universit)\w*\b.{0,80}\b(tmcf|thurgood marshall)/i, reason: "Restricted to TMCF member schools (AUC schools are UNCF members)" },
  { re: /\b(must be|only|open only to|limited to)\b.{0,40}\b(graduating )?high school seniors?\b/i, reason: "High school seniors only" },
  { re: /\bhigh school seniors? only\b/i, reason: "High school seniors only" },
  { re: /\bincoming (freshm[ae]n|first[- ]year)s? only\b/i, reason: "Incoming freshmen only" },
  { re: /\b(sweepstakes|random drawing|no purchase necessary|winner will be (randomly )?drawn)\b/i, reason: "Sweepstakes / random drawing" },
  { re: /\b(download (the|our) app|create an? (free )?(account|profile) on (our|the) (app|platform))\b/i, reason: "Requires a third-party app or account" },
];

const RESIDENCY_STATES = [
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida",
  "hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland",
  "massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma",
  "oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah",
  "vermont","virginia","washington","west virginia","wisconsin","wyoming",
];

// Law-firm / injury marketing "scholarships" (lead-gen; one served malware).
const LEADGEN_PROVIDER = /\b(law (group|firm|office|offices)|attorneys?( at law)?|injury|accident|lawyers?|legal group|esq\.?)\b/i;
const LEADGEN_NAME = /\b(truck|car|motorcycle|auto|bicycle|pedestrian|wrongful death|personal injury|accident)\b.{0,30}\bscholarship/i;

type CriterionResult = { pass: boolean; reason: string; hold?: boolean };
type CriteriaMap = Record<string, CriterionResult>;
const pass = (reason: string): CriterionResult => ({ pass: true, reason });
const fail = (reason: string): CriterionResult => ({ pass: false, reason });
// A "hold" failure keeps a staged row in needs_review for an admin to complete
// (e.g. add a deadline) instead of rejecting a legitimate scholarship.
const hold = (reason: string): CriterionResult => ({ pass: false, reason, hold: true });

function testName(name: string | null): CriterionResult {
  if (!name || name.trim().length === 0) return fail("Missing scholarship name");
  if (name.trim().length < 5) return fail("Name too short to be meaningful");
  return pass("Name present");
}

function testProvider(provider: string | null): CriterionResult {
  if (!provider || provider.trim().length === 0) return hold("Missing provider / sponsor name");
  return pass("Provider present");
}

function testDeadline(deadline: string | null): CriterionResult {
  if (!deadline) return hold("Missing deadline -- add it in the review queue");
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return hold("Deadline is not a valid date");
  const now = new Date();
  if (d < now) return fail(`Deadline has passed (${deadline})`);
  if (d.getTime() - now.getTime() < MIN_RUNWAY_DAYS * 86_400_000) return fail(`Deadline within ${MIN_RUNWAY_DAYS} days (${deadline})`);
  return pass(`Deadline valid: ${deadline}`);
}

function testAwardAmount(amount: number | string | null): CriterionResult {
  if (amount === null || amount === undefined || amount === "") return hold("Missing award amount -- add it in the review queue");
  const n = typeof amount === "string" ? parseFloat(amount.replace(/[^0-9.]/g, "")) : amount;
  if (isNaN(n) || n <= 0) return hold(`Award amount is not a real number (${amount})`);
  if (n > MAX_AWARD) return fail(`Award amount suspiciously large ($${n.toLocaleString()})`);
  return pass(`Award amount valid: $${n.toLocaleString()}`);
}

function testDescription(desc: string | null): CriterionResult {
  if (!desc || desc.trim().length === 0) return hold("Missing description");
  if (desc.trim().length < MIN_DESC_LEN) return hold(`Description too thin (${desc.trim().length} chars)`);
  const lower = desc.toLowerCase();
  const notOpen = NOT_OPEN_PHRASES.find((p) => lower.includes(p));
  if (notOpen) return fail(`Description signals not currently open: "${notOpen}"`);
  const broken = BROKEN_FORMAT_PATTERNS.find((r) => r.test(desc));
  if (broken) return hold("Description contains broken formatting");
  return pass(`Description valid (${desc.trim().length} chars)`);
}

function testEligibility(text: string): CriterionResult {
  for (const rule of INELIGIBLE_RULES) if (rule.re.test(text)) return fail(rule.reason);
  for (const st of RESIDENCY_STATES) {
    const re = new RegExp(`\\b(residents? of|reside in|resident of the state of|must live in|legal residents? of)\\s+(the state of\\s+)?${st}\\b`, "i");
    if (re.test(text)) return fail(`Requires ${st.replace(/\b\w/g, (c) => c.toUpperCase())} residency`);
  }
  return pass("No AUC-ineligible restrictions found");
}

function testLeadGen(name: string, provider: string, host: string): CriterionResult {
  if (LEADGEN_PROVIDER.test(provider) || LEADGEN_NAME.test(name) || /(law|legal|injury|attorney|lawyer)/i.test(host)) {
    return fail("Law-firm / injury-marketing lead-gen scholarship -- excluded by trust policy");
  }
  return pass("Sponsor type acceptable");
}

function testSchoolEligibility(eligibleSchools: string[]): CriterionResult {
  if (eligibleSchools.length === 0) return pass("Open to all schools");
  return eligibleSchools.some((s) => HBCU_SCHOOLS.includes(s))
    ? pass("School-eligible")
    : fail(`No overlap with target schools -- eligible: ${eligibleSchools.join(", ")}`);
}

function testMatchesSomeStudent(eligibleSchools: string[], eligibleMajors: string[], minGpa: number | null, students: Record<string, unknown>[]): CriterionResult {
  if (students.length === 0) return pass("No enrolled students yet -- gate skipped");
  const ok = students.some((s) => {
    if (eligibleSchools.length > 0 && !eligibleSchools.includes(s.school as string)) return false;
    if (eligibleMajors.length > 0 && !eligibleMajors.includes(s.major as string)) return false;
    if (minGpa && (s.gpa as number) < minGpa) return false;
    return true;
  });
  return ok ? pass("Matches at least one enrolled student") : hold("Zero current students match this scholarship");
}

type LinkTests = { url_present: CriterionResult; not_aggregator: CriterionResult; url_resolves: CriterionResult; no_redirect: CriterionResult; no_captcha: CriterionResult; no_malware: CriterionResult };

async function testLink(url: string | null): Promise<LinkTests> {
  const skipped = fail("Skipped -- no valid URL to test");
  if (!url) return { url_present: hold("Missing application URL"), not_aggregator: skipped, url_resolves: skipped, no_redirect: skipped, no_captcha: skipped, no_malware: skipped };
  let host = "";
  try { host = new URL(url).hostname; } catch {
    return { url_present: hold("Malformed URL"), not_aggregator: skipped, url_resolves: skipped, no_redirect: skipped, no_captcha: skipped, no_malware: skipped };
  }
  const url_present = pass("Application URL present");
  const isAgg = AGGREGATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  const not_aggregator = isAgg ? fail(`URL points to aggregator/lead-gen site (${host})`) : pass(`Direct sponsor URL (${host})`);
  if (isAgg) return { url_present, not_aggregator, url_resolves: skipped, no_redirect: skipped, no_captcha: skipped, no_malware: skipped };
  const isTrusted = TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ElevaidAudit/1.1" } });
    clearTimeout(timer);
    if (res.status >= 400) return { url_present, not_aggregator, url_resolves: fail(`URL returns HTTP ${res.status}`), no_redirect: skipped, no_captcha: skipped, no_malware: skipped };

    let finalHost = host, finalPath = "", origPath = "/";
    try { const p = new URL(res.url || url); finalHost = p.hostname; finalPath = p.pathname; } catch { /* keep defaults */ }
    try { origPath = new URL(url).pathname; } catch { /* keep default */ }
    const toRoot = finalPath === "" || finalPath === "/";
    const offSite = finalHost !== host && toRoot;
    const deadLink = !offSite && toRoot && origPath !== "/" && origPath !== "";
    const no_redirect = offSite ? fail(`Redirected off-site to ${finalHost} homepage`) : deadLink ? fail("Redirected to site root -- deep link is dead") : pass("Resolves to the expected page");
    const url_resolves = pass(`Resolves with HTTP ${res.status}`);

    const body = (await res.text()).slice(0, 60000);
    const lower = body.toLowerCase();
    const malwareHit = MALWARE_MARKERS.find((r) => r.test(body));
    const no_malware = malwareHit ? fail("SECURITY: page asks visitors to run a pasted command (ClickFix pattern)") : pass("No malware pattern detected");
    if (isTrusted) return { url_present, not_aggregator, url_resolves, no_redirect, no_captcha: pass("Trusted domain -- CAPTCHA check skipped"), no_malware };
    const captchaHit = CAPTCHA_MARKERS.find((m) => lower.includes(m));
    const no_captcha = captchaHit ? fail(`CAPTCHA / bot-check wall detected ("${captchaHit}")`) : pass("No CAPTCHA wall detected");
    return { url_present, not_aggregator, url_resolves, no_redirect, no_captcha, no_malware };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error && err.name === "AbortError" ? `Request timed out after ${FETCH_TIMEOUT / 1000}s` : `Unreachable: ${String(err)}`;
    // Network blips hold rather than reject; the next run retries.
    return { url_present, not_aggregator, url_resolves: hold(msg), no_redirect: skipped, no_captcha: skipped, no_malware: skipped };
  }
}

function hostOf(url: string | null): string {
  try { return url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

function summarize(criteria: CriteriaMap): { passed: boolean; hardFail: boolean; failures: string } {
  const failed = Object.entries(criteria).filter(([, v]) => !v.pass && !v.reason.startsWith("Skipped"));
  const hardFail = failed.some(([, v]) => !v.hold);
  return {
    passed: failed.length === 0,
    hardFail,
    failures: failed.map(([k, v]) => `${k}: ${v.reason}`).join(" | "),
  };
}

async function auditLive(s: Record<string, unknown>, rules: Record<string, unknown> | null, students: Record<string, unknown>[], supabase: ReturnType<typeof createClient>) {
  const eligibleSchools = (rules?.eligible_schools as string[] | null) ?? [];
  const eligibleMajors = (rules?.eligible_majors as string[] | null) ?? [];
  const minGpa = (rules?.min_gpa as number | null) ?? (s.min_gpa as number | null) ?? null;
  const url = s.application_url as string | null;
  const link = await testLink(url);
  const text = [s.name, s.description, s.application_requirements, s.apply_notes].filter(Boolean).join(" \n ");
  const criteria: CriteriaMap = {
    name: testName(s.name as string | null),
    deadline: testDeadline(s.deadline as string | null),
    eligibility: testEligibility(text),
    lead_gen: testLeadGen((s.name as string) ?? "", (s.provider as string) ?? "", hostOf(url)),
    school_eligibility: testSchoolEligibility(eligibleSchools),
    matches_students: testMatchesSomeStudent(eligibleSchools, eligibleMajors, minGpa, students),
    ...link,
  };
  // Live rows: only hard failures deactivate. Holds (e.g. a timeout) are logged.
  const { passed, hardFail, failures } = summarize(criteria);
  if (hardFail) {
    await supabase.from("scholarships").update({
      is_active: false, pipeline_status: "quarantined", quarantine_reason: failures.slice(0, 1000),
      link_status: link.no_malware.pass ? (link.url_resolves.pass ? "ok" : "broken") : "security_flagged",
      link_checked_at: new Date().toISOString(),
    }).eq("id", s.id);
    await supabase.from("pipeline_runs").insert({ scholarship_id: s.id, scholarship_name: s.name, passed: false, link_status: link.url_resolves.pass ? "ok" : "broken", reason: failures });
  } else {
    await supabase.from("scholarships").update({ link_checked_at: new Date().toISOString() }).eq("id", s.id);
  }
  return { passed: !hardFail, deactivated: hardFail, criteria, failures: passed ? null : failures };
}

async function auditStaged(s: Record<string, unknown>, students: Record<string, unknown>[], supabase: ReturnType<typeof createClient>) {
  const url = (s.application_url ?? s.source_url) as string | null;
  const link = await testLink(url);
  const name = ((s.name ?? s.title) as string | null) ?? "";
  const text = [name, s.description, s.eligibility_raw, s.application_requirements].filter(Boolean).join(" \n ");
  const criteria: CriteriaMap = {
    name: testName(name),
    provider: testProvider(s.provider as string | null),
    deadline: testDeadline(s.deadline as string | null),
    award_amount: testAwardAmount(s.award_amount as string | null),
    description: testDescription(s.description as string | null),
    eligibility: testEligibility(text),
    lead_gen: testLeadGen(name, (s.provider as string) ?? "", hostOf(url)),
    matches_students: testMatchesSomeStudent([], [], (s.min_gpa as number | null) ?? null, students),
    ...link,
  };
  const { passed, hardFail, failures } = summarize(criteria);
  const now = new Date().toISOString();

  if (passed) {
    const awardRaw = s.award_amount as string | null;
    const awardNum = awardRaw ? parseFloat(String(awardRaw).replace(/[^0-9.]/g, "")) : null;
    const years = s.allowed_class_years as string[] | null;
    const { data: promoted, error } = await supabase.from("scholarships").insert({
      name,
      provider: s.provider as string,
      description: s.description as string,
      award_amount: awardNum,
      deadline: s.deadline as string,
      application_url: url,
      min_gpa: (s.min_gpa as number | null) ?? null,
      allowed_class_years: years && years.length ? years.join(",") : null,
      source_domain: hostOf(url) || (s.source_domain as string | null),
      application_requirements: (s.application_requirements as string | null) ?? null,
      is_active: true,
      pipeline_status: "approved",
      link_status: "ok",
      link_checked_at: now,
    }).select().single();
    if (error || !promoted) {
      await supabase.from("scholarship_staging").update({ audit_ran_at: now, audit_criteria: criteria, audit_failure: `Promotion insert failed: ${error?.message ?? "unknown"}` }).eq("id", s.id);
      return { outcome: "error" as const, criteria };
    }
    await supabase.from("eligibility_rules").insert({ scholarship_id: (promoted as Record<string, unknown>).id, eligible_schools: [], eligible_majors: [], keywords: [], min_gpa: (s.min_gpa as number | null) ?? null });
    await supabase.from("scholarship_staging").update({ status: "promoted", audit_passed: true, audit_ran_at: now, audit_criteria: criteria, audit_failure: null }).eq("id", s.id);
    return { outcome: "promoted" as const, criteria };
  }

  if (hardFail) {
    await supabase.from("scholarship_staging").update({ status: "rejected", audit_passed: false, audit_ran_at: now, audit_criteria: criteria, audit_failure: failures }).eq("id", s.id);
    return { outcome: "rejected" as const, criteria };
  }
  // Only fixable gaps: keep in the review queue with the reason attached.
  await supabase.from("scholarship_staging").update({ status: "needs_review", audit_passed: false, audit_ran_at: now, audit_criteria: criteria, audit_failure: `HOLD: ${failures}` }).eq("id", s.id);
  return { outcome: "held" as const, criteria };
}

async function runPool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) out.push(...await Promise.all(items.slice(i, i + CONCURRENCY).map(fn)));
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });

  // Callers must prove they are the scheduler or the admin console:
  //  - admin-run-pipeline sends the service role key as a bearer token;
  //  - pg_cron sends x-pipeline-secret, read from Vault (public.pipeline_secret()).
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const providedSecret = req.headers.get("x-pipeline-secret") ?? "";
  let authorized = bearer.length > 0 && bearer === SUPABASE_SERVICE_KEY;
  if (!authorized && providedSecret.length >= 32) {
    const { data: expected } = await supabase.rpc("pipeline_secret");
    authorized = typeof expected === "string" && expected.length >= 32 && expected === providedSecret;
  }
  if (!authorized) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const body = await req.json().catch(() => ({}));
  const source: string = body.source ?? "manual";

  const { data: students } = await supabase.from("student_profiles").select("id, school, major, gpa, graduation_year");
  const allStudents = (students ?? []) as Record<string, unknown>[];

  const { data: session } = await supabase.from("audit_sessions").insert({ source, total_tested: 0, total_passed: 0, total_swept: 0, total_promoted: 0 }).select().single();
  const sessionId = (session as Record<string, unknown> | null)?.id as string;

  const { data: liveRows } = await supabase.from("scholarships").select("*").eq("is_active", true);
  const live = (liveRows ?? []) as Record<string, unknown>[];
  const liveResults = await runPool(live, async (s) => {
    const { data: rules } = await supabase.from("eligibility_rules").select("*").eq("scholarship_id", s.id).maybeSingle();
    return { s, r: await auditLive(s, rules, allStudents, supabase) };
  });

  const { data: stagedRows } = await supabase.from("scholarship_staging").select("*").eq("status", "needs_review");
  const staged = (stagedRows ?? []) as Record<string, unknown>[];
  const stagedResults = await runPool(staged, async (s) => ({ s, r: await auditStaged(s, allStudents, supabase) }));

  const deactivated = liveResults.filter((x) => x.r.deactivated);
  const promoted = stagedResults.filter((x) => x.r.outcome === "promoted");
  const rejected = stagedResults.filter((x) => x.r.outcome === "rejected");
  const held = stagedResults.filter((x) => x.r.outcome === "held");

  const auditRows = [
    ...liveResults.map(({ s, r }) => ({ session_id: sessionId, scholarship_id: s.id, scholarship_name: s.name, source: "live", passed: r.passed, criteria: r.criteria, swept_at: r.deactivated ? new Date().toISOString() : null })),
    ...stagedResults.map(({ s, r }) => ({ session_id: sessionId, scholarship_id: null, scholarship_name: (s.name ?? s.title) as string, source: "staging", passed: r.outcome === "promoted", criteria: r.criteria, promoted_at: r.outcome === "promoted" ? new Date().toISOString() : null })),
  ];
  if (auditRows.length) await supabase.from("audit_results").insert(auditRows);

  const notes = `Live: ${live.length} checked, ${deactivated.length} deactivated${deactivated.length ? ` (${deactivated.map((x) => x.s.name).join("; ")})` : ""}. Staged: ${staged.length} checked, ${promoted.length} promoted, ${held.length} held for review, ${rejected.length} rejected.`;
  await supabase.from("audit_sessions").update({ total_tested: live.length + staged.length, total_passed: liveResults.filter((x) => x.r.passed).length + promoted.length, total_swept: deactivated.length + rejected.length, total_promoted: promoted.length, notes }).eq("id", sessionId);
  await supabase.from("pipeline_logs").insert({ ran_at: new Date().toISOString(), status: "audit", scholarships_checked: live.length + staged.length, scholarships_approved: promoted.length, scholarships_quarantined: deactivated.length + rejected.length, scholarships_deactivated: deactivated.length, notes });

  return new Response(JSON.stringify({ session_id: sessionId, live_checked: live.length, deactivated: deactivated.length, staged_checked: staged.length, promoted: promoted.length, held: held.length, rejected: rejected.length, notes }), { status: 200, headers: { "Content-Type": "application/json" } });
});
