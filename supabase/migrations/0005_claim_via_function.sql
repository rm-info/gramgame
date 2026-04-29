-- Remplace la policy RLS de claim par une fonction SECURITY DEFINER.
--
-- La policy `usernames_self_claim` reposant sur `auth.email() = real_email`
-- était silencieusement rejetée (probable propagation incomplète des claims
-- du JWT vers le contexte SQL avec la nouvelle API key publishable). On bascule
-- sur une fonction qui lit `auth.users.email` directement (autorisé par
-- SECURITY DEFINER) et retourne un code d'erreur précis sur échec.

-- Drop l'ancienne policy de claim (remplacée par la fonction).
drop policy if exists "usernames_self_claim" on public.usernames;

create or replace function public.claim_username(target_username text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  current_email text;
  target_email text;
  target_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    return 'not_authenticated';
  end if;

  -- Email de l'utilisateur authentifié (lu directement, RLS court-circuité par SECURITY DEFINER).
  select email into current_email from auth.users where id = current_user_id;
  if current_email is null then
    return 'no_email';
  end if;

  -- État actuel du username cible.
  select real_email, user_id into target_email, target_user_id
  from public.usernames
  where username = target_username;

  if target_email is null then
    return 'not_found';
  end if;

  -- Déjà claimed : on retourne 'ok' si c'est nous, sinon 'taken_by_other'.
  if target_user_id is not null then
    if target_user_id = current_user_id then
      return 'ok';
    else
      return 'taken_by_other';
    end if;
  end if;

  -- Vérifie que l'email du JWT correspond à l'email d'inscription.
  if lower(target_email) != lower(current_email) then
    return 'email_mismatch';
  end if;

  -- Tous les checks passent : on claim.
  update public.usernames
    set user_id = current_user_id
    where username = target_username and user_id is null;

  return 'ok';
end;
$$;

revoke all on function public.claim_username(text) from public;
grant execute on function public.claim_username(text) to authenticated;
