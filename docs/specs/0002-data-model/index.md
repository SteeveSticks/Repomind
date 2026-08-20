# 0002. Data model for cited chat

**Date**: 2026-08-14
**Status**: Accepted

## Summary

RepoMind stores cited chat in seven Postgres tables (the relational database). A source is one public GitHub repo for now. Chunks remember file path and line numbers, and they hold a Voyage embedding (a list of 1024 numbers used to find similar text). Later slices can add uploads and accounts without rewriting these tables, because `kind` and a nullable owner already exist. `/develop` applies one Drizzle migration (a versioned schema change) and then stops. No new HTTP.

## Requirements

**User stories**:
- As someone asking a public repo, I want chunks that remember path and line so I can check the answer against the file.
- As someone who will add uploads and accounts later, I want a source `kind` and a nullable owner so those slices do not rewrite the tables.
- As the ingest worker, I want a job row and `job_id` on every chunk so a failed run can wipe only its own rows.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: After migrate, you can persist a public GitHub source, its ingest jobs, line aware chunks with `vector(1024)` embeddings, one chat per source, messages, and citations. Those rows are enough for cited chat.
- **AC-2**: `sources.kind` and `sources.owner_user_id` exist. `kind` accepts `github_repo`. `owner_user_id` is nullable and has no foreign key.
- **AC-3**: A failed or timed out job can delete only its own chunks (`job_id`). A later success can write new chunks, then delete other jobs' chunks for that source. Existing chats stay.
- **AC-4**: `UNIQUE (kind, identity)` allows many sources. `UNIQUE (source_id)` on `chats` allows exactly one chat per source. The first ask upserts that chat.
- **AC-5**: `ask_rate_limits` has primary key `(ip, window_start)` and a `count` you can increment in one statement. `window_start` is the UTC hour.
- **AC-6**: The migration does not create users, file blob, usage event, or share link tables.
- **AC-7**: At most one `ingest_jobs` row is `queued` or `running` at a time, enforced in the database.

## Decision

**Chosen option**: Option 1: Seven tables, citations as rows, forward hooks for later slices

Ship `sources`, `ingest_jobs`, `chunks`, `chats`, `messages`, `citations`, and `ask_rate_limits` in one migration. Citations are rows (path and line, no `chunk_id`). Jobs stay their own table. `kind` plus nullable `owner_user_id` are the only hooks for uploads and accounts.

**Implementation skills**: `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`) · `neon` (`neondatabase/agent-skills`, `.agents/skills/neon/`)

Calls made here (not asked in the interview):
- All timestamps are `timestamptz`. Runner up: `timestamp` without time zone, which lies about "now" on Vercel.
- `created_at` and `updated_at` use `DEFAULT now()`. The writer still overwrites `updated_at` on change. No trigger.
- Line numbers are `integer`. Runner up: `bigint`, which no real file needs.
- String columns are `text`, not `varchar(n)`.
- `kind`, `status`, and `role` are `text` plus `CHECK (x IN (...))`. No Postgres enum. Slice 3 widens the `kind` list in a later migration.
- Primary keys default to `gen_random_uuid()` in Postgres. Runner up: uuid v7, which needs a generator both runtimes agree on.
- The embedding column uses Drizzle's `vector` type. If drizzle-kit does not emit HNSW, add `CREATE INDEX chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops)` as SQL in the same migration.
- One active job is `CREATE UNIQUE INDEX ingest_jobs_one_active ON ingest_jobs ((true)) WHERE status IN ('queued', 'running')`. A unique on `status` would allow one `queued` and one `running`.
- Foreign keys use `ON DELETE CASCADE`, including `chunks.job_id`, so deleting a source cannot get stuck behind chunks that still point at jobs.
- `drizzle.config.ts` lives at the repo root. `schema` is `./db/schema.ts`, `out` is `./db/migrations`, `dialect` is `postgresql`, URL is `DATABASE_URL_DIRECT`.
- `drizzle-kit migrate` uses `DATABASE_URL_DIRECT` (the non pooler URL). A pooled URL breaks session level migrate.
- First rate limit insert writes `count = 1`. The upsert then does `count = count + 1`. No column default.
- Job `error` is one text value `{code}: {safe message}` using the closed code list.
- Citations on one message are read in `id` ascending (insert order). No `position` column.
- A source is ready to ask when `EXISTS (SELECT 1 FROM ingest_jobs WHERE source_id = $1 AND status = 'succeeded')`.
- Source upsert on `(kind, identity)` updates `origin_url` and `updated_at` only.
- Success delete of old chunks and the flip to `succeeded` run in one transaction.
- No new env vars.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

SQL names are `snake_case`. Drizzle may expose camelCase in TypeScript. The Python worker uses the SQL names. Primary key on every table except `ask_rate_limits` is `id uuid` default `gen_random_uuid()`.

`sources` (one indexed thing):
- `id` uuid, not null, primary key
- `kind` text, not null, `CHECK (kind IN ('github_repo'))`
- `identity` text, not null, lowercase `owner/repo` for GitHub
- `origin_url` text, not null, the URL you pasted
- `owner_user_id` uuid, null, no users table, no foreign key
- `created_at` timestamptz, not null, `DEFAULT now()`
- `updated_at` timestamptz, not null, `DEFAULT now()`
- `UNIQUE (kind, identity)`

`ingest_jobs` (one attempt):
- `id` uuid, not null, primary key
- `repo_url` text, not null
- `status` text, not null, `CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))`
- `error` text, null, shape `{code}: {safe message}`
- `source_id` uuid, null, foreign key to `sources.id`
- `created_at` timestamptz, not null, `DEFAULT now()`
- `started_at` timestamptz, null
- `finished_at` timestamptz, null
- Unique partial index: `CREATE UNIQUE INDEX ingest_jobs_one_active ON ingest_jobs ((true)) WHERE status IN ('queued', 'running')`
- Keep finished rows. Delete a job only when its source is deleted.

`chunks` (one line window):
- `id` uuid, not null, primary key
- `source_id` uuid, not null, foreign key to `sources.id`
- `job_id` uuid, not null, foreign key to `ingest_jobs.id`
- `path` text, not null
- `start_line` integer, not null
- `end_line` integer, not null
- `text` text, not null
- `embedding` `vector(1024)`, not null
- HNSW index on `embedding` using cosine distance
- btree index on `source_id`

`chats` (one per source):
- `id` uuid, not null, primary key
- `source_id` uuid, not null, unique, foreign key to `sources.id`
- `created_at` timestamptz, not null, `DEFAULT now()`
- `updated_at` timestamptz, not null, `DEFAULT now()`

`messages`:
- `id` uuid, not null, primary key
- `chat_id` uuid, not null, foreign key to `chats.id`
- `role` text, not null, `CHECK (role IN ('user', 'assistant'))`
- `content` text, not null
- `created_at` timestamptz, not null, `DEFAULT now()`
- btree index on `(chat_id, created_at)`
- Read order is `created_at`, then `id`

`citations`:
- `id` uuid, not null, primary key
- `message_id` uuid, not null, foreign key to `messages.id`
- `path` text, not null
- `start_line` integer, not null
- `end_line` integer, not null
- No `chunk_id`. A later ingest may replace chunk rows. Path and line still read.
- Read order for one message is `id` ascending (insert order)

`ask_rate_limits`:
- `ip` text, not null, first `x-forwarded-for` hop
- `window_start` timestamptz, not null, hour truncated in UTC
- `count` integer, not null, no default (first insert writes `1`)
- Primary key `(ip, window_start)`

Joins:
- `sources` one to many `ingest_jobs`
- `sources` one to many `chunks`
- `ingest_jobs` one to many `chunks`
- `sources` one to one `chats`
- `chats` one to many `messages`
- `messages` one to many `citations`
- `ask_rate_limits` stands alone

Delete a source and jobs, chunks, the chat, messages, and citations go with it.

**State transitions**:

`ingest_jobs.status`:
- insert as `queued` (`source_id` is null, `started_at` and `finished_at` are null, `error` is null)
- worker sets `running` and `started_at`
- worker upserts `sources` on `(kind, identity)` with `kind = github_repo`, then sets `source_id`. On conflict update `origin_url` and `updated_at` only. Never touch `id`, `created_at`, or `owner_user_id`.
- success: write this job's chunks. Then in one transaction delete other chunks for that `source_id` and set this job to `succeeded` with `finished_at`. Dual rows are allowed only until that transaction commits.
- failure (worker or reaper): delete chunks where `job_id` is this job, set `failed` and `finished_at` and `error`, leave the source row
- reaper: any `running` row older than 10 minutes becomes `failed` (timer decided in spec 0001). Use `started_at` (fallback `created_at` if you must)
- A source is ready to ask when at least one of its jobs is `succeeded`

`chats`: created on the first ask for that `source_id` (`INSERT ... ON CONFLICT (source_id) DO NOTHING`, then select). `id`, `created_at`, and `updated_at` come from database defaults. Conflict does nothing. A later message insert sets `chats.updated_at`. Spec 0001 allows an optional chat id on ask. This spec has one chat per source. The Ask spec should ignore a client chat id, or require it match this row.

**API surface**:

This feature ships no new HTTP. Spec 0001 owns the routes. The schema must satisfy them.

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `db/schema.ts` | n/a | the seven tables above | typed Drizzle schema | n/a | n/a |
| `drizzle.config.ts` (repo root) | n/a | `schema: ./db/schema.ts`, `out: ./db/migrations`, `dialect: postgresql` | kit config | n/a | n/a |
| `drizzle-kit generate` then `drizzle-kit migrate` | CLI | `DATABASE_URL_DIRECT` | one applied migration under `db/migrations` | n/a | fails if you point at the pooler |
| `/api/ingest` (spec 0001) | POST | `repoUrl` | `jobId`, `status=queued` | `x-ingest-secret` | 409 active job, 422 bad URL |
| `/api/ingest/[id]` (spec 0001) | GET | job `id` | `status`, `error`, `sourceId` | none | 404 |
| `/api/ask` (spec 0001) | POST | `sourceId`, `message` | stream plus citation parts | none, IP cap on Vercel | 404, 409 source not `succeeded`, 429 |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Start ingest | `jobId` | new `ingest_jobs.id` |
| Start ingest | initial `status` | always `queued` on insert |
| Start ingest | `repo_url` | request body `repoUrl` after the spec 0001 allowlist |
| Job status read | `status` | `ingest_jobs.status` |
| Job status read | `error` | `ingest_jobs.error`, shape `{code}: {safe message}` |
| Job status read | `sourceId` | `ingest_jobs.source_id`, null until the worker upserts |
| Ask readiness | 409 vs stream | ready iff a job for that `source_id` has `status = succeeded` |
| Worker upsert source | `kind` | always `github_repo` in this slice |
| Worker upsert source | `identity` | lowercase `{owner}/{repo}` parsed from `repo_url` (spec 0001) |
| Worker upsert source | `origin_url` | `ingest_jobs.repo_url` |
| Worker upsert source | `owner_user_id` | always null in this slice |
| Worker timestamps | `started_at`, `finished_at` | written by the worker (or the reaper on timeout) |
| Worker chunk | `path`, `start_line`, `end_line`, `text` | 80 line window, 10 overlap (spec 0001) |
| Worker chunk | `embedding` | Voyage `voyage-code-3`, 1024 dims, document input (spec 0001) |
| Worker chunk | `job_id` | the running job's `id` |
| Success replace | surviving chunks | rows with this `job_id`; then one transaction: `DELETE` other chunks for that `source_id` and set `succeeded` |
| Fail wipe | remaining chunks | `DELETE FROM chunks WHERE job_id = $jobId` |
| First ask | chat row | upsert on `chats.source_id`; `id` and timestamps from database defaults |
| Ask message | `role`, `content` | request: user text; model stream: assistant text |
| Ask citations | `path`, `start_line`, `end_line` | the 8 retrieved chunks, not a live `chunk_id` |
| Ask citations | display order | `citations.id` ascending |
| Ask rate limit | `ip` | first hop of `x-forwarded-for` (spec 0001) |
| Ask rate limit | `window_start` | `date_trunc('hour', now() AT TIME ZONE 'utc')` stored as timestamptz |
| Ask rate limit | `count` | `INSERT (ip, window_start, 1) ... ON CONFLICT (ip, window_start) DO UPDATE SET count = ask_rate_limits.count + 1 RETURNING count` |
| Chat list sort | latest activity | `chats.updated_at` written when a message is inserted |

**Key invariants**:
- At most one job is `queued` or `running` (partial unique index).
- `(kind, identity)` is unique. A later success for the same GitHub repo updates the same source and replaces chunks.
- Each source has at most one chat.
- Every chunk has both `source_id` and `job_id`.
- `status` is only `queued`, `running`, `succeeded`, or `failed`.
- `role` is only `user` or `assistant`.
- `error` is `{code}: {safe message}` or null. Codes are `timeout`, `too_large`, `bad_url`, `embed_failed`, `fetch_failed`. Never a raw API body or token.
- No half index: fail deletes that job's chunks before `failed`. Success writes new chunks, then in one transaction deletes the rest and sets `succeeded`.
- A source is ready to ask iff at least one of its jobs is `succeeded`.
- The worker and Next.js use the same SQL names. Next.js owns migrations. The worker never migrates.

**Security model**:
- No accounts. No row level security.
- One database role. Next.js uses `DATABASE_URL` (pooled). The worker uses `DATABASE_URL_DIRECT`. Same grants.
- Anyone who can ask a source can read its chat. A `sourceId` is enough. The public Vercel URL is a shared thread, not a private one.
- Ingest is gated by `x-ingest-secret` at HTTP (spec 0001), not by a row policy.
- `ask_rate_limits.ip` stores the raw address. That is enough to cap abuse. It is also personal data on a public deploy. Do not log it next to secrets.
- `owner_user_id` stays null. Do not treat it as a lock.

**Configuration required**:
None new. Migrate with the existing `DATABASE_URL_DIRECT`. Do not run drizzle-kit against the pooled `DATABASE_URL`.

**Critical test scenarios**:
- Happy path: migrate on Compose, insert a source, a succeeded job, chunks, a chat, a user message, an assistant message, citations, and a rate limit row, then read them back, verifies **AC-1**
- Growth hooks: insert `kind = github_repo` and `owner_user_id = null`; inserting a random uuid in `owner_user_id` succeeds because there is no foreign key, verifies **AC-2**
- Fail wipe: two jobs on one source, chunks on both, delete where `job_id` is the failed one, the other job's chunks remain, verifies **AC-3**
- Replace on success: write job B chunks, delete chunks whose `job_id` is not B, chats for that source still exist, verifies **AC-3**
- One chat: two upserts on the same `source_id` leave one `chats` row, verifies **AC-4**
- Rate limit: first insert writes `count = 1`; a second increment on the same `(ip, window_start)` leaves `count = 2`, verifies **AC-5**
- Ready to ask: a source with only `failed` jobs is not ready; after one `succeeded` job it is ready even if a later job is `failed`, verifies **AC-1**
- Out of scope: `\dt` after migrate shows none of `users`, `usage_events`, share link, or blob tables, verifies **AC-6**
- One active job: inserting a second `queued` job fails the unique index, verifies **AC-7**

## Build plan

Skateboard: the usable whole is one applied migration that can store cited chat and still accept later slices. Do not ship `sources` in one change and chats in another.

1. Write `db/schema.ts` with all seven tables, uuid defaults, `DEFAULT now()` on timestamps, `text` plus `CHECK (x IN (...))` for `kind` / `status` / `role`, foreign keys (`ON DELETE CASCADE`), unique constraints, `CREATE UNIQUE INDEX ingest_jobs_one_active ON ingest_jobs ((true)) WHERE status IN ('queued', 'running')`, and btree indexes. Do not add users, blobs, usage events, or share links. satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**
2. Add root `drizzle.config.ts` (`schema: ./db/schema.ts`, `out: ./db/migrations`, `dialect: postgresql`, URL from `DATABASE_URL_DIRECT`). Generate one drizzle-kit migration. Ensure it creates extension `vector`, column `embedding vector(1024)`, and the HNSW cosine index (add raw SQL in that file if the generator skips them). satisfies **AC-1**
3. Add npm scripts `db:generate` and `db:migrate` that use `DATABASE_URL_DIRECT`. Apply the migration to Compose Postgres (`pgvector/pgvector:pg16`). satisfies **AC-1**
4. Put the SQL name contract in a short comment at the top of `db/schema.ts` so the Python worker copies table and column names from there, not from TypeScript property names. satisfies **AC-1**, **AC-3**
5. On the live Compose database, run the critical test scenarios (insert the full tree, reject a second active job, wipe by `job_id`, replace chunks, upsert chat, increment rate limit, confirm cascade delete). satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**

## Consequences

**Positive**:
- Cited chat has real rows for sources, jobs, chunks, messages, and citations. `/develop` on Ask does not invent a schema.
- Uploads and accounts can attach later without renaming `sources`.
- A failed job cannot leave a mixed index, and a later success cannot wipe chats.
- The worker and the app share one name list.
- The IP cap works on Vercel because the counter lives in Postgres, not in process memory.

**Negative / tradeoffs**:
- Seven tables before the first product screen is heavy for a skateboard. You accepted that to avoid a rewrite.
- `kind` and `owner_user_id` may still be the wrong shape when Slice 3 or 4 arrives. You will migrate, just not from nothing.
- Anyone with a `sourceId` shares one chat. On a public URL that is a shared whiteboard.
- Citations do not point at chunk rows. After a new ingest you cannot open the stored window, only path and line.
- Raw IPs sit in `ask_rate_limits`. That is personal data with no retention rule yet.
- Two runtimes still means a typo in worker SQL fails at run time, not at generate time.
- HNSW on a tiny index is extra work at ingest. You still want it so Ask does not change plan later.

**Neutral**:
- HTTP stays in spec 0001. This spec does not add routes, a `getDb()` helper, or a health page.
- Job progress counts, chat titles, token counts, and model names wait.
- Soft delete is out. Delete a source and the tree is gone.
- Spec 0001 called this "spec 0003" (the feature number). This file is 0002 (the next spec number).

## Follow-up

- [ ] Point spec 0001's data sketch at this spec. It still says the full model is spec 0003.
- [ ] Slice 4 adds a users table, then a foreign key from `owner_user_id`. Nulls stay valid. Do not invent users here.
- [ ] Slice 3 adds a new `kind` value (and any file columns). Do not add blob storage here.
- [ ] Slice 4 and Slice 5 should revisit the shared chat. A public `sourceId` is not a private thread.
- [ ] The Ask spec (feature 5) should ignore a client chat id, or require it match the one chat for that source. Spec 0001 listed an optional chat id.
- [ ] Add a retention rule for `ask_rate_limits` when you care about stored IPs. This spec does not delete old windows.
