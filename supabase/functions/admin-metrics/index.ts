import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "GET" && request.method !== "POST") return response({ error: "Method not allowed." }, 405);

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

  const { data: session, error: sessionError } = await supabase
    .from("admin_sessions")
    .select("id")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (sessionError || !session) return response({ error: "Admin PIN session expired." }, 401);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let totalUsers = 0;
  let signupsLast7Days = 0;
  let signupsLast30Days = 0;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return response({ error: "Could not load account metrics." }, 500);
    totalUsers += data.users.length;
    for (const account of data.users) {
      const createdAt = Date.parse(account.created_at);
      if (createdAt >= sevenDaysAgo) signupsLast7Days += 1;
      if (createdAt >= thirtyDaysAgo) signupsLast30Days += 1;
    }
    if (data.users.length < 1000) break;
  }

  return response({ totalUsers, signupsLast7Days, signupsLast30Days });
});
