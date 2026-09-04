-- Daily cron for the Synthetic Coverage Check, offset a few minutes after
-- scholarship-quality-check (0 8 * * * UTC) so it always evaluates against
-- that day's already-cleaned-up inventory rather than racing it.
SELECT cron.schedule(
  'synthetic-coverage-check',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/synthetic-coverage-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
