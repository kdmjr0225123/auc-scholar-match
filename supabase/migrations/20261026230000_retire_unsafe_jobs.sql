-- Retire jobs that bypass the pre-publish gate or run unauthenticated.
-- * scholarship-quality-check hard-deleted any live scholarship that failed a
--   single check (Boren was removed on 2026-10-25 over a transient HTTP 502) and
--   could re-activate rows without the gate. scholarship-audit already re-checks
--   live scholarships every morning and only deactivates on a hard failure.
-- * synthetic-coverage-check now requires the pipeline secret (or an admin JWT),
--   so its cron sends x-pipeline-secret instead of an unset setting.

SELECT cron.unschedule('scholarship-quality-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scholarship-quality-check');

SELECT cron.unschedule('synthetic-coverage-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'synthetic-coverage-check');

SELECT cron.schedule(
  'synthetic-coverage-check',
  '15 12 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/synthetic-coverage-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pipeline_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
