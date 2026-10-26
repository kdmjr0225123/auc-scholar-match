// Tests for src/lib/matching.ts. Run: npm run test:matching
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { evaluateMatch, classYear, majorField, matchLabel, matchRank } from '../src/lib/matching.ts';

const NOW = new Date('2026-10-26T12:00:00Z');
const base = { school: 'spelman', major: 'Computer Science', gpa: 3.4, graduation_year: 2028 };
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${n} - ${name}`); };

t('class year boundaries (academic year ends in May)', () => {
  assert.equal(classYear(2027, NOW), 'senior');
  assert.equal(classYear(2028, NOW), 'junior');
  assert.equal(classYear(2029, NOW), 'sophomore');
  assert.equal(classYear(2030, NOW), 'freshman');
  assert.equal(classYear(2026, NOW), null);
  assert.equal(classYear(2027, new Date('2027-06-15T00:00:00Z')), 'senior');
  assert.equal(classYear(2027, new Date('2027-07-01T00:00:00Z')), null);
});

t('major fields', () => {
  assert.equal(majorField('Computer Science'), 'stem');
  assert.equal(majorField('Pre-Med'), 'health');
  assert.equal(majorField('Business Administration'), 'business');
  assert.equal(majorField('Economics'), 'business');
  assert.equal(majorField('Psychology'), 'social_science');
  assert.equal(majorField('Mass Media Arts'), 'arts_media');
  assert.equal(majorField('Elementary Education'), 'education');
  assert.equal(majorField('English'), 'humanities');
  assert.equal(majorField('eniginer'), 'stem');
  assert.equal(majorField('Other'), null);
  assert.equal(majorField(null), null);
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

t('majors: exact, field, unknown major, wrong field', () => {
  assert.equal(evaluateMatch(base, { eligible_majors: ['computer science'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch(base, { major_fields: ['stem'] }, NOW).verdict, 'eligible');
  assert.equal(evaluateMatch({ ...base, major: 'Other' }, { major_fields: ['stem'] }, NOW).verdict, 'check');
  const miss = evaluateMatch({ ...base, major: 'English' }, { major_fields: ['stem', 'health'] }, NOW);
  assert.equal(miss.verdict, 'ineligible');
  assert.deepEqual(miss.misses, ['Only for STEM, health majors']);
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
