# Verify: Data model · spec 0002 · updated 2026-08-14
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Compose Postgres must be up (`docker compose up -d`). Host `127.0.0.1:5432` may be a different Postgres on this machine. Prefer `docker exec -i repomind-postgres-1 psql -U repomind -d repomind` so you hit Compose.

## UI / manual
None. This feature ships no HTTP.

## Commands
- [x] `docker exec -i repomind-postgres-1 psql -U repomind -d repomind -c "\dt"` → public tables are only `sources`, `ingest_jobs`, `chunks`, `chats`, `messages`, `citations`, `ask_rate_limits` (plus drizzle internals). None of `users`, `usage_events`, share link, or blob tables. → AC-6
- [x] `\d chunks` → `embedding vector(1024) NOT NULL`, HNSW index `chunks_embedding_hnsw` using `vector_cosine_ops`, btree on `source_id`, both FKs `ON DELETE CASCADE`. → AC-1
- [x] `\d ingest_jobs` → unique index `ingest_jobs_one_active` on `(true)` where `status IN ('queued', 'running')`. Status check allows only `queued`, `running`, `succeeded`, `failed`. → AC-7
- [x] Insert a `github_repo` source, a `succeeded` job, a chunk with a 1024 dim embedding, one chat, a user message, an assistant message, citations, and a rate limit row, then join them back. One joined row. → AC-1
- [x] Insert `kind = 'github_repo'` and `owner_user_id = NULL`. Then insert `owner_user_id =` a random uuid. Both succeed. There is no foreign key on `owner_user_id`. → AC-2
- [x] Two jobs on one source, chunks on both. `DELETE FROM chunks WHERE job_id = $failed`. The other job's chunks remain. → AC-3
- [x] Write job B chunks, `DELETE FROM chunks WHERE source_id = $source AND job_id <> $jobB`. Chats for that source still exist. → AC-3
- [x] `INSERT INTO chats (source_id) VALUES ($id) ON CONFLICT (source_id) DO NOTHING` twice. One `chats` row. → AC-4
- [x] First `INSERT` into `ask_rate_limits` writes `count = 1`. Second `ON CONFLICT (ip, window_start) DO UPDATE SET count = ask_rate_limits.count + 1` leaves `count = 2`. → AC-5
- [x] Source with only `failed` jobs: `EXISTS (... status = 'succeeded')` is false. After one `succeeded` job it is true even if a later job is `failed`. → AC-1
- [x] Insert one `queued` job, then a second `queued` job. The second insert fails the unique index. → AC-7
- [x] `npm run db:generate` and `npm run db:migrate` read `DATABASE_URL_DIRECT` from `drizzle.config.ts`. Point them at Compose, not at a pooled URL. → AC-1

## Value sourcing
- [ ] Start ingest `jobId` comes from the new `ingest_jobs.id`, not from the client. → AC-1
- [ ] Initial job `status` is always `queued` on insert. → AC-1
- [ ] `repo_url` is the allowlisted request `repoUrl` (spec 0001), stored as `ingest_jobs.repo_url`. → AC-1
- [ ] Job status read `status` is `ingest_jobs.status`. → AC-1
- [ ] Job status read `error` is `ingest_jobs.error` in the shape `{code}: {safe message}`. → AC-1
- [ ] Job status read `sourceId` is `ingest_jobs.source_id`, null until the worker upserts. → AC-1
- [ ] Ask readiness is 409 vs stream: ready iff a job for that `source_id` has `status = succeeded`. → AC-1
- [ ] Worker upsert `kind` is always `github_repo` in this slice. → AC-2
- [ ] Worker upsert `identity` is lowercase `{owner}/{repo}` parsed from `repo_url`. → AC-4
- [ ] Worker upsert `origin_url` is `ingest_jobs.repo_url`. On conflict only `origin_url` and `updated_at` change. → AC-4
- [ ] Worker upsert `owner_user_id` is always null in this slice. → AC-2
- [ ] `started_at` and `finished_at` are written by the worker, or the reaper on timeout. → AC-1
- [ ] Chunk `path`, `start_line`, `end_line`, `text` come from the 80 line window with 10 overlap (spec 0001). → AC-1
- [ ] Chunk `embedding` is Voyage `voyage-code-3`, 1024 dims, document input. → AC-1
- [ ] Chunk `job_id` is the running job's `id`. Fail wipe is `DELETE FROM chunks WHERE job_id = $jobId`. → AC-3
- [ ] Success replace keeps this `job_id`, then one transaction deletes other chunks for that `source_id` and sets `succeeded`. Chats stay. → AC-3
- [ ] First ask upserts `chats` on `source_id`. `id` and timestamps come from database defaults. → AC-4
- [ ] Ask message `role` and `content` are request user text or model assistant text. → AC-1
- [ ] Ask citations store `path`, `start_line`, `end_line` from the 8 retrieved chunks, not a live `chunk_id`. Display order is `citations.id` ascending. → AC-1
- [ ] Rate limit `ip` is the first hop of `x-forwarded-for`. `window_start` is `date_trunc('hour', now() AT TIME ZONE 'utc')` stored as timestamptz. `count` is insert `1` then `count = count + 1`. → AC-5
- [ ] Chat list sort uses `chats.updated_at` written when a message is inserted. → AC-4

## Acceptance-criteria coverage
- AC-1 persist tree, ready to ask, vector(1024), HNSW, migrate scripts · AC-2 kind plus nullable owner · AC-3 fail wipe and replace · AC-4 unique source and one chat · AC-5 rate limit increment · AC-6 no later slice tables · AC-7 one active job
