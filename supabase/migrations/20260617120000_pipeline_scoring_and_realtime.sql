-- ============================================================
-- Pipeline scoring gates + audit trail + realtime
-- ============================================================

-- 1. Pipeline tracking columns on scholarships
ALTER TABLE public.scholarships
  ADD COLUMN IF NOT EXISTS pipeline_status   text DEFAULT 'approved'
                            CHECK (pipeline_status IN ('pending','approved','quarantined')),
  ADD COLUMN IF NOT EXISTS link_status       text DEFAULT 'unchecked'
                            CHECK (link_status IN ('unchecked','ok','broken','redirected','captcha','timeout')),
  ADD COLUMN IF NOT EXISTS link_checked_at   timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quarantine_reason text DEFAULT NULL;

-- New rows inserted after this migration should be evaluated by the
-- pipeline before going live, rather than inheriting the "approved"
-- default meant for backfilling existing manually-added rows.
ALTER TABLE public.scholarships ALTER COLUMN pipeline_status SET DEFAULT 'pending';

-- Backfill: anything already in the table before this migration is
-- treated as previously-approved so it doesn't get yanked the moment
-- the new function runs. The next scheduled run will re-validate it
-- against the real criteria and quarantine it if it no longer qualifies.
UPDATE public.scholarships
SET pipeline_status = 'approved'
WHERE pipeline_status IS NULL OR pipeline_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scholarships_pipeline_status ON public.scholarships (pipeline_status);
CREATE INDEX IF NOT EXISTS idx_scholarships_link_status     ON public.scholarships (link_status);

-- 2. Aggregate run log (one row per cron invocation) — referenced by the
--    existing function already but never had a migration backing it.
CREATE TABLE IF NOT EXISTS public.pipeline_logs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at                   timestamptz NOT NULL DEFAULT now(),
  scholarships_checked     integer DEFAULT 0,
  scholarships_approved    integer DEFAULT 0,
  scholarships_quarantined integer DEFAULT 0,
  scholarships_deactivated integer DEFAULT 0,
  status                   text,
  notes                    text
);

CREATE INDEX IF NOT EXISTS idx_pipeline_logs_ran_at ON public.pipeline_logs (ran_at DESC);

ALTER TABLE public.pipeline_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view pipeline logs" ON public.pipeline_logs;
CREATE POLICY "Admins can view pipeline logs"
  ON public.pipeline_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Per-scholarship audit trail — every gate decision, every run,
--    so "why did this get quarantined" is always answerable.
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scholarship_id uuid REFERENCES public.scholarships(id) ON DELETE CASCADE,
  ran_at         timestamptz NOT NULL DEFAULT now(),
  passed         boolean NOT NULL,
  link_status    text,
  reason         text
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_scholarship ON public.pipeline_runs (scholarship_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_ran_at       ON public.pipeline_runs (ran_at DESC);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view pipeline runs" ON public.pipeline_runs;
CREATE POLICY "Admins can view pipeline runs"
  ON public.pipeline_runs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. Realtime — so the student-facing "money matched" dashboard updates
--    the instant the pipeline approves or quarantines a scholarship,
--    without requiring a manual page refresh.
ALTER TABLE public.scholarships REPLICA IDENTITY FULL;
ALTER TABLE public.eligibility_rules REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'scholarships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scholarships;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'eligibility_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.eligibility_rules;
  END IF;
END $$;
