# Ingest

## Overview

Python 3.12 worker that will download a public GitHub snapshot, split files into chunks that remember path and line, embed them, and write Postgres. It lives in this same git tree. Next.js starts the job; this folder owns the pipeline.

## Key files

| File | Owns |
|---|---|
| `ingest/main.py` | Entry point (scaffold hello today) |
| `ingest/pyproject.toml` | uv project, Python >=3.12, pytest in the dev group |
| `ingest/uv.lock` | Locked deps |
| `ingest/tests/test_main.py` | Scaffold tests for the hello entry point |

## Commands

```bash
# Run the worker entry point
uv run --directory ingest python main.py

# Tests
uv run --directory ingest pytest
```

## Conventions

- Python 3.12, installed with uv. Do not add a second package manager here.
- Lint and format with Ruff once it is installed. Do not add flake8 or black beside it.
- Next.js owns Drizzle migrations in `db/`. This worker will use psycopg 3 plus the pgvector Python types.
- Trigger.dev task id is `ingest-repo`, payload `{ jobId }` only. If Trigger.dev cannot run Python, stop. Do not rewrite this worker to TypeScript.
- Job `error` is a short code plus a safe message. Never store raw API bodies or tokens.

## Gotchas

- Use `DATABASE_URL_DIRECT` (Neon direct, not the pooler). Locally it may match `DATABASE_URL`.
- Skip rules, the 50 MB unpacked cap, 80 line windows with 10 line overlap, and one active job are locked in spec 0001. Do not invent a RAG framework.
- The virtualenv stays at `ingest/.venv` (gitignored).

## Related specs

- [0001 stack and architecture](../docs/specs/0001-stack-architecture/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
