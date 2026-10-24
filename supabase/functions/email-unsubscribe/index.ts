import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// One-click unsubscribe for every Elevaid email.
//   GET  ?u=<user_id>&t=<token>  -> confirmation page (link in the email body)
//   POST ?u=<user_id>&t=<token>  -> RFC 8058 one-click (List-Unsubscribe-Post)
// The token is an HMAC of the user id keyed with the Vault pipeline secret, so
// links can't be forged for other users.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${message}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Elevaid</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1628;font-family:system-ui,-apple-system,sans-serif;color:#fff;padding:24px">
<div style="max-width:440px;text-align:center"><div style="color:#E8B84B;font-weight:700;font-size:20px;margin-bottom:16px">Elevaid</div>
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p style="color:rgba(255,255,255,.7);line-height:1.5;margin:0 0 24px">${body}</p>
<a href="https://elevaid.pro/dashboard" style="color:#E8B84B;text-decoration:none;font-weight:600">Go to my matches →</a></div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!UUID_RE.test(userId) || token.length !== 40) return page("Link not valid", "This unsubscribe link is incomplete. Use the link from your most recent Elevaid email.", 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: secret } = await supabase.rpc("pipeline_secret");
  if (typeof secret !== "string" || secret.length < 32) return page("Something went wrong", "Please try again in a few minutes.", 500);
  const expected = await hmacHex(secret, userId);
  if (!timingSafeEqual(expected, token)) return page("Link not valid", "This unsubscribe link isn't valid. Use the link from your most recent Elevaid email.", 400);

  const { error } = await supabase.from("student_profiles").update({ email_opt_out: true }).eq("user_id", userId);
  if (error) return page("Something went wrong", "We couldn't update your preferences. Please try again in a few minutes.", 500);

  if (req.method === "POST") return new Response("ok", { status: 200 });
  return page("You're unsubscribed", "You won't get scholarship emails from Elevaid anymore. Your matches are still on your dashboard whenever you want them.");
});
