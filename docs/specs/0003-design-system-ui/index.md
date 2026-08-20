# 0003. Design system and UI foundation

**Date**: 2026-08-15
**Status**: Accepted

## Summary

RepoMind gets one light look and one product surface: `/` is the sidebar plus the chat session. The chrome follows the Gemini Material 3 kit. The thread follows the live Gemini chat shot. Send on that composer is the ask action for the whole app. This foundation ships the shell and the control. Slice 1 binds Send to the Next.js ask path (retrieve plus a streamed answer). The Python worker stays on ingest, not on Send.

## Requirements

**User stories**:
- As someone opening RepoMind, I want a finished looking chat home so ingest and ask feel like one tool, not a starter page.
- As someone checking an answer later, I want citation chips and a copy control that already look right so Slice 1 only wires data.
- As someone on a laptop or a phone, I want the sidebar, composer, and settings to work from the keyboard with readable contrast.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Opening `/` shows a light shell. Left: RepoMind wordmark, New chat, Recents with placeholder items, a settings control. Main: New chat canvas with a greeting, a Paste a GitHub URL card, at least three suggestion cards, and a pill composer.
- **AC-2**: Color, type, and spacing tokens live in `app/globals.css` as CSS variables wired through Tailwind `@theme`. Light only. `DESIGN.md` at the repo root records the same tokens and the shared components.
- **AC-3**: Activating one designated recent replaces the canvas with a placeholder thread: one user bubble aligned end, one assistant reply rendered as markdown (a heading and a list at minimum), citation chips that open a sample GitHub blob URL in a new tab, and Copy that puts the assistant text on the clipboard.
- **AC-4**: A suggestion card puts its prompt in the composer and focuses the field. The plus control does not open a picker or send. Send is off when the field is empty or only spaces. Send with text appends a user bubble, clears the field, and does not invent an assistant row. After the first send on New chat, hide the greeting, the URL card, and the suggestion cards (do not leave those controls in the tab order). Keep one visually hidden `h1` whose accessible name is `Hello`. Local bubbles sit above the composer in the same `MessageScroller` as the thread, user `Bubble`s only. Focus stays in the composer. New chat restores the empty canvas (greeting, URL card, suggestion cards) and drops local bubbles. The composer draft may stay. Send is the only ask entry in the product. This foundation does not call `/api/ask` (that route is Slice 1). It must not add a second composer or a second chat route.
- **AC-5**: At a narrow width the sidebar is not persistent. A menu button opens it as an overlay. The composer stays at the bottom of the viewport. Escape closes the overlay.
- **AC-6**: Settings opens a dialog titled About with the product name and a note that dark mode comes later. Focus moves into the dialog. Escape and a close control return focus to the gear.
- **AC-7**: Every interactive control is reachable by keyboard with a visible focus ring. A skip link moves focus to the main canvas. Text and surface pairs used in the shell meet WCAG 2.2 AA. `prefers-reduced-motion: reduce` removes non essential motion.
- **AC-8**: The shipped UI does not show Gemini, Upgrade, Extensions, Public links, a model picker, or a microphone control.

## Decision

**Chosen option**: Option 1: Blend kit chrome with live chat, shadcn nova on Base UI, custom AppShell

Ship tokens plus the one product shell at `/` (sidebar + chat session). Chrome from the Figma kit. Thread and composer from the live Gemini screenshot. shadcn preset `nova` on Base UI, then retoken to white, soft gray, and one violet accent. Custom AppShell (not the dense dashboard Sidebar). Thread uses `MessageScroller`, `Message`, and `Bubble`. Assistant markdown uses `react-markdown` plus `remark-gfm`. Light only. Chat chrome only. `/` is the core flow: New chat, recents, composer, and later ingest and ask all live here.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.agents/skills/shadcn/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`) · `fixing-accessibility` (`ibelick/ui-skills`, `.agents/skills/fixing-accessibility/`) · `create-design-md` (`ibelick/ui-skills`, `.agents/skills/create-design-md/`) · `web-design-guidelines` (`vercel-labs/agent-skills`, `.agents/skills/web-design-guidelines/`)

Calls made here (not asked in the interview):
- Tokens live in `app/globals.css` via `@theme inline`. Semantic names: `background`, `foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `border`, `ring`, `card`, `radius`. Runner up: a second CSS file, which splits the one Tailwind 4 entry the scaffold already has.
- Exact light values (picked from the screenshots, not from nova defaults):
  - `background` `#FFFFFF`
  - `foreground` `#1F1F1F`
  - `muted` `#F0F4F9`
  - `muted-foreground` `#5F6368`
  - `accent` `#6750A4`
  - `accent-foreground` `#FFFFFF`
  - `border` `#C4C7C5`
  - `ring` `#6750A4`
  - `card` `#F0F4F9`
  - `radius` `1.5rem`
- Composer pill uses full rounding (`9999px`). User bubble uses `1.25rem`. Cards use `radius`.
- Sidebar overlay below `768px` (`md`). At `768px` and up the sidebar is persistent.
- Sans is Plus Jakarta Sans via `next/font/google`. Mono stays Geist Mono. Drop Geist Sans.
- Type scale in `@theme` (size / line height): `xs` 12px / 16px, `sm` 14px / 20px, `base` 16px / 24px, `lg` 18px / 28px, `xl` 24px / 32px, `2xl` 32px / 40px. Weights: 400 body, 500 recents and chips, 600 greeting and section headings. Greeting uses `2xl` / 600. Body and assistant prose use `base` / 400. Recents, chips, URL card body, and settings body use `sm`. Composer uses `base`.
- Spacing token `--spacing` stays Tailwind's `0.25rem` (4px). Default gaps: sidebar padding `16px`, recents row gap `4px`, canvas padding `24px`, card padding `16px`, composer inner padding `12px 16px`, thread row gap `16px`. Sidebar width `280px` and composer max `48rem` stay as named above.
- File layout: `components/ui/` for shadcn output, `components/shell/` for AppShell, `components/chat/` for canvas, composer, chips. Placeholder copy in `lib/placeholder-data.ts`. `cn` in `lib/utils.ts`.
- shadcn add list: `button`, `separator`, `sheet`, `dialog`, `badge`, `textarea`, `input-group`, `empty`, `tooltip`, `message-scroller`, `message`, `bubble`. Icons from `lucide-react`.
- Desktop has no top Upgrade bar. Mobile header is the menu button only.
- Recents labels look like public repos. The designated thread recent is `vercel/next.js`. Two more static rows: `facebook/react`, `openai/whisper`.
- Suggestion prompts, exact copy:
  1. `Where does Next.js keep App Router pages?`
  2. `How do citations point at a file and line?`
  3. `What does a failed ingest look like?`
- Canned user text: `Where does Next.js keep App Router pages?`
- Canned assistant markdown, exact string:
```
## App Router pages

1. Keep routes in the `app` directory.
2. A folder becomes a URL segment.
3. Add `page.tsx` in that folder to render the screen.
4. Add `layout.tsx` beside it to wrap nested routes.
```
- Citation chip label: `README.md:1`. Href is `https://github.com/vercel/next.js/blob/canary/README.md` (no line fragment in this foundation). `target="_blank"` and `rel="noopener noreferrer"`. Slice 1 replaces the href and may add `#L`.
- User bubble: `Bubble` `variant="muted"` `align="end"`. Fill `muted` (`#F0F4F9`), text `foreground` (`#1F1F1F`), radius `1.25rem`.
- Assistant: `Message` `align="start"`, no `Bubble`. Prose sits on `background`. Markdown: headings `lg` / 600, body `base` / 400, inline code Geist Mono on `muted`.
- Under the assistant `MessageFooter`: citation chips in one row (`Badge` as a link, `secondary`), then Copy. Copy is a ghost `Button` with a Lucide clipboard icon.
- Enter sends. Shift+Enter inserts a newline. Send is disabled on empty or whitespace.
- Composer placeholder: `Ask a question`. Plus is an icon control, `aria-disabled="true"`, `aria-label="Add"` plus tooltip `Uploads come later`. Send is an icon control, `aria-label="Send"` (visible text optional).
- Copy uses `navigator.clipboard.writeText` on the assistant markdown source. `aria-label` is `Copy answer`. Visible label reads Copy, then Copied for two seconds. No toast library. If the clipboard call fails, the label stays Copy.
- The URL card is visual only. Not a form.
- New chat resets the canvas to the empty state and drops local user bubbles. The composer draft may stay. Refresh also drops local bubbles. They are memory only.
- After the first local send on `new`, hide starter chrome when `view` is `new` and there is at least one local user message. Unmount the greeting, the URL card, and the suggestion cards so they are not focusable. Keep one visually hidden `h1` whose accessible name is `hello` (`Hello`). The tagline is not part of that heading. Show local bubbles in the thread `MessageScroller` (user `Bubble`s only, oldest first) above the composer. Focus stays in the textarea. Do not switch `view` to `thread`.
- A recent that does not open a thread is a no op on the canvas: keep `view`, local bubbles, hide state, and composer text.
- Designated recent uses `aria-current="true"` and background `muted` while `view` is `thread`. Other recents stay enabled and look like rows. They do not take the selected style.
- `react-markdown` does not load `rehype-raw`. Images in markdown are not rendered in this foundation.
- Dialog uses a visible `DialogTitle` `About`. Sheet on small screens uses visible `SheetTitle` `Menu`. Backdrop click closes the Sheet. The Sheet traps focus. Escape or close returns focus to the menu button (`aria-label="Open menu"`). Settings gear `aria-label` is `Settings`.
- Skip link text is `Skip to chat`. It is the first focusable control. It moves focus to `id="main-canvas"` on the main landmark.
- Minimum hit size is `44px` on interactive controls.
- Focus ring: `2px` solid `ring` (`#6750A4`), offset `2px`, on every interactive control in `:focus-visible`.
- Allowed motion: Sheet slide, Copy label swap. Under `prefers-reduced-motion: reduce`, the Sheet appears and disappears with no slide. No hover scale. Copy is a text swap only, not a bounce.
- Contrast pairs that must meet WCAG 2.2 AA: `foreground` on `background`, `muted-foreground` on `background`, `muted-foreground` on `muted` and `card`, `accent-foreground` on `accent`, chip text (`muted-foreground`) on `muted`, disabled Send (`muted-foreground`) on `background`. Do not put `muted-foreground` on `accent`.
- Document title is `RepoMind`. `html lang="en"`.
- `DESIGN.md` is written after tokens exist, repository mode, export target `css-tailwind`, then lint and export as the create-design-md skill requires.
- Every user facing string named in this Decision lives in `lib/placeholder-data.ts` (greeting, URL card, prompts, recents, canned thread, settings body, composer placeholder, a11y labels). `globals.css` holds tokens only.
- `/` is the only chat surface. Do not add `/chat` or a second composer in later slices without superseding this spec.
- Send on `/` is the ask action. Slice 1 binds it to spec 0001 `POST /api/ask` (Voyage query, pgvector top 8, stream from Ollama or Groq). That is retrieve plus generate, not the Python ingest worker. Python runs when the URL card is wired (index a repo).
- No new env vars. No new tables. No HTTP in this foundation.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new Postgres tables. Spec 0002 already owns `chats`, `messages`, and `citations`. This foundation keeps a client only stand in.

`PlaceholderRecent` (static module data):
- `id` string, required
- `label` string, required
- `opensThread` boolean, required. Exactly one is true.

`PlaceholderThread` (static module data):
- `userText` string, required
- `assistantMarkdown` string, required
- `citations` list of `{ label, href }`, at least one

`LocalUserMessage` (React state, not persisted):
- `id` string, required, created in the client
- `text` string, required

**State transitions**:

View: `new` (default) or `thread`.
- New chat → `new`, clear local user messages, close the mobile sidebar. Composer text is unchanged.
- Activate the designated recent → `thread`, clear local user messages, close the mobile sidebar. Composer text is unchanged.
- Activate a recent that does not open a thread → stay on `new`. Local bubbles, hide state, and composer text stay as they are.
- Send (non empty) while `new` → stay on `new`, append a `LocalUserMessage`, hide starter chrome (`view` is `new` and the local list is not empty), keep the visually hidden `Hello` heading, show user bubbles in the thread scroller, leave focus in the composer.
- Send while `thread` → append a local user bubble after the canned pair.

Settings: `closed` (default) or `open`. Escape or close → `closed`, focus returns to the gear.

Mobile sidebar: `closed` (default) or `open`. Escape, New chat, or a recent → `closed`.

Copy: `idle` or `copied`. After two seconds → `idle`.

**API surface**:

No HTTP. Client actions only.

| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Open `/` | GET page | none | shell + New chat canvas | public | none |
| New chat | client | none | view `new`, empty local list, starter chrome visible, composer draft unchanged | public | none |
| Select recent | client | `id` | view `thread` if designated; else no canvas change | public | unknown id: no change |
| Fill from card | client | card prompt | composer text + focus | public | none |
| Send | client now, `POST /api/ask` in Slice 1 | composer text | local user bubble now; starter chrome hidden when `view` is `new`; streamed assistant + citations in Slice 1 | public | empty: control off. Slice 1 adds 429 and 503 from spec 0001 |
| Copy | client | assistant markdown | clipboard | public | clipboard deny: label stays Copy |
| Open citation | navigation | `href` | new tab | public | none |
| Open settings | client | none | About dialog | public | none |
| Toggle sidebar | client | none | overlay open or closed | public | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Open `/` | Wordmark text | `lib/placeholder-data.ts` `wordmark` = `RepoMind` |
| Open `/` | Greeting | `lib/placeholder-data.ts` `hello` = `Hello` and `tagline` = `How can I help you today?` |
| Open `/` | URL card title | `lib/placeholder-data.ts` `urlCardTitle` = `Paste a GitHub URL` |
| Open `/` | URL card body | `lib/placeholder-data.ts` `urlCardBody` = `Index a public repo, then ask it with citations.` |
| Open `/` | Suggestion card prompts | `lib/placeholder-data.ts` the three Decision prompts |
| Open `/` | Recents labels | `lib/placeholder-data.ts` (`vercel/next.js`, `facebook/react`, `openai/whisper`) |
| Open `/` | Document title | `layout.tsx` metadata, decided here: `RepoMind` |
| Open `/` | Surfaces and type | CSS variables in `app/globals.css` listed in Decision |
| Open `/` | Composer placeholder | `lib/placeholder-data.ts` `composerPlaceholder` = `Ask a question` |
| Open `/` | Skip link text | `lib/placeholder-data.ts` `skipLabel` = `Skip to chat` |
| Open `/` | Skip target | decided here: `id="main-canvas"` |
| Open `/` | Menu button name | `lib/placeholder-data.ts` `menuLabel` = `Open menu` |
| Select designated recent | User bubble text | `placeholder-data` `userText` |
| Select designated recent | Assistant markdown | `placeholder-data` `assistantMarkdown` (exact Decision string) |
| Select designated recent | Chip label | `placeholder-data` `citations[].label` = `README.md:1` |
| Select designated recent | Chip href | `placeholder-data` `citations[].href` = the Decision sample blob URL |
| Fill from card | Composer value | the card's prompt string |
| Send | New bubble text | the composer input |
| Send | New bubble id | created in the client (`crypto.randomUUID()`) |
| Send | Starter chrome hidden | derived: `view` is `new` and the local user list is not empty |
| Send | Screen reader heading | `lib/placeholder-data.ts` `hello` = `Hello` |
| New chat | Restored greeting and cards | same `placeholder-data` strings as Open `/` |
| Copy | Clipboard payload | the canned `assistantMarkdown` string |
| Copy | Control name | `lib/placeholder-data.ts` `copyLabel` = `Copy answer` |
| Settings | Dialog title | `lib/placeholder-data.ts` `settingsTitle` = `About` |
| Settings | Dialog body | `lib/placeholder-data.ts` `settingsBody` = `RepoMind` plus `Dark mode comes later.` |
| Settings | Gear name | `lib/placeholder-data.ts` `settingsLabel` = `Settings` |
| Plus | Name and tooltip | `lib/placeholder-data.ts` `addLabel` = `Add`, `addTooltip` = `Uploads come later` |
| Send | Control name | `lib/placeholder-data.ts` `sendLabel` = `Send` |
| Toggle sidebar | Sheet title | `lib/placeholder-data.ts` `sheetTitle` = `Menu` |

**Key invariants**:
- Light theme only. No `prefers-color-scheme: dark` override on product tokens. Remove the scaffold dark block from `app/globals.css`.
- No Google or Gemini marks, names, or product chrome (AC-8).
- Thread bubbles come from shadcn `Message` and `Bubble`, not hand rolled surfaces. The assistant has no `Bubble`.
- Assistant markdown never passes raw HTML.
- User facing copy is imported from `lib/placeholder-data.ts`, not written inline in JSX.
- Local user bubbles never hit Postgres or `localStorage`.
- Exactly one recent opens the canned thread.
- Citation links always include `rel="noopener noreferrer"`.
- Composer send is a no op when the control is off.
- There is one product page: `/`. Sidebar and chat session are that page. Send is the ask entry. Ingest starts from the URL card on the same page.

**Security model**:
- The shell is public. Anyone who can load `/` sees the same placeholder data. No session.
- No PII. Placeholder copy is product owned.
- Markdown is a closed renderer (`react-markdown` without `rehype-raw`).
- Outbound citation links open in a new tab with `noopener`.
- No secrets and no new credentials.

**Configuration required**:
None. No new env vars.

**Critical test scenarios**:
- Happy path: open `/`, see the empty shell, click a suggestion card, type a word, send, see a right aligned bubble and no assistant row, with the greeting and starter cards gone; then open the designated recent and see markdown plus a working citation link and Copy. Verifies **AC-1**, **AC-3**, **AC-4**.
- Failure case: send with an empty composer does nothing. Clipboard denial leaves the Copy label in place. Unknown recent id does not change the canvas. Verifies **AC-4**.
- Auth/permission: `/` renders the shell with no cookie and no login screen. Verifies **AC-1**.
- Narrow viewport: sidebar hidden, menu opens overlay, composer stays visible, Escape closes the overlay. Verifies **AC-5**.
- Keyboard: Tab reaches skip link `Skip to chat`, New chat, recents, cards, composer, plus (named Add), send (named Send), settings (named Settings). Settings and the mobile Sheet trap focus and return it. Contrast on the Decision AA pairs meets AA. Verifies **AC-6**, **AC-7**.
- Brand: search the rendered home for Gemini, Upgrade, Extensions, Public links, Flash, and a mic button. None present. Verifies **AC-8**.
- Tokens: `DESIGN.md` lint and `css-tailwind` export succeed, and `globals.css` has no dark product theme. Verifies **AC-2**.

## Build plan

Skateboard for this feature means one clickable whole at `/`, not tokens in a vacuum and screens later. Each step leaves the app bootable.

1. Init shadcn (`nova`, Base UI, Lucide) with npm. Replace Geist Sans with Plus Jakarta Sans. Retoken `app/globals.css` to the Decision values and delete the scaffold dark block. Add `lib/utils.ts`. Satisfies **AC-2**.
2. Mount a custom `AppShell` on `/`: skip link, sidebar (wordmark, New chat, Recents, settings trigger), main landmark, mobile `Sheet`, metadata title `RepoMind`. No Gemini chrome. Satisfies **AC-1**, **AC-5**, **AC-8**.
3. Build the New chat canvas: greeting, URL card, suggestion cards, pill composer (plus inert, textarea, send). Wire card fill, Enter to send, empty send off, local user bubbles. Satisfies **AC-1**, **AC-4**.
4. Add `lib/placeholder-data.ts` and the designated recent thread: `MessageScroller`, `Message`, `Bubble` for the user, assistant markdown, citation chips, Copy. Satisfies **AC-3**.
5. Build the About dialog (title, body, focus return). Satisfies **AC-6**.
6. Keyboard and motion pass: visible focus, `44px` targets, skip link, reduced motion, AA check on the token pairs. Satisfies **AC-7**.
7. Write `DESIGN.md` from the shipped tokens (create-design-md, repository mode, `css-tailwind`). Lint and export must pass. Satisfies **AC-2**.

## Consequences

**Positive**:
- Slice 1 inherits a real shell. Ask does not invent layout, type, or citation chips.
- Keyboard and contrast are in the foundation, not a cleanup pass.
- shadcn chat primitives already know how to follow a stream, so Slice 1 does not write a stick to bottom hook.

**Negative / tradeoffs**:
- Send is unbound in this foundation. A first visitor can type and see their bubble, then no answer. Recents are still fake. Slice 1 must bind Send on `/` so the core flow is real.
- nova defaults will fight the Gemini look until tokens are overwritten. A half init looks like a different product.
- Plus Jakarta Sans is an approximation of Google Sans, not the licensed face.
- Light only means a system dark preference will still show a white app.

**Neutral**:
- `/` becomes a client heavy shell. `"use client"` will sit on the shell and the thread, not on every leaf if the builder splits them.
- Spec 0002 tables stay unused until Slice 1.
- Later history, uploads, accounts, and the public ask page must read `DESIGN.md` and this shell rather than add a second kit.

## Follow-up

- [ ] `shadcn`, `fixing-accessibility`, `create-design-md`, and `web-design-guidelines` conventions are not yet in root `AGENTS.md` `## Agent skills`. They apply to every UI file and belong at root. `/audit` or `/sync` should list them.
- [ ] Lucide and `react-markdown` skills were not searched. The interview panel was dismissed. Add them later if the build needs stronger conventions.
- [ ] Slice 1 (`Ask a public repo`) binds the URL card to ingest and binds Send on `/` to `POST /api/ask`. It must not add a second route or restyle the thread.
- [ ] Document history replaces placeholder recents with real sources.
- [ ] Dark mode stays out until a later pass. Settings already says so.
- [ ] Do not add Google brand assets or the Gemini wordmark in any later slice.
