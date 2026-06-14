import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: scholarships } = await supabase
    .from("scholarships")
    .select("*")
    .eq("is_active", true);

  if (!scholarships || scholarships.length === 0) {
    return new Response(JSON.stringify({ message: "No active scholarships" }), { status: 200 });
  }

  const results = {
    checked: 0,
    deactivated: 0,
    flagged: [] as string[],
  };

  const today = new Date();
  const twoMonthsFromNow = new Date(today);
  twoMonthsFromNow.setMonth(today.getMonth() + 2);

  for (const scholarship of scholarships) {
    results.checked++;
    const issues: string[] = [];

    // Check deadline — must be at least 2 months out
    if (scholarship.deadline) {
      const deadline = new Date(scholarship.deadline);
      if (deadline < today) {
        // Already expired — deactivate
        await supabase
          .from("scholarships")
          .update({ is_active: false })
          .eq("id", scholarship.id);
        results.deactivated++;
        continue;
      }
      if (deadline < twoMonthsFromNow) {
        issues.push(`Deadline within 2 months: ${scholarship.deadline}`);
      }
    } else {
      issues.push("Missing deadline");
    }

    // Check URL is reachable
    if (scholarship.application_url) {
      try {
        const res = await fetch(scholarship.application_url, {
          method: "HEAD",
          headers: { "User-Agent": "ElevaidBot/1.0" },
          redirect: "follow",
        });
        if (res.status === 404) {
          issues.push(`URL returns 404: ${scholarship.application_url}`);
        }
      } catch {
        issues.push(`URL unreachable: ${scholarship.application_url}`);
      }
    } else {
      issues.push("Missing application URL");
    }

    // Check required fields
    if (!scholarship.description || scholarship.description.length < 20) {
      issues.push("Missing or thin description");
    }
    if (!scholarship.award_amount || scholarship.award_amount <= 0) {
      issues.push("Missing award amount");
    }
    if (!scholarship.provider) {
      issues.push("Missing provider");
    }

    if (issues.length > 0) {
      results.flagged.push(`${scholarship.name}: ${issues.join(" | ")}`);
    }
  }

  // Log results to pipeline_logs
  await supabase.from("pipeline_logs").insert({
    ran_at: new Date().toISOString(),
    scholarships_deactivated: results.deactivated,
    status: results.flagged.length > 0 ? "issues_found" : "clean",
    notes: results.flagged.length > 0
      ? `Flagged ${results.flagged.length} scholarships:\n${results.flagged.join("\n")}`
      : `All ${results.checked} scholarships passed quality check`,
  });

  return new Response(JSON.stringify(results), { status: 200 });
});