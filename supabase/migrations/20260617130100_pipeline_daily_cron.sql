-- Retire the legacy daily "deactivate-expired-scholarships" cron job.
-- It only soft-deactivated scholarships past their deadline, which is now
-- fully superseded by scholarship-quality-check's stricter 2-month gate
-- (which deletes outright rather than soft-deactivating). Keeping both
-- running was redundant and risked the two disagreeing over time.
SELECT cron.unschedule('deactivate-expired-scholarships');

-- Move scholarship-quality-check from weekly (Mondays only) to daily, so
-- broken links, CAPTCHA walls, and deadline creep get caught promptly
-- rather than sitting live in the inventory for up to a week.
SELECT cron.unschedule('scholarship-quality-check');

SELECT cron.schedule(
  'scholarship-quality-check',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://swvfmitxxjrjuizaqvsn.supabase.co/functions/v1/scholarship-quality-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
