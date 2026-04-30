-- Permet à un admin de supprimer une ligne usernames.
-- Cas d'usage principal : compte créé avec un email erroné, jamais claim'd,
-- donc bloqué et inutilisable. L'admin libère le username pour qu'il puisse
-- être réutilisé, et nettoie au passage les éventuels exercises/attempts liés
-- (via les FK ON DELETE CASCADE déjà en place).
--
-- Garde-fou : un admin ne peut pas supprimer son propre compte (un autre
-- admin doit le faire).

create policy "usernames_admin_delete"
  on public.usernames for delete
  using (public.is_admin());

create or replace function public.prevent_self_username_delete()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and old.user_id = auth.uid() then
    raise exception 'Tu ne peux pas supprimer ton propre compte. Un autre administrateur doit le faire.';
  end if;
  return old;
end;
$$;

drop trigger if exists usernames_prevent_self_delete on public.usernames;

create trigger usernames_prevent_self_delete
  before delete on public.usernames
  for each row
  execute function public.prevent_self_username_delete();
