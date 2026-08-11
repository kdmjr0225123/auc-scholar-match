import { createClient } from "https:

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SCORE_AND_VALIDATE_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/score-and-validate`;

type LinkStatus = "active" | "broken" | "redirected" | "captcha" | "timeout";

async function recheckLinks(): Promise<{ rechecked: number; deactivated: number; recovered: number }> {
  const { data: scholarships, error } = await supabase
    .from("scholarships")
    .select("id, name, application_url, is_active, link_status")
    .in("pipeline_status", ["approved"])
    .order("link_checked_at", { ascending: true, nullsFirst: true })
    .limit(100);

  if (error || !scholarships) return { rechecked: 0, deactivated: 0, recovered: 0 };

  let deactivated = 0;
  let recovered = 0;

  for (const s of scholarships) {
    const result = await checkSingleLink(s.application_url);
    const nowActive = result.status === "active" || result.status === "redirected";
    const wasActive = s.is_active;

    await supabase
      .from("scholarships")
      .update({
        link_status: result.status,
        link_checked_at: new Date().toISOString(),
        is_active: nowActive,

        pipeline_status: nowActive ? "approved" : "quarantined",
        quarantine_reason: nowActive
          ? null
          : `Link re-check failed: ${result.status}. ${result.notes ?? ""}`,
      })
      .eq("id", s.id);

    await supabase.from("pipeline_runs").insert({
      scholarship_id: s.id,
      run_type: "maintenance",
      link_status: result.status,
      notes: `Daily link re-check. ${result.notes ?? ""}`,
    });

    if (wasActive && !nowActive) deactivated++;
    if (!wasActive && nowActive) recovered++;
  }

  return { rechecked: scholarships.length, deactivated, recovered };
}

async function checkSingleLink(url: string): Promise<{ status: LinkStatus; notes?: string }> {
  if (!url) return { status: "broken", notes: "No URL" };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": "ElevaidBot/1.0" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 200) return { status: res.url !== url ? "redirected" : "active" };
    if (res.status === 404) return { status: "broken", notes: "404 Not Found" };
    if (res.status === 403) return { status: "captcha", notes: "403 Forbidden" };
    if (res.status >= 500) return { status: "broken", notes: `Server error ${res.status}` };
    return { status: "broken", notes: `HTTP ${res.status}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return { status: "timeout", notes: "Timed out" };
    return { status: "broken", notes: `${err instanceof Error ? err.message : String(err)}` };
  }
}

async function refreshScores(): Promise<{ refreshed: number; flagged: number }> {

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: scholarships, error } = await supabase
    .from("scholarships")
    .select("id")
    .eq("pipeline_status", "approved")
    .or(`last_pipeline_run.is.null,last_pipeline_run.lt.${sevenDaysAgo.toISOString()}`)
    .limit(50);

  if (error || !scholarships) return { refreshed: 0, flagged: 0 };

  let flagged = 0;

  for (const s of scholarships) {
    const res = await fetch(SCORE_AND_VALIDATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ scholarship_id: s.id, run_type: "maintenance" }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.results?.[0]?.pipeline_status === "quarantined") flagged++;
    }
  }

  return { refreshed: scholarships.length, flagged };
}

async function deactivateExpired(): Promise<{ expired: number }> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("scholarships")
    .update({ is_active: false, pipeline_status: "quarantined", quarantine_reason: "Deadline has passed" })
    .lt("deadline", today)
    .eq("is_active", true)
    .select("id");

  if (error) return { expired: 0 };
  return { expired: data?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const mode: string = body.mode ?? "full";

    const report: Record<string, unknown> = {
      started_at: new Date().toISOString(),
      mode,
    };

    const expired = await deactivateExpired();
    report.expired_deactivated = expired.expired;

    if (mode === "daily" || mode === "full") {
      const links = await recheckLinks();
      report.link_recheck = links;
    }

    if (mode === "weekly" || mode === "full") {
      const scores = await refreshScores();
      report.score_refresh = scores;
    }

    report.finished_at = new Date().toISOString();

    console.log("Maintenance run complete:", JSON.stringify(report));

    return new Response(JSON.stringify(report), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("maintenance-runner error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
