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

const FIELD_PATTERNS: [MajorField, RegExp][] = [
  ['health', /\b(pre-?med|medicine|nursing|public health|health|kinesiology|nutrition|pharm|dent|biomedical)\w*/i],
  ['stem', /\b(computer|comput|software|data|cyber|information tech|math|physics|chemi|biolog|engineer|enginee|eniginer|environmental science|statistic|neuro|astro|geolog|science)\w*/i],
  ['business', /\b(business|account|financ|marketing|management|entrepreneur|economic|supply chain|real estate|hospitality)\w*/i],
  ['education', /\b(education|teaching)\w*/i],
  ['arts_media', /\b(art|music|theat|film|communication|journalism|media|public relations|design|dance)\w*/i],
  ['social_science', /\b(psycholog|sociolog|political|criminal|social work|anthropolog|international relations|urban|government|public policy)\w*/i],
  ['humanities', /\b(english|history|philosoph|religio|african american|women'?s studies|spanish|french|language|literature|liberal arts)\w*/i],
];

/** Best-effort field for a free-text major. Null when unknown ("Other", "Undeclared"). */
export function majorField(major: string | null | undefined): MajorField | null {
  if (!major) return null;
  for (const [field, re] of FIELD_PATTERNS) if (re.test(major)) return field;
  return null;
}

/**
 * Class year for the academic year containing `now`. The academic year ends in
 * May: a Class of 2027 student is a senior from July 2026 through June 2027.
 */
export function classYear(graduationYear: number | null | undefined, now: Date = new Date()): ClassYear | null {
  if (!graduationYear) return null;
  const endYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const remaining = graduationYear - endYear;
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
    if (gpa === null) checks.push(`Requires a ${minGpa.toFixed(1)} GPA — add yours to your profile`);
    else if (gpa + 1e-9 < minGpa) misses.push(`Requires a ${minGpa.toFixed(1)} GPA (yours: ${gpa.toFixed(2)})`);
    else {
      reasons.push(`Your ${gpa.toFixed(2)} GPA meets the ${minGpa.toFixed(1)} minimum`);
      targeted = true;
    }
  }
  if (maxGpa !== null && gpa !== null && gpa - 1e-9 > maxGpa) misses.push(`Only for GPAs up to ${maxGpa.toFixed(1)}`);

  // Major: exact majors first, then broad fields
  const majors = list(r.eligible_majors);
  const fields = list(r.major_fields);
  if (majors.length > 0 || fields.length > 0) {
    const field = majorField(profile.major);
    const exact = majors.some((m) => m.toLowerCase() === (profile.major ?? '').toLowerCase());
    const inField = field !== null && fields.includes(field);
    if (exact) {
      reasons.push(`Open to ${profile.major} majors`);
      targeted = true;
    } else if (inField) {
      reasons.push(`Open to ${FIELD_NAMES[field as MajorField]} majors like ${profile.major}`);
      targeted = true;
    } else if (!profile.major || field === null) {
      const wanted = [...majors, ...fields.map((f) => FIELD_NAMES[f as MajorField] ?? f)];
      checks.push(`For ${wanted.join(', ')} majors — confirm your major qualifies`);
    } else {
      const wanted = [...majors, ...fields.map((f) => FIELD_NAMES[f as MajorField] ?? f)];
      misses.push(`Only for ${wanted.join(', ')} majors`);
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
        if (profile.greek_org && profile.greek_org !== 'none') { reasons.push('For members of your Greek organization — confirm yours qualifies'); targeted = true; }
        else if (profile.greek_org === 'none') misses.push('Only for members of a specific Greek organization');
        else checks.push('For members of a specific Greek organization');
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

/** Short label for a card badge. */
export function matchLabel(m: MatchResult): string {
  if (m.verdict === 'eligible') return m.targeted ? 'Strong match' : 'Open to you';
  if (m.verdict === 'check') return 'Check eligibility';
  return 'Not eligible';
}
