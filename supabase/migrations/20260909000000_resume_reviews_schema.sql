-- Resume Reviewer: stores one row per AI-generated review of a student's resume.
-- Writes happen only from the resume-review edge function (service role), which
-- bypasses RLS; students only ever read their own rows through the client.
create table if not exists public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_path text not null,
  overall_score integer not null check (overall_score >= 0 and overall_score <= 100),
  category_scores jsonb not null default '{}'::jsonb,
  fixes jsonb not null default '[]'::jsonb,
  summary text,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists resume_reviews_user_id_created_at_idx
  on public.resume_reviews (user_id, created_at desc);

alter table public.resume_reviews enable row level security;

create policy "Users can view own resume reviews"
  on public.resume_reviews for select
  using (auth.uid() = user_id);

create policy "Admins can view all resume reviews"
  on public.resume_reviews for select
  using (has_role(auth.uid(), 'admin'::app_role));
