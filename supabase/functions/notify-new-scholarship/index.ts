import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const payload = await req.json();
    const scholarship = payload.record;

    if (!scholarship || !scholarship.is_active) {
      return new Response(JSON.stringify({ message: "Not active, skipping" }), { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get all student profiles
    const { data: students, error } = await supabase
      .from("student_profiles")
      .select("*");

    if (error || !students) {
      return new Response(JSON.stringify({ error }), { status: 500 });
    }

    // Get eligibility rules for this scholarship
    const { data: rules } = await supabase
      .from("eligibility_rules")
      .select("*")
      .eq("scholarship_id", scholarship.id)
      .maybeSingle();

    // Filter matching students
    const matching = students.filter((student) => {
      if (rules?.eligible_schools?.length > 0 && !rules.eligible_schools.includes(student.school)) return false;
      if (rules?.min_gpa && student.gpa < rules.min_gpa) return false;
      if (rules?.graduation_year_min && student.graduation_year < rules.graduation_year_min) return false;
      if (rules?.graduation_year_max && student.graduation_year > rules.graduation_year_max) return false;
      if (rules?.eligible_majors?.length > 0 && !rules.eligible_majors.includes(student.major)) return false;
      return true;
    });

    // Send email to each matching student
    const emails = await Promise.all(
      matching.map(async (student) => {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Elevaid <notifications@elevaid.pro>",
            to: student.email,
            subject: `New scholarship match: ${scholarship.name}`,
            html: `
              <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; background: #0A1628; color: #fff; border-radius: 16px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #1a1a3e, #2d1b69); padding: 2rem; text-align: center;">
                  <h1 style="font-size: 1.4rem; color: #E8B84B; margin: 0;">🎓 New Match, ${student.first_name}</h1>
                </div>
                <div style="padding: 2rem;">
                  <p style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">A new scholarship was just added that you qualify for:</p>
                  <div style="background: #111E2E; border-radius: 12px; padding: 1.25rem; margin: 1rem 0; border: 1px solid rgba(255,255,255,0.07);">
                    <h2 style="color: #fff; font-size: 1rem; margin: 0 0 0.5rem;">${scholarship.name}</h2>
                    <p style="color: #E8B84B; font-size: 1.1rem; font-weight: 700; margin: 0 0 0.5rem;">$${scholarship.award_amount?.toLocaleString()}</p>
                    <p style="color: rgba(255,255,255,0.4); font-size: 0.8rem; margin: 0;">Deadline: ${new Date(scholarship.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <a href="https://elevaid.pro/dashboard" style="display: block; background: #E8B84B; color: #0A1628; text-align: center; padding: 0.9rem; border-radius: 10px; font-weight: 700; text-decoration: none; margin-top: 1.5rem;">View My Matches →</a>
                  <p style="color: rgba(255,255,255,0.2); font-size: 0.7rem; text-align: center; margin-top: 1.5rem;">Where access meets opportunity · elevaid.pro</p>
                </div>
              </div>
            `,
          }),
        });
        return res.ok;
      })
    );

    return new Response(
      JSON.stringify({ matched: matching.length, sent: emails.filter(Boolean).length }),
      { status: 200 }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});