/**
 * Matching precision check: what the engine SHOWS vs what a student actually QUALIFIES for.
 *
 *   node --experimental-strip-types scripts/eval-matching.ts [rules-snapshot.json]
 *
 * Truth:  tests/fixtures/scholarship-truth.json (verified eligibility per scholarship)
 * Engine: src/lib/eligibility.ts run against a snapshot of live eligibility data
 *
 * A shown scholarship is a FALSE POSITIVE when the truth table rules the student out.
 * Identity criteria we cannot check (e.g. lgbtq_or_ally) count as "uncertain", not wrong.
 */
import { readFileSync } from "node:fs";
import { checkEligibility, classYearFor } from "../src/lib/eligibility.ts";

type Truth = {
  name: string; award: number; class_years: string[]; min_gpa: number | null; gender: string;
  fields: string[]; schools: string[]; identity: string[]; enrollment: string; expires_today: boolean;
};
type Persona = { id: string; label: string; school: string; gpa: number; major: string; graduation_year: number;
  gender: "male" | "female"; identity: string[]; fields: string[] };

// Student major -> field families used by the truth table.
const MAJOR_FIELDS: Record<string, string[]> = {
  "Computer Science": ["stem", "information_technology", "mathematics"],
  "Engineering": ["stem", "engineering", "manufacturing", "transportation"],
  "Physics": ["stem", "physics"],
  "Biology": ["stem", "biology", "health"],
  "Psychology": ["psychology", "social_science", "counseling", "health"],
  "Business Administration": ["business"],
  "Finance": ["finance", "business"],
  "Economics": ["economics", "social_science", "business"],
  "Health Sciences": ["health", "biology"],
  "Public Health": ["health", "social_science"],
  "Kinesiology": ["kinesiology", "health"],
};

const PERSONAS: Persona[] = [
  { id: "A", label: "Morehouse · CS · 3.7 · senior", school: "morehouse", gpa: 3.7, major: "Computer Science", graduation_year: 2027, gender: "male", identity: ["black", "underrepresented_minority"], fields: [] },
  { id: "B", label: "Spelman · Psychology · 2.6 · sophomore", school: "spelman", gpa: 2.6, major: "Psychology", graduation_year: 2029, gender: "female", identity: ["black", "underrepresented_minority"], fields: [] },
  { id: "C", label: "Clark Atlanta · Finance · 3.1 · junior", school: "clark_atlanta", gpa: 3.1, major: "Finance", graduation_year: 2028, gender: "female", identity: ["black", "underrepresented_minority"], fields: [] },
];

const UNCHECKABLE = new Set(["lgbtq_or_ally"]);

function truthVerdict(p: Persona, t: Truth, now: Date): "yes" | "no" | "uncertain" {
  const cy = classYearFor(p.graduation_year, now);
  if (!t.class_years.includes(cy)) return "no";
  if (t.min_gpa != null && p.gpa < t.min_gpa) return "no";
  if (t.gender !== "any" && t.gender !== p.gender) return "no";
  if (!t.schools.includes("any_auc") && !t.schools.includes(p.school)) return "no";
  if (t.enrollment === "grad_bound" && cy !== "senior") return "no";
  const pf = MAJOR_FIELDS[p.major] ?? [];
  if (!t.fields.includes("any") && !t.fields.includes("any_with_env_career") && !t.fields.some((f) => pf.includes(f))) return "no";
  for (const id of t.identity) {
    if (UNCHECKABLE.has(id)) return "uncertain";
    if (!p.identity.includes(id)) return "no";
  }
  return "yes";
}

const truth: Truth[] = JSON.parse(readFileSync("tests/fixtures/scholarship-truth.json", "utf8")).scholarships;
const snapPath = process.argv[2] ?? "tests/fixtures/live-rules-snapshot-2026-11-16.json";
const live: any[] = JSON.parse(readFileSync(snapPath, "utf8")).scholarships;
const byName = new Map(live.map((s) => [s.name, s]));
const now = new Date(process.env.EVAL_DATE ?? Date.now());

let worst = 1;
for (const p of PERSONAS) {
  const rows = truth.filter((t) => !t.expires_today).map((t) => {
    const s = byName.get(t.name);
    const shown = s ? checkEligibility(p, s.eligibility_rules, s, now).eligible : false;
    return { t, shown, truth: truthVerdict(p, t, now) };
  });
  const shown = rows.filter((r) => r.shown);
  const fp = shown.filter((r) => r.truth === "no");
  const unc = shown.filter((r) => r.truth === "uncertain");
  const tp = shown.filter((r) => r.truth === "yes");
  const fn = rows.filter((r) => !r.shown && r.truth === "yes");
  const sum = (a: typeof rows) => a.reduce((n, r) => n + r.t.award, 0);
  const judged = shown.length - unc.length;
  const prec = judged ? tp.length / judged : 1;
  const precD = sum(shown) - sum(unc) ? sum(tp) / (sum(shown) - sum(unc)) : 1;
  worst = Math.min(worst, prec, precD);
  console.log(`\n${p.id}  ${p.label}  [${classYearFor(p.graduation_year, now)}]`);
  console.log(`   shown ${shown.length} ($${sum(shown).toLocaleString()})  qualifies ${tp.length} ($${sum(tp).toLocaleString()})  wrong ${fp.length}  uncertain ${unc.length}  missed ${fn.length}`);
  console.log(`   precision: ${(100 * prec).toFixed(0)}% by count, ${(100 * precD).toFixed(0)}% by $`);
  if (fp.length) console.log("   wrong: " + fp.map((r) => r.t.name.replace(/ (Scholarship|Program).*$/, "")).join(" · "));
  if (fn.length) console.log("   missed: " + fn.map((r) => r.t.name).join(" · "));
}
const GATE = 0.9;
console.log(`\nGate (>= ${GATE * 100}% precision, count and $): ${worst >= GATE ? "PASS" : "FAIL"} (worst ${(100 * worst).toFixed(0)}%)`);
process.exitCode = worst >= GATE ? 0 : 1;
