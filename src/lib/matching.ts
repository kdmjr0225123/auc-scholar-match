// Elevaid matching engine — the single source of truth for "does this student
// qualify for this scholarship, and why".
//
// Used by the student dashboard (src/pages/Dashboard.tsx) and, as byte-identical
// copies, by the edge functions that email or audit matches
// (supabase/functions/*/matching.ts). Keep this file dependency-free and run
// `npm run sync:matching` after editing it; `npm run test:matching` checks the
// copies are identical and exercises the rules.
//
// Principles:
//  * A student is only excluded on a rule that actually exists and that they
//    clearly fail. Unknown is never a "no": it becomes "check".
//  * Every reason shown to a student corresponds to a stored rule.

export type School = 'morehouse' | 'spelman' | 'clark_atlanta' | 'morris_brown';

export type ClassYear = 'freshman' | 'sophomore' | 'junior' | 'senior';

/** Requirement codes stored in eligibility_rules.requirements. */
export const REQUIREMENT_CODES = [
  'first_gen',
  'pell_eligible',
  'financial_need',
  'georgia_resident',
  'greek_member',
  'women',
  'men',
  'us_citizen',
] as const;
export type RequirementCode = typeof REQUIREMENT_CODES[number];

/** Major fields stored in eligibility_rules.major_fields. */
export const MAJOR_FIELDS = [
  'stem',
  'business',
  'health',
  'social_science',
  'humanities',
  'arts_media',
  'education',
] as const;
export type MajorField = typeof MAJOR_FIELDS[number];

export interface MatchProfile {
  school: School | string;
  major: string | null;
  gpa: number | null;
  graduation_year: number | null;
  first_gen?: boolean | null;
  pell_eligible?: boolean | null;
  home_state?: string | null;
  greek_org?: string | null;
}

export interface MatchRules {
  eligible_schools?: string[] | null;
  eligible_majors?: string[] | null;
  major_fields?: string[] | null;
  class_years?: string[] | null;
  graduation_year_min?: number | null;
  graduation_year_max?: number | null;
  min_gpa?: number | string | null;
  max_gpa?: number | string | null;
  requirements?: string[] | null;
}

export type Verdict = 'eligible' | 'check' | 'ineligible';

export interface MatchResult {
  verdict: Verdict;
  /** Rules the student meets, in plain words. */
  reasons: string[];
  /** Rules we can't confirm from the profile; the student should verify. */
  checks: string[];
  /** Rules the student fails (only populated when verdict is ineligible). */
  misses: string[];
  /** True when at least one specific rule (not just "open to all") matched. */
  targeted: boolean;
}

const SCHOOL_NAMES: Record<string, string> = {
  morehouse: 'Morehouse',
  spelman: 'Spelman',
  clark_atlanta: 'Clark Atlanta',
  morris_brown: 'Morris Brown',
};

const FIELD_NAMES: Record<MajorField, string> = {
  stem: 'STEM',
  business: 'business',
  health: 'health',
  social_science: 'social science',
  humanities: 'humanities',
  arts_media: 'arts and media',
  education: 'education',
};

// A major can belong to several fields (Biology is STEM and pre-health;
// Economics is business and social science). Patterns are matched on word
// starts, so "art" does not match "Department" and "science" alone never
// decides a field.
const FIELD_PATTERNS: [MajorField, RegExp][] = [
  ['stem', /\b(computer|computing|software|data|cyber|information (tech|sys)|math|statistic|physics|chemi|biolog|biochem|neuro|engineer|eniginer|environmental science|astro|geolog|artificial intelligence|kinesiology|exercise science|health science|psycholog)/i],
  ['health', /\b(pre-?med|medicine|medical|nursing|public health|health|kinesiology|exercise science|nutrition|pharm|dent|biomedical|biolog|biochem|chemi|neuro|psycholog)/i],
  ['business', /\b(business|account|financ|marketing|management|entrepreneur|economic|supply chain|real estate|hospitality|actuar)/i],
  ['social_science', /\b(psycholog|sociolog|political|criminal|social (work|science)|anthropolog|international relations|urban|government|public policy|economic)/i],
  ['humanities', /\b(english|history|philosoph|religio|african american|africana|women'?s studies|gender studies|spanish|french|language|literature|liberal arts|interdisciplinary)/i],
  ['arts_media', /\b(arts?\b|music|theat|film|cinema|communication|journalism|mass media|media\b|public relations|graphic design|design|dance|photograph)/i],
  ['education', /\b(education|teaching)/i],
];

/** Fields a free-text major belongs to. Empty when unknown ("Other", "Undeclared"). */
export function majorFields(major: string | null | undefined): MajorField[] {
  const m = (major ?? '').trim();
  if (!m) return [];
  const out: MajorField[] = [];
  for (const [field, re] of FIELD_PATTERNS) if (re.test(m) && !out.includes(field)) out.push(field);
  // "Liberal Arts" is humanities, not arts and media.
  if (/\bliberal arts\b/i.test(m)) return out.filter((f) => f !== 'arts_media');
  return out;
}

/** First field of a major (kept for callers that want one label). */
export function majorField(major: string | null | undefined): MajorField | null {
  return majorFields(major)[0] ?? null;
}

/**
 * Class year for the academic year containing `now`. The academic year ends in
 * May: a Class of 2027 student is a senior from July 2026 through June 2027.
 */
export function classYear(graduationYear: number | null | undefined, now: Date = new Date()): ClassYear | null {
  if (!graduationYear) return null;
  const endYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const remaining = graduationYear - endYear;
  // December graduates: Class of 2026 in fall 2026 is still a senior.
  if (remaining === -1 && now.getUTCMonth() >= 6) return 'senior';
  if (remaining < 0) return null;
  if (remaining === 0) return 'senior';
  if (remaining === 1) return 'junior';
  if (remaining === 2) return 'sophomore';
  return 'freshman';
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const list = (v: string[] | null | undefined): string[] => (Array.isArray(v) ? v.filter(Boolean) : []);

/** GPA threshold for display without rounding a 3.25 minimum up to 3.3. */
const fmtGpa = (g: number): string => (Math.round(g * 100) % 10 === 0 ? g.toFixed(1) : g.toFixed(2));

/**
 * Class years ("rising juniors" etc.) are relative to the school year they were
 * read in. Convert them to absolute graduation years so a rule written in
 * April 2027 still targets the same students in September 2027.
 */
export function classYearsToGradRange(years: string[], readAt: Date): { min: number; max: number } | null {
  const offset: Record<string, number> = { senior: 0, junior: 1, sophomore: 2, freshman: 3 };
  const endYear = readAt.getUTCMonth() >= 6 ? readAt.getUTCFullYear() + 1 : readAt.getUTCFullYear();
  const grads = years.filter((y) => y in offset).map((y) => endYear + offset[y]);
  if (grads.length === 0) return null;
  return { min: Math.min(...grads), max: Math.max(...grads) };
}

/**
 * Evaluate one student against one scholarship's rules. `rules` may be null
 * (no rules row) — that means open to every current AUC undergraduate.
 */
export function evaluateMatch(profile: MatchProfile, rules: MatchRules | null, now: Date = new Date()): MatchResult {
  const reasons: string[] = [];
  const checks: string[] = [];
  const misses: string[] = [];
  let targeted = false;
  const r = rules ?? {};

  // School
  const schools = list(r.eligible_schools);
  if (schools.length > 0) {
    if (schools.includes(String(profile.school))) {
      reasons.push(`Open to ${SCHOOL_NAMES[String(profile.school)] ?? 'your school'} students`);
      targeted = true;
    } else {
      misses.push(`Only for ${schools.map((s) => SCHOOL_NAMES[s] ?? s).join(', ')} students`);
    }
  }

  // Class year (explicit list) and graduation-year range
  const years = list(r.class_years);
  const cy = classYear(profile.graduation_year, now);
  if (years.length > 0) {
    if (!cy) checks.push(`Open to ${years.join(', ')}s — add your graduation year`);
    else if (years.includes(cy)) {
      reasons.push(`Open to ${cy}s`);
      targeted = true;
    } else misses.push(`Only for ${years.join(', ')}s`);
  }
  const gMin = num(r.graduation_year_min);
  const gMax = num(r.graduation_year_max);
  if (gMin !== null || gMax !== null) {
    const gy = profile.graduation_year;
    if (!gy) checks.push('Has a graduation-year requirement — add yours to your profile');
    else if ((gMin !== null && gy < gMin) || (gMax !== null && gy > gMax)) {
      misses.push(gMin !== null && gMax !== null ? `Only for the Class of ${gMin}–${gMax}` : gMin !== null ? `Only for the Class of ${gMin} or later` : `Only for the Class of ${gMax} or earlier`);
    } else if (years.length === 0) {
      reasons.push(`Open to the Class of ${gy}`);
      targeted = true;
    }
  }

  // GPA
  const minGpa = num(r.min_gpa);
  const maxGpa = num(r.max_gpa);
  const gpa = num(profile.gpa);
  if (minGpa !== null) {
    if (gpa === null) checks.push(`Requires a ${fmtGpa(minGpa)} GPA — add yours to your profile`);
    else if (gpa + 1e-9 < minGpa) misses.push(`Requires a ${fmtGpa(minGpa)} GPA (yours: ${fmtGpa(gpa)})`);
    else {
      reasons.push(`Your ${fmtGpa(gpa)} GPA meets the ${fmtGpa(minGpa)} minimum`);
      targeted = true;
    }
  }
  if (maxGpa !== null && gpa !== null && gpa - 1e-9 > maxGpa) misses.push(`Only for GPAs up to ${fmtGpa(maxGpa)}`);

  // Major. Which field a major falls in is our inference, not a stored fact,
  // so a major restriction never hides a scholarship: it is a reason when the
  // major clearly fits and a check otherwise.
  const majors = list(r.eligible_majors).map((m) => m.trim()).filter(Boolean);
  const fields = list(r.major_fields);
  if (majors.length > 0 || fields.length > 0) {
    const mine = (profile.major ?? '').trim();
    const myFields = majorFields(mine);
    const listedFields = majors.flatMap((m) => majorFields(m));
    const exact = mine !== '' && majors.some((m) => m.toLowerCase() === mine.toLowerCase());
    const fitField = myFields.find((f) => fields.includes(f) || listedFields.includes(f));
    const wanted = [...majors, ...fields.map((f) => FIELD_NAMES[f as MajorField] ?? f)];
    if (exact) {
      reasons.push(`Open to ${mine} majors`);
      targeted = true;
    } else if (fitField) {
      reasons.push(`Open to ${FIELD_NAMES[fitField]} majors like ${mine}`);
      targeted = true;
    } else {
      checks.push(`For ${wanted.join(', ')} majors — confirm your major qualifies`);
    }
  }

  // Requirements
  for (const code of list(r.requirements)) {
    switch (code) {
      case 'first_gen':
        if (profile.first_gen === true) { reasons.push('For first-generation college students'); targeted = true; }
        else if (profile.first_gen === false) misses.push('Only for first-generation college students');
        else checks.push('For first-generation college students — add this to your profile');
        break;
      case 'pell_eligible':
        if (profile.pell_eligible === true) { reasons.push('For Pell Grant recipients'); targeted = true; }
        else if (profile.pell_eligible === false) misses.push('Only for Pell Grant recipients');
        else checks.push('For Pell Grant recipients — add this to your profile');
        break;
      case 'georgia_resident': {
        const st = (profile.home_state ?? '').trim().toUpperCase();
        if (st === 'GA') { reasons.push('For Georgia residents'); targeted = true; }
        else if (st) misses.push('Only for Georgia residents');
        else checks.push('For Georgia residents — add your home state to your profile');
        break;
      }
      case 'greek_member':
        // We store which organization a student is in, not which one an award
        // requires, so membership is always something to confirm.
        if (profile.greek_org === 'none') misses.push('Only for members of a specific fraternity or sorority');
        else checks.push('For members of a specific fraternity or sorority — confirm yours qualifies');
        break;
      case 'women':
        if (profile.school === 'spelman') reasons.push('For women');
        else if (profile.school === 'morehouse') misses.push('Only for women');
        else checks.push('For women');
        break;
      case 'men':
        if (profile.school === 'morehouse') reasons.push('For men');
        else if (profile.school === 'spelman') misses.push('Only for men');
        else checks.push('For men');
        break;
      case 'financial_need':
        checks.push('Considers financial need');
        break;
      case 'us_citizen':
        checks.push('U.S. citizens or permanent residents only');
        break;
      default:
        break;
    }
  }

  const verdict: Verdict = misses.length > 0 ? 'ineligible' : checks.length > 0 ? 'check' : 'eligible';
  return { verdict, reasons, checks, misses: verdict === 'ineligible' ? misses : [], targeted };
}

/** Sort key: eligible+targeted first, then eligible, then check. */
export function matchRank(m: MatchResult): number {
  if (m.verdict === 'eligible') return m.targeted ? 0 : 1;
  if (m.verdict === 'check') return 2;
  return 3;
}

/** Checks a student can resolve by answering the optional profile questions. */
export function answerableChecks(m: MatchResult): number {
  return m.checks.filter((c) => /add this to your profile|add your home state/.test(c)).length;
}

/** Short label for a card badge. */
export function matchLabel(m: MatchResult): string {
  if (m.verdict === 'eligible') return m.targeted ? 'Strong match' : 'Open to you';
  if (m.verdict === 'check') return 'Check eligibility';
  return 'Not eligible';
}
