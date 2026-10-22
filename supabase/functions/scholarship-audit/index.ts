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
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL = "openai/gpt-oss-120b";
const AI_MAX_ATTEMPTS = 4;
const MIN_PAGE_TEXT = 300; // below this the page can't be verified (JS-only, login wall, PDF stub)
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

// Challenge pages that block the content. A reCAPTCHA on an application form is
// normal and is NOT a wall, so bare "captcha" only counts when the page has
// almost no readable content (i.e. the challenge is all there is).
const CAPTCHA_WALL_MARKERS = [
  "are you a human", "are you human", "verify you are human", "checking your browser",
  "enable javascript and cookies to continue", "ddos-guard", "cf-challenge", "attention required! | cloudflare",
];
const CAPTCHA_WEAK_MARKERS = ["captcha", "recaptcha", "hcaptcha", "just a moment"];
const CAPTCHA_WALL_MAX_TEXT = 1500;

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

// Page-content lead-gen signals: catches law firms whose name has no "law" word
// (e.g. "Florin|Roebig"). Two or more distinct hits fails the scholarship.
const LEADGEN_BODY = [
  /personal injury/i, /injury (lawyer|attorney)s?/i, /accident (lawyer|attorney)s?/i, /attorneys? at law/i,
  /\blaw firm\b/i, /free (case )?(consultation|evaluation)/i, /wrongful death/i, /no fee unless (we|you) win/i,
  /(car|truck|motorcycle|auto) accident/i, /medical malpractice/i, /workers'? comp(ensation)?/i,
];

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
type LinkResult = { tests: LinkTests; pageText: string };

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function testLink(url: string | null): Promise<LinkResult> {
  const r = await testLinkInner(url);
  return r;
}

async function testLinkInner(url: string | null): Promise<LinkResult> {
  const skipped = fail("Skipped -- no valid URL to test");
  if (!url) return { tests: { url_present: hold("Missing application URL"), not_aggregator: skipped, url_resolves: skipped, no_redirect: skipped, no_captcha: skipped, no_malware: skipped }, pageText: "" };
  let host = "";
  try { host = new URL(url).hostname; } catch {
    return { tests: { url_present: hold("Malformed URL"), not_aggregator: skipped, url_resolves: skipped, no_redirect: skipped, no_captcha: skipped, no_malware: skipped }, pageText: "" };
  }
  const url_present = pass("Application URL present");
  const isAgg = AGGREGATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  const not_aggregator = isAgg ? fail(`URL points to aggregator/lead-gen site (${host})`) : pass(`Direct sponsor URL (${host})`);
  if (isAgg) return { tests: { url_present, not_aggregator, url_resolves: skipped, no_redirect: skipped, no_captcha: skipped, no_malware: skipped }, pageText: "" };
  const isTrusted = TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ElevaidAudit/1.1" } });
    clearTimeout(timer);
    if (res.status >= 400) return { tests: { url_present, not_aggregator, url_resolves: fail(`URL returns HTTP ${res.status}`), no_redirect: skipped, no_captcha: skipped, no_malware: skipped }, pageText: "" };

    let finalHost = host, finalPath = "", origPath = "/";
    try { const p = new URL(res.url || url); finalHost = p.hostname; finalPath = p.pathname; } catch { /* keep defaults */ }
    try { origPath = new URL(url).pathname; } catch { /* keep default */ }
    const toRoot = finalPath === "" || finalPath === "/";
    const offSite = finalHost !== host && toRoot;
    const deadLink = !offSite && toRoot && origPath !== "/" && origPath !== "";
    const no_redirect = offSite ? fail(`Redirected off-site to ${finalHost} homepage`) : deadLink ? fail("Redirected to site root -- deep link is dead") : pass("Resolves to the expected page");
    const url_resolves = pass(`Resolves with HTTP ${res.status}`);

    const body = (await res.text()).slice(0, 300000);
    const pageText = htmlToText(body).slice(0, 40000);
    const lower = body.toLowerCase();
    const malwareHit = MALWARE_MARKERS.find((r) => r.test(body));
    const no_malware = malwareHit ? fail("SECURITY: page asks visitors to run a pasted command (ClickFix pattern)") : pass("No malware pattern detected");
    if (isTrusted) return { tests: { url_present, not_aggregator, url_resolves, no_redirect, no_captcha: pass("Trusted domain -- CAPTCHA check skipped"), no_malware }, pageText };
    const wallHit = CAPTCHA_WALL_MARKERS.find((m) => lower.includes(m))
      ?? (pageText.length < CAPTCHA_WALL_MAX_TEXT ? CAPTCHA_WEAK_MARKERS.find((m) => lower.includes(m)) : undefined);
    const no_captcha = wallHit ? fail(`CAPTCHA / bot-check wall blocks the page ("${wallHit}")`) : pass("No CAPTCHA wall blocking the content");
    return { tests: { url_present, not_aggregator, url_resolves, no_redirect, no_captcha, no_malware }, pageText };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error && err.name === "AbortError" ? `Request timed out after ${FETCH_TIMEOUT / 1000}s` : `Unreachable: ${String(err)}`;
    // Network blips hold rather than reject; the next run retries.
    return { tests: { url_present, not_aggregator, url_resolves: hold(msg), no_redirect: skipped, no_captcha: skipped, no_malware: skipped }, pageText: "" };
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

// ---------------------------------------------------------------------------
// Pre-publish run-through. Runs on the real application page right before a
// staged scholarship is promoted. Anything it can't verify is held, never
// promoted.
// ---------------------------------------------------------------------------

function testPageLeadGen(pageText: string): CriterionResult {
  if (!pageText) return pass("No page text to scan");
  const hits = LEADGEN_BODY.filter((r) => r.test(pageText)).map((r) => r.source);
  if (hits.length >= 2) return fail(`Sponsor page reads like a law firm / injury marketer (${hits.length} signals)`);
  return pass("Page content has no law-firm marketing signals");
}

const NAME_STOPWORDS = new Set(["scholarship", "scholarships", "program", "programs", "award", "awards", "fund", "fellowship",
  "the", "and", "for", "with", "from", "undergraduate", "student", "students", "annual", "contest", "essay", "grant"]);

function testPageIdentity(name: string, pageText: string): CriterionResult {
  if (pageText.length < MIN_PAGE_TEXT) return hold(`Page has too little readable text to verify (${pageText.length} chars) -- JS-only, login wall or document`);
  const page = pageText.toLowerCase();
  const tokens = [...new Set(name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((t) => t.length >= 4 && !NAME_STOPWORDS.has(t) && !/^\d{4}$/.test(t)))];
  if (tokens.length === 0) return pass("Name has no distinctive words to match");
  const found = tokens.filter((t) => page.includes(t));
  const ratio = found.length / tokens.length;
  return ratio >= 0.5
    ? pass(`Page matches the scholarship name (${found.length}/${tokens.length} key words)`)
    : hold(`Page does not appear to be this scholarship's page (${found.length}/${tokens.length} key words: missing ${tokens.filter((t) => !found.includes(t)).join(", ")})`);
}

type AiVerdict = {
  is_scholarship_page: boolean;
  sponsor_type: string;
  open_now: string;
  current_undergrads_eligible: string;
  auc_eligible: string;
  red_flags: string[];
  summary: string;
};

const AI_SYSTEM_PROMPT = `You verify scholarship listings for Elevaid before they are shown to students.
Students are CURRENT undergraduates at Morehouse College, Spelman College and Clark Atlanta University in Atlanta, Georgia.
These are private HBCUs and UNCF member institutions. They are NOT Thurgood Marshall College Fund (TMCF) member schools.
You are given the scholarship as listed and the text of its live web page. Judge ONLY from the page text.
The text includes site navigation, menus and footers. Ignore them and judge the main content: a company or
organization page with a long product menu can still be a genuine scholarship page.
Return JSON with exactly these keys:
- "is_scholarship_page": true if the page is the sponsor's own page for this specific scholarship (details or application), false if it is unrelated, a generic homepage, a listing aggregator, or a different award.
- "sponsor_type": one of "foundation", "nonprofit", "government", "university", "corporation", "professional_association", "fraternity_sorority", "law_firm", "marketing_seo", "aggregator", "sweepstakes", "unknown". Use "law_firm" for any legal practice (personal injury, accident, criminal defense, etc.) even if the firm name has no legal words. Use "marketing_seo" when the "scholarship" mainly exists to get backlinks or leads (e.g. essay must link to the sponsor site, unrelated small business).
- "open_now": "yes", "no" or "unclear" -- is the application currently open or opening soon for an upcoming cycle?
- "current_undergrads_eligible": "yes", "no" or "unclear" -- can a current undergraduate (sophomore/junior/senior) apply, or is it only for high school seniors / incoming freshmen / graduate students?
- "auc_eligible": "yes", "no" or "unclear" -- can a student at Morehouse/Spelman/Clark Atlanta apply? "no" if restricted to TMCF member schools, to named schools that are not these, or to residents of a US state other than Georgia.
- "red_flags": array of short strings (fees to apply, requests for bank/SSN info, run-a-command instructions, mismatched sponsor, etc.). Empty array if none.
- "summary": one sentence.`;

async function aiReview(row: { name: string; provider: string; amount: unknown; deadline: unknown; description: string }, url: string, pageText: string): Promise<{ result: CriterionResult; verdict: AiVerdict | null }> {
  if (!GROQ_API_KEY) return { result: hold("AI run-through unavailable (GROQ_API_KEY not set) -- not promoted"), verdict: null };
  const requestBody = JSON.stringify({
    model: GROQ_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user", content: `Listing:\nName: ${row.name}\nProvider: ${row.provider}\nAmount: ${row.amount ?? "n/a"}\nDeadline: ${row.deadline ?? "n/a"}\nDescription: ${row.description}\nURL: ${url}\n\nPage text (truncated):\n${pageText.slice(0, 14000)}` },
    ],
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    // Rate limits (429) and transient 5xx are retried with backoff; anything
    // still failing after the last attempt holds the row (fail closed).
    let res: Response | null = null;
    for (let attempt = 0; attempt < AI_MAX_ATTEMPTS; attempt++) {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: requestBody,
      });
      if (res.status !== 429 && res.status < 500) break;
      if (attempt === AI_MAX_ATTEMPTS - 1) break;
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20_000) : 2_000 * 2 ** attempt;
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, waitMs));
    }
    if (!res || !res.ok) return { result: hold(`AI run-through failed (HTTP ${res?.status ?? "no response"}) after retries -- not promoted`), verdict: null };
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const v = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as AiVerdict;
    // Clear-cut findings reject. Judgement calls hold for a human: a false
    // rejection hides a real scholarship, a hold only costs one review click.
    const rejectReasons: string[] = [];
    const holdReasons: string[] = [];
    if (["law_firm", "aggregator", "sweepstakes"].includes(v.sponsor_type)) rejectReasons.push(`sponsor is ${v.sponsor_type.replace("_", " ")}`);
    if (v.auc_eligible === "no") rejectReasons.push("AUC students not eligible");
    if (v.current_undergrads_eligible === "no") rejectReasons.push("not open to current undergraduates");
    const severeFlags = (v.red_flags ?? []).filter((f) => /fee to apply|application fee|ssn|social security|bank (account|info)|password|run a command|run dialog|powershell|malware/i.test(f));
    if (severeFlags.length) rejectReasons.push(`red flags: ${severeFlags.join("; ")}`);
    if (v.is_scholarship_page !== true) holdReasons.push("page may not be this scholarship's own page");
    if (v.open_now === "no") holdReasons.push("page suggests applications are not open");
    if (v.sponsor_type === "marketing_seo") holdReasons.push("sponsor looks like a marketing/SEO scholarship");
    const summary = (v.summary ?? "").trim();
    if (rejectReasons.length) return { result: fail(`AI run-through: ${rejectReasons.join(", ")}. ${summary}`.trim()), verdict: v };
    if (holdReasons.length) return { result: hold(`AI run-through flagged for review: ${holdReasons.join(", ")}. ${summary}`.trim()), verdict: v };
    return { result: pass(`AI run-through passed (${v.sponsor_type}; open: ${v.open_now}; undergrads: ${v.current_undergrads_eligible}; AUC: ${v.auc_eligible})`), verdict: v };
  } catch (err) {
    return { result: hold(`AI run-through error: ${err instanceof Error ? err.message : String(err)} -- not promoted`), verdict: null };
  } finally {
    clearTimeout(timer);
  }
}

// Serializes AI calls across the concurrent pool so a run never bursts past
// the provider's rate limit.
let aiChain: Promise<unknown> = Promise.resolve();
function aiQueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = aiChain.then(fn, fn);
  aiChain = next.catch(() => undefined);
  return next;
}

// ---------------------------------------------------------------------------

async function auditLive(s: Record<string, unknown>, rules: Record<string, unknown> | null, students: Record<string, unknown>[], supabase: ReturnType<typeof createClient>) {
  const eligibleSchools = (rules?.eligible_schools as string[] | null) ?? [];
  const eligibleMajors = (rules?.eligible_majors as string[] | null) ?? [];
  const minGpa = (rules?.min_gpa as number | null) ?? (s.min_gpa as number | null) ?? null;
  const url = s.application_url as string | null;
  const { tests: link, pageText } = await testLink(url);
  const text = [s.name, s.description, s.application_requirements, s.apply_notes].filter(Boolean).join(" \n ");
  const criteria: CriteriaMap = {
    name: testName(s.name as string | null),
    deadline: testDeadline(s.deadline as string | null),
    eligibility: testEligibility(text),
    lead_gen: testLeadGen((s.name as string) ?? "", (s.provider as string) ?? "", hostOf(url)),
    page_lead_gen: testPageLeadGen(pageText),
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
      link_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", s.id);
    await supabase.from("pipeline_runs").insert({ scholarship_id: s.id, scholarship_name: s.name, passed: false, link_status: link.url_resolves.pass ? "ok" : "broken", reason: failures });
  } else {
    await supabase.from("scholarships").update({ link_checked_at: new Date().toISOString() }).eq("id", s.id);
  }
  return { passed: !hardFail, deactivated: hardFail, criteria, failures: passed ? null : failures };
}

// Pure evaluation of a staged row, including the pre-publish run-through.
// No database writes, so it also powers dry-run test cases.
async function evaluateStaged(s: Record<string, unknown>, students: Record<string, unknown>[]) {
  const url = (s.application_url ?? s.source_url) as string | null;
  const { tests: link, pageText } = await testLink(url);
  const name = ((s.name ?? s.title) as string | null) ?? "";
  const provider = (s.provider as string) ?? "";
  const description = (s.description as string) ?? "";
  const text = [name, description, s.eligibility_raw, s.application_requirements].filter(Boolean).join(" \n ");
  const criteria: CriteriaMap = {
    name: testName(name),
    provider: testProvider(provider),
    deadline: testDeadline(s.deadline as string | null),
    award_amount: testAwardAmount(s.award_amount as string | null),
    description: testDescription(description),
    eligibility: testEligibility(text),
    lead_gen: testLeadGen(name, provider, hostOf(url)),
    matches_students: testMatchesSomeStudent([], [], (s.min_gpa as number | null) ?? null, students),
    ...link,
    page_lead_gen: testPageLeadGen(pageText),
  };
  // The run-through only matters for rows that would otherwise be promoted;
  // skipping it for rows already failing keeps the AI cost proportional.
  if (summarize(criteria).passed && url) {
    criteria.page_identity = testPageIdentity(name, pageText);
    if (criteria.page_identity.pass) {
      const { result } = await aiQueue(() => aiReview({ name, provider, amount: s.award_amount, deadline: s.deadline, description }, url, pageText));
      criteria.ai_run_through = result;
    }
  }
  return { url, name, criteria, ...summarize(criteria) };
}

async function auditStaged(s: Record<string, unknown>, students: Record<string, unknown>[], supabase: ReturnType<typeof createClient>) {
  const { url, name, criteria, passed, hardFail, failures } = await evaluateStaged(s, students);
  const now = new Date().toISOString();

  if (passed && criteria.ai_run_through?.pass === true) {
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
  // Only fixable gaps (or an unverifiable page): keep in the review queue.
  await supabase.from("scholarship_staging").update({ status: "needs_review", audit_passed: false, audit_ran_at: now, audit_criteria: criteria, audit_failure: `HOLD: ${failures || "pre-publish run-through did not complete"}` }).eq("id", s.id);
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

  // Dry run: evaluate test cases (row-shaped objects) with the full staged
  // gate, including the pre-publish run-through. Writes nothing.
  if (body.dry_run === true) {
    const cases = Array.isArray(body.cases) ? body.cases as Record<string, unknown>[] : [];
    const results = await runPool(cases, async (c) => {
      const r = await evaluateStaged(c, allStudents);
      const wouldPromote = r.passed && r.criteria.ai_run_through?.pass === true;
      return { name: r.name, url: r.url, outcome: wouldPromote ? "promote" : r.hardFail ? "reject" : "hold", failures: r.failures, ai: r.criteria.ai_run_through?.reason ?? null };
    });
    return new Response(JSON.stringify({ dry_run: true, results }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

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
