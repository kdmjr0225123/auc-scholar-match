// Tests for src/lib/matching.ts. Run: npm run test:matching
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { evaluateMatch, classYear, majorFields, matchLabel, matchRank, classYearsToGradRange } from '../src/lib/matching.ts';

const NOW = new Date('2026-10-26T12:00:00Z');
const base = { school: 'spelman', major: 'Computer Science', gpa: 3.4, graduation_year: 2028 };
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${n} - ${name}`); };

t('class year boundaries (academic year ends in May)', () => {
  assert.equal(classYear(2027, NOW), 'senior');
  assert.equal(classYear(2028, NOW), 'junior');
  assert.equal(classYear(2029, NOW), 'sophomore');
  assert.equal(classYear(2030, NOW), 'freshman');
  assert.equal(classYear(2025, NOW), null);
  assert.equal(classYear(2027, new Date('2027-06-15T00:00:00Z')), 'senior');
  assert.equal(classYear(2027, new Date('2028-01-15T00:00:00Z')), null);
});

t('major fields (multi-field, no false positives)', () => {
  const has = (m: string, f: string) => assert.ok(majorFields(m).includes(f as never), `${m} should include ${f}: ${majorFields(m)}`);
  const not = (m: string, f: string) => assert.ok(!majorFields(m).includes(f as never), `${m} should not include ${f}: ${majorFields(m)}`);
  has('Computer Science', 'stem');
  has('Pre-Med', 'health'); has('Pre-Medicine', 'health');
  has('Biology', 'stem'); has('Biology', 'health'); has('Chemistry', 'health');
  has('Nursing', 'health'); has('Public Health', 'health'); has('Kinesiology', 'health'); has('Kinesiology', 'stem');
  has('Health Sciences', 'health'); has('Health Sciences', 'stem');
  has('Psychology', 'social_science'); has('Psychology', 'stem');
  has('Economics', 'business'); has('Economics', 'social_science');
  has('Political Science', 'social_science'); not('Political Science', 'stem');
  has('Social Science', 'social_science'); not('Social Science', 'stem');
  has('Liberal Arts', 'humanities'); not('Liberal Arts', 'arts_media');
  has('Mass Media Arts', 'arts_media'); has('Communications', 'arts_media');
  not('Artificial Intelligence', 'arts_media'); has('Artificial Intelligence', 'stem');
  not('Information Technology Department', 'arts_media');
  has('Elementary Education', 'education'); has('English', 'humanities');
  has('International Business', 'business'); has('International Relations', 'social_science');
  has('eniginer', 'stem'); has('Mechanical Engineering', 'stem');
  assert.deepEqual(majorFields('Other'), []); assert.deepEqual(majorFields('Undeclared'), []); assert.deepEqual(majorFields(null), []);
});

t('no rules row = open to everyone, not targeted', () => {
  const m = evaluateMatch(base, null, NOW);
  assert.equal(m.verdict, 'eligible');
  assert.equal(m.targeted, false);
  assert.deepEqual(m.reasons, []);
  assert.equal(matchLabel(m), 'Open to you');
});

t('empty rules = open to everyone', () => {
  const m = evaluateMatch(base, { eligible_schools: [], eligible_majors: [], requirements: [] }, NOW);
  assert.equal(m.verdict, 'eligible');
  assert.equal(m.targeted, false);
});

t('school restriction excludes other schools', () => {
  assert.equal(evaluateMatch(base, { eligible_schools: ['morehouse'] }, NOW).verdict, 'ineligible');
  const ok = evaluateMatch(base, { eligible_schools: ['spelman', 'clark_atlanta'] }, NOW);
  assert.equal(ok.verdict, 'eligible');
  assert.equal(ok.targeted, true);
  assert.deepEqual(ok.reasons, ['Open to Spelman students']);
  assert.equal(matchLabel(ok), 'Strong match');
});

t('class years', () => {
  assert.equal(evaluateMatch(base, { class_years: ['junior', 'senior'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch(base, { class_years: ['senior'] }, NOW).verdict, 'ineligible');
  assert.equal(evaluateMatch({ ...base, graduation_year: null }, { class_years: ['senior'] }, NOW).verdict, 'check');
  assert.equal(classYear(2026, NOW), 'senior', 'December graduate is still a senior in the fall');
});

t('class years convert to absolute graduation years (no July drift)', () => {
  const r = classYearsToGradRange(['junior'], new Date('2027-04-10T00:00:00Z'));
  assert.deepEqual(r, { min: 2028, max: 2028 });
  const rules = { graduation_year_min: r!.min, graduation_year_max: r!.max };
  const student = { ...base, graduation_year: 2028 };
  assert.equal(evaluateMatch(student, rules, new Date('2027-04-15T00:00:00Z')).verdict, 'eligible');
  assert.equal(evaluateMatch(student, rules, new Date('2027-08-15T00:00:00Z')).verdict, 'eligible', 'same student still matches after July');
  assert.deepEqual(classYearsToGradRange(['freshman', 'senior'], NOW), { min: 2026, max: 2030 }, 'fall: December graduates count as seniors');
  assert.deepEqual(classYearsToGradRange(['senior'], new Date('2027-03-01T00:00:00Z')), { min: 2027, max: 2027 });
  assert.equal(classYearsToGradRange([], NOW), null);
});

t('graduation-year range', () => {
  assert.equal(evaluateMatch(base, { graduation_year_min: 2028, graduation_year_max: 2029 }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch(base, { graduation_year_max: 2027 }, NOW).verdict, 'ineligible');
});

t('GPA: below min excludes, missing GPA is a check, equal passes', () => {
  assert.equal(evaluateMatch({ ...base, gpa: 2.9 }, { min_gpa: 3.0 }, NOW).verdict, 'ineligible');
  assert.equal(evaluateMatch({ ...base, gpa: 3.0 }, { min_gpa: '3.0' }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, gpa: null }, { min_gpa: 3.0 }, NOW).verdict, 'check');
});

t('majors never hide a scholarship; they are a reason or a check', () => {
  assert.equal(evaluateMatch(base, { eligible_majors: ['computer science '] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Computer Science ' }, { eligible_majors: ['Computer Science'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch(base, { major_fields: ['stem'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Mechanical Engineering' }, { eligible_majors: ['Engineering'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Pre-Medicine' }, { eligible_majors: ['Pre-Med'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Biology' }, { major_fields: ['health'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Political Science' }, { major_fields: ['social_science'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Psychology' }, { major_fields: ['stem'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Other' }, { major_fields: ['stem'] }, NOW).verdict, 'check');
  const far = evaluateMatch({ ...base, major: 'English' }, { major_fields: ['stem', 'health'] }, NOW);
  assert.equal(far.verdict, 'check');
  assert.deepEqual(far.misses, []);
});

t('GPA display does not round the minimum', () => {
  const m = evaluateMatch({ ...base, gpa: 3.27 }, { min_gpa: 3.25 }, NOW);
  assert.deepEqual(m.reasons, ['Your 3.27 GPA meets the 3.25 minimum']);
});

t('Greek membership is confirmed, not assumed', () => {
  assert.equal(evaluateMatch({ ...base, greek_org: 'Delta Sigma Theta' }, { requirements: ['greek_member'] }, NOW).verdict, 'check');
  assert.equal(evaluateMatch({ ...base, greek_org: 'none' }, { requirements: ['greek_member'] }, NOW).verdict, 'ineligible');
});

t('first-gen / Pell: unknown is a check, never an exclusion', () => {
  assert.equal(evaluateMatch(base, { requirements: ['first_gen'] }, NOW).verdict, 'check');
  assert.equal(evaluateMatch({ ...base, first_gen: true }, { requirements: ['first_gen'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, first_gen: false }, { requirements: ['first_gen'] }, NOW).verdict, 'ineligible');
  assert.equal(evaluateMatch({ ...base, pell_eligible: true }, { requirements: ['pell_eligible'] }, NOW).verdict, 'eligible');
});

t('Georgia residency', () => {
  assert.equal(evaluateMatch({ ...base, home_state: 'ga' }, { requirements: ['georgia_resident'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, home_state: 'NY' }, { requirements: ['georgia_resident'] }, NOW).verdict, 'ineligible');
  assert.equal(evaluateMatch(base, { requirements: ['georgia_resident'] }, NOW).verdict, 'check');
});

t('gendered awards follow single-gender schools only', () => {
  assert.equal(evaluateMatch(base, { requirements: ['women'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, school: 'morehouse' }, { requirements: ['women'] }, NOW).verdict, 'ineligible');
  assert.equal(evaluateMatch({ ...base, school: 'clark_atlanta' }, { requirements: ['women'] }, NOW).verdict, 'check');
  assert.equal(evaluateMatch({ ...base, school: 'morehouse' }, { requirements: ['men'] }, NOW).verdict, 'eligible');
});

t('citizenship and need are always checks', () => {
  const m = evaluateMatch(base, { requirements: ['us_citizen', 'financial_need'] }, NOW);
  assert.equal(m.verdict, 'check');
  assert.equal(m.checks.length, 2);
  assert.equal(matchLabel(m), 'Check eligibility');
});

t('any miss beats any check', () => {
  const m = evaluateMatch({ ...base, gpa: 2.5 }, { min_gpa: 3.0, requirements: ['first_gen'] }, NOW);
  assert.equal(m.verdict, 'ineligible');
});

t('rank order', () => {
  const strong = evaluateMatch(base, { eligible_schools: ['spelman'] }, NOW);
  const open = evaluateMatch(base, null, NOW);
  const check = evaluateMatch(base, { requirements: ['us_citizen'] }, NOW);
  assert.ok(matchRank(strong) < matchRank(open) && matchRank(open) < matchRank(check));
});

t('edge-function copies are in sync', () => {
  execFileSync('node', ['scripts/sync-matching.mjs', '--check'], { stdio: 'inherit' });
});

console.log(`\n${n} tests passed`);
