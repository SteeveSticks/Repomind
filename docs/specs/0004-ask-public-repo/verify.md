# 0004. Verification for Ask a public repo

## How to verify this feature

Run these checks after `/develop ask a public repo` to confirm the skateboard functions end to end:

### 1. Ingest pipeline verification
- [x] Start local database: `docker compose up -d`
- [ ] Run Trigger.dev local development daemon: `npx trigger.dev dev` (not run: no `TRIGGER_SECRET_KEY`, so the local fallback spawns the worker directly)
- [x] Trigger an ingest with a small public repo (e.g. `https://github.com/facebook/react` or a small test repo) via the UI or `curl`:
  ```bash
  curl -X POST http://localhost:3000/api/ingest \
    -H "Content-Type: application/json" \
    -H "x-ingest-secret: repomind" \
    -d '{"repoUrl": "https://github.com/facebook/react"}'
  ```
- [x] Confirm the response returns `{ jobId: "...", status: "queued" }`.
- [ ] Poll `GET http://localhost:3000/api/ingest/{jobId}` until `status` becomes `succeeded`. (blocked: the worker's tarball URL returns 404 for every repo, see report)
- [x] Query Postgres to confirm chunks and embeddings were written (verified via a one line download URL workaround):
  ```sql
  SELECT count(*) FROM chunks;
  ```

### 2. Edge case and error handling
- [x] Attempt to start a second ingest while one is running and confirm HTTP 409 Conflict is returned.
- [x] Attempt to ingest an invalid URL (e.g. `https://github.com/foo/bar/extra`) and confirm HTTP 422 is returned.
- [x] Attempt to ingest a non existent repository or oversized repository (>50 MB) and verify the job status updates to `failed` with a descriptive error message. (surfaced `fetch_failed: Repository not found or private on GitHub.`; the >50 MB oversized case was not separately tested)

### 3. Ask and citation streaming
- [x] Submit a question via `POST /api/ask` or the UI composer:
  ```bash
  curl -X POST http://localhost:3000/api/ask \
    -H "Content-Type: application/json" \
    -d '{"sourceId": "{sourceId}", "message": "Where is the main entry point?"}'
  ```
- [x] Confirm the response streams markdown text accompanied by citation data parts `{ path, startLine, endLine }`.
- [ ] In the browser UI, verify that citation chips render properly and clicking a chip opens the exact file and line range on GitHub in a new tab. (browser not driven; URL format verified at the API level)

### 4. Rate limiting (on production mode)
- [ ] Submit more than 20 asks from the same IP address and verify HTTP 429 is returned with the hourly limit notice. (needs a production build; the per IP counter does increment locally)
