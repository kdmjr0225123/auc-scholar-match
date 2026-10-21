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

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
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

  const body = objectValue(await request.json().catch(() => ({})));
  const currentPin = typeof body.currentPin === "string" ? body.currentPin : null;
  const newPin = typeof body.newPin === "string" ? body.newPin : null;
  if (!newPin || !/^\d{4}$/.test(newPin)) return response({ error: "Enter a four-digit PIN." }, 400);

  const { data, error } = await supabase.rpc("admin_set_pin", {
    p_user_id: user.id,
    p_current_pin: currentPin,
    p_new_pin: newPin,
  });
  if (error) return response({ error: "PIN update is temporarily unavailable." }, 500);
  const result = objectValue(data);
  if (result.ok !== true) return response(result, 401);

  const { data: sessionData, error: verifyError } = await supabase.rpc("admin_verify_pin", {
    p_user_id: user.id,
    p_pin: newPin,
  });
  if (verifyError) return response({ error: "PIN saved, but session could not be started. Sign in again." }, 500);
  const session = objectValue(sessionData);
  return response({ ok: session.ok === true, expires_at: session.expires_at });
});
