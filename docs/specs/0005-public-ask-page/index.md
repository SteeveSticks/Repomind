# 0005. Public ask page

**Date**: 2026-08-18
**Status**: Proposed

## Summary

A way to publish an indexed repository to a short shareable link. Anyone with the link can ask that repo questions and see cited answers, without an account or the app. You publish from the app with the same secret that guards ingest, and revoking the link makes the old URL stop working. The visitor conversation is transient, so public traffic never mixes into your own chat.

## Requirements

**User stories**:
- As the person who indexed a repo, I want to publish it to a shareable link so other people can try RepoMind on it.
- As someone who receives that link, I want to ask questions and see cited answers without creating an account or installing anything.
- As the publisher, I want to revoke a link so the public page stops working when I no longer want it shared.
- As a visitor, I want to know what repo I am asking about and be able to open its source on GitHub.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: An indexed repo (at least one succeeded ingest job) can be published from the app. `POST /api/sources/[id]/publish` returns a short random slug and stores it with `published_at` on the source row. Publishing is gated by the same `x-ingest-secret` header as ingest, bypassed in local development. Re publishing a repo that is already published returns the existing slug and URL unchanged, so the old link survives.
- **AC-2**: `GET /ask/[slug]` resolves the slug to its source. An unknown or revoked slug renders a 404 page. The page shows a repo header (owner/repo plus a GitHub link) and the chat UI, with no ingest card, secret input, or starter cards.
- **AC-3**: A visitor can ask on the public page. `POST /api/ask/public` streams a cited answer using the same Voyage embedding, top 8 chunk retrieval, and AI SDK streaming as `/api/ask`, and persists no messages, chats, or citations.
- **AC-4**: The public ask route shares the same `ask_rate_limits` table and the same 20 asks per IP per hour cap as `/api/ask` on production deployments.
- **AC-5**: Publishing is reversible. `POST /api/sources/[id]/revoke` clears `public_slug` and `published_at`; the old public URL then returns a 404. Revoking a source that is not published is a harmless no-op.
- **AC-6**: Reindexing a published repo keeps the slug intact. The public page automatically serves the fresh chunks; no republish is needed.
- **AC-7**: Edge cases: publishing a source with no succeeded job returns 409; a source whose chunks were all filtered out returns 409 rather than an uncited answer; an unknown or revoked slug returns 404; a stream failure shows an inline error with a retry action; the page sends `noindex` plus basic Open Graph metadata for shared links.

## Decision

**Chosen option**: Option 1: publish control in the app gated by the ingest secret, short random slug, reversible, and an ephemeral public ask route that reuses the existing ask pipeline

The owner publishes an indexed repo from the app (the same secret that guards ingest, bypassed locally). Publishing stores a short random slug on the source. A server component at `/ask/[slug]` renders the existing chat UI for that repo, and a new `/api/ask/public` route streams answers with citations but writes nothing. Revoking clears the slug and 404s the URL. The public page never touches your private chat or the ingest secret.

**Implementation skills**: `neon-postgres` (`neondatabase/agent-skills`, `.agents/skills/neon-postgres/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`)

Calls made here (decided during the design conversation):
- Slug: generated server side, short random token (about 8 characters, base36 style), retried on a unique collision. Runner up: owner chosen slug, more memorable but needs validation, uniqueness UI, and can break on reindex.
- URL shape: `/ask/[slug]`. Runner up: `/p/[slug]`.
- Visitor chat: ephemeral. The thread lives in the browser for the visit and is lost on refresh; nothing is persisted. Runner up: share the one chat per source, which spec 0002 already flagged as a public whiteboard.
- Rate limit: reuse the existing table and cap rather than a separate lower cap, so there is one rule and one code path.
- Reindex: the slug survives, because the source row is updated in place and chunks are replaced.
- Public failures: unknown slug renders a bare 404; a failed stream shows the existing inline error with retry; rate limiting shows the same hourly notice as the app.
- SEO: `noindex` plus a descriptive title and basic Open Graph tags so shared links look decent, without turning the page into an indexed marketing surface.
- Design: reuse the existing design system and chat components from spec 0003 and `DESIGN.md`. No new visual direction.
- No unique index on `public_slug`, so many repos can be published at once; collisions are checked before insert and retried with a fresh token.
- Ask logic is shared: the embed, retrieval, provider switch, and streaming are extracted into one helper called by `/api/ask` (persisting) and `/api/ask/public` (not persisting), so the two routes cannot drift.
- A source with a succeeded job but zero retrievable chunks returns 409 instead of an uncited answer.
- Publish and revoke are idempotent: re publish returns the existing slug, revoke on an unpublished source is a no-op.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

Two nullable columns added to `sources` (one Drizzle migration). The Python worker ignores them.

- `sources.public_slug`: text, nullable. Null means not published.
- `sources.published_at`: timestamptz, nullable. Set at publish, cleared at revoke.

No unique index on `public_slug` (a Postgres unique index would allow only one published repo at a time). Many repos may be published at once. Slug collisions are handled by checking for an existing slug before insert and retrying with a fresh token.

No new tables. `ask_rate_limits` is reused unchanged.

**State transitions**:

- Publish state: unpublished (`public_slug` null) → published (`public_slug` set, `published_at` set) → revoked (both cleared).
- Public page view: loading (slug lookup) → chat_ready (repo header + composer) → streaming (tokens and citation chips) → idle (citations clickable) → error (inline retry) or 404 (unknown or revoked slug).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/sources/[id]/publish` | POST | `id` (path, uuid) | `slug`, `url` | `x-ingest-secret`, bypassed in dev | 401 unauthorized, 404 source missing, 409 no succeeded job |
| `/api/sources/[id]/revoke` | POST | `id` (path, uuid) | `{ revoked: true }` | `x-ingest-secret`, bypassed in dev | 401 unauthorized, 404 source missing |
| `/api/ask/public` | POST | `slug` (string, required), `message` (string, required) | AI SDK stream: text tokens plus citation data parts | none (IP rate limited on production) | 400 missing fields, 404 slug unknown or revoked, 409 source not indexed or no retrievable content, 429 rate limit exceeded, 502 model failure |
| `/ask/[slug]` | GET | `slug` (path) | rendered page | none | 404 page unknown or revoked slug |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):

| Action | Value produced / displayed | Source |
|---|---|---|
| Publish | `slug` | Random token generated server side (e.g. `crypto.randomBytes`, base36, about 8 characters), checked for existing slug, regenerated on collision |
| Publish | `url` | Derived from the request host plus `/ask/{slug}` |
| Publish | `published_at` | `now()` set at publish |
| Public page lookup | repo header (`owner/repo`) | `sources.identity` by `public_slug` |
| Public page lookup | GitHub link | `https://github.com/{identity}` derived from `sources.identity`, not raw `origin_url` (which may carry `.git` or a trailing slash) |
| Public ask | source identity for citation hrefs | `sources.identity` by `public_slug` |
| Public ask | query embedding | Voyage `voyage-code-3` query embedding, same as `/api/ask` |
| Public ask | retrieved chunks | pgvector cosine top 8 for that `source_id`, same as `/api/ask` |
| Public ask | answer tokens | Groq on deploy, Ollama locally, same provider switch as `/api/ask` |
| Public ask | citation data parts | the retrieved chunks' path and lines, same as `/api/ask` |
| Public ask | no persistence | no chat, message, or citation rows are written |
| Public ask | zero chunk rejection | 409 when the top 8 retrieval returns no rows (source indexed but all files filtered out) |
| Rate limit | 429 versus stream | first `x-forwarded-for` hop against `ask_rate_limits`, shared helper with `/api/ask` |

**Key invariants**:
- Many repos may be published at once; no unique index on `public_slug`.
- A slug already in use is never overwritten; publish regenerates on collision.
- A source is publishable only when at least one of its ingest jobs is `succeeded` (readiness check per spec 0002).
- Re publishing a published source returns its existing slug unchanged.
- Revoking an unpublished source is a no-op success.
- A published source keeps its slug across reindexes; the slug is cleared only by revoke.
- Public asks never write chat, message, or citation rows.
- Unknown or revoked slugs resolve to 404, never to a chat.
- A source with no retrievable chunks is rejected with 409, never served an uncited answer.

**Security model**:
- Publishing and revoking are gated by the same shared secret as ingest (`x-ingest-secret`), bypassed in local development. The public page carries no publish control and never reads the secret.
- The public ask route is open but rate limited per IP, same cap as the app, to protect Groq and Voyage quotas.
- The shared rate budget is keyed by IP across both the app and the public route, so a visitor on the same IP as you shares your remaining hourly asks and vice versa. Accepted; the cap is a speed bump, not a per visitor meter.
- No accounts are involved. A visitor needs only the link; the slug is unguessable but not secret, so sharing the link is intentional.
- No new personal data beyond the existing `ask_rate_limits` IP rows.

**Configuration required**:
- None new. Publishing reuses `INGEST_SECRET`; the public ask route reuses `VOYAGE_API_KEY`, `GROQ_API_KEY`, and the Ollama settings already used by `/api/ask`.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Happy path: index a repo, publish it, open the returned `/ask/[slug]` link in a private window, ask a question, see a streamed answer with citation chips that open GitHub, verifies **AC-1**, **AC-2**, **AC-3**.
- Not indexed: publish a source with no succeeded job and receive 409, verifies **AC-1**, **AC-7**.
- Zero chunks: publish a repo whose files were all filtered out, then ask and receive 409 for no retrievable content rather than an uncited answer, verifies **AC-7**.
- Re publish: publish twice and confirm the second call returns the same slug and URL, verifies **AC-1**.
- Revoke: publish, then revoke, then open the old URL and receive a 404 page; revoking again is a harmless no-op, verifies **AC-5**, **AC-7**.
- No persistence: ask on the public page, then query the database and confirm no new chat, message, or citation rows for that source, verifies **AC-3**.
- Rate limit: on a production build, send more than 20 asks from one IP and receive 429 with the hourly notice, verifies **AC-4**.
- Reindex: publish, reindex the same repo, confirm the slug still resolves and serves the new chunks, verifies **AC-6**.
- Stream failure: force a provider error and confirm the inline error with retry appears, verifies **AC-7**.

## Build plan

Skateboard: the thinnest usable whole is publish a repo, share the link, and let a visitor ask with citations. Build that loop in one pass, then confirm revoke and edge cases are handled.

1. **Migration**: add `public_slug` (text, nullable) and `published_at` (timestamptz, nullable) to `sources` with no unique index on the slug; generate and apply one Drizzle migration, satisfies **AC-1**, **AC-5**, **AC-6**.
2. **Shared ask core**: extract the embed, top 8 retrieval, provider switch, and streaming with citation parts from `app/api/ask/route.ts` into a shared helper that takes a persist flag; refactor `POST /api/ask` to call it with persistence on, so the public route and the app route share one code path, satisfies **AC-3**, **AC-4**.
3. **Publish and revoke handlers**: build `POST /api/sources/[id]/publish` (secret gate with local dev bypass, 409 when no succeeded job, slug generation with collision check and retry, idempotent on re publish) and `POST /api/sources/[id]/revoke` (idempotent no-op when not published) in `app/api/sources/[id]/`, satisfies **AC-1**, **AC-5**, **AC-7**.
4. **Public ask route**: build `POST /api/ask/public` that resolves `slug` to the source, calls the shared ask core with persistence off, applies the same shared rate limit helper, and returns 409 when retrieval yields no chunks, satisfies **AC-3**, **AC-4**, **AC-7**.
5. **Public page**: build the `app/ask/[slug]` server component that looks the source up by slug, renders a repo header plus the existing thread and composer, 404s on unknown or revoked slugs, renders dynamically (so revoke takes effect immediately, not from a cache), and sends `noindex` plus Open Graph metadata derived from the source identity, satisfies **AC-2**, **AC-7**.
6. **App publish control**: add a Publish button (and a Revoke button once published) to the app next to the active repo, mirroring the ingest secret entry pattern on production, showing the shareable link with a copy action, satisfies **AC-1**, **AC-5**.

## Consequences

**Positive**:
- Other people can try RepoMind on a repo you already indexed, with no account and no setup.
- The public page reuses the existing ask pipeline, chat components, and rate limiter, so the incremental build is small.
- Visitor questions never pollute your chat or its message history.
- Revoke gives you control after sharing; a stale link just 404s.

**Negative / tradeoffs**:
- Public asks consume Groq and Voyage quota from any visitor, with only the per IP cap as a speed bump.
- The rate budget is shared per IP across the app and the public page, so you and a visitor on the same IP compete for the same hourly asks.
- The visitor thread is ephemeral, so a refresh loses the conversation. Acceptable for a demo, weaker for real collaboration.
- The slug is unguessable but not a real access control; anyone who gets the link can ask.
- The public page is `noindex`, so it is not a search discoverability surface (that stays a deferred marketing feature).

**Neutral**:
- One small migration on `sources`; the Python worker needs no change.
- Feature 8 (accounts) is a later slice; when ownership lands, a published source can be tied to its owner without reshaping this feature.

## Follow-up

- [ ] Confirm the publish button's placement in the app once `/develop` wires it, so revoke stays discoverable beside it.
- [ ] The shared ask core refactor touches spec 0004's `app/api/ask/route.ts`; `post /api/ask` must keep its behavior and its persistence after the extraction.
- [ ] When feature 8 (accounts) ships, revisit whether publishing should require the owner identity rather than the shared secret.