# Verify: Stack and architecture · spec 0001 · updated 2026-08-14
_Steps derived from spec 0001 and the scope Done when line. `/check verify` runs these; `/test` locks the durable ones. This is a decision plus scaffold feature, so there are no AC-N ids._

## UI / manual
- [x] Open `/` on the local Next.js app → the create-next-app home page renders → Done when: empty app boots locally
- [x] Open `docs/specs/0001-stack-architecture/index.md` → `## Proposed stack` records the chosen layers → Done when: stack is recorded in a spec

## Commands
- [x] `npm run build` → exits 0 and emits the `/` route → Done when: empty app boots locally and can be deployed as a web app
- [x] `npm run dev` then visit `http://localhost:3000` → home page loads without an error → Done when: empty app boots locally
- [x] `uv run --directory ingest python main.py` → prints `Hello from ingest!` using CPython 3.12 → Proposed stack: Python 3.12 ingest runtime
- [x] `docker compose up -d` (needs Docker Desktop) then connect to `postgresql://repomind:repomind@127.0.0.1:5432/repomind` → Postgres with pgvector accepts the connection → Proposed stack: local DB

## Acceptance-criteria coverage
- Done when (stack recorded): covered by the spec read step
- Done when (empty app boots locally): covered by `npm run dev` plus the `/` visit
- Done when (deployable as a web app): covered by `npm run build`
- Proposed stack (Python ingest): covered by `uv run --directory ingest python main.py`
- Proposed stack (local Postgres): covered by `docker compose up -d`

## Value sourcing (later slices, not this scaffold)
These rows live on spec 0001 so the later ingest and ask builds inherit them. They are not runnable until those features land. Do not fail this feature's verify on them.
- Start ingest `jobId` / `status`: new job row, always `queued`
- Job status read: job row `status`, `error`, `sourceId`
- Ingest worker: `{owner}/{repo}` from the GitHub URL allowlist; tarball from `codeload.github.com`; 80 line windows; Voyage document embeddings
- Ask: Voyage query vector, 8 nearest chunks, Groq if `GROQ_API_KEY` is set else Ollama, citations as AI SDK data parts
- Ask rate limit: Postgres counter on the first `x-forwarded-for` hop
