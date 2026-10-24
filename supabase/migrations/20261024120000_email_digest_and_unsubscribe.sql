-- Student email: one batched match email per day, unsubscribe, authenticated senders.
--
-- 1. Unsubscribe + digest bookkeeping on student_profiles.
-- 2. Stop the per-scholarship email: with automated daily promotion it emailed
--    every student once per scholarship (10 emails each on 2026-10-22).
--    Replaced by the match-digest function (one email per student per day).
-- 3. Schedule match-digest at 13:00 UTC (after the 11:30 UTC audit) and make the
--    reminder cron authenticate with the Vault pipeline secret.

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_match_email_at timestamptz;

DROP TRIGGER IF EXISTS on_scholarship_approved ON public.scholarships;

SELECT cron.unschedule('match-email-digest')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'match-email-digest');

SELECT cron.schedule(
  'match-email-digest',
  '0 13 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/match-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pipeline_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

SELECT cron.unschedule('scholarship-deadline-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scholarship-deadline-reminders');

SELECT cron.schedule(
  'scholarship-deadline-reminders',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/scholarship-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pipeline_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
