-- Gramgame — schéma initial
-- Tables : user_profiles, rules, exercises, attempts
-- Toutes les tables (sauf rules en lecture) sont protégées par RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- user_profiles : profil applicatif rattaché 1-1 à auth.users
-- ────────────────────────────────────────────────────────────────────────────
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 40),
  grade_level text not null,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "user_profiles_self_select"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "user_profiles_self_insert"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_profiles_self_update"
  on public.user_profiles for update
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- rules : catalogue de règles grammaticales (lecture publique)
-- ────────────────────────────────────────────────────────────────────────────
create table public.rules (
  id text primary key,
  display_name text not null,
  short_description text not null,
  rule_type text not null check (rule_type in ('multiple_choice', 'free_text')),
  candidates jsonb not null,
  difficulty_hint text
);

alter table public.rules enable row level security;

create policy "rules_public_read"
  on public.rules for select
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- exercises : exercices générés (un user voit ses exercices)
-- ────────────────────────────────────────────────────────────────────────────
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  rule_id text not null references public.rules(id),
  theme text not null,
  grade_level text not null,
  num_blanks int not null check (num_blanks > 0),
  text text not null,
  blanks jsonb not null,
  llm_model text not null,
  created_at timestamptz not null default now()
);

create index idx_exercises_creator on public.exercises(created_by, created_at desc);

alter table public.exercises enable row level security;

create policy "exercises_self_select"
  on public.exercises for select
  using (auth.uid() = created_by);

create policy "exercises_self_insert"
  on public.exercises for insert
  with check (auth.uid() = created_by);

-- ────────────────────────────────────────────────────────────────────────────
-- attempts : tentatives d'exercices par les utilisateurs
-- ────────────────────────────────────────────────────────────────────────────
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  responses jsonb not null,
  score int not null check (score >= 0),
  score_total int not null check (score_total > 0),
  per_rule_breakdown jsonb not null,
  appreciation text,
  completed_at timestamptz not null default now()
);

create index idx_attempts_user on public.attempts(user_id, completed_at desc);

alter table public.attempts enable row level security;

create policy "attempts_self_select"
  on public.attempts for select
  using (auth.uid() = user_id);

create policy "attempts_self_insert"
  on public.attempts for insert
  with check (auth.uid() = user_id);
