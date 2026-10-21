import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ownerEmail = Deno.env.get("OWNER_EMAIL")?.toLowerCase();
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !serviceKey || !ownerEmail || !token) return response({ error: "Unauthorized." }, 401);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const user = authData.user;
  if (authError || !user || user.email?.toLowerCase() !== ownerEmail) return response({ error: "Unauthorized." }, 401);

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError || role?.role !== "admin") return response({ error: "Unauthorized." }, 403);

  const { data: activeSession, error: sessionError } = await supabase
    .from("admin_sessions")
    .select("id")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (sessionError || !activeSession) return response({ error: "Admin PIN session expired." }, 401);

  // Runs the server-side pipeline gate (scholarship-audit): re-checks live
  // scholarships, then promotes / holds / rejects everything in staging.
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  if (body.action === "status") return response({ configured: true });

  const auditResponse = await fetch(`${url}/functions/v1/scholarship-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ source: "admin" }),
  }).catch(() => null);
  if (!auditResponse) return response({ error: "Could not reach the pipeline." }, 502);
  const result = await auditResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!auditResponse.ok) return response({ error: `Pipeline run failed (${auditResponse.status}).`, details: result }, 502);
  return response({ ok: true, status: "completed", ...result });
});
