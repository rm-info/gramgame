# Gramgame

Application web pédagogique : un "prof de grammaire en ligne" qui génère des textes à trous sur mesure, fait pratiquer l'élève à l'écran, corrige automatiquement, note avec appréciation et oriente vers les difficultés rencontrées.

**Stack** : SvelteKit (static export) + Supabase (Postgres + Auth + Edge Functions) + LLM (Gemini par défaut, n'importe quel provider compatible OpenAI). Hébergement gratuit sur GitHub Pages.

## Stack et architecture

```
┌─────────────────────────────┐    ┌──────────────────────────┐
│ Frontend statique           │    │ Supabase                 │
│ (GitHub Pages, gratuit)     │    │  ├── Postgres (data)     │
│ - SvelteKit + adapter-static│◄──►│  ├── Auth (magic link)   │
│ - Appelle Supabase via SDK  │    │  └── Edge Functions      │
└─────────────────────────────┘    │       └── LLM (HTTP) →   │
                                    └──────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────────┐
                                    │ Provider LLM             │
                                    │ Gemini 2.0 Flash défaut  │
                                    │ (free tier 1500 req/jour)│
                                    └──────────────────────────┘
```

La clé API LLM ne sort **jamais** du serveur : elle vit dans les secrets Supabase, est utilisée uniquement par les Edge Functions.

## Démarrage local

```sh
# 1. Installer les dépendances
npm install

# 2. Copier les variables d'env et remplir avec votre projet Supabase
cp .env.example .env
# Éditer .env : PUBLIC_SUPABASE_URL et PUBLIC_SUPABASE_ANON_KEY

# 3. Lancer le dev server
npm run dev
```

L'app est accessible sur <http://localhost:5173>.

## Mise en place complète (1ʳᵉ fois)

### 1. Créer le projet Supabase

1. Aller sur <https://supabase.com>, créer un projet gratuit.
2. Récupérer dans **Settings → API** : `Project URL` et `anon public key`. Les coller dans `.env`.
3. Dans **Authentication → URL Configuration** :
    - `Site URL` : `http://localhost:5173`
    - `Redirect URLs` : ajouter `http://localhost:5173/auth-callback` et plus tard `https://<votre-user>.github.io/gramgame/auth-callback`.

### 2. Appliquer le schéma SQL

Avec la CLI Supabase :

```sh
npm install -g supabase
supabase login
supabase link --project-ref <votre-project-ref>
supabase db push
```

Ou : copier le contenu de `supabase/migrations/0001_initial_schema.sql` puis `0002_seed_rules.sql` dans **SQL Editor** sur l'interface Supabase et exécuter.

### 3. Configurer le provider LLM

L'app utilise **n'importe quelle API compatible OpenAI** via 3 secrets Supabase. Par défaut elle est configurée pour **Gemini** (free tier généreux, ~750 exos/jour gratuits).

**Option A — Gemini (recommandé pour démarrer, $0)**

1. Créer une API key sur <https://aistudio.google.com/app/apikey>.
2. La stocker comme secret Supabase :

```sh
supabase secrets set LLM_API_KEY=AIza...
```

C'est tout — `LLM_BASE_URL` et `LLM_MODEL` ont déjà des défauts Gemini-friendly (`gemini-2.0-flash`). Free tier : 15 req/min, 1500 req/jour.

**Option B — OpenRouter (multi-modèles, ~0,01 €/exercice avec Claude Haiku)**

```sh
supabase secrets set LLM_API_KEY=sk-or-v1-xxxxx
supabase secrets set LLM_BASE_URL=https://openrouter.ai/api/v1
supabase secrets set LLM_MODEL=anthropic/claude-haiku-4-5
```

OpenRouter propose aussi des modèles `:free` (Llama, Mistral, Qwen) à $0 avec rate limits — voir <https://openrouter.ai/models?max_price=0>.

**Option C — Mistral, OpenAI, Anthropic direct**

Même principe : 3 secrets pour pointer vers leur endpoint OpenAI-compatible et choisir un modèle.

### 4. Déployer les Edge Functions

```sh
supabase functions deploy generate-exercise
supabase functions deploy correct-attempt
```

### 5. Vérification locale

```sh
npm run dev
```

Aller sur <http://localhost:5173>, créer un compte par magic link, faire l'onboarding, lancer un exercice. Le flow doit fonctionner E2E.

### 6. Déploiement sur GitHub Pages

1. Créer le repo `gramgame` sur GitHub, pusher le code (`git push -u origin main`).
2. Dans **Settings → Pages** du repo, choisir **Source : GitHub Actions**.
3. Dans **Settings → Secrets and variables → Actions**, ajouter :
    - `PUBLIC_SUPABASE_URL`
    - `PUBLIC_SUPABASE_ANON_KEY`
4. Pousser sur `main` → le workflow `.github/workflows/deploy.yml` se déclenche, build le site sous `/gramgame/` et le publie.
5. Mettre à jour les **Redirect URLs** Supabase pour inclure `https://<votre-user>.github.io/gramgame/auth-callback`.

## Plusieurs apprenants dans une famille

Pas de notion de "compte familial" dans le MVP, mais l'astuce du sub-addressing email permet à un parent de créer un compte distinct pour chaque enfant à partir d'**une seule boîte mail** :

- `parent+lea@gmail.com` → compte de Léa
- `parent+tom@gmail.com` → compte de Tom

Tous les emails arrivent dans `parent@gmail.com`, mais Gramgame voit deux comptes indépendants. Chaque enfant a sa progression.

L'astuce est documentée dans la page de connexion de l'app.

## Ajouter une règle de grammaire

Pour ajouter une règle d'homophone (ex : `son/sont`), il suffit d'insérer une ligne dans la table `rules` :

```sql
insert into public.rules (id, display_name, short_description, rule_type, candidates, difficulty_hint) values
  ('son-sont', 'son / sont',
   'Distinction entre l''adjectif possessif "son" et le verbe "sont" (être conjugué).',
   'multiple_choice',
   '["son", "sont"]'::jsonb,
   'CE2');
```

La nouvelle règle apparaît automatiquement dans le sélecteur de `/new`. Aucun changement de code.

Pour les règles de type `free_text` (accords, conjugaison), une logique de validation supplémentaire devra être ajoutée — c'est pour une itération future.

## Coûts

- **Hébergement** : 0 € (GitHub Pages + tier gratuit Supabase).
- **LLM** : 0 € avec Gemini (free tier de 1500 requêtes/jour, soit ~750 exercices/jour). Si tu passes à un modèle payant : ~0,005 € par génération + ~0,002 € par correction (Claude Haiku 4.5 via OpenRouter), soit ~0,01 €/exercice complet.

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build (vers `build/`)
- `npm run preview` — preview du build
- `npm run check` — type-check Svelte + TS

## Structure

```
gramgame/
├── src/
│   ├── lib/
│   │   ├── supabase.ts            # client Supabase singleton
│   │   ├── auth.svelte.ts         # store d'état d'auth
│   │   ├── profile.svelte.ts      # store de profil utilisateur
│   │   ├── api/
│   │   │   ├── generate.ts        # invoke generate-exercise
│   │   │   └── correct.ts         # invoke correct-attempt
│   │   └── components/
│   │       ├── BlankSelect.svelte
│   │       ├── ExerciseText.svelte
│   │       └── ResultView.svelte
│   └── routes/
│       ├── +layout.svelte         # nav + redirections d'auth
│       ├── +page.svelte           # accueil avec dernières tentatives
│       ├── login/                 # magic link
│       ├── auth-callback/
│       ├── onboarding/            # prénom + niveau
│       ├── new/                   # formulaire de génération
│       └── exercise/[id]/         # exécution + correction
└── supabase/
    ├── config.toml
    ├── migrations/                # schéma + seed (SQL versionné)
    └── functions/
        ├── _shared/cors.ts
        ├── generate-exercise/
        └── correct-attempt/
```

## Décisions architecturales

Voir le plan complet : `/home/lokifaer/.claude-tdt/plans/tout-l-heure-j-ai-vivid-dove.md` (généré pendant la phase de cadrage).

Points clés :
- **1 compte = 1 apprenant** (pas de profils multiples). Sub-addressing email pour les familles.
- **Génération LLM à la demande** + persistance de chaque exercice (id stable). Ouvre la voie au partage en cercle plus tard sans refonte.
- **Validation programmatique stricte** côté Edge Function : la sortie LLM est vérifiée (nb de trous, candidats valides, marqueurs présents) avant persistance, retry max 2 sinon erreur claire. Pas de "fallback silencieux" — on enseigne, donc afficher du faux serait inacceptable.
- **RLS** : un utilisateur ne voit que ses propres `exercises` et `attempts`. Le catalogue `rules` est en lecture publique.
- **Détection de difficulté** : l'app suggère automatiquement un exercice ciblé sur la règle la plus ratée à la fin de chaque correction.
