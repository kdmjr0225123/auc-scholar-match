import { createClient } from "https:

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const TRUSTED_DOMAINS = [
  ".edu", ".gov", ".org",
  "fastweb.com", "scholarships.com", "cappex.com",
  "petersons.com", "unigo.com", "collegeboard.org",
  "uncf.org", "thurgoodmarshallfund.net", "bonner.org",
];

const SUSPICIOUS_SIGNALS = [
  "fee required", "processing fee", "guaranteed scholarship",
  "no essay required", "instant approval", "pay to apply",
  "wire transfer", "western union",
];

interface ScoreBreakdown {
  domainTrust: number;
  httpsEnforced: number;
  providerLegit: number;
  amountSanity: number;
  descriptionQuality: number;
  deadlineValid: number;
  total: number;
  flags: string[];
}

function scoreScholarship(scholarship: Record<string, unknown>): ScoreBreakdown {
  const flags: string[] = [];
  let domainTrust = 0;
  let httpsEnforced = 0;
  let providerLegit = 0;
  let amountSanity = 0;
  let descriptionQuality = 0;
  let deadlineValid = 0;

  const url = (scholarship.application_url as string) || "";
  const provider = ((scholarship.provider as string) || "").toLowerCase();
  const description = ((scholarship.description as string) || "").toLowerCase();
  const amount = scholarship.award_amount as number;
  const deadline = scholarship.deadline as string;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (TRUSTED_DOMAINS.some((d) => host.endsWith(d))) {
      domainTrust = 30;
    } else if (host.includes("scholarship") || host.includes("foundation") || host.includes("fund")) {
      domainTrust = 18;
    } else if (host.endsWith(".com") || host.endsWith(".net")) {
      domainTrust = 10;
    } else {
      domainTrust = 5;
      flags.push("Unknown domain extension");
    }

    if (parsed.protocol === "https:") {
      httpsEnforced = 15;
    } else {
      httpsEnforced = 0;
      flags.push("URL is not HTTPS");
    }
  } catch {
    domainTrust = 0;
    httpsEnforced = 0;
    flags.push("Invalid URL format");
  }

  if (
    provider.includes("university") ||
    provider.includes("college") ||
    provider.includes("foundation") ||
    provider.includes("institute") ||
    provider.includes("association") ||
    provider.includes("fund")
  ) {
    providerLegit = 20;
  } else if (provider.length > 5) {
    providerLegit = 12;
  } else {
    providerLegit = 5;
    flags.push("Provider name is vague or too short");
  }

  if (amount > 0 && amount <= 100000) {
    amountSanity = 15;
  } else if (amount > 100000) {
    amountSanity = 5;
    flags.push(`Unusually high award amount: $${amount.toLocaleString()}`);
  } else {
    amountSanity = 0;
    flags.push("Award amount is zero or missing");
  }

  const descWords = description.split(/\s+/).filter(Boolean).length;
  if (descWords >= 30) {
    descriptionQuality = 10;
  } else if (descWords >= 10) {
    descriptionQuality = 5;
  } else {
    descriptionQuality = 0;
    flags.push("Description is too short");
  }

  const suspiciousFound = SUSPICIOUS_SIGNALS.filter((s) => description.includes(s));
  if (suspiciousFound.length > 0) {
    descriptionQuality = Math.max(0, descriptionQuality - 10);
    flags.push(`Suspicious language detected: "${suspiciousFound[0]}"`);
  }

  if (deadline) {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const oneYearOut = new Date();
    oneYearOut.setFullYear(now.getFullYear() + 2);

    if (deadlineDate > now && deadlineDate < oneYearOut) {
      deadlineValid = 10;
    } else if (deadlineDate <= now) {
      deadlineValid = 0;
      flags.push("Deadline has already passed");
    } else {
      deadlineValid = 5;
      flags.push("Deadline is more than 2 years away");
    }
  } else {
    deadlineValid = 0;
    flags.push("No deadline specified");
  }

  const total = domainTrust + httpsEnforced + providerLegit + amountSanity + descriptionQuality + deadlineValid;

  return {
    domainTrust,
    httpsEnforced,
    providerLegit,
    amountSanity,
    descriptionQuality,
    deadlineValid,
    total,
    flags,
  };
}

type LinkStatus = "active" | "broken" | "redirected" | "captcha" | "timeout";

async function validateLink(url: string): Promise<{ status: LinkStatus; finalUrl?: string; notes?: string }> {
  if (!url) return { status: "broken", notes: "No URL provided" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ElevaidBot/1.0; scholarship validator)",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const finalUrl = response.url;
    const wasRedirected = finalUrl !== url && !finalUrl.startsWith(url);

    if (response.status === 200) {
      const text = await response.text();
      const lower = text.toLowerCase();

      if (
        lower.includes("captcha") ||
        lower.includes("cloudflare") ||
        lower.includes("access denied") ||
        lower.includes("ddos protection")
      ) {
        return { status: "captcha", finalUrl, notes: "Page is behind a bot protection wall" };
      }

      if (
        lower.includes("page not found") ||
        lower.includes("404") ||
        lower.includes("this page doesn't exist") ||
        lower.includes("scholarship is no longer available")
      ) {
        return { status: "broken", finalUrl, notes: "Page returned 200 but content suggests removed" };
      }

      if (wasRedirected) {
        return { status: "redirected", finalUrl, notes: `Redirected from original URL` };
      }

      return { status: "active", finalUrl };
    }

    if (response.status === 404) return { status: "broken", notes: "HTTP 404 Not Found" };
    if (response.status === 403) return { status: "captcha", notes: "HTTP 403 Forbidden / access blocked" };
    if (response.status >= 500) return { status: "broken", notes: `Server error: HTTP ${response.status}` };

    return { status: "broken", notes: `Unexpected HTTP status: ${response.status}` };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "timeout", notes: "Request timed out after 10s" };
    }
    return { status: "broken", notes: `Fetch error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const CONFIDENCE_THRESHOLD = 45;

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

    const targetId: string | null = body.scholarship_id ?? null;
    const runType: string = body.run_type ?? "manual";

    let query = supabase.from("scholarships").select("*");
    if (targetId) {
      query = query.eq("id", targetId);
    } else {

      query = query.in("pipeline_status", ["pending"]);
    }

    const { data: scholarships, error } = await query;
    if (error) throw error;
    if (!scholarships || scholarships.length === 0) {
      return new Response(JSON.stringify({ message: "No scholarships to process", processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const scholarship of scholarships) {

      const scoreResult = scoreScholarship(scholarship);

      const linkResult = await validateLink(scholarship.application_url);

      const passesScore = scoreResult.total >= CONFIDENCE_THRESHOLD;
      const linkOk = linkResult.status === "active" || linkResult.status === "redirected";

      let pipelineStatus: string;
      let quarantineReason: string | null = null;

      if (!passesScore) {
        pipelineStatus = "quarantined";
        quarantineReason = `Confidence score too low (${scoreResult.total}/100). Flags: ${scoreResult.flags.join("; ")}`;
      } else if (!linkOk) {
        pipelineStatus = "quarantined";
        quarantineReason = `Link validation failed: ${linkResult.status}. ${linkResult.notes ?? ""}`;
      } else {
        pipelineStatus = "approved";
      }

      const { error: updateError } = await supabase
        .from("scholarships")
        .update({
          confidence_score: scoreResult.total,
          link_status: linkResult.status,
          link_checked_at: new Date().toISOString(),
          pipeline_status: pipelineStatus,
          quarantine_reason: quarantineReason,
          last_pipeline_run: new Date().toISOString(),

          is_active: pipelineStatus === "approved",
        })
        .eq("id", scholarship.id);

      if (updateError) console.error(`Update failed for ${scholarship.id}:`, updateError);

      await supabase.from("pipeline_runs").insert({
        scholarship_id: scholarship.id,
        run_type: runType,
        confidence_score: scoreResult.total,
        link_status: linkResult.status,
        notes: [
          `Score breakdown: domain=${scoreResult.domainTrust} https=${scoreResult.httpsEnforced} provider=${scoreResult.providerLegit} amount=${scoreResult.amountSanity} desc=${scoreResult.descriptionQuality} deadline=${scoreResult.deadlineValid}`,
          scoreResult.flags.length ? `Flags: ${scoreResult.flags.join("; ")}` : null,
          linkResult.notes ?? null,
        ]
          .filter(Boolean)
          .join(" | "),
      });

      results.push({
        id: scholarship.id,
        name: scholarship.name,
        confidence_score: scoreResult.total,
        link_status: linkResult.status,
        pipeline_status: pipelineStatus,
        flags: scoreResult.flags,
      });
    }

    const approved = results.filter((r) => r.pipeline_status === "approved").length;
    const quarantined = results.filter((r) => r.pipeline_status === "quarantined").length;

    return new Response(
      JSON.stringify({ processed: results.length, approved, quarantined, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("score-and-validate error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
