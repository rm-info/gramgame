#!/usr/bin/env bash
# Lance PocketBase avec la config de pocketbase/.env (usage manuel / dev).
# En prod : image Docker (Dockerfile à la racine) ou service systemd (gramgame.service).
set -euo pipefail

PB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Lecture littérale KEY=VALUE (comme `docker --env-file` / systemd) : on ne
# `source` PAS le fichier, sinon un mot de passe contenant ( { $ ` ou des
# espaces casse le démarrage, voire s'exécute comme du shell.
if [ -f "$PB_DIR/.env" ]; then
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in '' | \#*) continue ;; esac
		key="${line%%=*}"
		[[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
		export "$key=${line#*=}"
	done <"$PB_DIR/.env"
fi

exec "$PB_DIR/pocketbase" serve \
	--http "${PB_HTTP:-127.0.0.1:8092}" \
	--dir "$PB_DIR/pb_data" \
	--migrationsDir "$PB_DIR/pb_migrations" \
	--hooksDir "$PB_DIR/pb_hooks" \
	--publicDir "$PB_DIR/pb_public" \
	"$@"
