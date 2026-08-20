# 0004. Ask a public repo

**Date**: 2026-08-17
**Status**: Accepted

## Summary

This feature delivers the core skateboard for RepoMind in one complete loop. You paste a public GitHub repository URL, watch the indexing progress, and automatically start a chat session once indexing completes. When you ask a question, RepoMind finds the most relevant code chunks using Voyage embeddings, streams the answer using the Vercel AI SDK with Groq or local Ollama, and displays interactive citation chips that open the exact source file and line on GitHub.

## Requirements

**User stories**:
- As a developer exploring an open source library, I want to paste a GitHub repository link so RepoMind can download and index its code.
- As a user waiting for an index, I want to see clear progress states (queued, running, succeeded, or failed) so I know what is happening.
- As someone asking about the codebase, I want an accurate answer grounded in the actual files with citations showing file path and line numbers.
- As someone verifying an answer, I want to click citation chips to open the source code directly on GitHub at the exact line range.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Pasting a valid public GitHub URL (`https://github.com/{owner}/{repo}`) and submitting triggers `POST /api/ingest`. On localhost or when the ingest secret is provided in the web interface, it creates a job row in Postgres and starts the Trigger.dev `ingest-repo` task.
- **AC-2**: The interface polls `GET /api/ingest/[id]` every 2 seconds to show live progress states: `queued`, `running`, `succeeded`, or `failed` with safe error descriptions.
- **AC-3**: Upon ingest success, the interface automatically switches to the active chat session for that repository, hides the greeting and URL cards, and focuses the composer.
- **AC-4**: Submitting a question posts to `POST /api/ask`, inserts the user message into Postgres, embeds the question with Voyage (`voyage-code-3`, 1024 dimensions, query input type), and retrieves the top 8 chunks by cosine distance from `chunks` where `source_id` matches the repository.
- **AC-5**: The response streams back into the active thread using the Vercel AI SDK (`streamText`), powered by Groq on deploy (when `GROQ_API_KEY` is present) or Ollama (`qwen2.5-coder:7b`) on local development. On stream completion, the assistant message and citations are persisted to Postgres.
- **AC-6**: Citations stream as data parts and render as clickable chips on the assistant message. Clicking a chip opens the GitHub file and line range in a new browser tab (`https://github.com/{owner}/{repo}/blob/HEAD/{path}#L{startLine}-L{endLine}`).
- **AC-7**: On production deployments, asks are rate limited to 20 requests per IP per hour using the `ask_rate_limits` table. When exceeded, the endpoint returns HTTP 429 with a `Retry-After` header and the interface displays an hourly limit notice.
- **AC-8**: Edge cases and failures (invalid repository URL, repository size over 50 MB, empty repository, failed download, upstream AI error, or stalled job reaper) are surfaced with clean error messages and a retry action.

## Decision

**Chosen option**: Option 1: Trigger.dev Python worker pipeline, client poll on Postgres job status, Vercel AI SDK streaming with citation data parts, and GitHub deep links

This approach connects the existing Next.js App Router frontend to the Python ingest worker via Trigger.dev. Next.js creates the job record in Postgres and triggers the task. The client polls the database status. Asking runs directly in Next.js using Voyage embeddings and the AI SDK, querying pgvector for relevant chunks.

**Implementation skills**: `trigger-tasks` (`triggerdotdev/skills`, `.agents/skills/trigger-tasks/`) · `trigger-setup` (`triggerdotdev/skills`, `.agents/skills/trigger-setup/`) · `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`)

Calls made here:
- Ingest secret handling: on local development (`NODE_ENV === 'development'`), `POST /api/ingest` reads `INGEST_SECRET` from local environment automatically; on deployed environments, a prompt or settings modal allows entering the secret header `x-ingest-secret`.
- Model provider selection: automatically uses Groq (`llama-3.3-70b-versatile`) if `GROQ_API_KEY` is set, otherwise defaults to local Ollama (`qwen2.5-coder:7b`) at `OLLAMA_BASE_URL`.
- Inline reaper: `POST /api/ingest` runs a cleanup query before inserting a new job to mark any job as `failed` if it is `running` and started over 10 minutes ago, or `queued` and created over 10 minutes ago. This guarantees orphaned jobs never lock the partial unique index.
- Citation URLs: uses `HEAD` in the GitHub blob URL path (`blob/HEAD/{path}#L{start}-L{end}`), guaranteeing valid deep links regardless of whether the default branch is named `main`, `master`, or `trunk`.
- Chat persistence timing: writes the user message record before initiating LLM streaming; writes the completed assistant message record and citation records in the AI SDK `onFinish` handler.
- Stream error recovery: when an ask stream errors out, the assistant message bubble renders an inline error alert with a Retry button that restores the prompt to the composer.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:
Uses the 7 Postgres tables already defined and migrated in spec 0002:
- `sources`: `id` (uuid PK), `kind` ('github_repo'), `identity` ('owner/repo'), `origin_url`, `owner_user_id` (null), `created_at`, `updated_at`.
- `ingest_jobs`: `id` (uuid PK), `repo_url`, `status` ('queued' | 'running' | 'succeeded' | 'failed'), `error` (text), `source_id` (FK `sources.id`), `created_at`, `started_at`, `finished_at`. Enforces one active job via partial unique index.
- `chunks`: `id` (uuid PK), `source_id` (FK `sources.id`), `job_id` (FK `ingest_jobs.id`), `path`, `start_line`, `end_line`, `text`, `embedding` (vector 1024, HNSW cosine index).
- `chats`: `id` (uuid PK), `source_id` (FK `sources.id`, unique), `created_at`, `updated_at`.
- `messages`: `id` (uuid PK), `chat_id` (FK `chats.id`), `role` ('user' | 'assistant'), `content`, `created_at`.
- `citations`: `id` (uuid PK), `message_id` (FK `messages.id`), `path`, `start_line`, `end_line`.
- `ask_rate_limits`: `ip`, `window_start` (composite PK), `count`.

**State transitions**:
- Ingest Job state machine: `queued` (inserted by Next.js) -> `running` (claimed by Python worker) -> `succeeded` (chunks written and old chunks pruned) OR `failed` (error code and message recorded).
- Chat View state machine: `canvas` (greeting, URL card, suggestion cards) -> `indexing` (progress badge, spinner, status labels) -> `chat_ready` (active repository selected, composer focused) -> `streaming` (assistant tokens and citation chips appending) -> `idle` (copy button active, citation chips clickable).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/ingest` | POST | `repoUrl` (string, required), `x-ingest-secret` (header) | `jobId` (uuid), `status` ('queued') | Shared secret (`INGEST_SECRET`) | 400 invalid JSON, 401 unauthorized, 409 active job running, 422 bad GitHub URL |
| `/api/ingest/[id]` | GET | `id` (path param uuid) | `id`, `status`, `error`, `sourceId` | None (public read) | 404 job not found |
| `/api/ask` | POST | `sourceId` (uuid, required), `message` (string, required), `chatId` (uuid, optional) | AI SDK data stream (text tokens and citation data parts) | None (IP rate limited on Vercel) | 400 missing fields, 404 source not found, 409 source not indexed, 429 rate limit exceeded, 502 model failure |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Trigger ingest | `jobId` | Generated UUID on inserting new `ingest_jobs` row |
| Trigger ingest | initial `status` | Set to literal `queued` on insert |
| Ingest worker | `sourceId` | Upserted `sources` row on `(kind, identity)` |
| Ingest worker | Chunk `path`, `startLine`, `endLine`, `text` | 80 line window with 10 line overlap from downloaded UTF-8 files |
| Ingest worker | Document vectors | Voyage API `voyage-code-3` (1024 dimensions, document type, batched up to 128) |
| Read job status | `status`, `error`, `sourceId` | Columns read from `ingest_jobs` row by `id` |
| Ask question | User message row | Inserted into `messages` table with role `user` before streaming |
| Ask question | Query embedding | Voyage API `voyage-code-3` (1024 dimensions, query type) |
| Retrieve context | Top 8 chunks | pgvector cosine distance `<=>` against `chunks.embedding` for `source_id` |
| Stream answer | Markdown text tokens | Groq API or Ollama via Vercel AI SDK `streamText` |
| Stream answer | Citations | Extracted from retrieved chunks referenced in model response |
| Complete answer | Assistant message and citations | Persisted to `messages` and `citations` tables in `onFinish` handler |
| Citation link | URL target | Computed from `https://github.com/{identity}/blob/HEAD/{path}#L{startLine}-L{endLine}` |
| Rate limiting | Client IP and Retry-After | First entry in `x-forwarded-for` header, retry seconds until next UTC hour |

**Key invariants**:
- At most one `ingest_jobs` row may be `queued` or `running` across the entire database, guaranteed by Postgres partial unique index.
- A source is only eligible for question answering when at least one associated ingest job has status `succeeded`.
- The Python worker must discard any unpacked repository larger than 50 MB and fail the job with error code `too_large`.
- Chunks must only be created for valid UTF-8 source files smaller than 1 MB, excluding ignored extensions and directories (`.git`, `node_modules`, `dist`, `build`, `vendor`, binaries, images, lockfiles, fonts, media).
- All citation start and end lines must be positive integers, with `start_line <= end_line`.
- On production deployments, no client IP may exceed 20 asks per calendar hour.

**Security model**:
- Ingest triggering is protected by a shared secret (`INGEST_SECRET`). Local development allows bypass.
- Repository URLs are strictly validated against `https://github.com/{owner}/{repo}` with no query strings or extra subpaths.
- No third party access tokens or internal database URLs are ever exposed in client responses or public logs.
- Public ask endpoint is open but rate limited per IP address to protect upstream model quotas.

**Configuration required**:
- `INGEST_SECRET`: Secret passphrase required in `x-ingest-secret` header to initiate indexing.
- `VOYAGE_API_KEY`: API key for Voyage AI code embeddings (`voyage-code-3`).
- `GROQ_API_KEY`: API key for Groq LLM inference on deployed environments (optional locally).
- `OLLAMA_BASE_URL`: Base URL for local Ollama server (defaults to `http://127.0.0.1:11434`).
- `OLLAMA_MODEL`: Model name for Ollama (defaults to `qwen2.5-coder:7b`).
- `TRIGGER_SECRET_KEY`: Trigger.dev secret key for background task orchestration.
- `DATABASE_URL_DIRECT`: Direct connection string to Postgres with pgvector.

**Critical test scenarios**:
- Happy path: User pastes `https://github.com/facebook/react`, waits for indexing progress to complete, asks a question, receives a streamed answer, and clicks a citation chip opening the exact line on GitHub, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
- Concurrent ingest rejection: User attempts to start an ingest while another job is `queued` or `running` and receives HTTP 409 with a descriptive message, verifies **AC-1**, **AC-8**.
- Ingest failure handling: Ingesting an invalid repository URL, oversized repository (>50 MB), or empty repository fails with clear error status and description, verifies **AC-2**, **AC-8**.
- Stale job reaper: An ingest job abandoned in `running` status or stuck in `queued` status for over 10 minutes is automatically marked `failed` by the reaper on the next ingest attempt, verifies **AC-1**, **AC-8**.
- Hourly ask rate limit: Submitting more than 20 questions from the same IP within one hour on deploy returns HTTP 429 with retry header and friendly UI notice, verifies **AC-7**.

## Build plan

- [x] 1. **Python ingest pipeline in worker**: Implement repository tarball download, file filtering, window chunking (80 lines, 10 overlap), Voyage embedding generation with batching (up to 128 chunks), Postgres write, and old chunk pruning in `ingest/main.py` wrapped as Trigger.dev task `ingest-repo`, satisfies **AC-1**, **AC-2**, **AC-8**.
- [x] 2. **Ingest and status route handlers**: Build `POST /api/ingest` with URL validation, secret verification, 10 minute stale job reaper (for queued and running jobs), database job insertion, and Trigger.dev task triggering; build `GET /api/ingest/[id]` for job status polling in `app/api/ingest/`, satisfies **AC-1**, **AC-2**, **AC-8**.
- [x] 3. **Ask route handler and vector retrieval**: Build `POST /api/ask` with IP rate limiting check, user message persistence, Voyage question embedding, pgvector cosine search for top 8 chunks, prompt assembly, and Vercel AI SDK `streamText` streaming with citation data parts and `onFinish` assistant persistence in `app/api/ask/`, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**.
- [x] 4. **UI ingest workflow integration**: Connect URL card in `components/chat/` to `POST /api/ingest`, display live progress states with polling against `GET /api/ingest/[id]`, handle error displays, and switch active repository on success, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-8**.
- [x] 5. **UI chat stream and citation chips**: Wire composer to `POST /api/ask` using Vercel AI SDK hooks, stream assistant responses into `Message` bubbles, render clickable citation chips targeting GitHub blob URLs with HEAD branch links, and handle stream errors with inline retry controls, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-8**.

## Consequences

- **What becomes easier**: Users can point RepoMind at any public GitHub repository and receive accurate, cited answers within minutes without manual repository setup or vector database maintenance.
- **What becomes constrained**: Only one repository can be indexed globally at a time to stay within free tier resource limits; repositories larger than 50 MB unpacked or containing non UTF-8 files are rejected.
- **Operational reality**: The system relies on Voyage AI for embeddings and Groq / Ollama for chat generation; outages or quota limits on these providers will directly degrade answer latency or trigger error states.

## Follow-up

- [ ] Connect and test Trigger.dev Python worker task execution in development and production environments.
- [ ] Prepare slice 2 (Document history) to support switching between multiple indexed repositories in the sidebar.
