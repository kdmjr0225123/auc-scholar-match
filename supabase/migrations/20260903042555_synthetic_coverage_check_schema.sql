-- Synthetic Coverage Check: canary student profiles re-evaluated daily
-- against the live scholarships + eligibility_rules tables using the exact
-- same matching predicate the student Dashboard uses (see Dashboard.tsx's
-- calculateMatches), so a regression that silently shrinks real students'
-- match counts (e.g. the pipeline-deletion bug fixed earlier) gets caught
-- by monitoring instead of a manual audit.
--
-- IMPORTANT — this mirrors the REAL matching behavior, not an idealized
-- spec: Dashboard.tsx only hard-excludes a scholarship on eligible_schools
-- and graduation_year (min/max). GPA and eligible_majors are evaluated but
-- never cause a `return null` — they only lower the displayed match
-- percentage. So a scholarship still counts as "matched" even when a
-- profile's GPA is under min_gpa or its major isn't in eligible_majors.
-- The synthetic check below replicates that faithfully (bugs and all).

create table public.synthetic_profiles (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  school public.school not null,
  gpa numeric not null,
  major text not null,
  graduation_year integer not null,
  created_at timestamptz not null default now()
);

comment on table public.synthetic_profiles is
  'Fixed set of representative fake student profiles ("canaries") spanning school/GPA/major/grad-year, used by the daily synthetic-coverage-check edge function to detect coverage regressions before real students do.';

create table public.synthetic_coverage_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  profiles_checked integer not null default 0,
  below_threshold_count integer not null default 0,
  min_matches integer,
  max_matches integer,
  avg_matches numeric,
  status text not null default 'clean',
  notes text
);

comment on table public.synthetic_coverage_runs is
  'One row per synthetic-coverage-check run (daily cron + on-demand from Admin). Mirrors pipeline_logs style/shape for consistency.';

create table public.synthetic_coverage_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.synthetic_coverage_runs(id) on delete cascade,
  profile_id uuid not null references public.synthetic_profiles(id) on delete cascade,
  match_count integer not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.synthetic_coverage_results is
  'Per-canary-profile match count for one synthetic_coverage_runs row. passed = match_count >= 4 (the "no student should receive <4" threshold).';

create index synthetic_coverage_results_run_id_idx on public.synthetic_coverage_results (run_id);
create index synthetic_coverage_results_profile_id_idx on public.synthetic_coverage_results (profile_id);

alter table public.synthetic_profiles enable row level security;
alter table public.synthetic_coverage_runs enable row level security;
alter table public.synthetic_coverage_results enable row level security;

-- Admin-read pattern copied verbatim from the existing pipeline_logs /
-- audit_sessions policies (has_role(auth.uid(), 'admin'::app_role)).
-- No anon/authenticated write policy is added anywhere: the edge function
-- writes with the service role key, which bypasses RLS entirely.
create policy "Admins can view synthetic profiles"
  on public.synthetic_profiles
  for select
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can view synthetic coverage runs"
  on public.synthetic_coverage_runs
  for select
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can view synthetic coverage results"
  on public.synthetic_coverage_results
  for select
  using (has_role(auth.uid(), 'admin'::app_role));

-- Seed ~16 canary profiles cycling through all 4 schools, 4 GPA bands
-- (2.5 / 3.0 / 3.5 / 3.8), 4 graduation years spanning freshman->senior
-- relative to the Aug 2026 Morehouse-orientation launch (2027 senior ..
-- 2030 freshman), and 5 commonly-picked real majors from src/constants/majors.ts.
insert into public.synthetic_profiles (label, school, gpa, major, graduation_year) values
  ('Morehouse CS senior, 3.5 GPA',              'morehouse',      3.5, 'Computer Science',        2027),
  ('Spelman Business junior, 3.0 GPA',          'spelman',        3.0, 'Business Administration', 2028),
  ('Clark Atlanta Biology sophomore, 2.5 GPA',  'clark_atlanta',  2.5, 'Biology',                 2029),
  ('Morris Brown Psychology freshman, 3.8 GPA', 'morris_brown',   3.8, 'Psychology',              2030),
  ('Morehouse Engineering junior, 3.0 GPA',     'morehouse',      3.0, 'Engineering',             2028),
  ('Spelman CS senior, 3.8 GPA',                'spelman',        3.8, 'Computer Science',        2027),
  ('Clark Atlanta Business freshman, 3.5 GPA',  'clark_atlanta',  3.5, 'Business Administration', 2030),
  ('Morris Brown Biology sophomore, 3.0 GPA',   'morris_brown',   3.0, 'Biology',                 2029),
  ('Morehouse Psychology sophomore, 2.5 GPA',   'morehouse',      2.5, 'Psychology',              2029),
  ('Spelman Engineering freshman, 2.5 GPA',     'spelman',        2.5, 'Engineering',             2030),
  ('Clark Atlanta CS senior, 3.0 GPA',          'clark_atlanta',  3.0, 'Computer Science',        2027),
  ('Morris Brown Engineering junior, 3.8 GPA',  'morris_brown',   3.8, 'Engineering',             2028),
  ('Morehouse Business freshman, 3.8 GPA',      'morehouse',      3.8, 'Business Administration', 2030),
  ('Spelman Psychology sophomore, 3.0 GPA',     'spelman',        3.0, 'Psychology',              2029),
  ('Clark Atlanta Engineering junior, 2.5 GPA', 'clark_atlanta',  2.5, 'Engineering',             2028),
  ('Morris Brown CS senior, 3.5 GPA',           'morris_brown',   3.5, 'Computer Science',        2027);
