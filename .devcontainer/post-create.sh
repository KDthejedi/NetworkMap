#!/usr/bin/env bash
# Codespaces post-create. Sets up the workspace so `pnpm dev` Just Works.
# Designed to be idempotent and fail loudly so the next step in the README
# is obvious if something goes wrong.

cd "$(dirname "$0")/.."

set -u

step() { printf "\n==> %s\n" "$1"; }
warn() { printf "\n!!  %s\n" "$1"; }

# ---------- pnpm ----------
step "Setting up pnpm"
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable || warn "corepack enable failed"
    corepack prepare pnpm@10.0.0 --activate || warn "corepack prepare failed"
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm still not on PATH; installing via npm"
  npm install -g pnpm@10
fi
pnpm --version || { warn "pnpm install failed; run 'npm install -g pnpm' manually"; exit 1; }

# ---------- env ----------
step "Bootstrapping .env.local"
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example"
else
  echo ".env.local already exists; leaving it alone"
fi

# ---------- deps ----------
step "Installing dependencies"
# Try frozen first for reproducibility; fall back to a regular install if the
# lockfile drifts (e.g. after a dependency bump on the branch).
if ! pnpm install --frozen-lockfile; then
  warn "frozen-lockfile install failed; retrying without --frozen-lockfile"
  pnpm install || { warn "pnpm install failed; run it manually"; exit 1; }
fi

# ---------- postgres ----------
step "Starting Postgres in Docker"
if ! docker --version >/dev/null 2>&1; then
  warn "docker not available; skipping db setup. Once docker is up, run: pnpm db:up && pnpm db:migrate"
  exit 0
fi
pnpm db:up || { warn "docker compose up failed; check 'docker compose logs postgres'"; exit 0; }

step "Waiting for Postgres to accept connections"
ready=0
for i in $(seq 1 60); do
  if docker compose exec -T postgres pg_isready -U networkmap -d networkmap >/dev/null 2>&1; then
    echo "Postgres is ready."
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  warn "Postgres did not become ready in 60s. Check 'docker compose logs postgres' and re-run 'pnpm db:migrate' once it is up."
  exit 0
fi

# ---------- migrations ----------
step "Applying migrations and RLS policies"
pnpm db:migrate || warn "Migrations failed; re-run 'pnpm db:migrate' after fixing the error."

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
