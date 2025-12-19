-- Add first_name, last_name, and email columns to student_profiles
ALTER TABLE public.student_profiles
ADD COLUMN first_name text,
ADD COLUMN last_name text,
ADD COLUMN email text;

-- Add RLS policy for admins to view all student profiles
CREATE POLICY "Admins can view all student profiles"
ON public.student_profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));