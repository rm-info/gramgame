#!/usr/bin/env bash
# Installe / met à jour GramGame sur le serveur :
#   1. télécharge le binaire PocketBase (version figée, checksum vérifié)
#   2. build le front SvelteKit dans pocketbase/pb_public
#   3. crée pocketbase/.env depuis l'exemple s'il n'existe pas
#
# Idempotent : à relancer après chaque `git pull`.
# Prérequis : curl, unzip, Node.js ≥ 20 + npm.
set -euo pipefail

PB_VERSION="${PB_VERSION:-0.40.6}"

PB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$PB_DIR")"

case "$(uname -m)" in
	x86_64 | amd64) ARCH=amd64 ;;
	aarch64 | arm64) ARCH=arm64 ;;
	armv7l | armv7) ARCH=armv7 ;;
	*) echo "Architecture non gérée : $(uname -m)" >&2; exit 1 ;;
esac

# ── 1. Binaire PocketBase ───────────────────────────────────────────────────
if [ -x "$PB_DIR/pocketbase" ] && "$PB_DIR/pocketbase" --version | grep -q " $PB_VERSION\$"; then
	echo "✓ PocketBase $PB_VERSION déjà présent"
else
	echo "→ Téléchargement de PocketBase $PB_VERSION ($ARCH)…"
	TMP="$(mktemp -d)"
	trap 'rm -rf "$TMP"' EXIT
	ZIP="pocketbase_${PB_VERSION}_linux_${ARCH}.zip"
	BASE_URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"
	curl -fsSL -o "$TMP/$ZIP" "$BASE_URL/$ZIP"
	curl -fsSL -o "$TMP/checksums.txt" "$BASE_URL/checksums.txt"
	(cd "$TMP" && grep " $ZIP\$" checksums.txt | sha256sum -c -)
	unzip -o -q "$TMP/$ZIP" pocketbase -d "$TMP/out"
	install -m 755 "$TMP/out/pocketbase" "$PB_DIR/pocketbase"
	echo "✓ PocketBase $("$PB_DIR/pocketbase" --version)"
fi

# ── 2. Front ───────────────────────────────────────────────────────────────
echo "→ Build du front…"
cd "$ROOT_DIR"
npm ci --no-audit --no-fund
npm run build
echo "✓ Front buildé dans pocketbase/pb_public"

mkdir -p "$PB_DIR/pb_data"

# ── 3. Config ──────────────────────────────────────────────────────────────
if [ ! -f "$PB_DIR/.env" ]; then
	cp "$PB_DIR/.env.example" "$PB_DIR/.env"
	chmod 600 "$PB_DIR/.env"
	echo "⚠ $PB_DIR/.env créé depuis l'exemple : remplis-le (LLM, SMTP) avant de démarrer."
fi

echo
echo "Terminé. Démarrage manuel : $PB_DIR/run.sh  (ou via systemd, cf. README)"
