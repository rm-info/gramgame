-- Trigger : interdit à un utilisateur de modifier son propre rôle.
--
-- Cas couverts :
--   - admin ne peut pas se rétrograder (footgun, en plus du trigger 0008
--     qui empêche la démotion du dernier admin)
--   - prof ne peut pas se promouvoir admin
--   - admin ne peut pas non plus *augmenter* son propre rôle (cas trivial,
--     mais on pose la règle proprement : seul un autre admin peut changer
--     un rôle)
--
-- Bootstrap : la migration 0007 fait un UPDATE depuis un contexte
-- service-role (auth.uid() IS NULL), donc le trigger ne bloque pas.

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
as $$
begin
  if old.role <> new.role
     and auth.uid() is not null
     and old.user_id = auth.uid() then
    raise exception 'Tu ne peux pas modifier ton propre rôle. Un autre administrateur doit le faire.';
  end if;
  return new;
end;
$$;

drop trigger if exists usernames_prevent_self_role_change on public.usernames;

create trigger usernames_prevent_self_role_change
  before update on public.usernames
  for each row
  execute function public.prevent_self_role_change();
