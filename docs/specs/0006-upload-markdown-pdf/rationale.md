# 0006. Upload markdown and PDF: rationale

## Context

RepoMind allows users to index public GitHub repositories and ask questions with cited line references. Many valuable engineering resources, API documentation sets, architecture writeups, and technical research papers exist as standalone Markdown and PDF files rather than public GitHub repositories.

The forces at play:

- Adding file uploads should not require setting up third party AWS S3 buckets or object storage services when the database is already Neon Postgres and files are modest in size (under 10 MB).
- Spec 0002 designed `sources.kind` and `sources.owner_user_id` as forward hooks specifically to accommodate uploads and accounts without rewriting the core database schema.
- PDF documents do not have native line numbers like code files, so text extraction in the Python worker must synthesize consistent page and line positions that match citation chunks.
- When an answer cites a line range in an uploaded document, there is no public GitHub URL to link out to; users need an in app document viewer that displays the file and highlights the cited text.
- The project build approach is Skateboard: ship the thinnest usable whole first. The whole here is upload a file, index it via Trigger.dev, and ask questions with cited line highlights.

## Options considered

### Option 1: Store raw files in Postgres source_files table, extract text in Python worker with pypdf, trigger Trigger.dev ingest-upload task, and render an in app document viewer with line highlights (chosen)

Uploaded files are posted as multipart form data to `/api/upload`, validated, and stored in a new `source_files` table in Neon Postgres. Next.js inserts an `ingest_jobs` row and starts the Trigger.dev `ingest-upload` task. The Python worker extracts text and line ranges using `pypdf`, computes Voyage embeddings, and writes to `chunks`. Citation chips in the chat UI open an in app drawer that displays the document and highlights the cited line range.

**Pros**:
- Self contained in Postgres without adding external S3 or cloud storage infrastructure and credentials.
- Reuses the existing Trigger.dev worker, Voyage embeddings, and pgvector cosine search pipelines.
- Content hash identity (`sha256`) prevents duplicate rows and safely handles re uploads.
- The in app document viewer provides instant citation verification without external navigation.

**Cons**:
- Storing binary PDF data in Postgres `bytea` uses database storage; capped at 10 MB per file.
- Complex PDFs containing scanned image pages require optical character recognition (OCR), which is deferred.

### Option 2: Upload files to external S3 compatible cloud object storage

Files are uploaded directly or via presigned URLs to an S3 or Cloudflare R2 bucket, and Postgres stores only the object storage key.

**Pros**:
- Offloads binary storage from Postgres.
- Scales easily to very large files (hundreds of megabytes).

**Cons**:
- Requires new environment variables, AWS or Cloudflare R2 bucket configuration, and cloud access keys.
- Too heavy for the skateboard build, adding third party moving parts when files are small.

### Option 3: Extract text inside Next.js route handler and bypass the Python worker

Next.js parses Markdown and PDF files using Node libraries like `pdf-parse`, computes embeddings directly, and writes chunks to Postgres without involving Trigger.dev or Python.

**Pros**:
- Eliminates the background job step for small files.

**Cons**:
- Node PDF parsing libraries are often less robust than Python PDF tooling.
- Computing Voyage embeddings synchronously during HTTP requests risks serverless timeouts on Vercel.
- Splits the indexing pipeline between Python (for repositories) and Node (for files) instead of maintaining one consistent ingestion model.

## Rationale

Option 1 is chosen because it delivers the complete upload and chat loop using the existing database and background worker architecture. By storing files in `source_files` in Postgres, RepoMind remains easy to run both locally and on Vercel without configuring external cloud buckets.

The Python worker already handles text chunking and Voyage vector generation; extending it with `pypdf` for `ingest-upload` keeps all document extraction logic unified in the Python runtime. The in app document viewer solves the citation verification requirement cleanly by highlighting the exact lines retrieved by pgvector.

Content based deduplication using SHA256 ensures that uploading the same file multiple times updates the existing source rather than fragmenting the database with duplicate records.
