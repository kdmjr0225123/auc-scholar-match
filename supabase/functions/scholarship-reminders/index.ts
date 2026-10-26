import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateMatch, type MatchProfile, type MatchRules } from "./matching.ts";

// Deadline reminders (7 days and 2 days out) for matching students.
// Skips students who unsubscribed; every email carries a one-click unsubscribe.
// Called by pg_cron with x-pipeline-secret (or the service-role key).

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UNSUB_BASE = `${SUPABASE_URL}/functions/v1/email-unsubscribe`;

const REMINDER_DAYS = [7, 2];

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${message}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function isMatch(student: Record<string, unknown>, rules: Record<string, unknown> | null): boolean {
  if (!student.email) return false;
  return evaluateMatch(student as unknown as MatchProfile, rules as MatchRules | null).verdict !== "ineligible";
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: secret } = await supabase.rpc("pipeline_secret");
  if (typeof secret !== "string" || secret.length < 32) return new Response(JSON.stringify({ error: "Pipeline secret unavailable" }), { status: 500 });
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const provided = req.headers.get("x-pipeline-secret") ?? "";
  if (!(bearer === SUPABASE_SERVICE_KEY || provided === secret)) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const today = new Date();
  const deadlineDates = REMINDER_DAYS.map((n) => fmt(addDays(today, n)));

  const { data: scholarships } = await supabase
    .from("scholarships")
    .select("*")
    .eq("is_active", true)
    .eq("pipeline_status", "approved")
    .in("deadline", deadlineDates);

  if (!scholarships || scholarships.length === 0) {
    return new Response(JSON.stringify({ message: "No deadlines in range" }), { status: 200 });
  }

  const { data: students } = await supabase.from("student_profiles").select("*").eq("email_opt_out", false);
  if (!students || students.length === 0) {
    return new Response(JSON.stringify({ message: "No students" }), { status: 200 });
  }

  const unsubByUser = new Map<string, string>();
  for (const s of students) unsubByUser.set(s.user_id, `${UNSUB_BASE}?u=${s.user_id}&t=${await hmacHex(secret, s.user_id)}`);

  let totalSent = 0;
  const errors: string[] = [];

  for (const scholarship of scholarships) {
    const { data: rules } = await supabase
      .from("eligibility_rules")
      .select("*")
      .eq("scholarship_id", scholarship.id)
      .maybeSingle();

    const daysLeft = scholarship.deadline === fmt(addDays(today, 2)) ? 2 : 7;
    const urgencyColor = daysLeft === 2 ? "#ff6b6b" : "#E8B84B";
    const urgencyLabel = daysLeft === 2 ? "Last 2 days" : "7 days left";
    const matching = students.filter((s: Record<string, unknown>) => isMatch(s, rules));
    if (matching.length === 0) continue;

    const amount = Number(scholarship.award_amount) > 0 ? `$${Number(scholarship.award_amount).toLocaleString("en-US")}` : "Award varies";
    const batchEmails = matching.map((student: Record<string, any>) => {
      const unsub = unsubByUser.get(student.user_id) as string;
      return {
        from: "Elevaid <notifications@elevaid.pro>",
        to: student.email,
        subject: `${daysLeft === 2 ? "Last chance" : "Closing soon"}: ${scholarship.name}`,
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0A1628;color:#fff;border-radius:16px;overflow:hidden"><div style="background:linear-gradient(135deg,#1a1a3e,#2d1b69);padding:2rem;text-align:center"><h1 style="font-size:1.4rem;color:${urgencyColor};margin:0">${urgencyLabel} - ${esc(student.first_name)}, don't miss this</h1></div><div style="padding:2rem"><p style="color:rgba(255,255,255,0.7);font-size:0.9rem">This scholarship closes in ${daysLeft} days:</p><div style="background:#111E2E;border-radius:12px;padding:1.25rem;margin:1rem 0;border:1px solid rgba(255,255,255,0.07)"><h2 style="color:#fff;font-size:1rem;margin:0 0 0.5rem">${esc(scholarship.name)}</h2><p style="color:#E8B84B;font-size:1.1rem;font-weight:700;margin:0 0 0.5rem">${amount}</p><p style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin:0">Deadline: ${new Date(`${scholarship.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p></div><a href="${esc(scholarship.application_url)}" style="display:block;background:#E8B84B;color:#0A1628;text-align:center;padding:0.9rem;border-radius:10px;font-weight:700;text-decoration:none;margin-top:1.5rem">Apply now</a><a href="https://elevaid.pro/dashboard" style="display:block;color:rgba(255,255,255,0.4);text-align:center;padding:0.75rem;text-decoration:none;font-size:0.8rem;margin-top:0.5rem">View all my matches</a><p style="color:rgba(255,255,255,0.3);font-size:0.7rem;text-align:center;margin-top:1.5rem">Where access meets opportunity - elevaid.pro<br><a href="${unsub}" style="color:rgba(255,255,255,0.5)">Unsubscribe</a></p></div></div>`,
      };
    });

    for (let i = 0; i < batchEmails.length; i += 100) {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(batchEmails.slice(i, i + 100)),
      });
      if (res.ok) totalSent += Math.min(100, batchEmails.length - i);
      else errors.push(`${scholarship.name}: ${await res.text()}`);
    }
  }

  return new Response(JSON.stringify({ scholarships: scholarships.length, sent: totalSent, errors }), { status: 200 });
});
