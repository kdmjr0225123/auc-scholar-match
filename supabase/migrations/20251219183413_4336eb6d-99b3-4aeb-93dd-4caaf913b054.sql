INSERT INTO public.user_roles (user_id, role)
VALUES ('ce683473-6d32-4458-aac6-07e35ef80fb5', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;