import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Threshold from the user's own words: "no student should receive <4"
// scholarship matches. Any canary at or above this passes.
const MIN_MATCHES = 4;

interface SyntheticProfile {
  id: string;
  label: string;
  school: string;
  gpa: number;
  major: string;
  graduation_year: number;
}

interface EligibilityRule {
  min_gpa: number | null;
  max_gpa: number | null;
  eligible_schools: string[] | null;
  eligible_majors: string[] | null;
  graduation_year_min: number | null;
  graduation_year_max: number | null;
}

interface ScholarshipWithRules {
  id: string;
  is_active: boolean | null;
  eligibility_rules: EligibilityRule | EligibilityRule[] | null;
}

// This is a DELIBERATE, faithful mirror of Dashboard.tsx's calculateMatches
// — not an idealized eligibility spec. The real student dashboard only
// hard-excludes a scholarship on eligible_schools and graduation_year;
// GPA and eligible_majors are checked but never exclude a match, they only
// lower the displayed match percentage. So this synthetic check counts a
// scholarship as "matched" under the exact same rule: school + grad year
// only. If that ever changes in Dashboard.tsx, this predicate must change
// with it, or the canaries will be monitoring a matching system that no
// longer exists.
function isMatch(profile: SyntheticProfile, rules: EligibilityRule | null): boolean {
  if (!rules) return false; // no eligibility_rules row -> unmatchable, same as the dashboard

  const schools = rules.eligible_schools ?? [];
  const schoolMatch = schools.length === 0 || schools.includes(profile.school);
  if (!schoolMatch) return false;

  const yearInRange =
    (!rules.graduation_year_min || profile.graduation_year >= rules.graduation_year_min) &&
    (!rules.graduation_year_max || profile.graduation_year <= rules.graduation_year_max);
  if (!yearInRange) return false;

  // GPA and eligible_majors are intentionally NOT checked here — the real
  // app doesn't exclude on them either (confirmed against Dashboard.tsx).
  return true;
}

serve(async (req: Request) => {
  // Needed because this function is invoked directly from the browser
  // (the Admin page's "Run Now" button), not just server-side via cron —
  // without this, the browser's CORS preflight fails before the actual
  // request is ever sent, surfacing as "Failed to send a request to the
  // Edge Function" in the Supabase JS client.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const [{ data: profiles, error: profilesError }, { data: scholarships, error: scholarshipsError }] =
      await Promise.all([
        supabase.from("synthetic_profiles").select("*"),
        supabase
          .from("scholarships")
          .select("id, is_active, eligibility_rules (*)")
          .eq("is_active", true),
      ]);

    if (profilesError) throw profilesError;
    if (scholarshipsError) throw scholarshipsError;

    const liveScholarships = (scholarships ?? []) as ScholarshipWithRules[];

    // Insert the run row first so results can reference it, then backfill
    // its summary stats once every profile has been scored.
    const { data: run, error: runInsertError } = await supabase
      .from("synthetic_coverage_runs")
      .insert({ profiles_checked: 0, below_threshold_count: 0, status: "clean" })
      .select()
      .single();
    if (runInsertError) throw runInsertError;

    const belowThreshold: { label: string; match_count: number }[] = [];
    const matchCounts: number[] = [];
    const resultRows: { run_id: string; profile_id: string; match_count: number; passed: boolean }[] = [];

    for (const profile of (profiles ?? []) as SyntheticProfile[]) {
      let matchCount = 0;
      for (const scholarship of liveScholarships) {
        const rules = Array.isArray(scholarship.eligibility_rules)
          ? scholarship.eligibility_rules[0] ?? null
          : scholarship.eligibility_rules;
        if (isMatch(profile, rules ?? null)) matchCount++;
      }

      const passed = matchCount >= MIN_MATCHES;
      matchCounts.push(matchCount);
      if (!passed) belowThreshold.push({ label: profile.label, match_count: matchCount });

      resultRows.push({
        run_id: run.id,
        profile_id: profile.id,
        match_count: matchCount,
        passed,
      });
    }

    if (resultRows.length > 0) {
      const { error: resultsError } = await supabase.from("synthetic_coverage_results").insert(resultRows);
      if (resultsError) throw resultsError;
    }

    const minMatches = matchCounts.length > 0 ? Math.min(...matchCounts) : 0;
    const maxMatches = matchCounts.length > 0 ? Math.max(...matchCounts) : 0;
    const avgMatches =
      matchCounts.length > 0 ? matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length : 0;
    const status = belowThreshold.length > 0 ? "issues_found" : "clean";
    const notes =
      belowThreshold.length > 0
        ? belowThreshold
            .map((b) => `${b.label}: only ${b.match_count} match${b.match_count === 1 ? "" : "es"} (need ${MIN_MATCHES}+)`)
            .join("\n")
        : `All ${matchCounts.length} canary profiles matched ${MIN_MATCHES}+ active scholarships`;

    const { error: runUpdateError } = await supabase
      .from("synthetic_coverage_runs")
      .update({
        profiles_checked: matchCounts.length,
        below_threshold_count: belowThreshold.length,
        min_matches: minMatches,
        max_matches: maxMatches,
        avg_matches: avgMatches,
        status,
        notes,
      })
      .eq("id", run.id);
    if (runUpdateError) throw runUpdateError;

    return new Response(
      JSON.stringify({
        run_id: run.id,
        profiles_checked: matchCounts.length,
        below_threshold_count: belowThreshold.length,
        min_matches: minMatches,
        max_matches: maxMatches,
        avg_matches: avgMatches,
        status,
        below_threshold: belowThreshold,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
