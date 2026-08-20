# 0005. Public ask page: rationale

## Context

RepoMind already answers questions about an indexed public repo with streamed answers and citations (spec 0004). The deployed app is ask only; starting an ingest needs a secret. To let other people experience RepoMind after a deploy, a visitor needs a page they can open with a link, ask the repo, and see cited answers, without the app or an account.

The forces at play:

- No accounts yet (feature 8 is a later slice), so both publishing and asking must work without an identity. Publishing is the only owner action, and the only owner gate that exists today is the ingest secret.
- Spec 0002 made `chats` one row per source and flagged that a public `sourceId` is not a private thread. Public traffic writing into that shared chat would mix visitors into the owner's conversation.
- The existing ask pipeline, provider switch, rate limiter, and chat components are built and verified. The public page should reuse them, not reimplement them.
- The project build approach is Skateboard: ship the thinnest usable whole first. The whole here is publish, share, ask, with citations, plus revoke to stay in control.
- A shareable URL is public by design, so abuse protection (rate limiting) matters more than accounts do.

## Options considered

### Option 1: Publish control in the app, short random slug, ephemeral public ask (chosen)

The owner publishes an indexed repo from the app, gated by the same `x-ingest-secret` as ingest (bypassed in local dev). Publishing stores a short random slug and `published_at` on the source. A server component at `/ask/[slug]` renders the existing chat UI for that repo, and `/api/ask/public` streams answers with citations but writes nothing. Revoking clears the slug and the old URL 404s.

**Pros**:
- Reuses the existing ask pipeline, rate limiter, chat components, and secret gate almost unchanged.
- No accounts needed; a visitor needs only the link.
- Public traffic never touches the owner's chat or its persisted messages.
- Revoke gives the publisher real control with minimal work.

**Cons**:
- The visitor thread is ephemeral; a refresh loses it.
- The slug is unguessable but not a real access control; anyone with the link can ask.
- Public traffic still burns Groq and Voyage quota, capped only per IP.

### Option 2: Auto publish every indexed repo

Every successful ingest immediately gets a public URL derived from the repo, with no publish action.

**Pros**:
- Zero extra UI; every indexed repo is instantly shareable.

**Cons**:
- No control over what becomes public; indexing and publishing are forced together.
- A URL derived from the repo identity is guessable, so anyone could browse every indexed repo.
- Contradicts the "publish when you choose" shape in the scope row.

### Option 3: Public page shares the one chat per source

Visitors ask through the existing `/api/ask` and share the single chat row for that source.

**Pros**:
- No new route and no persistence decisions; the existing ask flow is used untouched.

**Cons**:
- Every visitor's question lands in the owner's chat and is persisted, exactly the shared whiteboard spec 0002 warned about.
- Requires exposing `sourceId` to the public page or a slug lookup that then writes to the shared thread.
- The owner's thread becomes everyone's thread, with no way to tell visitors apart.

### Option 4: Per visitor anonymous chats

A cookie identifies each visitor and gives them their own persisted thread.

**Pros**:
- Visitors keep a real conversation history across refreshes.

**Cons**:
- New tables, cookie handling, and cleanup rules for a demo surface.
- More than a skateboard needs; the added persistence is not required by the feature's done condition.

## Rationale

Option 1 because the skateboard is the whole loop, built by composition rather than reimplementation. Publishing is the only new owner surface, and it reuses the one owner gate that exists (the ingest secret), matching how the app already behaves. The ephemeral public ask route sidesteps the shared chat problem that spec 0002 flagged, with no schema beyond two nullable columns on `sources`.

The slug is random rather than derived from the repo because the feature is about sharing with people you choose, not about discoverability. Deriving the URL from the identity would let anyone enumerate every indexed repo. A short random token is shareable and unguessable, and a check before insert with a fresh token on collision keeps many repos publishable at once (a Postgres unique index would have limited the whole app to one published repo).

Reusing the existing 20 per IP per hour cap keeps one rule and one code path; a separate lower cap would add a scope column or a second table for no protection the shared cap already provides. The shared cap is keyed by IP across both routes, so a visitor and the owner on one IP share the same hourly budget; that is accepted as a speed bump, not a per visitor meter. The public page is `noindex` because it is a working tool, not a marketing surface; the deferred marketing and SEO feature stays responsible for search presence.

The one tradeoff the owner accepts is that a public page is public: the link is the access control, and public traffic spends model quota. That matches how spec 0001 already described the open ask surface on the deployed URL.