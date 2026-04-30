-- Ajoute une colonne `examples` à la table rules pour donner au LLM des
-- exemples concrets de phrases où la règle s'applique vraiment. C'est crucial
-- pour les modèles open-weights moins fins, qui ont tendance à insérer des
-- trous dans des contextes où ni l'un ni l'autre des candidats ne fonctionne
-- (ex : "ils atterrissent {{où/ou}} la capitale" — il faut "à").

alter table public.rules
  add column if not exists examples jsonb;

-- Exemples pour ou/où
update public.rules
set examples = '[
  {"sentence": "Le château {{?}} habite la sorcière est sombre.", "answer": "où", "rationale": "où introduit une relative de lieu"},
  {"sentence": "Va dans la pièce {{?}} se trouve le coffre.", "answer": "où", "rationale": "où introduit une relative de lieu"},
  {"sentence": "Tu veux du pain {{?}} de la brioche ?", "answer": "ou", "rationale": "ou marque une alternative entre deux choix"},
  {"sentence": "Il faut choisir entre la mer {{?}} la montagne.", "answer": "ou", "rationale": "ou marque une alternative"}
]'::jsonb
where id = 'ou-ou';

-- Exemples pour a/à
update public.rules
set examples = '[
  {"sentence": "Il {{?}} mangé toute la tarte.", "answer": "a", "rationale": "verbe avoir conjugué (3e personne du singulier)"},
  {"sentence": "Elle {{?}} couru jusqu''au bout du jardin.", "answer": "a", "rationale": "auxiliaire avoir"},
  {"sentence": "Nous allons {{?}} la piscine cet après-midi.", "answer": "à", "rationale": "préposition de lieu"},
  {"sentence": "Elle parle {{?}} sa sœur tous les soirs.", "answer": "à", "rationale": "préposition (parler à quelqu''un)"}
]'::jsonb
where id = 'a-a';
