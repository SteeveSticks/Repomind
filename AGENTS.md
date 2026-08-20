<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# RepoMind

## Stack

- **Language / Runtime**: TypeScript on Node for the Next.js app. Python 3.12 with uv for ingest.
- **Framework**: Next.js 16 App Router, React 19, Tailwind 4
- **Key dependencies**: Neon Postgres with pgvector, Drizzle, Trigger.dev, Voyage embeddings, Vercel AI SDK, Groq on deploy, Ollama on a laptop
- **Package manager**: npm
- **Local DB**: Docker Compose `pgvector/pgvector:pg16`

## Build approach

Skateboard: ship the thinnest usable whole first, then grow it.

## Commands

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Lint
npm run lint

# Local Postgres (pgvector)
docker compose up -d

# Ingest worker
uv run --directory ingest python main.py

# Ingest tests
uv run --directory ingest pytest
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`.

## Rules

- TypeScript `strict` is on. Keep it on.
- UI lives in `app/` (App Router). Import with `@/`.
- Style with Tailwind 4 (`@import "tailwindcss"` in `app/globals.css`).
- Use npm. The lockfile is `package-lock.json`.
- Never commit `.env*` files. Secrets stay in `.env.local` and host dashboards.
- Before writing Next.js code, read the version docs in `node_modules/next/dist/docs/`. This Next.js release can differ from older guides.
- Local Postgres is Docker Compose (`pgvector/pgvector:pg16`). Default URL `postgresql://repomind:repomind@127.0.0.1:5432/repomind`.
- Drizzle schema lives in `db/`. The ingest worker uses psycopg, not Drizzle.
- App lint is ESLint (`eslint-config-next`). Do not add a second JS formatter unless asked.
- Ingest lint and format is Ruff. Git hooks use the `pre-commit` framework. Neither is installed yet.

## Agent skills

- [trigger-setup](.agents/skills/trigger-setup/): `triggerdotdev/skills`, add Trigger.dev to the app
- [trigger-tasks](.agents/skills/trigger-tasks/): `triggerdotdev/skills`, write Trigger.dev tasks
- [neon](.agents/skills/neon/): `neondatabase/agent-skills`, Neon product overview
- [neon-postgres](.agents/skills/neon-postgres/): `neondatabase/agent-skills`, Lakebase Postgres setup and access
- [vercel-react-best-practices](.agents/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance
- [deploy-to-vercel](.agents/skills/deploy-to-vercel/): `vercel-labs/agent-skills`, deploy the app to Vercel

MCP servers: trigger-dev (connected), neon (recommended), vercel (recommended)

## Context files

- [ingest/AGENTS.md](ingest/AGENTS.md): Python ingest worker (uv, pytest, Trigger.dev task `ingest-repo`)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-tasks`.
<!-- TRIGGER.DEV SKILLS END -->
