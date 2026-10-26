-- Real matching: structured eligibility rules read from each sponsor page,
-- and optional student details that those rules depend on.
-- Every new column is nullable or defaults to empty, so existing rows mean
-- "no restriction" and existing students are unaffected until they answer.

ALTER TABLE public.eligibility_rules
  ADD COLUMN IF NOT EXISTS class_years text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS major_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requirements text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eligibility_summary text,
  ADD COLUMN IF NOT EXISTS rules_source text,
  ADD COLUMN IF NOT EXISTS rules_extracted_at timestamptz;

ALTER TABLE public.eligibility_rules
  DROP CONSTRAINT IF EXISTS eligibility_rules_class_years_check,
  ADD CONSTRAINT eligibility_rules_class_years_check
    CHECK (class_years <@ ARRAY['freshman','sophomore','junior','senior']::text[]),
  DROP CONSTRAINT IF EXISTS eligibility_rules_major_fields_check,
  ADD CONSTRAINT eligibility_rules_major_fields_check
    CHECK (major_fields <@ ARRAY['stem','business','health','social_science','humanities','arts_media','education']::text[]),
  DROP CONSTRAINT IF EXISTS eligibility_rules_requirements_check,
  ADD CONSTRAINT eligibility_rules_requirements_check
    CHECK (requirements <@ ARRAY['first_gen','pell_eligible','financial_need','georgia_resident','greek_member','women','men','us_citizen']::text[]);

-- Optional, student-provided. NULL = not answered (never treated as "no").
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS first_gen boolean,
  ADD COLUMN IF NOT EXISTS pell_eligible boolean,
  ADD COLUMN IF NOT EXISTS home_state text,
  ADD COLUMN IF NOT EXISTS greek_org text;

ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_home_state_check,
  ADD CONSTRAINT student_profiles_home_state_check
    CHECK (home_state IS NULL OR home_state ~ '^[A-Z]{2}$'),
  DROP CONSTRAINT IF EXISTS student_profiles_greek_org_check,
  ADD CONSTRAINT student_profiles_greek_org_check
    CHECK (greek_org IS NULL OR char_length(greek_org) BETWEEN 1 AND 60);
