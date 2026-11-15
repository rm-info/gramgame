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

Deux options : **image Docker** (front + PocketBase dans une seule image, c'est ce qui tourne sur belzebold) ou **binaire + systemd**.

### Option A : Docker

```sh
docker build -t gramgame .          # contexte = racine du repo
docker run -d --name gramgame --restart unless-stopped \
  -p 127.0.0.1:8091:8090 \
  --env-file pocketbase/.env \
  -v "$PWD/pb_data:/pb/pb_data" gramgame
```

`--env-file` reçoit les mêmes variables que ci-dessous (`PB_HTTP` y est ignoré : le conteneur écoute sur `:8090`). Sur belzebold, le compose et le `.env` vivent dans le repo homelab (`compose/gramgame/`).

### Option B : binaire + systemd

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
./pocketbase/run.sh            # PocketBase de dev sur 127.0.0.1:8092
npm run dev                    # vite sur :5174, proxifie /api et /_ vers PocketBase
```

Pour un PocketBase sur un autre port : `PB_HTTP=127.0.0.1:8093 ./pocketbase/run.sh` et `PB_URL=http://127.0.0.1:8093 npm run dev`. (Le défaut est 8092 et non 8090, qui est pris par un autre PocketBase sur belzebold.) Une instance de dev dans un clone séparé a ses propres données (`pb_data/` est par clone).

Les hooks (`pb_hooks/`) sont rechargés automatiquement par PocketBase quand ils changent ; le front, lui, a besoin d'un `npm run build` pour être servi par PocketBase.

Le front est une **SPA pure** (`ssr = false`, `prerender = false`) : le build ne produit qu'un `index.html`, que PocketBase renvoie pour toute route inconnue. Ne pas réactiver le prérendu : PocketBase ne sait pas servir `login.html` pour `/login`, il renverrait la page d'accueil.

## Modèle d'authentification

- **Inscription** : nom d'utilisateur (3-20 caractères, lettres/chiffres/-/_) + email. Un code à 6 chiffres est envoyé par mail.
- **Connexion** : nom d'utilisateur seul → code par mail (valable 15 min, 1 envoi/minute max, un nouveau code invalide le précédent). Anti brute-force : 5 essais par compte toutes les 3 min (natif PocketBase), et compte bloqué 1 h après 10 codes erronés (`pb_hooks`, compteur en mémoire).
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

Une règle = un `id` (ex. `son-sont`), un nom affiché, une description, une catégorie (orthographe / grammaire / conjugaison, pour le regroupement dans `/new`), un **type d'exercice**, et selon le type : les candidats, des **groupes de confusion**, une configuration et des exemples qui guident le LLM. Elle apparaît immédiatement dans `/new`.

### Types d'exercices

| Type (`rule_type`) | Exercice | Bonne réponse |
|---|---|---|
| `multiple_choice` | texte à trous + menu (homophones) | donnée par le LLM, contrôlée (candidats, marqueurs, chaque confusion présente) |
| `free_text` | texte à trous à remplir au clavier, infinitif affiché à côté | **calculée par le serveur** : le serveur tire les verbes et les personnes, le LLM n'écrit que l'histoire, la conjugaison vient de `pb_hooks/lib/conjugaison.js` |
| `qcm` | une question par phrase (ou par verbe), boutons de réponse, explication après correction | liste fixe (groupes des verbes, sans LLM) ou LLM **vérifié par des règles** (passé/futur proche, pronom) |
| `span` | une phrase par question : l'élève **clique sur les mots** du groupe demandé (le GNS) | LLM, mais le serveur découpe les mots, calcule la réponse à partir du passage `[[ ]]` et rejette les sujets pronoms, les prépositions, le `[[ ]]` mal placé ou couvrant toute la phrase |
| `punctuation` | un texte **sans ponctuation** (majuscules de début de phrase retirées, noms propres gardés) : l'élève touche un mot puis choisit `rien . , ? !` ; la majuscule revient toute seule après `. ? !` | LLM pour le texte, signes attendus calculés par le serveur ; `.` accepte `!`, `!` accepte `.` sauf phrase exclamative (« Quel… ») ; un `. ? !` en trop compte comme une erreur, une virgule en trop est tolérée |
| `transform` | une phrase de départ + une transformation (négative, interrogative, exclamative, impérative). **Mode normal : QCM** (la bonne + 2 erreurs typiques, ordre mélangé). **Mode difficile : l'élève écrit la phrase** | QCM : réponses de référence du LLM, contrôlées (chaque référence passe les contrôles ci-dessous, aucune erreur proposée n'est correcte). Écriture : identique à une référence → juste ; sinon contrôles **sans IA** (phrase recopiée, ponctuation finale, `?` / `!`, les deux morceaux de la négation, pas de sujet à l'impératif) ; sinon **jugement de l'IA** guidé par les références (étiqueté « corrigé par l'IA ») ; si l'IA ne répond pas, la réponse n'est pas validée et l'écran le signale |

La configuration (`config`, JSON) d'une règle `free_text` / `qcm` choisit le générateur :
- `{"generator": "verb_groups"}` : verbes tirés d'une liste fermée, groupe connu d'avance, avec les pièges (aller, -ir du 3e groupe, -oir, -re). « être » et « avoir » ne sont pas proposés (auxiliaires, hors groupe selon les manuels). À partir du CM2, une partie des verbes est présentée **conjuguée dans une phrase** (« Ils [[partent]] en vacances. ») : phrases construites sans IA à partir d'un complément écrit à la main pour chaque verbe (`GROUP_SENTENCES`).
- `{"generator": "llm_qcm", "check": "proche" | "pronom", "highlight": true, "balance": true}` : phrases écrites par le LLM, passage clé entre `[[ ]]`. `check: proche` reclasse chaque phrase (venir de / aller + infinitif, sinon présent) et rejette l'exercice si le LLM s'est trompé ; `check: pronom` contrôle nombre, genre évident (la/le/une/un…), moi → nous, toi → vous. Avec `"hard_mode": "hide_highlight"` (et `hard_consigne`), le **mode difficile** ne surligne plus le passage : pour `pronom-gns`, l'élève doit d'abord retrouver le GNS ; les corrections le remontrent.
- `{"generator": "conj_present", "pool": "present" | "eter_eler" | "accord"}` : texte à trous de conjugaison au présent. Le pronom sujet collé au trou est contrôlé (« nous {{3}} » doit être à la 1re du pluriel). Les orthographes rectifiées (1990) sont acceptées en variante (« il étiquète », « il connait ») et signalées « rectifiée » à la correction.

**Listes de verbes** (`POOLS` dans `pb_hooks/lib/conjugaison.js`) : groupes des verbes 330 verbes (chacun avec un complément écrit à la main pour les phrases), présent 263, accord sujet-verbe 174, -eter / -eler 35. **Anti-répétition** : à la génération, le serveur relit les verbes des 8 derniers exercices de l'élève et tire d'abord des verbes qu'il n'a pas vus, puis ceux vus il y a le plus longtemps (« aller » revient moins souvent s'il vient de l'avoir).

**Niveau de l'élève** : pour `verb_groups` et `conj_present`, chaque verbe a une difficulté (1 courant / 2 pièges classiques / 3 rare ou difficile, dans `pb_hooks/lib/conjugaison.js`). Le niveau choisi donne un palier qui règle le mélange :

| Niveau | Verbes tirés | Groupes : verbes conjugués en phrase | Accord sujet-verbe |
|---|---|---|---|
| CP – CE2 | faciles uniquement | 0 % | sujets simples juste avant le verbe, 3e personne seulement |
| CM1 | ⅖ faciles, ⅗ moyens | 0 % | sujets éloignés, compléments du nom, sujets composés, pronom complément |
| CM2 – 6e | ⅖ faciles, ⅗ moyens | 40 % | idem |
| 5e et + | ⅕ faciles, ⅖ moyens, ⅖ difficiles | 60 % | + sujet inversé, proposition intercalée, « qui », « toi et moi » |

Pour les exercices écrits par l'IA, le niveau règle aussi la longueur du texte et le vocabulaire.

**Exercices au clavier** : à partir de 6 trous, chaque personne (je, tu, il/elle/on, nous, vous, ils/elles) a au moins un trou (garanti par le serveur, qui impose les personnes) ; pour la conjugaison, le LLM est aussi invité à utiliser au moins une fois chaque pronom sujet plutôt qu'un groupe nominal, sauf si ça nuit à la cohérence du récit (l'accord sujet-verbe, lui, travaille justement les groupes nominaux). Après correction, chaque erreur est expliquée sans IA par le conjugueur : forme correcte mais pour une autre personne → erreur d'accord avec le sujet ; sinon la règle qui s'applique (-oyer/-uyer → i, -ayer → les deux formes, -cer/-ger devant -ons, appeler/jeter, accent grave, é → è, terminaisons du 1er/2e groupe) ou le tableau complet d'un verbe irrégulier.

**GNS et ponctuation** : générateurs `llm_span` et `llm_punctuation` (`pb_hooks/lib/span_punct.js`). Le niveau règle les pièges (GNS : sujets courts en CE2 ; sujets longs, après un complément, composés en CM1-6e ; + relatives et sujets inversés dès la 5e — ponctuation : virgules d'énumération seulement en CE2 ; + complément en tête et exclamatives ; + incises et apostrophes). Ponctuation : 15 phrases maximum ; seuls `. , ? !` sont utilisés (pas de dialogue ni de `: ; « » …`). Quand un prof modifie un de ces exercices (phrases marquées `[[ ]]`, ou texte ponctué + noms propres), les mots et les réponses sont recalculés par le serveur.

**Transformations** (`pb_hooks/lib/transform.js`, générateur `llm_transform`, `config.targets`) : une règle par transformation + `transformations` (révision mélangée, au moins une phrase par transformation). L'élève choisit le mode (QCM ou écriture) avant de commencer, comme le mode difficile des homophones ; la tentative est enregistrée avec `hard_mode`. Le niveau règle les formes demandées (négation : ne … pas seul en CE2, puis plus / jamais / rien et « du → de », puis temps composés et pronoms ; interrogative : est-ce que / intonation, puis inversion et -t-, puis inversion avec un nom sujet ; impératif : tu / vous, puis nous et verbes en -er sans s, puis pronominaux et pronoms). En mode écriture, la correction fait un appel LLM de plus (toutes les phrases d'un coup, température 0).

Pour tous les types, la correction détaille le score par catégorie (confusion, groupe du verbe, accent grave / consonne doublée, sujet singulier / pluriel…), et l'appréciation de l'IA cible la catégorie la plus ratée.

**Groupes de confusion** : une règle peut mélanger plusieurs confusions, ex. `on-son-et` = `on / ont`, `son / sont`, `et / es / est`. En mode normal, chaque trou ne propose que les mots de son groupe ; en **mode difficile** (case sur la page de l'exercice, verrouillée dès la première réponse), tous les candidats. La correction détaille le score par confusion, et l'appréciation cible la plus ratée. Les trous en début de phrase affichent les mots avec majuscule ; la comparaison ignore casse et type d'apostrophe (`'` / `’`).

Règles livrées — programme CM2, période 1. **Orthographe** : `a-a-ou-ou`, `on-son-et`, `se-ce-ses-ces` (`se / ce` et `ses / ces / s'est / c'est`), `ni-ny-si-sy` (révisions mélangées), et une règle par confusion : `a-a`, `ou-ou`, `on-ont`, `son-sont`, `et-es-est`, `se-ce`, `ses-ces`, `ni-ny`, `si-sy`. **Conjugaison** : `groupe-verbe` (QCM), `passe-futur-proche` (QCM), `present-indicatif` et `present-eter-eler` (saisie). **Grammaire** : `accord-sujet-verbe` (saisie), `pronom-gns` (QCM), `retrouver-gns` (mots à cliquer), `ponctuation`, `transfo-negative`, `transfo-interrogative`, `transfo-exclamative`, `transfo-imperative`, `transformations` (QCM ou écriture).

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
│   │   └── components/            # BlankSelect, BlankInput, ExerciseText, QcmList, ResultView, CodeStep
│   └── routes/                    # login, signup, onboarding, new, exercise, profile, admin
└── pocketbase/
    ├── install.sh / run.sh
    ├── gramgame.service           # unité systemd
    ├── .env.example
    ├── pb_migrations/             # schéma, API rules, seed, réglages
    └── pb_hooks/
        ├── gramgame.pb.js         # routes /api/gram/*, garde-fous, cron
        └── lib/
            ├── gram.js            # OTP, LLM, homophones (génération, validation, notation)
            ├── exercises.js       # QCM et saisie : générateurs, contrôles, notation
            └── conjugaison.js     # présent de l'indicatif + groupes des verbes (sans LLM)
```

## Décisions architecturales

- **Génération LLM à la demande** + persistance de chaque exercice (id stable).
- **Validation programmatique stricte** de la sortie LLM (nb de trous, candidats valides, marqueurs présents, réponses recalculées ou contrôlées quand c'est possible), retry max 2 sinon erreur claire. Pas de fallback silencieux : afficher du faux serait inacceptable pour un outil d'apprentissage.
- **API rules** : un utilisateur ne voit que ses exercices et tentatives ; profs/admins voient tous les exercices. Le catalogue `rules` est en lecture publique. Exercices et tentatives ne sont créés que par les routes serveur.
- **Rate limiting** activé (inscription/connexion 5/min/IP, génération 10/min, correction 20/min).
- **Détection de difficulté** : à la fin d'une correction sous 80 %, l'app propose un exercice ciblé sur la même règle.
