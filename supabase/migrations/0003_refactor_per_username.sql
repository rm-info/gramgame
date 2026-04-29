-- Refactor du modèle d'auth : drop sub-addressing, multi-username par auth user
--
-- Avant : chaque username avait son propre auth.users (via un email synthétique
-- sub-adressé). Limite : ne marche pas si le serveur mail du destinataire rejette
-- les `+tags`.
--
-- Après : 1 email = 1 auth.users. N usernames peuvent pointer vers le même auth
-- user. Le bon username est routé via un paramètre URL dans le magic link.
-- Toutes les données (profil, exercices, tentatives) sont filtrées par username.

-- ────────────────────────────────────────────────────────────────────────────
-- usernames : drop auth_email, ajoute user_id (NULL avant claim)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.usernames drop column auth_email;
alter table public.usernames
  add column user_id uuid references auth.users(id) on delete set null;
create index idx_usernames_user_id on public.usernames(user_id);

drop policy if exists "usernames_self_read" on public.usernames;

-- L'utilisateur peut lire les lignes qu'il possède (claim posé)
create policy "usernames_self_read"
  on public.usernames for select
  using (auth.uid() = user_id);

-- L'utilisateur peut "claim" une ligne : poser son user_id sur une ligne non
-- claim, à condition que SON email JWT corresponde au real_email de la ligne.
-- C'est ce qui empêche de revendiquer le username de quelqu'un d'autre.
create policy "usernames_self_claim"
  on public.usernames for update
  using (
    user_id is null
    and (select auth.jwt() ->> 'email') = real_email
  )
  with check (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- user_profiles : repivote sur username
-- ────────────────────────────────────────────────────────────────────────────
drop table if exists public.user_profiles cascade;

create table public.user_profiles (
  username text primary key references public.usernames(username) on delete cascade,
  grade_level text not null,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "user_profiles_self_select"
  on public.user_profiles for select
  using (
    username in (select username from public.usernames where user_id = auth.uid())
  );

create policy "user_profiles_self_insert"
  on public.user_profiles for insert
  with check (
    username in (select username from public.usernames where user_id = auth.uid())
  );

create policy "user_profiles_self_update"
  on public.user_profiles for update
  using (
    username in (select username from public.usernames where user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- exercises : remplace created_by (uuid) par created_by_username (text)
-- ────────────────────────────────────────────────────────────────────────────
drop table if exists public.exercises cascade;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  created_by_username text not null references public.usernames(username) on delete cascade,
  rule_id text not null references public.rules(id),
  theme text not null,
  grade_level text not null,
  num_blanks int not null check (num_blanks > 0),
  text text not null,
  blanks jsonb not null,
  llm_model text not null,
  created_at timestamptz not null default now()
);

create index idx_exercises_creator on public.exercises(created_by_username, created_at desc);

alter table public.exercises enable row level security;

create policy "exercises_self_select"
  on public.exercises for select
  using (
    created_by_username in (select username from public.usernames where user_id = auth.uid())
  );

create policy "exercises_self_insert"
  on public.exercises for insert
  with check (
    created_by_username in (select username from public.usernames where user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- attempts : remplace user_id par username
-- ────────────────────────────────────────────────────────────────────────────
drop table if exists public.attempts cascade;

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  username text not null references public.usernames(username) on delete cascade,
  responses jsonb not null,
  score int not null check (score >= 0),
  score_total int not null check (score_total > 0),
  per_rule_breakdown jsonb not null,
  appreciation text,
  completed_at timestamptz not null default now()
);

create index idx_attempts_user on public.attempts(username, completed_at desc);

alter table public.attempts enable row level security;

create policy "attempts_self_select"
  on public.attempts for select
  using (
    username in (select username from public.usernames where user_id = auth.uid())
  );

create policy "attempts_self_insert"
  on public.attempts for insert
  with check (
    username in (select username from public.usernames where user_id = auth.uid())
  );
