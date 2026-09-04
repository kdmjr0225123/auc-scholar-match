
ALTER FUNCTION public.deactivate_expired_scholarships() SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_notify_new_scholarship() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.trigger_notify_new_scholarship() FROM PUBLIC, anon, authenticated;
