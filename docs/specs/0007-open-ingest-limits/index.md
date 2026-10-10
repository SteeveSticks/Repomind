# 0007. Open Repository Ingest and Fair-Use Limits

**Date**: 2026-10-10
**Status**: In Progress

## Summary

This spec removes the requirement for a manually typed `INGEST_SECRET` across RepoMind indexing endpoints and user interfaces. Indexing and document uploads are opened to any visitor. To prevent server resource abuse and preserve AI model budgets in production deployments, multi-tier fair-use limits are enforced based on client IP address and query character lengths, while leaving local development environments completely free and unlimited.

## Requirements

**User stories**:
- As a visitor exploring RepoMind, I want to paste a public GitHub repository link or upload a document without entering a secret passphrase so I can immediately index code and ask questions.
- As a visitor typing a question, I want clear visual feedback showing my character count and maximum allowed query length so my input is accepted smoothly.
- As a visitor hitting a daily indexing or hourly ask limit, I want a clear, friendly error message explaining the policy and reset time.
- As a developer running RepoMind locally, I want zero indexing or character limits so I can test and build without artificial restrictions.

**Acceptance criteria**:
- **AC-1**: `POST /api/ingest` and `POST /api/upload` no longer require an `x-ingest-secret` header or `INGEST_SECRET` environment variable to process requests.
- **AC-2**: The repository index form and document upload UI no longer display secret input fields or passphrase prompts.
- **AC-3**: In production (`NODE_ENV === 'production'`), repository and document indexing attempts are limited to 3 per IP address per 24-hour UTC window. Submitting a 4th indexing attempt returns HTTP 429 with a clear error message.
- **AC-4**: In production (`NODE_ENV === 'production'`), user questions submitted to `POST /api/ask` are limited to 1,500 characters. Submitting a longer message returns HTTP 400 with character count details.
- **AC-5**: In local development (`NODE_ENV !== 'production'`), indexing count and question character length limits are bypassed.
- **AC-6**: The chat composer renders a character counter when prompt length exceeds 500 characters, highlighting red when exceeding 1,500 characters and disabling submission.

## Architecture & Data Model

- **`ingest_rate_limits` Table**:
  - `ip`: `text`, composite primary key with `window_start`
  - `window_start`: `timestamp with time zone`, truncated to 00:00 UTC of current day
  - `count`: `integer`, incremented on each successful ingest initiation
