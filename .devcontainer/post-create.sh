#!/usr/bin/env bash
# Codespaces post-create. Sets up the workspace so `pnpm dev` Just Works.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Enabling pnpm via corepack"
corepack enable
corepack prepare pnpm@10.0.0 --activate

# Bootstrap .env.local from the example. If the user set Codespaces secrets,
# they appear as real env vars and override anything in this file.
if [ ! -f .env.local ]; then
  echo "==> Creating .env.local from .env.example"
  cp .env.example .env.local
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Starting Postgres in Docker"
pnpm db:up

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U networkmap -d networkmap >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Postgres did not become ready in 30s. Check 'docker compose logs postgres'."
    exit 1
  fi
  sleep 1
done

echo "==> Applying migrations and RLS policies"
pnpm db:migrate

cat <<'BANNER'

==============================================================
  Codespaces setup complete.
==============================================================
Next:

1. Set Codespaces secrets (recommended) so they auto-populate
   on every rebuild. From the iPad open GitHub -> Settings ->
   Codespaces -> Secrets and add:
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     SUPABASE_SERVICE_ROLE_KEY
     SUPABASE_JWT_SECRET
     ANTHROPIC_API_KEY  (optional)

   Or edit .env.local directly in this Codespace for a one off.

2. Start the dev server:
     pnpm dev

3. Open the forwarded port in the "Ports" tab. Codespaces will
   give you a public https URL you can open in Safari.

4. Optional: load demo data so the globe has pins to render:
     pnpm db:seed

==============================================================
BANNER
