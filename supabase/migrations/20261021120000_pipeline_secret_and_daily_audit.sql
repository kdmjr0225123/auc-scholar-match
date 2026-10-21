-- Pipeline v1: authenticate scheduled audit runs and run the audit daily.
--
-- The scholarship-audit edge function now rejects unauthenticated calls. pg_cron
-- authenticates with a random secret kept in Vault; the edge function reads the
-- same value through public.pipeline_secret(), which only service_role can call.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pipeline_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'pipeline_secret',
      'Shared secret for pg_cron -> scholarship-audit edge function calls');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pipeline_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pipeline_secret' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.pipeline_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_secret() TO service_role;

-- Run daily at 11:30 UTC (7:30am ET), after the 6:47am ET inventory monitor
-- stages new finds, so they are gated the same morning. Replaces the
-- Mon/Wed/Fri 09:00 UTC schedule.
SELECT cron.unschedule('scholarship-audit-scheduled')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scholarship-audit-scheduled');

SELECT cron.schedule(
  'scholarship-audit-scheduled',
  '30 11 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/scholarship-audit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pipeline_secret' LIMIT 1)
    ),
    body := '{"source":"scheduled"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
