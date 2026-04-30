-- Rôles utilisateurs : user (défaut), prof (éditer exos), admin (gérer rôles + tout).
--
-- Ajout d'une colonne role sur usernames + helpers SECURITY DEFINER pour
-- éviter les boucles RLS quand on vérifie un rôle dans une policy d'une table
-- (puisqu'auth.uid() → query usernames → RLS sur usernames → query usernames…
-- récursion sans cette parade).
--
-- Bootstrap : la 1ʳᵉ ligne usernames est promue admin pour faciliter le démarrage
-- (à adapter manuellement après si l'ordre de création n'est pas déterministe).

alter table public.usernames
  add column role text not null default 'user'
  check (role in ('user', 'prof', 'admin'));

-- ────────────────────────────────────────────────────────────────────────────
-- Helpers SECURITY DEFINER (bypassent RLS, évitent la récursion)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usernames
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.can_edit_exercises()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usernames
    where user_id = auth.uid() and role in ('prof', 'admin')
  );
$$;

revoke all on function public.can_edit_exercises() from public;
grant execute on function public.can_edit_exercises() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Policies admin sur usernames : voir et modifier toutes les lignes
-- ────────────────────────────────────────────────────────────────────────────
create policy "usernames_admin_select_all"
  on public.usernames for select
  using (public.is_admin());

create policy "usernames_admin_update_all"
  on public.usernames for update
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- Policies prof/admin sur exercises : voir et éditer tous les exercices
-- ────────────────────────────────────────────────────────────────────────────
create policy "exercises_editor_select_all"
  on public.exercises for select
  using (public.can_edit_exercises());

create policy "exercises_editor_update"
  on public.exercises for update
  using (public.can_edit_exercises())
  with check (public.can_edit_exercises());

-- ────────────────────────────────────────────────────────────────────────────
-- Bootstrap : promeut le 1er username admin (sera le créateur si singleton).
-- Modifie cette ligne ou exécute manuellement si ton username est différent.
-- ────────────────────────────────────────────────────────────────────────────
update public.usernames
set role = 'admin'
where username = (select username from public.usernames order by created_at limit 1);
