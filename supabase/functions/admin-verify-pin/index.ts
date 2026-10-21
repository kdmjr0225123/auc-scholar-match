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
  if (body.action === "status") {
    const { data, error } = await supabase.rpc("admin_pin_status", { p_user_id: user.id });
    if (error) return response({ error: "PIN status is temporarily unavailable." }, 500);
    return response(objectValue(data));
  }
  if (body.action === "lock") {
    const { error } = await supabase.from("admin_sessions").delete().eq("user_id", user.id);
    if (error) return response({ error: "Could not lock the console." }, 500);
    return response({ ok: true });
  }
  if (body.action === "refresh") {
    const { data: session, error } = await supabase
      .from("admin_sessions")
      .update({ expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .limit(1)
      .maybeSingle();
    if (error || !session) return response({ ok: false, expired: true }, 401);
    return response({ ok: true, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
  }

  const pin = typeof body.pin === "string" ? body.pin : null;
  if (pin !== null && !/^\d{4}$/.test(pin)) return response({ error: "Enter a four-digit PIN." }, 400);
  const { data, error } = await supabase.rpc("admin_verify_pin", { p_user_id: user.id, p_pin: pin });
  if (error) return response({ error: "PIN verification is temporarily unavailable." }, 500);
  return response(objectValue(data));
});
