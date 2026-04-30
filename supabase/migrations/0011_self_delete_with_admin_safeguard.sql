-- Permet à un utilisateur de supprimer son propre compte (désinscription)
-- depuis l'espace profil, tout en préservant l'invariant "au moins un admin".
--
-- Remplace le trigger trop restrictif de 0010 (qui bloquait toute
-- auto-suppression) par une logique plus fine : on n'interdit la suppression
-- que si la ligne supprimée est admin ET qu'il n'en reste aucun autre.
--
-- Ajoute une policy DELETE pour qu'un user puisse cibler sa propre ligne.

drop trigger if exists usernames_prevent_self_delete on public.usernames;
drop function if exists public.prevent_self_username_delete();

create or replace function public.prevent_last_admin_loss_on_delete()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'admin' then
    if (
      select count(*) from public.usernames
      where role = 'admin' and username <> old.username
    ) = 0 then
      raise exception 'Impossible : il doit toujours rester au moins un administrateur. Promeus quelqu''un d''autre admin avant de supprimer ce compte.';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists usernames_prevent_last_admin_loss_on_delete on public.usernames;

create trigger usernames_prevent_last_admin_loss_on_delete
  before delete on public.usernames
  for each row
  execute function public.prevent_last_admin_loss_on_delete();

-- Policy : un user peut supprimer sa propre ligne (désinscription)
create policy "usernames_self_delete"
  on public.usernames for delete
  using (auth.uid() = user_id);
