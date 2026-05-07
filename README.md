# Network Map

Private network graph and agent product. Web app per the v1 functional architecture.

## What this is

You log who you know, where they live, and how often you talk to them. The app scores each relationship as a **Pulse** (Healthy / Steady / Fading / Dormant) that decays without engagement. You set career goals. An agent produces a daily digest of 3–5 contacts to engage with, plus profiles of people to meet who would help close goal gaps. Visualize your network on a 3D globe, a force-directed graph, or a list.

The functional architecture document is the single source of truth. Cross-references in the code use spec section numbers.

## Quick start

### Option A: GitHub Codespaces (works from an iPad)

The repo includes a `.devcontainer/` config that gives you a full dev environment in the browser, with Postgres + Node + pnpm preinstalled and migrations applied automatically.

1. From the GitHub repo page on your iPad, tap the green **Code** button -> **Codespaces** -> **Create codespace on `claude/import-word-doc-EkbIb`**.
2. Wait ~2 minutes for the post-create script to install deps, start Postgres, and run migrations.
3. Set your secrets (one time, persists across rebuilds) at GitHub -> Settings -> Codespaces -> Secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (from a free Supabase project)
   - `ANTHROPIC_API_KEY` (optional; agent runs in NOOP mode without it)
4. In the Codespaces terminal:
   ```bash
   pnpm db:seed   # optional demo data
   pnpm dev
   ```
5. The **Ports** tab will offer a public https URL for port 3000. Open it in Safari.

### Option B: Local development

Prerequisites: Node 20+, pnpm 10+, Docker.

```bash
cp .env.example .env.local
# Fill in: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.

pnpm install
pnpm db:up                  # starts local Postgres in Docker
pnpm db:generate            # generates Drizzle SQL migrations from the schema
pnpm db:migrate             # applies migrations + RLS policies
pnpm dev                    # http://localhost:3000
```

Health check: `curl http://localhost:3000/api/healthz`.

### Getting the Supabase credentials

1. Sign up at [supabase.com](https://supabase.com) (free tier is fine).
2. Create a new project. Wait for it to provision.
3. Project Settings -> API:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key -> `SUPABASE_SERVICE_ROLE_KEY` (secret)
   - **JWT Settings** -> **JWT Secret** -> `SUPABASE_JWT_SECRET`
4. Authentication -> URL Configuration -> add your Codespaces URL (or `http://localhost:3000`) to Site URL and Redirect URLs.

You only need Supabase for auth. The application data lives in your local/Codespace Postgres.

## Architecture at a glance

- **App**: Next.js 15 (App Router), React 19, TypeScript strict.
- **DB**: Postgres 16, Drizzle ORM. RLS enforced on every user-scoped table via `app.current_user_id` GUC set per request from a verified Supabase JWT.
- **Auth**: Supabase Auth (email + Apple + Google). Server verifies JWT, sets the GUC, queries through Drizzle.
- **Agent**: `lib/agent/` runner with Anthropic SDK (`claude-sonnet-4-7`), nine DB-only tools, four scheduled/on-demand workflows.
- **Pulse**: pure functions in `lib/pulse/`, recomputed synchronously on every touchpoint write and nightly for band-boundary crossings.
- **Visualization**: `react-globe.gl`, `react-force-graph-2d`, virtualized list.

## Repo layout

```
app/
  (auth)/                # signup, signin, verify-email, password-reset
  (app)/                 # authenticated app shell (sidebar + header)
    home/                # Today's Pulse, recents, quick actions
    network/             # globe / graph / list (segmented control)
    goals/
    briefing/            # streaming agent chat
    settings/
  api/v1/                # REST endpoints, snake_case JSON, cursor pagination
  api/cron/              # daily digest + nightly Pulse recompute (cron-secret guarded)
components/              # shared UI (shadcn/ui-based)
lib/
  agent/                 # runner + tools + prompts + workflows
  auth/                  # supabase server + client helpers
  db/                    # drizzle schema, client, migrations, policies.sql
  pulse/                 # tie strength, cadence, bands
  geocode/               # mapbox / nominatim
docker-compose.yml
drizzle.config.ts
```

## Scripts

| script | what it does |
| --- | --- |
| `pnpm dev` | next dev server |
| `pnpm build` | production build |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm test` | vitest unit/integration |
| `pnpm test:e2e` | playwright e2e |
| `pnpm db:up` / `db:down` | start/stop local postgres |
| `pnpm db:generate` | generate SQL migrations from schema.ts |
| `pnpm db:migrate` | run migrations + apply policies/triggers |
| `pnpm db:reset` | nuke and reapply (dev only) |
| `pnpm db:seed` | seed demo data |

## Status

This is an active build. Track progress through the code. The functional architecture (sections 1–14) is the contract. The 12-week phasing in section 12 is informative; the actual build is web-first.

## License

Private. © Career Factory 360 LLC.
