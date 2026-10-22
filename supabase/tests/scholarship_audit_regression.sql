-- Regression test for the scholarship-audit pre-publish gate.
--
-- Runs the audit in dry-run mode (no writes) against real, live pages with a
-- known expected outcome, then reports PASS/FAIL per case. Run it in the
-- Supabase SQL editor after every change to supabase/functions/scholarship-audit
-- and before relying on a new deploy.
--
-- Step 1: send the dry run (returns a request id).
-- Step 2: wait ~60s (AI checks run one at a time), then run the CHECK query
--         below with that id.
--
-- Expected outcomes:
--   reject  = must never reach students (law firm, TMCF-member-only, ...)
--   promote = legitimate and verifiable; would go live automatically
--   hold    = needs a human (unreadable page, unclear status); never auto-live
--
-- Live pages change over time. If a "promote" case starts holding because the
-- sponsor closed the cycle, update the case rather than loosening the gate.

-- STEP 1 -------------------------------------------------------------------
select net.http_post(
  url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/scholarship-audit',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-pipeline-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pipeline_secret')
  ),
  body := jsonb_build_object('dry_run', true, 'cases', jsonb_build_array(
    -- Law firm whose name contains no legal words: caught by page content.
    jsonb_build_object('expect','reject','name','Florin|Roebig 2026 Scholarship Essay Contest','provider','Florin|Roebig',
      'description','An essay contest with $750, $500 and $250 prizes paid to the winners'' schools. Open to full-time U.S. college students 18+.',
      'award_amount','750','deadline', (current_date + 30)::text,'application_url','https://florinroebig.com/scholarship/'),
    -- Law firm, obvious from name.
    jsonb_build_object('expect','reject','name','Truck Accident Scholarship (Fall 2026)','provider','Brooks Law Group',
      'description','A two-tier annual scholarship for current high school seniors and undergraduate college students attending a U.S. college.',
      'award_amount','1000','deadline', (current_date + 60)::text,'application_url','https://brookslawgroup.com/scholarship/'),
    -- TMCF member schools only: AUC schools are UNCF members.
    jsonb_build_object('expect','reject','name','TMCF | MolsonCoors Scholarship','provider','Thurgood Marshall College Fund / MolsonCoors',
      'description','Up to $8,200 for outstanding students at TMCF member HBCUs for the 2027-2028 academic year. Open to all majors with a 3.0+ GPA.',
      'award_amount','8200','deadline', (current_date + 60)::text,'application_url','https://scholarships.tmcf.org/studentlogin.asp'),
    -- Legitimate federal programs.
    jsonb_build_object('expect','promote','name','NOAA Ernest F. Hollings Undergraduate Scholarship','provider','NOAA Office of Education',
      'description','Up to $9,500 per year for two years plus a paid 10-week NOAA summer internship. For full-time second-year students in NOAA-related majors with a 3.0+ GPA.',
      'award_amount','9500','deadline', (current_date + 60)::text,'application_url','https://www.noaa.gov/office-education/hollings-scholarship'),
    jsonb_build_object('expect','promote','name','Boren Scholarship 2027-2028','provider','National Security Education Program (IIE)',
      'description','Up to $25,000 for U.S. undergraduates to study a critical language abroad in regions important to U.S. national security.',
      'award_amount','25000','deadline', (current_date + 60)::text,'application_url','https://www.borenawards.org/apply-now'),
    -- Corporate essay scholarship with a reCAPTCHA on its form (not a bot wall).
    jsonb_build_object('expect','promote','name','McCann STEM Scholarship 2026','provider','McCann Systems',
      'description','An essay scholarship of $2,000+ from McCann Systems for U.S. citizens attending a U.S. college. The essay explains the science behind live-event AV technology.',
      'award_amount','2000','deadline', (current_date + 30)::text,'application_url','https://mccannsystems.com/stem-scholarship-2026/'),
    -- PDF link: unreadable, must hold, never auto-promote.
    jsonb_build_object('expect','hold','name','Harry S. Truman Scholarship 2027','provider','Harry S. Truman Scholarship Foundation',
      'description','The Truman Scholarship awards up to $30,000 toward a public service-related graduate degree to college juniors with strong leadership records.',
      'award_amount','30000','deadline', (current_date + 90)::text,'application_url','https://www.truman.gov/sites/default/files/2026-04/BOI%202027.pdf')
  )),
  timeout_milliseconds := 240000
) as request_id;

-- CHECK ---------------------------------------------------------------------
-- Replace <request_id> with the id returned above.
--
-- with resp as (select content::jsonb as c from net._http_response where id = <request_id>),
-- cases as (
--   select r->>'name' as name, r->>'outcome' as got, left(coalesce(r->>'failures',''), 160) as why
--   from resp, jsonb_array_elements(c->'results') r
-- ),
-- expected(name, want) as (values
--   ('Florin|Roebig 2026 Scholarship Essay Contest','reject'),
--   ('Truck Accident Scholarship (Fall 2026)','reject'),
--   ('TMCF | MolsonCoors Scholarship','reject'),
--   ('NOAA Ernest F. Hollings Undergraduate Scholarship','promote'),
--   ('Boren Scholarship 2027-2028','promote'),
--   ('McCann STEM Scholarship 2026','promote'),
--   ('Harry S. Truman Scholarship 2027','hold')
-- )
-- select e.name, e.want, c.got, case when e.want = c.got then 'PASS' else 'FAIL' end as result, c.why
-- from expected e left join cases c using (name)
-- order by result, e.name;
