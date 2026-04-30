-- Trigger : empêche la démotion du dernier admin (qui laisserait l'app
-- inadministrable). Le check côté frontend serait contournable par requête
-- directe — un trigger DB est la seule garantie inviolable.

create or replace function public.prevent_last_admin_demotion()
returns trigger
language plpgsql
as $$
begin
  -- On n'agit que si ce changement précis est une démotion depuis admin
  if old.role = 'admin' and new.role <> 'admin' then
    if (
      select count(*)
      from public.usernames
      where role = 'admin'
        and username <> old.username
    ) = 0 then
      raise exception 'Impossible : il doit toujours rester au moins un administrateur. Promeus quelqu''un d''autre admin avant de te démettre.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists usernames_prevent_last_admin_demotion on public.usernames;

create trigger usernames_prevent_last_admin_demotion
  before update on public.usernames
  for each row
  execute function public.prevent_last_admin_demotion();
