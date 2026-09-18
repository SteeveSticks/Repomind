# 0006. Upload markdown and PDF

**Date**: 2026-09-08
**Status**: In Progress

## Summary

A way to index standalone documents into RepoMind without needing a GitHub repository. You can upload or drag and drop a Markdown, plain text, or PDF file up to 10 MB. The Python worker extracts text and line positions using pypdf, embeds the content with Voyage, and saves vector chunks to Postgres. Asking questions uses the same cited streaming chat, and clicking a citation chip opens an in app document viewer that highlights the exact cited lines.

## Requirements

**User stories**:
- As a developer or researcher with local notes, API docs, or whitepapers, I want to upload a Markdown or PDF document so RepoMind can index its contents.
- As a user waiting for a document index, I want to see clear progress states (queued, running, succeeded, or failed) so I know what is happening.
- As someone asking about an uploaded document, I want accurate answers grounded in the text with citations showing the document path and line numbers.
- As someone verifying an answer, I want to click citation chips to open an in app document viewer that scrolls to and highlights the cited lines.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Dropping or selecting a supported file (Markdown `.md`, `.markdown`, plain text `.txt`, or PDF `.pdf` up to 10 MB) uploads it via `POST /api/upload`. The endpoint validates the file extension, MIME type, and size, computes the SHA256 content hash for `identity`, inserts or updates `sources` (`kind = 'upload'`) and `source_files`, inserts an `ingest_jobs` row (`kind = 'upload'`), and triggers the Trigger.dev `ingest-upload` task.
- **AC-2**: The interface polls `GET /api/ingest/[id]` every 2 seconds to display live progress states: `queued`, `running`, `succeeded`, or `failed` with safe error descriptions.
- **AC-3**: The Python ingest worker executes the `ingest-upload` task. For Markdown and text, it creates 80 line chunks with 10 line overlap. For PDF, it uses `pypdf` to extract text per page and line, embeds all chunks using Voyage (`voyage-code-3`, 1024 dimensions), writes chunk rows to Postgres, and marks the job as `succeeded`.
- **AC-4**: Submitting a question for an uploaded source to `POST /api/ask` embeds the query with Voyage, retrieves the top 8 chunks from `chunks` where `source_id` matches, streams the answer using the AI SDK with Groq or Ollama, and attaches citation data parts with file path, start line, and end line.
- **AC-5**: Clicking a citation chip for an uploaded document opens an in app document viewer drawer, displaying the document content and automatically scrolling to and highlighting the cited line range.
- **AC-6**: `GET /api/sources/[id]/file` provides document metadata, raw text for Markdown and plain text, and binary data for PDF to power the in app document viewer.
- **AC-7**: Uploading is protected by the same shared secret (`x-ingest-secret`) as repository ingest on production deployments, bypassed during local development.
- **AC-8**: Edge cases and failures (files over 10 MB, unsupported file extensions, password protected or corrupted PDFs, empty documents, failed embeddings, or stalled jobs) fail gracefully with safe error codes (`too_large`, `bad_file_type`, `unreadable_pdf`, `empty_file`, `embed_failed`) and display clean retry options.

## Decision

**Chosen option**: Option 1: Store raw file data in Postgres source_files table, extract text in Python worker with pypdf, trigger Trigger.dev ingest-upload task, and render an in app document viewer with line highlights

This approach reuses the existing Postgres storage and Trigger.dev background worker architecture without introducing third party S3 or cloud bucket dependencies. Files up to 10 MB are stored directly in `source_files` in Neon Postgres. The Python worker extracts clean line and page aware text chunks, computes Voyage embeddings, and writes to `chunks`. Asking reuses the existing ask pipeline, and citation clicks open an in app document viewer.

**Implementation skills**: `trigger-tasks` (`triggerdotdev/skills`, `.agents/skills/trigger-tasks/`) · `trigger-setup` (`triggerdotdev/skills`, `.agents/skills/trigger-setup/`) · `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`)

Calls made here (decided during the design conversation):
- Storage: store file content directly in a `source_files` Postgres table (text in `raw_text`, binary PDF in `file_data`). Runner up: external S3 compatible object storage, which adds cloud credentials and extra configuration for small files.
- Identity: compute `identity = sha256(content)` so dropping the exact same file content reuses or updates the existing source row without duplicate entries.
- File limits: maximum 10 MB per file, single file per upload in this slice.
- Formats allowed: `.md`, `.markdown`, `.txt`, `.pdf`.
- Worker extraction: Python worker uses `pypdf` to extract page text and synthesize consistent line numbering for PDF documents.
- Ingest task: new Trigger.dev task `ingest-upload` alongside `ingest-repo`.
- Schema changes: update `sources.kind` check constraint to include `'upload'`, make `ingest_jobs.repo_url` nullable, add `ingest_jobs.kind` (`CHECK (kind IN ('github_repo', 'upload'))`), and create `source_files` table with foreign key cascade to `sources.id`.
- Document viewer: in app drawer component that renders the document text or PDF pages and highlights the active line range when a citation chip is clicked.
- Secret gating: `POST /api/upload` uses the same `x-ingest-secret` header as `POST /api/ingest`, bypassed on local development.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

One Drizzle migration adding `source_files` and updating constraints on `sources` and `ingest_jobs`:

1. `sources`:
- `kind`: widen check constraint to `CHECK (kind IN ('github_repo', 'upload'))`
- `identity`: lowercase hex SHA256 hash of file content for uploads
- `origin_url`: original uploaded file name (for example `api-spec.md` or `manual.pdf`)
- All other columns (`id`, `owner_user_id`, `created_at`, `updated_at`) remain unchanged
- Unique constraint `UNIQUE (kind, identity)` continues to prevent duplicates

2. `source_files` (new table):
- `id` uuid, not null, primary key, default `gen_random_uuid()`
- `source_id` uuid, not null, unique, foreign key to `sources.id` with `ON DELETE CASCADE`
- `filename` text, not null
- `mime_type` text, not null (`text/markdown`, `text/plain`, `application/pdf`)
- `byte_size` integer, not null
- `raw_text` text, null (holds text content for Markdown and plain text)
- `file_data` bytea, null (holds raw bytes for PDF documents)
- `created_at` timestamptz, not null, `DEFAULT now()`

3. `ingest_jobs`:
- `kind` text, not null, default `'github_repo'`, with `CHECK (kind IN ('github_repo', 'upload'))`
- `repo_url` text, null (required for `github_repo`, null for `upload`)
- `status` text, not null, `CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))`
- `error` text, null
- `source_id` uuid, null, foreign key to `sources.id` with `ON DELETE CASCADE`
- `created_at` timestamptz, not null, `DEFAULT now()`
- `started_at` timestamptz, null
- `finished_at` timestamptz, null
- Unique partial index `ingest_jobs_one_active` remains unchanged

4. `chunks`, `chats`, `messages`, `citations`, `ask_rate_limits`:
- Reused unchanged from spec 0002.
- For uploaded documents, `chunks.path` holds the original file name, or page identifier like `manual.pdf (Page 1)`.

**State transitions**:
- Ingest Job state machine: `queued` (created by Next.js upload handler) -> `running` (claimed by Trigger.dev `ingest-upload` task) -> `succeeded` (chunks written and old chunks pruned) OR `failed` (error code and message recorded).
- Upload Card UI state machine: `idle` (dropzone active with file picker) -> `uploading` (HTTP multipart transfer) -> `indexing` (polling job status with spinner) -> `chat_ready` (switches to active chat session) -> `error` (error alert with retry button).
- Document Viewer state machine: `closed` -> `opening` (fetching file content from `/api/sources/[id]/file`) -> `ready` (rendered document with highlighted lines) -> `error` (failed to load document alert).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/upload` | POST | Multipart form data with `file` (File, required), `x-ingest-secret` (header) | `jobId` (uuid), `sourceId` (uuid), `status` ('queued') | Shared secret (`INGEST_SECRET`), bypassed in local dev | 400 bad file or missing field, 401 unauthorized, 409 active job running, 413 file exceeds 10 MB, 422 unsupported file extension |
| `/api/sources/[id]/file` | GET | `id` (path param uuid) | `id`, `filename`, `mimeType`, `byteSize`, `rawText`, or binary file stream | None (public read) | 404 source or file not found |
| `/api/ingest/[id]` | GET | `id` (path param uuid) | `id`, `kind`, `status`, `error`, `sourceId` | None (public read) | 404 job not found |
| `/api/ask` | POST | `sourceId` (uuid, required), `message` (string, required) | AI SDK stream (text tokens and citation data parts) | None (IP rate limited on Vercel) | 400 missing fields, 404 source not found, 409 source not indexed, 429 rate limit exceeded, 502 model failure |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Upload file | `sourceId` | Existing `sources.id` on SHA256 collision or newly generated UUID |
| Upload file | `identity` | Computed lowercase hex SHA256 string of file buffer |
| Upload file | `origin_url` | Sanitized original file name from multipart form data header |
| Upload file | `jobId` | Generated UUID on inserting new `ingest_jobs` row |
| Upload file | `source_files.raw_text` | Decoded UTF-8 string for `.md` and `.txt` files |
| Upload file | `source_files.file_data` | Buffer binary payload for `.pdf` files |
| Upload worker | Chunk `path`, `start_line`, `end_line`, `text` | 80 line window with 10 line overlap from text, or page lines extracted via `pypdf` |
| Upload worker | Chunk embeddings | Voyage API `voyage-code-3` (1024 dimensions, document input type) |
| Read file content | Document text or stream | Query `source_files` table by `source_id` |
| Click citation chip | Line range highlight | `citations.start_line` and `citations.end_line` from citation payload |
| Document viewer target | Document title and lines | `sources.origin_url` and highlighted line numbers |

**Key invariants**:
- Maximum upload size is strictly 10 MB (10,485,760 bytes), enforced in Next.js route handler and worker.
- Only `.md`, `.markdown`, `.txt`, and `.pdf` file extensions with matching MIME types are accepted.
- Exact duplicate file uploads (matching SHA256 identity) update the existing source and replace chunks on success rather than creating duplicate source records.
- At most one `ingest_jobs` row may be `queued` or `running` across the entire database, guaranteed by Postgres partial unique index.
- A document source is only eligible for question answering when at least one associated ingest job has status `succeeded`.
- Chunks for failed jobs are cleaned up immediately to prevent ghost chunks.
- Document viewer gracefully highlights valid lines (`1 <= start_line <= end_line`).

**Security model**:
- File upload is gated by the shared secret (`INGEST_SECRET`) on production deployments, bypassed on localhost.
- Uploaded file names are sanitized to prevent directory traversal or header injection.
- PDF parsing in Python runs with safety limits against zip bombs, decompression recursion, and password protected files.
- The `source_files` table stores binary data safely using Postgres bytea; raw executable scripts or HTML files are rejected by extension validation.
- Rate limiting on `/api/ask` continues to apply the same 20 asks per IP per hour cap on production deployments.

**Configuration required**:
- None new. Reuses existing `DATABASE_URL`, `DATABASE_URL_DIRECT`, `TRIGGER_SECRET_KEY`, `VOYAGE_API_KEY`, `GROQ_API_KEY`, and `INGEST_SECRET`.

**Critical test scenarios**:
- Happy path Markdown: upload `guide.md` (200 lines), verify job completes, ask a question, verify stream returns citations, click citation chip and verify in app viewer opens and highlights lines 40 to 60, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
- Happy path PDF: upload `whitepaper.pdf` (5 pages), verify worker extracts text with pypdf and embeds chunks, ask a question, verify citations resolve to correct page and line numbers, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**.
- Oversized file: upload a file larger than 10 MB and receive HTTP 413 with error code `too_large`, verifies **AC-1**, **AC-8**.
- Unsupported extension: upload an executable or image file (`script.sh` or `photo.png`) and receive HTTP 422 with error code `bad_file_type`, verifies **AC-1**, **AC-8**.
- Unreadable or encrypted PDF: upload a password protected PDF, verify job fails with error code `unreadable_pdf`, chunks are wiped, and UI displays clear error with retry button, verifies **AC-3**, **AC-8**.
- Deduplication on re upload: upload the identical file twice, verify source row is updated and old chunks are replaced without duplicate records, verifies **AC-1**, **AC-3**.
- Secret protection: on production environment, upload without `x-ingest-secret` header and receive HTTP 401 unauthorized, verifies **AC-7**.

## Build plan

Skateboard: the thinnest usable whole is upload a Markdown or PDF document, index it via the Python worker, and ask questions with cited in app viewer highlights.

1. **Migration and schema**: update `db/schema.ts` to widen `sources.kind` check constraint, make `ingest_jobs.repo_url` nullable, add `ingest_jobs.kind`, and create `source_files` table (`id`, `source_id`, `filename`, `mime_type`, `byte_size`, `raw_text`, `file_data`, `created_at`) with foreign key cascade; generate and apply one Drizzle migration, satisfies **AC-1**, **AC-2**, **AC-8**.
2. **Python worker upload ingest pipeline**: add `pypdf` dependency to `ingest/pyproject.toml`, implement document chunking with line and page tracking, implement Trigger.dev `ingest-upload` task that fetches `source_files`, chunks, embeds with Voyage `voyage-code-3`, writes `chunks`, and marks job `succeeded` or `failed`, satisfies **AC-1**, **AC-3**, **AC-8**.
3. **Upload route handler**: build `POST /api/upload` that validates secret, validates file extension and size up to 10 MB, computes SHA256 identity, inserts or updates `sources` and `source_files`, inserts `ingest_jobs` row, triggers `ingest-upload` task, and returns `jobId` and `sourceId`, satisfies **AC-1**, **AC-7**, **AC-8**.
4. **Document file API**: build `GET /api/sources/[id]/file` to return document metadata and content (text or PDF binary stream) for client rendering, satisfies **AC-6**.
5. **UI upload dropzone and card workflow**: update the source selection card on the home page with a tab or toggle for GitHub URL versus File Upload (drag and drop area, file selector, size limit hint), wire polling on `GET /api/ingest/[id]`, and transition to chat on success, satisfies **AC-1**, **AC-2**, **AC-3**.
6. **In app document viewer component**: build a slide in drawer or modal component using shadcn dialog or sheet primitives that fetches document content from `/api/sources/[id]/file`, renders formatted text or PDF pages, automatically scrolls to cited lines, and highlights active line ranges when a citation chip is clicked, satisfies **AC-4**, **AC-5**.

## Consequences

**Positive**:
- Users can ask questions about local documentation, API references, and PDF research papers without creating a GitHub repository.
- File data stays self contained inside Neon Postgres without requiring third party S3 buckets or extra cloud credentials.
- Deduplication via content SHA256 prevents duplicate source records when re uploading files.
- The in app document viewer provides line level citation verification directly inside RepoMind.
- Reuses the existing Voyage embedding pipeline, pgvector similarity search, and AI SDK chat streaming.

**Negative / tradeoffs**:
- Storing binary PDFs in Postgres bytea increases database storage usage compared to external object storage. Capped at 10 MB per file to keep database growth manageable.
- Complex PDFs with scanned images or complex multi column tables require OCR for full fidelity, which is deferred to a later enhancement.
- Single file upload only in this slice; multi file folders or zip archives wait for a future slice.

**Neutral**:
- Extends the existing data model cleanly without breaking changes to existing GitHub repo sources or public ask pages.
- The same IP rate limits and secret protection apply equally to file sources and repo sources.

## Follow-up

- [ ] Confirm `pypdf` installation in Python environment via `uv add pypdf` in `ingest/` directory.
- [ ] In a future slice, evaluate adding OCR support for scanned image PDFs if users request it.
- [ ] Slice 6 (usage metering) will count uploaded document chunks and files against account quotas.
