# GramGame

Application web pédagogique : un "prof de grammaire en ligne" qui génère des textes à trous sur mesure, fait pratiquer l'élève à l'écran, corrige automatiquement, note avec appréciation et oriente vers les difficultés rencontrées.

**Stack** : SvelteKit (export statique) + [PocketBase](https://pocketbase.io) (SQLite + auth + hooks JS) + LLM (Gemini par défaut, n'importe quel provider compatible OpenAI). Auto-hébergé : un seul process, ~20–50 Mo de RAM.

## Architecture

```
┌──────────── navigateur ────────────┐
│ SvelteKit (SPA statique)           │
│ SDK pocketbase, même origine       │
└───────────────┬────────────────────┘
                │ HTTPS
        ┌───────▼────────┐
        │ Caddy          │  (TLS, reverse proxy)
        └───────┬────────┘
                │ 127.0.0.1:8090
┌───────────────▼──────────────────────────────┐
│ PocketBase (1 binaire Go)                    │
│  ├── pb_public/   front buildé (servi tel quel)│
│  ├── pb_data/     SQLite + backups           │
│  ├── pb_migrations/ schéma + seed des règles │
│  └── pb_hooks/    routes /api/gram/*, garde-fous│
└───────────────┬──────────────────────────────┘
                │ HTTPS (sortant)
        ┌───────▼────────┐   ┌──────────┐
        │ Provider LLM   │   │ SMTP     │ (codes de connexion)
        └────────────────┘   └──────────┘
```

La clé API LLM ne sort jamais du serveur : elle est dans `pocketbase/.env`, utilisée uniquement par les hooks.

## Installation sur le serveur

Prérequis : `git`, `curl`, `unzip`, Node.js ≥ 20 (pour builder le front), Caddy.

```sh
sudo useradd --system --create-home --home-dir /var/lib/gramgame --shell /usr/sbin/nologin gramgame
sudo git clone https://github.com/rm-info/gramgame.git /srv/gramgame
sudo chown -R gramgame:gramgame /srv/gramgame
cd /srv/gramgame
sudo -u gramgame ./pocketbase/install.sh
```

`install.sh` télécharge le binaire PocketBase (version figée, checksum vérifié, amd64/arm64/armv7), builde le front dans `pocketbase/pb_public/` et crée `pocketbase/.env`.

### 1. Config

Éditer `pocketbase/.env` : clé LLM, SMTP, URL publique. Tout est commenté dans [`pocketbase/.env.example`](pocketbase/.env.example). Les réglages SMTP/URL sont réappliqués à chaque démarrage.

### 2. Service systemd

```sh
sudo cp pocketbase/gramgame.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gramgame
journalctl -u gramgame -f
```

Le fichier suppose le repo dans `/srv/gramgame` et un user `gramgame` : adapter sinon. (`ProtectHome=true` empêche de lancer depuis un `/home/...` : retirer la ligne dans ce cas.)

Au premier démarrage, les migrations créent le schéma et les règles `ou/où`, `a/à`.

### 3. Caddy

```caddy
gramgame.lab.rm-info.fr {
	reverse_proxy 127.0.0.1:8090
}
```

Optionnel, pour ne laisser l'admin PocketBase (`/_/`) accessible que depuis le LAN / tailnet :

```caddy
gramgame.lab.rm-info.fr {
	@admin {
		path /_/*
		not remote_ip private_ranges 100.64.0.0/10
	}
	respond @admin 403
	reverse_proxy 127.0.0.1:8090
}
```

### 4. Premier compte

- Le **premier compte créé** via « Créer un compte » devient automatiquement **admin** de l'app.
- Pour l'admin technique de PocketBase (`/_/` : données brutes, logs, backups) :

  ```sh
  sudo -u gramgame ./pocketbase/pocketbase superuser upsert toi@example.org 'un-mot-de-passe-long' --dir pocketbase/pb_data
  ```

### Mise à jour

```sh
cd /srv/gramgame
sudo -u gramgame git pull
sudo -u gramgame ./pocketbase/install.sh
sudo systemctl restart gramgame
```

Les nouvelles migrations (`pb_migrations/`) s'appliquent au redémarrage.

### Sauvegardes

Backup automatique quotidien (03h30, 7 conservés) dans `pocketbase/pb_data/backups/`. Pour une copie hors machine, sauvegarder ce dossier (ou tout `pb_data/`). Restauration possible depuis l'admin `/_/` → Settings → Backups.

## Développement local

```sh
npm install
./pocketbase/install.sh        # 1ʳᵉ fois : binaire PocketBase + .env
./pocketbase/run.sh            # PocketBase sur 127.0.0.1:8090
npm run dev                    # vite sur :5174, proxifie /api et /_ vers PocketBase
```

Pour un PocketBase sur un autre port : `PB_HTTP=127.0.0.1:8091 ./pocketbase/run.sh` et `PB_URL=http://127.0.0.1:8091 npm run dev`. Une instance de dev dans un clone séparé a ses propres données (`pb_data/` est par clone).

Les hooks (`pb_hooks/`) sont rechargés automatiquement par PocketBase quand ils changent ; le front, lui, a besoin d'un `npm run build` pour être servi par PocketBase.

## Modèle d'authentification

- **Inscription** : nom d'utilisateur (3-20 caractères, lettres/chiffres/-/_) + email. Un code à 6 chiffres est envoyé par mail.
- **Connexion** : nom d'utilisateur seul → code par mail (valable 15 min, 1 envoi/minute max, 5 essais max par code).
- **Plusieurs apprenants dans une famille** : un même email peut servir pour plusieurs noms d'utilisateur (ex. « lea » et « tom » avec `parent@gmail.com`). Les codes arrivent tous dans la même boîte, chaque compte a sa progression. Une fois plusieurs comptes connectés sur un navigateur, le sélecteur en haut permet de basculer **sans redemander de code** (« + Ajouter un compte… » pour en connecter un autre).

**Technique** : 1 nom d'utilisateur = 1 enregistrement de la collection auth `users`. PocketBase exige un `email` unique : il reçoit une adresse synthétique non routable (`<username>@users.gramgame.invalid`) et l'adresse réelle est dans `real_email` ; le hook `onMailerRecordOTPSend` redirige les codes vers elle. Aucun `+tag` dans les adresses, donc compatible avec tous les fournisseurs mail. Le front garde un token par compte connecté (localStorage).

Un compte dont le code n'a jamais été saisi reste « en attente » et est supprimé au bout de 7 jours (libère le nom).

### Rôles

- `user` (défaut) : ses exercices et tentatives.
- `prof` : voit et édite tous les exercices, peut les marquer « vérifiés ».
- `admin` : + gestion des rôles, des comptes et des règles.

Garde-fous côté serveur (`pb_hooks/gramgame.pb.js`) : impossible de modifier son propre rôle, de rétrograder ou supprimer le dernier admin ; la date et l'auteur de vérification d'un exercice sont posés par le serveur.

## Ajouter une règle de grammaire

Depuis l'app : **Gestion → Règles** (admin). Ou depuis l'admin PocketBase `/_/` → collection `rules`.

Une règle = un `id` (ex. `son-sont`), un nom affiché, une description, les candidats (`["son", "sont"]`) et des exemples optionnels qui guident le LLM. Elle apparaît immédiatement dans `/new`. Seul le type `multiple_choice` est géré pour l'instant.

## Coûts

- **Hébergement** : la machine existante.
- **LLM** : 0 € avec Gemini (free tier ~1500 requêtes/jour, soit ~750 exercices/jour). Avec un modèle payant : ~0,005 € par génération + ~0,002 € par correction (Claude Haiku via OpenRouter).

## Scripts

- `npm run dev` — dev server (proxy vers PocketBase)
- `npm run build` — build du front dans `pocketbase/pb_public/`
- `npm run check` — type-check Svelte + TS
- `pocketbase/install.sh` — installe / met à jour (binaire + build)
- `pocketbase/run.sh` — lance PocketBase avec `pocketbase/.env`

## Structure

```
gramgame/
├── src/
│   ├── lib/
│   │   ├── pb.ts                  # client PocketBase (même origine)
│   │   ├── auth.svelte.ts         # session + comptes multiples
│   │   ├── active-username.svelte.ts  # accesseurs compte actif / rôle
│   │   ├── profile.svelte.ts      # niveau scolaire
│   │   ├── data.ts                # normalisation des records
│   │   ├── api/                   # appels /api/gram/* + OTP
│   │   └── components/            # BlankSelect, ExerciseText, ResultView, CodeStep
│   └── routes/                    # login, signup, onboarding, new, exercise, profile, admin
└── pocketbase/
    ├── install.sh / run.sh
    ├── gramgame.service           # unité systemd
    ├── .env.example
    ├── pb_migrations/             # schéma, API rules, seed, réglages
    └── pb_hooks/
        ├── gramgame.pb.js         # routes /api/gram/*, garde-fous, cron
        └── lib/gram.js            # OTP, prompts LLM, validation, notation
```

## Décisions architecturales

- **Génération LLM à la demande** + persistance de chaque exercice (id stable).
- **Validation programmatique stricte** de la sortie LLM (nb de trous, candidats valides, marqueurs présents), retry max 2 sinon erreur claire. Pas de fallback silencieux : afficher du faux serait inacceptable pour un outil d'apprentissage.
- **API rules** : un utilisateur ne voit que ses exercices et tentatives ; profs/admins voient tous les exercices. Le catalogue `rules` est en lecture publique. Exercices et tentatives ne sont créés que par les routes serveur.
- **Rate limiting** activé (inscription/connexion 5/min/IP, génération 10/min, correction 20/min).
- **Détection de difficulté** : à la fin d'une correction sous 80 %, l'app propose un exercice ciblé sur la même règle.
