-- Seed des règles disponibles au lancement.
-- Pour ajouter une nouvelle règle d'homophone : juste un INSERT supplémentaire.
insert into public.rules (id, display_name, short_description, rule_type, candidates, difficulty_hint) values
  (
    'ou-ou',
    'ou / où',
    'Distinction entre la conjonction « ou » (alternative) et l''adverbe « où » (lieu/temps).',
    'multiple_choice',
    '["ou", "où"]'::jsonb,
    'CE1'
  ),
  (
    'a-a',
    'a / à',
    'Distinction entre le verbe « a » (auxiliaire avoir, 3e personne du singulier) et la préposition « à ».',
    'multiple_choice',
    '["a", "à"]'::jsonb,
    'CE1'
  )
on conflict (id) do nothing;
