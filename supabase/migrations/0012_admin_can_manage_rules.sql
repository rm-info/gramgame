-- Permet à un admin de gérer les règles (CRUD) depuis l'UI.
-- Avant : seule la lecture publique était autorisée par RLS, les rules
-- étaient seedées via migration. Maintenant l'admin peut ajouter / éditer /
-- dupliquer / supprimer depuis /admin/rules.
--
-- Sécurité : la suppression d'une règle référencée par des exercises sera
-- naturellement rejetée par la FK exercises.rule_id (pas de ON DELETE CASCADE),
-- donc pas de risque d'effacement silencieux d'exercices.

create policy "rules_admin_insert"
  on public.rules for insert
  with check (public.is_admin());

create policy "rules_admin_update"
  on public.rules for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "rules_admin_delete"
  on public.rules for delete
  using (public.is_admin());
