-- Fix la policy de claim sur usernames : remplace `(select auth.jwt() ->> 'email')`
-- par `auth.email()` qui est plus direct et plus fiable.
--
-- Le pattern subselect est recommandé pour la perf mais a été rapporté à
-- plusieurs reprises comme se comportant mal avec les helpers d'auth (claims
-- pas propagés correctement dans certaines configs, notamment depuis la
-- migration vers les API keys publishable). `auth.email()` (qui est juste un
-- alias court de `auth.jwt() ->> 'email'`) est lui parfaitement éprouvé.

drop policy if exists "usernames_self_claim" on public.usernames;

create policy "usernames_self_claim"
  on public.usernames for update
  using (
    user_id is null
    and auth.email() = real_email
  )
  with check (user_id = auth.uid());
