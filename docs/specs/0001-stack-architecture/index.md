# 0001. Stack and architecture for RepoMind

**Date**: 2026-08-13
**Status**: Accepted

## Summary

RepoMind is one web app in one git tree. Next.js (the existing UI framework) serves screens and streams answers. A Python worker in `ingest/` downloads a public GitHub snapshot, splits files into line aware chunks (pieces that remember path and line), embeds them, and writes Postgres (the relational database). You run that worker through Trigger.dev (a hosted job runner) on your laptop and on Vercel (the Next.js host). Ask is open on the deployed URL. Starting an ingest needs a shared secret. Chat uses Ollama on your laptop and Groq on Vercel so the deploy stays on a free chat tier.

## Decision

**Chosen option**: Option 1: Next.js on Vercel, Python ingest on Trigger.dev, Neon Postgres with pgvector, Voyage embeddings, Ollama locally and Groq on deploy

Keep the create-next-app App Router UI. Add `ingest/` in this same `repomind` tree. Do not split into two repositories. Next.js owns ask and the HTTP surface. Python owns the full ingest pipeline. Status lives in a Postgres job row. Vectors live in the same database via pgvector (the Postgres vector extension).

**Implementation skills**: `trigger-setup` (`triggerdotdev/skills`, `.agents/skills/trigger-setup/`) · `trigger-tasks` (`triggerdotdev/skills`, `.agents/skills/trigger-tasks/`) · `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`) · `neon` (`neondatabase/agent-skills`, `.agents/skills/neon/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`) · `deploy-to-vercel` (`vercel-labs/agent-skills`, `.agents/skills/deploy-to-vercel/`)

`vercel/ai` (the AI SDK skill) was requested and may still be cloning. Add it here once it lands. `/audit` or `/sync` should list these under root `AGENTS.md` `## Agent skills`.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Product shape | One repo, two runtimes (Next.js app plus Python ingest) | You wanted Python for ingest without a second repository. A layered monolith, not two services to deploy as products. |
| Language (app) | TypeScript | Already on the scaffold. |
| Language (ingest) | Python 3.12, installed with uv and `ingest/pyproject.toml` | You chose Python for the pipeline. 3.12 is the safe current pin. uv locks deps. |
| UI framework | Next.js 16 App Router, React 19, Tailwind 4 | Already in `app/`. This spec does not replace the frontend. |
| HTTP surface | App Router route handlers | `POST /api/ingest`, `GET /api/ingest/[id]`, `POST /api/ask` (stream). Fits the AI SDK stream and a secret header. |
| Primary DB | Postgres with pgvector | You wanted SQL from day one. One store for sources, jobs, chats, chunks, and vectors. |
| Local DB | Docker Compose Postgres plus the pgvector image | Same engine as production. Works on Windows with Docker Desktop. |
| Production DB | Neon with pgvector | Serverless Postgres that Vercel can reach. Free tier. You run `drizzle-kit migrate` yourself. |
| App data access | Drizzle ORM and drizzle-kit | Typed SQL for Next.js. Schema lives in `db/`. Python does not use Drizzle. |
| Ingest data access | psycopg 3 plus the pgvector Python types | Native driver. Writes job status, chunks, and embeddings. Next.js owns migrations. |
| Repo fetch | GitHub tarball of the default branch HEAD | One HTTP get and unzip. No git binary. Optional `GITHUB_TOKEN` for rate limits. |
| Chunking | Custom line window: about 80 lines, 10 line overlap | Path, start line, and end line are first class. No RAG framework. |
| Embeddings | Voyage `voyage-code-3` at 1024 dimensions | Same size in Python ingest, Next.js ask (`@ai-sdk/voyage` only), and the pgvector column. Document input type on ingest, query input type on ask. |
| Vector search | pgvector cosine distance, HNSW index, top 8 | One query shape. No score cutoff in this slice. |
| Chat (laptop) | Ollama `qwen2.5-coder:7b` via `OLLAMA_MODEL` | Free local answers while you build. |
| Chat (Vercel) | Groq free tier, `GROQ_MODEL` default `llama-3.3-70b-versatile` | Real free chat API (rate limited, no card). `@ai-sdk/groq`. |
| Streaming | Vercel AI SDK (`ai`) | `streamText` into the browser. Provider is Ollama locally and Groq on Vercel. |
| Background jobs | Trigger.dev Python task, same path locally (`npx trigger.dev dev`) and on Vercel | Long ingest cannot live in a Vercel function. The Postgres job row is the UI source of truth. |
| File storage | Ephemeral temp only; delete the tarball when the job ends | No volume on Vercel. Chunks in Postgres are enough to ask. |
| Hosting | Vercel Hobby for Next.js | Free Next.js deploy. You rejected Fly.io on cost. |
| Auth | None in this slice | Accounts are scope feature 8. Ingest is gated by `INGEST_SECRET`. Ask is open. |
| Observability | Structured console logs (JSON lines) | Error monitoring and product analytics are deferred in scope. |
| Package manager (app) | npm | Existing `package-lock.json`. |

### How the two runtimes meet

1. Next.js checks `x-ingest-secret` against `INGEST_SECRET`. A unique partial index allows only one `queued` or `running` job. Insert `queued` (or 409). Trigger task `ingest-repo` with payload `{ jobId }` only.
2. The worker sets `running`, reads `repoUrl` from the job row, downloads the tarball, unpacks to temp, applies skip rules, rejects if unpacked size is over 50 MB, chunks, embeds, replaces that source's chunks, deletes temp files, sets `succeeded`.
3. On failure the worker deletes that job's chunks, leaves the source row, sets `failed` with a short error code. Trigger.dev max duration is 10 minutes. On Next.js boot (and before a new ingest) a reaper marks any `running` job older than 10 minutes as `failed` and wipes those chunks, so a dead worker cannot block the queue.
4. The UI polls `GET /api/ingest/[id]` and reads status from Postgres, not from the Trigger.dev dashboard.
5. Ask embeds the question with Voyage (query input, 1024 dims), takes the 8 nearest cosine neighbors, and streams from Groq if `GROQ_API_KEY` is set, else Ollama.

### Ingest rules `/develop` must honor

- Accept only `https://github.com/{owner}/{repo}` with optional `.git` or a trailing slash. Reject `/tree/...`, extra path, and non GitHub hosts (422).
- Fetch `https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD` (GitHub default branch). Optional `GITHUB_TOKEN`.
- Source identity is canonical `{owner}/{repo}` (lowercase). A later success replaces that source's chunks. Set `sourceId` when the source row is upserted (at job insert or first worker write; worker upsert is enough).
- Skip directories named `node_modules`, `.git`, `dist`, `build`, `vendor`. Skip files by extension: images (`.png` `.jpg` `.jpeg` `.gif` `.webp` `.ico` `.svg`), fonts (`.woff` `.woff2` `.ttf` `.otf` `.eot`), media (`.mp3` `.mp4` `.mov` `.wav` `.webm`), archives (`.zip` `.gz` `.tar` `.7z` `.rar`), lockfiles (`package-lock.json` `pnpm-lock.yaml` `yarn.lock` `Cargo.lock` `poetry.lock` `uv.lock`), binaries (`.exe` `.dll` `.so` `.dylib` `.wasm` `.bin` `.class` `.o` `.a`). Skip a file that is not valid UTF-8. Skip a single file over 1 MB.
- Split with a window of exactly 80 lines and 10 lines overlap. Last window may be shorter. Skip empty files. If a window is still over Voyage's input limit, split that window in half until it fits.
- Cap 50 MB unpacked.
- One `queued` or `running` job globally, enforced by a unique partial index. Second start is 409.
- Timeout 10 minutes (Trigger.dev max duration plus the reaper above).
- Task name `ingest-repo`, payload `{ jobId }`. Code lives in `ingest/`. If Trigger.dev cannot run Python at build time, deployed ingest is blocked. Do not silently rewrite the worker to TypeScript.
- Job `error` is a short code (`timeout`, `too_large`, `bad_url`, `embed_failed`, `fetch_failed`) plus a safe message. Never store raw API bodies or tokens.

### Ask rules `/develop` must honor

- Anyone with the deployed URL may ask an existing index.
- 20 asks per IP per hour on Vercel. IP is the first hop in `x-forwarded-for` (Vercel). Counter is a Postgres table. 429 when over. Local ask has no IP cap.
- Retrieve 8 chunks. Prompt must require citations from those chunks.
- `POST /api/ask` uses the Vercel AI SDK data stream. Citations are data parts `{ path, startLine, endLine }`. Pixel UI for cites is the Ask a public repo spec.
- The public Vercel UI must not start ingest and must not embed `INGEST_SECRET`. Ingest is header only (`POST /api/ingest` plus `x-ingest-secret`), from your laptop, curl, or a local form. A server action that reads the env secret and fires ingest would make the demo URL an open ingest button. Do not do that.

### HTTP surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ingest` | POST | `repoUrl` (string, required), header `x-ingest-secret` | `jobId`, `status` | shared secret | 401 missing/wrong secret, 409 job already active, 422 bad URL |
| `/api/ingest/[id]` | GET | `id` | `status`, `error` (nullable), `sourceId` (nullable) | none | 404 |
| `/api/ask` | POST | `sourceId`, `message`, optional chat id | AI SDK data stream: tokens plus citation data parts | none (rate limited on Vercel) | 404 unknown source, 409 source not `succeeded`, 429 rate limit, 502 model or embed failure |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Start ingest | `jobId` | new Postgres job row id |
| Start ingest | initial `status` | always `queued` on insert |
| Job status read | `status` | job row column |
| Job status read | `error` | job row column, set by the worker |
| Job status read | `sourceId` | job row FK after the worker upserts `sources` on `{owner}/{repo}` |
| Ingest worker | `{owner}/{repo}` | parsed from `repoUrl` by the allowlist above |
| Ingest worker | unpacked size | measured after unzip, compared to the 50 MB cap |
| Ingest worker | tarball bytes | `GET https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD` |
| Ingest worker | chunk `path`, `startLine`, `endLine`, `text` | 80 line window, 10 overlap, UTF-8 files only |
| Ingest worker | embedding vector | Voyage `voyage-code-3`, 1024 dims, document input type |
| Ask | query vector | Voyage `voyage-code-3`, 1024 dims, query input type, `@ai-sdk/voyage` |
| Ask | retrieved chunks | 8 nearest by cosine distance on that source |
| Ask | answer tokens | Groq if `GROQ_API_KEY` is set, else Ollama at `OLLAMA_BASE_URL` |
| Ask | citations | those 8 chunks' `path`, `startLine`, `endLine` as AI SDK data parts |
| Ask rate limit | remaining / 429 | Postgres counter keyed by the first `x-forwarded-for` hop |
| Job error | `error` | worker sets a short code plus a safe message |

**Chat provider switch**: if `GROQ_API_KEY` is set, stream with Groq. Else stream with Ollama at `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`). No `CHAT_PROVIDER` flag. Vercel must set `GROQ_API_KEY`. Local `.env.local` may omit it.

### Configuration required

- `DATABASE_URL`: Neon pooled URL for Next.js (and Compose URL locally)
- `DATABASE_URL_DIRECT`: Neon direct (non pooler) URL for the Python worker. Locally this may equal `DATABASE_URL`.
- `INGEST_SECRET`: shared secret for `POST /api/ingest`. Local may use a well known dev value in `.env.local`. Vercel must set a real secret. The Vercel UI must not read this to start a job.
- `VOYAGE_API_KEY`: Voyage embeddings (laptop, worker, and Vercel)
- `GROQ_API_KEY`: Groq chat on Vercel (optional locally)
- `GROQ_MODEL`: default `llama-3.3-70b-versatile`
- `OLLAMA_BASE_URL`: default `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: default `qwen2.5-coder:7b`
- `GITHUB_TOKEN`: optional, GitHub archive rate limits
- Trigger.dev project keys as that product requires (`TRIGGER_SECRET_KEY` or current equivalent, confirm at build)

Never commit secrets. `.env.local` is gitignored. Set `DATABASE_URL`, `DATABASE_URL_DIRECT`, `VOYAGE_API_KEY`, and `INGEST_SECRET` on Vercel and in the Trigger.dev dashboard.

### Security model

No accounts yet. Anyone who can reach the app may ask. Only a caller who sends a correct `x-ingest-secret` header may start ingest. The public Vercel UI is ask only. Do not put `INGEST_SECRET` in the client bundle. Do not add a public button that starts ingest with a server side env secret. Rate limit ask by IP. Optional GitHub token is server only.

### Data sketch (full model is spec 0003)

This stack assumes, and does not design, records like: `sources`, `ingest_jobs` (states above), `chunks` (path, lines, text, embedding), `chats`, `messages`. Feature 3 owns names, nullability, and indexes. `/develop` on this feature may add the thinnest tables the scaffold needs to boot, then feature 3 replaces that sketch without a breaking public API.

## Consequences

**Positive**:
- You keep the existing Next.js UI and still get a Python ingest pipeline in one tree.
- Vercel Hobby plus Groq plus Neon can be demonstrated without a Fly.io bill.
- Laptop and deploy share embeddings, so search quality does not drift.
- A job row survives a refresh. The UI does not depend on Trigger.dev's own status API.
- Failed ingest does not leave a half index.

**Negative / tradeoffs**:
- This is a heavy skateboard: Next.js, Python, Trigger.dev, Docker, Neon, Voyage, Groq, and Ollama. More to install than a TypeScript only file database.
- Vercel cannot run ingest itself. If Trigger.dev's free tier or Python runtime changes, deployed ingest stops. That is the serverless trap, accepted for cost.
- Voyage embeddings are not free. Chat is free. Embed cost grows with every repo and every question.
- Local answers (Ollama) and deployed answers (Groq) will differ. Prompts must stay provider agnostic.
- One job at a time and a 50 MB cap will reject real large repos. That is intentional.
- Postgres plus Docker on Windows is more local ops than SQLite.
- An open ask URL burns Groq and Voyage (every question embeds). The IP cap is a speed bump, not a product meter.
- Two languages means two lockfiles, two CI paths, and two ways to fail migrate versus worker SQL.
- The deployed demo cannot paste a new repo unless you call ingest with the secret. Visitors only ask indexes you already built.

**Neutral**:
- Auth, billing, error monitoring, and a public marketing site stay later slices.
- SpaceXAI (xAI Grok) is the usual project AI default. You overrode it for a free chat tier. Switching later is a provider swap behind the AI SDK.
- Coding standards (feature 2) and the data model (feature 3) still need their own specs.

## Follow-up

- [ ] `ai-sdk`, Trigger.dev skills, Neon skills, and Vercel React / deploy skills are not yet in root `AGENTS.md` `## Agent skills`. They apply across the app and belong at root, with a short pointer only.
- [ ] Connect official MCP servers in your client (I cannot do this for you): Neon at `https://mcp.neon.tech/sse`, Vercel at `https://mcp.vercel.com`, Trigger.dev via `npx trigger.dev@latest mcp`. Flag them on the root `AGENTS.md` MCP line once connected.
- [ ] Confirm Trigger.dev's current Python task docs at build time. Task id is `ingest-repo`. If Python is unavailable, stop; do not rewrite to TypeScript in silence.
- [ ] Feature 3 (data model) must lock `sources` (unique `{owner}/{repo}`), `ingest_jobs` (unique partial index on one active job), `chunks` (`vector(1024)`), chats, and messages, plus a small ask rate limit table.
- [ ] Feature 2 (`/audit`) should write the real root `AGENTS.md` (today it is only Next.js boilerplate).
- [ ] If you later want paid higher quality chat, swap Groq for SpaceXAI (`@ai-sdk/xai`, `XAI_API_KEY`) without changing the rest of the stack.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
