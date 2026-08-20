# 0002. Data model: rationale

## Context

> ⚠️ Premise note: Seven tables plus unused columns (`kind`, `owner_user_id`) is more schema than the first ask screen needs. The usual skateboard would migrate only what that screen reads. You chose growth without a rewrite instead. The risk is Slice 3 or 4 wants a different shape and you still migrate. That is cheaper than adding a required owner later and rewriting every query.

> ⚠️ Premise note: Anyone who knows a source id shares that source's one chat. On a public Vercel URL that is a shared whiteboard, not a private thread. Slice 4 and Slice 5 should revisit this. This spec will not pretend the chat is private.

Slice 1 must persist a public GitHub repo, the ingest attempt, line aware chunks with embeddings, a chat, messages, and citations. The product promise is an answer you can check against a file and a line. If those facts live only in a stream and vanish, Document history cannot come back to the thread.

Spec 0001 already locked the engine: Postgres with pgvector, Drizzle in Next.js, psycopg in the Python worker, job states, one active job, `vector(1024)`, open ask, and an IP counter in Postgres. `db/` is empty. Feature 3 owns names, nullability, indexes, and how later slices attach.

Two runtimes will write the same rows. A name the worker invents that Drizzle does not emit is a production incident, not a style fight. Failed ingest must not leave a half index. A later success must replace chunks without deleting the chat. Accounts and uploads are later, but a required owner or a GitHub only identity column would force a rewrite when they arrive.

Not deciding this leaves `/develop` to invent tables while building Ask. The worker and the app will drift. History, uploads, and accounts will fight the first migration.

## Options considered

### Option 1: Seven tables, citations as rows, forward hooks

`sources`, `ingest_jobs`, `chunks`, `chats`, `messages`, `citations`, and `ask_rate_limits`. Citations store path and line. `kind` and nullable `owner_user_id` exist now. Jobs stay their own table.

**Pros**:
- Cited chat, job polling, fail wipe, and the IP cap all have a home.
- Uploads and accounts attach without renaming `sources`.

**Cons**:
- Heavier than the first screen. Two columns sit unused until later slices.

### Option 2: Slice 1 tables only, migrate when later slices land

Same seven tables minus `kind` and `owner_user_id`. Identity is GitHub shaped only.

**Pros**:
- Smaller first migration. Nothing unused.

**Cons**:
- Slice 3 and 4 become a rewrite of `sources` and of every query that assumes `owner/repo`. Conflicts with the scope Done when.

### Option 3: Fold jobs into the source, fold citations into message JSON

Status columns live on `sources`. Citations live in a JSON column on the assistant message.

**Pros**:
- Fewer tables and joins. Faster to type.

**Cons**:
- You lose attempt history and the job row spec 0001 said the UI polls. JSON cites are harder to query. A failed run and a good index fight over the same status columns.

### Option 4: Full product schema now

Users, file blobs, share links, and usage events land in this migration too.

**Pros**:
- Later slices are mostly inserts.

**Cons**:
- You design accounts, uploads, public pages, and metering before those features have specs. Most of it will be wrong. Scope said those tables stay out.

## Rationale

The force that mattered was the scope Done when: cited chat now, and later slices without a breaking rewrite. Option 2 is the smaller skateboard and it fails that test the moment uploads need a non GitHub identity. Option 4 designs four unspecced products. Option 3 fights spec 0001, which already made the job row the source of truth and asked for a rate limit table.

Option 1 is the honest middle. Seven tables match the records Slice 1 actually reads and writes. `kind` plus a bare nullable owner is a cheap hook, not a fake users table. Citations as rows match the product (file and line you can open). Skipping `chunk_id` is what keeps those rows valid after a replace.

Jobs stay separate so one source can have many attempts and so fail wipe is `DELETE WHERE job_id = $1`. New chunks land first. Deleting the old set and flipping to `succeeded` share one transaction, so a crash cannot leave a source with no chunks and no succeeded job. Dual rows are allowed only until that transaction commits. Keeping chats across a new ingest is how history still reads. A source is ready to ask when any of its jobs succeeded, which is how spec 0001's 409 rule is answered without a status column on `sources`.

One chat per source, created on first ask, is enough until accounts exist. The cost is a shared thread on a public `sourceId`. That is a product leak you accepted for Slice 1, not a security control.

SQL `snake_case` in one `db/schema.ts` file is the contract the worker can copy. Next.js owns migrate. The worker never gets a second schema. Neon migrate uses the direct URL because a pooler breaks session work. Those are operational facts, not taste.
