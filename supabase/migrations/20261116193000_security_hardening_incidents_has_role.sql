-- 1. incidents: no client reads it; service role (edge functions) bypasses RLS.
alter table public.incidents enable row level security;
revoke all on table public.incidents from anon, authenticated;

-- 2. Admin-only policies were granted to role "public" (includes anon). Scope them to signed-in users
--    so anon never evaluates has_role(), then remove anon's ability to call it.
alter policy "Admins can view audit results" on public.audit_results to authenticated;
alter policy "Admins can view audit sessions" on public.audit_sessions to authenticated;
alter policy "Admins can view pipeline logs" on public.pipeline_logs to authenticated;
alter policy "Admins can view pipeline runs" on public.pipeline_runs to authenticated;
alter policy "Admins can view all resume reviews" on public.resume_reviews to authenticated;
alter policy "Admins can view all applications" on public.student_applications to authenticated;
alter policy "Admins can view all student profiles" on public.student_profiles to authenticated;
alter policy "Admins can view synthetic coverage results" on public.synthetic_coverage_results to authenticated;
alter policy "Admins can view synthetic coverage runs" on public.synthetic_coverage_runs to authenticated;
alter policy "Admins can view synthetic profiles" on public.synthetic_profiles to authenticated;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
revoke execute on function public.has_admin_session() from public, anon;
grant execute on function public.has_admin_session() to authenticated, service_role;
