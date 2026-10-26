import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateMatch, type MatchProfile, type MatchRules } from "./matching.ts";

// Daily "new matches" email. Replaces the per-scholarship email that fired on
// every promotion: each student gets at most ONE email per day, only when at
// least one newly-live scholarship matches them, with a one-click unsubscribe.
// Called by pg_cron (x-pipeline-secret) or with the service-role key.
// Body: { dry_run?: boolean } -> dry run reports who would be emailed, sends nothing.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "Elevaid <notifications@elevaid.pro>";
const UNSUB_BASE = `${SUPABASE_URL}/functions/v1/email-unsubscribe`;
const MAX_LISTED = 5;
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000; // never backfill a student's whole history
const RESEND_BATCH = 100;

type Row = Record<string, unknown>;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${message}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// Same engine as the dashboard: a student is emailed about a scholarship they
// qualify for, or one they may qualify for pending a detail only they know.
function isMatch(student: Row, rules: Row | null): boolean {
  return evaluateMatch(student as unknown as MatchProfile, rules as MatchRules | null).verdict !== "ineligible";
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function money(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `$${v.toLocaleString("en-US")}` : "Award varies";
}

function dateLabel(d: unknown): string {
  if (!d) return "Rolling deadline";
  const dt = new Date(`${d}T12:00:00Z`);
  return isNaN(dt.getTime()) ? "" : `Due ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

function renderEmail(firstName: string, items: Row[], extra: number, unsubUrl: string): string {
  const cards = items.map((s) => `
    <tr><td style="padding:0 0 12px"><div style="background:#111E2E;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px">
      <div style="color:#fff;font-size:15px;font-weight:700;margin:0 0 4px">${esc(s.name)}</div>
      <div style="color:rgba(255,255,255,.55);font-size:12px;margin:0 0 8px">${esc(s.provider)}</div>
      <div style="font-size:14px"><span style="color:#E8B84B;font-weight:700">${money(s.award_amount)}</span>
      <span style="color:rgba(255,255,255,.45)"> · ${dateLabel(s.deadline)}</span></div>
    </div></td></tr>`).join("");
  const more = extra > 0 ? `<p style="color:rgba(255,255,255,.6);font-size:13px;margin:4px 0 0">+ ${extra} more on your dashboard</p>` : "";
  const total = items.length + extra;
  return `<!doctype html><html><body style="margin:0;background:#0A1628">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A1628"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff">
<tr><td style="padding:0 0 20px"><span style="color:#E8B84B;font-weight:800;font-size:18px">Elevaid</span></td></tr>
<tr><td style="padding:0 0 6px"><h1 style="margin:0;font-size:22px">${esc(firstName) || "Hi"}, ${total === 1 ? "a new scholarship matches you" : `${total} new scholarships match you`}</h1></td></tr>
<tr><td style="padding:0 0 18px;color:rgba(255,255,255,.65);font-size:14px">Verified and open now. Added to your matches today.</td></tr>
${cards}
<tr><td>${more}</td></tr>
<tr><td style="padding:18px 0 0"><a href="https://elevaid.pro/dashboard" style="display:block;background:#E8B84B;color:#0A1628;text-align:center;padding:14px;border-radius:10px;font-weight:700;text-decoration:none">View my matches</a></td></tr>
<tr><td style="padding:24px 0 0;color:rgba(255,255,255,.35);font-size:11px;text-align:center;line-height:1.6">
You're getting this because you have an Elevaid account. At most one match email a day.<br>
<a href="${unsubUrl}" style="color:rgba(255,255,255,.55)">Unsubscribe</a> · Where access meets opportunity · elevaid.pro</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: secret } = await supabase.rpc("pipeline_secret");
  if (typeof secret !== "string" || secret.length < 32) return new Response(JSON.stringify({ error: "Pipeline secret unavailable" }), { status: 500 });
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const provided = req.headers.get("x-pipeline-secret") ?? "";
  if (!(bearer === SUPABASE_SERVICE_KEY || provided === secret)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean };
  const dryRun = body.dry_run === true;
  if (!dryRun && !RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500 });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data: scholarships } = await supabase.from("scholarships")
    .select("id, name, provider, award_amount, deadline, created_at")
    .eq("is_active", true).eq("pipeline_status", "approved");
  const live = ((scholarships ?? []) as Row[]).filter((s) => !s.deadline || (s.deadline as string) >= today);
  if (live.length === 0) return new Response(JSON.stringify({ sent: 0, reason: "no live scholarships" }), { status: 200 });

  const { data: rulesRows } = await supabase.from("eligibility_rules").select("*").in("scholarship_id", live.map((s) => s.id));
  const rulesBy = new Map(((rulesRows ?? []) as Row[]).map((r) => [r.scholarship_id as string, r]));

  const { data: students } = await supabase.from("student_profiles")
    .select("user_id, first_name, email, school, gpa, major, graduation_year, first_gen, pell_eligible, home_state, greek_org, email_opt_out, last_match_email_at")
    .eq("email_opt_out", false).not("email", "is", null);

  const outgoing: { userId: string; email: string; payload: Record<string, unknown>; count: number }[] = [];
  for (const st of (students ?? []) as Row[]) {
    const lastSent = st.last_match_email_at ? new Date(st.last_match_email_at as string).getTime() : now.getTime() - FIRST_RUN_LOOKBACK_MS;
    const since = Math.max(lastSent, now.getTime() - FIRST_RUN_LOOKBACK_MS * 7); // cap at one week even after a pause
    const fresh = live
      .filter((s) => new Date(s.created_at as string).getTime() > since)
      .filter((s) => isMatch(st, rulesBy.get(s.id as string) ?? null))
      .sort((a, b) => Number(b.award_amount ?? 0) - Number(a.award_amount ?? 0));
    if (fresh.length === 0) continue;

    const userId = st.user_id as string;
    const unsubUrl = `${UNSUB_BASE}?u=${userId}&t=${await hmacHex(secret, userId)}`;
    const shown = fresh.slice(0, MAX_LISTED);
    const subject = fresh.length === 1
      ? `New scholarship match: ${fresh[0].name as string}`
      : `${fresh.length} new scholarships match you`;
    outgoing.push({
      userId, email: st.email as string, count: fresh.length,
      payload: {
        from: FROM, to: st.email, subject,
        html: renderEmail((st.first_name as string) ?? "", shown, fresh.length - shown.length, unsubUrl),
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      },
    });
  }

  if (dryRun) {
    return new Response(JSON.stringify({ dry_run: true, would_email: outgoing.length, live: live.length, sample: outgoing.slice(0, 5).map((o) => ({ user_id: o.userId, matches: o.count, subject: o.payload.subject })) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  let sent = 0;
  const errors: string[] = [];
  for (let i = 0; i < outgoing.length; i += RESEND_BATCH) {
    const chunk = outgoing.slice(i, i + RESEND_BATCH);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map((o) => o.payload)),
    });
    if (!res.ok) { errors.push(`batch ${i / RESEND_BATCH}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); continue; }
    sent += chunk.length;
    await supabase.from("student_profiles").update({ last_match_email_at: now.toISOString() }).in("user_id", chunk.map((o) => o.userId));
  }

  await supabase.from("pipeline_logs").insert({
    ran_at: now.toISOString(), status: "match_email", scholarships_checked: live.length,
    scholarships_approved: sent, scholarships_quarantined: errors.length, scholarships_deactivated: 0,
    notes: `Match digest: ${sent} students emailed (one email each)${errors.length ? `; errors: ${errors.join(" | ")}` : ""}.`,
  });
  return new Response(JSON.stringify({ sent, errors }), { status: errors.length && !sent ? 502 : 200, headers: { "Content-Type": "application/json" } });
});
