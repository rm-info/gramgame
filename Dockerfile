# Image GramGame complète : front SvelteKit buildé + PocketBase (schéma, hooks).
# Build : docker build -t gramgame .   (contexte = racine du repo)

# ── 1. Front ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS front
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY svelte.config.js vite.config.ts tsconfig.json ./
COPY src src
COPY static static
RUN npm run build

# ── 2. PocketBase ──────────────────────────────────────────────────────────
FROM alpine:3.22
ARG PB_VERSION=0.40.6
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates tzdata unzip wget \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/pb.zip \
 && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt" -O /tmp/checksums.txt \
 && grep " pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip\$" /tmp/checksums.txt | awk '{print $1"  /tmp/pb.zip"}' | sha256sum -c - \
 && unzip /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip /tmp/checksums.txt && apk del unzip wget
COPY pocketbase/pb_migrations /pb/pb_migrations
COPY pocketbase/pb_hooks /pb/pb_hooks
COPY --from=front /app/pocketbase/pb_public /pb/pb_public
EXPOSE 8090
# --automigrate=false : le schéma ne change que par les migrations versionnées.
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--publicDir=/pb/pb_public", "--automigrate=false"]
