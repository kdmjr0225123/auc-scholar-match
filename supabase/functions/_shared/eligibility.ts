// Single source of truth for "does this student qualify for this scholarship".
//
// Used by: src/pages/Dashboard.tsx (via src/lib/eligibility.ts, a byte-for-byte
// copy — keep them identical), synthetic-coverage-check, match-digest,
// scholarship-reminders. If you change a rule here, copy the file to
// src/lib/eligibility.ts and redeploy those functions.
//
// Every stated criterion is a HARD exclude. A student is only shown a
// scholarship they actually meet on paper: school, graduation-year range,
// class year, GPA, major. Missing data on the scholarship side means "no
// restriction"; missing data on the student side never excludes them.

export type ClassYear = "freshman" | "sophomore" | "junior" | "senior";

export interface StudentLike {
  school?: string | null;
  gpa?: number | string | null;
  major?: string | null;
  graduation_year?: number | null;
}

export interface RulesLike {
  min_gpa?: number | string | null;
  max_gpa?: number | string | null;
  eligible_schools?: string[] | null;
  eligible_majors?: string[] | null;
  graduation_year_min?: number | null;
  graduation_year_max?: number | null;
}

export interface ScholarshipLike {
  min_gpa?: number | string | null;
  allowed_class_years?: string | string[] | null;
}

export interface EligibilityResult {
  eligible: boolean;
  /** 70 for open-to-everyone, +10 per specific criterion the student meets, max 100. */
  score: number;
  pass: string[];
  fail: string[];
}

const ALL_YEARS: ClassYear[] = ["freshman", "sophomore", "junior", "senior"];

/** Academic year rolls over July 1: Nov 2026 and Mar 2027 both belong to the year ending 2027. */
export function academicYearEnd(now: Date = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export function classYearFor(graduationYear: number, now: Date = new Date()): ClassYear {
  const diff = graduationYear - academicYearEnd(now);
  if (diff <= 0) return "senior";
  if (diff === 1) return "junior";
  if (diff === 2) return "sophomore";
  return "freshman";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseYears(v: string | string[] | null | undefined): ClassYear[] {
  const raw = Array.isArray(v) ? v : (v ?? "").split(",");
  const years = raw.map((s) => String(s).trim().toLowerCase()).filter((s): s is ClassYear => (ALL_YEARS as string[]).includes(s));
  return Array.from(new Set(years));
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function checkEligibility(
  student: StudentLike,
  rules: RulesLike | null | undefined,
  scholarship: ScholarshipLike = {},
  now: Date = new Date(),
): EligibilityResult {
  const pass: string[] = [];
  const fail: string[] = [];
  let score = 70;
  // No eligibility_rules row means the pipeline never verified this one — don't show it.
  if (!rules) return { eligible: false, score: 0, pass, fail: ["No eligibility data"] };

  // School
  const schools = rules.eligible_schools ?? [];
  if (schools.length > 0) {
    if (!student.school || !schools.includes(student.school)) fail.push("School not eligible");
    else { pass.push("Your school is eligible"); score += 10; }
  }

  // Graduation-year range
  const gy = student.graduation_year ?? null;
  if (gy !== null) {
    if ((rules.graduation_year_min && gy < rules.graduation_year_min) || (rules.graduation_year_max && gy > rules.graduation_year_max)) {
      fail.push(`Graduation year ${gy} is outside the eligible range`);
    }
  }

  // Class year (stored on the scholarship by the pipeline)
  const years = parseYears(scholarship.allowed_class_years);
  if (years.length > 0 && years.length < ALL_YEARS.length && gy !== null) {
    const cy = classYearFor(gy, now);
    if (!years.includes(cy)) fail.push(`Open to ${years.join(", ")} only`);
    else { pass.push(`Open to ${cy}s`); score += 10; }
  }

  // GPA — the stricter of the two places a minimum can live
  const gpa = num(student.gpa);
  const minCandidates = [num(rules.min_gpa), num(scholarship.min_gpa)].filter((n): n is number => n !== null);
  const minGpa = minCandidates.length ? Math.max(...minCandidates) : null;
  const maxGpa = num(rules.max_gpa);
  if (gpa !== null && (minGpa !== null || maxGpa !== null)) {
    if (minGpa !== null && gpa < minGpa) fail.push(`Requires ${minGpa.toFixed(1)} GPA`);
    else if (maxGpa !== null && gpa > maxGpa) fail.push(`GPA above ${maxGpa.toFixed(1)} limit`);
    else { if (minGpa !== null) pass.push(`GPA ${gpa.toFixed(1)} meets ${minGpa.toFixed(1)} minimum`); score += 10; }
  }

  // Major
  const majors = (rules.eligible_majors ?? []).map(norm);
  if (majors.length > 0) {
    if (!student.major || !majors.includes(norm(student.major))) fail.push("Major not eligible");
    else { pass.push(`${student.major} is an eligible major`); score += 10; }
  }

  if (pass.length === 0) pass.push("Open to all AUC students");
  return { eligible: fail.length === 0, score: Math.min(score, 100), pass, fail };
}

export function isEligible(student: StudentLike, rules: RulesLike | null | undefined, scholarship: ScholarshipLike = {}, now: Date = new Date()): boolean {
  return checkEligibility(student, rules, scholarship, now).eligible;
}
