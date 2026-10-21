CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.admin_pin (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
REVOKE ALL ON TABLE private.admin_pin FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_expiry_idx
  ON public.admin_sessions (user_id, expires_at DESC);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.has_admin_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_sessions AS session
    WHERE session.user_id = auth.uid()
      AND session.expires_at > now()
  );
$$;
REVOKE ALL ON FUNCTION public.has_admin_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_verify_pin(p_user_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions
AS $$
DECLARE
  pin_record private.admin_pin%ROWTYPE;
  next_attempts integer;
BEGIN
  SELECT * INTO pin_record
  FROM private.admin_pin
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'setup_required', true, 'remaining_attempts', 5);
  END IF;

  IF pin_record.locked_until IS NOT NULL AND pin_record.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked_until', pin_record.locked_until, 'remaining_attempts', 0);
  END IF;

  IF pin_record.locked_until IS NOT NULL AND pin_record.locked_until <= now() THEN
    UPDATE private.admin_pin SET failed_attempts = 0, locked_until = NULL WHERE user_id = p_user_id;
    pin_record.failed_attempts := 0;
    pin_record.locked_until := NULL;
  END IF;

  IF p_pin IS NOT NULL AND p_pin ~ '^[0-9]{4}$'
     AND extensions.crypt(p_pin, pin_record.pin_hash) = pin_record.pin_hash THEN
    UPDATE private.admin_pin SET failed_attempts = 0, locked_until = NULL WHERE user_id = p_user_id;
    INSERT INTO public.admin_sessions (user_id, expires_at)
    VALUES (p_user_id, now() + interval '30 minutes');
    RETURN jsonb_build_object('ok', true, 'expires_at', now() + interval '30 minutes');
  END IF;

  next_attempts := pin_record.failed_attempts + 1;
  UPDATE private.admin_pin
  SET failed_attempts = next_attempts,
      locked_until = CASE WHEN next_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'ok', false,
    'remaining_attempts', GREATEST(5 - next_attempts, 0),
    'locked_until', CASE WHEN next_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT jsonb_build_object(
    'setup_required', NOT EXISTS (SELECT 1 FROM private.admin_pin WHERE user_id = p_user_id),
    'locked_until', (SELECT locked_until FROM private.admin_pin WHERE user_id = p_user_id),
    'session_active', EXISTS (
      SELECT 1 FROM public.admin_sessions
      WHERE user_id = p_user_id AND expires_at > now()
    ),
    'expires_at', (
      SELECT max(expires_at) FROM public.admin_sessions
      WHERE user_id = p_user_id AND expires_at > now()
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_pin(p_user_id uuid, p_current_pin text, p_new_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, extensions
AS $$
DECLARE
  pin_record private.admin_pin%ROWTYPE;
  next_attempts integer;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PIN must be exactly four digits.');
  END IF;

  SELECT * INTO pin_record
  FROM private.admin_pin
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_current_pin IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PIN setup state changed.');
    END IF;
    INSERT INTO private.admin_pin (user_id, pin_hash)
    VALUES (p_user_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf')));
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF pin_record.locked_until IS NOT NULL AND pin_record.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked_until', pin_record.locked_until, 'remaining_attempts', 0);
  END IF;

  IF pin_record.locked_until IS NOT NULL AND pin_record.locked_until <= now() THEN
    UPDATE private.admin_pin SET failed_attempts = 0, locked_until = NULL WHERE user_id = p_user_id;
    pin_record.failed_attempts := 0;
    pin_record.locked_until := NULL;
  END IF;

  IF p_current_pin IS NULL OR p_current_pin !~ '^[0-9]{4}$'
     OR extensions.crypt(p_current_pin, pin_record.pin_hash) <> pin_record.pin_hash THEN
    next_attempts := pin_record.failed_attempts + 1;
    UPDATE private.admin_pin
    SET failed_attempts = next_attempts,
        locked_until = CASE WHEN next_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', false, 'remaining_attempts', GREATEST(5 - next_attempts, 0));
  END IF;

  UPDATE private.admin_pin
  SET pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
      failed_attempts = 0,
      locked_until = NULL
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_pin(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_pin_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_pin(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_pin(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_pin_status(uuid) TO service_role;

DO $$
DECLARE
  existing_policy record;
BEGIN
  IF to_regclass('public.scholarship_staging') IS NOT NULL THEN
    ALTER TABLE public.scholarship_staging ENABLE ROW LEVEL SECURITY;
    FOR existing_policy IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'scholarship_staging'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.scholarship_staging', existing_policy.policyname);
    END LOOP;
    CREATE POLICY "Admins with PIN session can manage staging"
      ON public.scholarship_staging
      FOR ALL
      TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) AND public.has_admin_session())
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND public.has_admin_session());
  END IF;
END;
$$;

DO $$
DECLARE
  policy_row record;
  role_list text;
  using_clause text;
  check_clause text;
BEGIN
  FOR policy_row IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public'
      AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~* 'has_role.*admin'
  LOOP
    SELECT string_agg(quote_ident(role_name), ', ')
    INTO role_list
    FROM unnest(policy_row.roles) AS role_name;

    using_clause := CASE WHEN policy_row.qual IS NULL THEN ''
      ELSE format(' USING ((%s) AND public.has_admin_session())', policy_row.qual) END;
    check_clause := CASE WHEN policy_row.with_check IS NULL THEN ''
      ELSE format(' WITH CHECK ((%s) AND public.has_admin_session())', policy_row.with_check) END;

    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename,
      CASE WHEN policy_row.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      policy_row.cmd,
      COALESCE(role_list, 'public'),
      using_clause,
      check_clause
    );
  END LOOP;
END;
$$;
