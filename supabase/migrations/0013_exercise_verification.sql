-- Notion de "vérifié" sur les exercices : un prof ou admin atteste que le
-- texte et les bonnes réponses sont corrects. Les utilisateurs peuvent s'y
-- fier pour se concentrer sur la grammaire sans s'inquiéter d'un bug du LLM.
--
-- 3 colonnes :
--   verified              : flag à afficher
--   verified_at           : quand a-t-il été vérifié (pour tri / fraîcheur)
--   verified_by_username  : qui a vérifié (signal social)
--
-- Toutes nullables sauf verified (default false). L'éditeur les remplit
-- explicitement lors du toggle (pas de trigger : on garde le code lisible
-- et la responsabilité côté app).

alter table public.exercises
  add column verified boolean not null default false,
  add column verified_at timestamptz,
  add column verified_by_username text references public.usernames(username) on delete set null;

-- Index partiel : seules les lignes vérifiées sont indexées, ce qui est
-- plus léger qu'un index complet et suffit pour les requêtes "lister les
-- exercices vérifiés".
create index idx_exercises_verified on public.exercises(verified, created_at desc) where verified;
