-- pipeline_runs.scholarship_id was ON DELETE CASCADE, which meant deleting
-- a failing scholarship would also erase its own audit record. Switch to
-- SET NULL and denormalize the name so history survives removal.

ALTER TABLE public.pipeline_runs
  ADD COLUMN IF NOT EXISTS scholarship_name text;

ALTER TABLE public.pipeline_runs
  DROP CONSTRAINT IF EXISTS pipeline_runs_scholarship_id_fkey;

ALTER TABLE public.pipeline_runs
  ADD CONSTRAINT pipeline_runs_scholarship_id_fkey
  FOREIGN KEY (scholarship_id) REFERENCES public.scholarships(id) ON DELETE SET NULL;
