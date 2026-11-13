#!/usr/bin/env bash
# Lance PocketBase avec la config de pocketbase/.env (usage manuel / dev).
# En prod, préférer le service systemd (gramgame.service).
set -euo pipefail

PB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$PB_DIR/.env" ]; then
	set -a
	# shellcheck disable=SC1091
	. "$PB_DIR/.env"
	set +a
fi

exec "$PB_DIR/pocketbase" serve \
	--http "${PB_HTTP:-127.0.0.1:8090}" \
	--dir "$PB_DIR/pb_data" \
	--migrationsDir "$PB_DIR/pb_migrations" \
	--hooksDir "$PB_DIR/pb_hooks" \
	--publicDir "$PB_DIR/pb_public" \
	"$@"
