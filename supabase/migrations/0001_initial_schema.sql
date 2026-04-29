-- Gramgame — schéma initial
-- Tables : usernames, user_profiles, rules, exercises, attempts
-- Toutes les tables (sauf rules en lecture) sont protégées par RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- usernames : handles globalement uniques + mapping email réel ↔ email auth
-- ────────────────────────────────────────────────────────────────────────────
-- Pour permettre à plusieurs apprenants (typiquement frères/sœurs) de partager
-- une seule boîte mail, on synthétise en interne un "auth_email" sub-adressé
-- (ex : parent+gramgame-lea@gmail.com). L'utilisateur ne voit jamais cette
-- transformation : il fournit son email réel à l'inscription, et son username
-- seul à la connexion.
--
-- Cette table est gérée exclusivement par l'edge function `signin` (avec la
-- service_role_key), jamais directement par le client — pour empêcher
-- l'énumération de usernames et le spam de magic links.
create table public.usernames (
  username text primary key
    check (username ~ '^[a-z0-9_-]{3,20}$'),
  real_email text not null
    check (real_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  auth_email text not null unique
    check (auth_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);

create index idx_usernames_real_email on public.usernames(real_email);

alter table public.usernames enable row level security;

-- L'utilisateur authentifié peut lire SA ligne (matchée par email du JWT).
-- Aucune policy d'INSERT/UPDATE pour anon : tout passe par l'edge function.
create policy "usernames_self_read"
  on public.usernames for select
  using ((select auth.jwt() ->> 'email') = auth_email);

-- ────────────────────────────────────────────────────────────────────────────
-- user_profiles : profil applicatif rattaché 1-1 à auth.users
-- ────────────────────────────────────────────────────────────────────────────
-- Le nom affiché vient de `usernames.username`. Ici on ne stocke que les
-- préférences pédagogiques (grade_level pour adapter la difficulté).
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
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
