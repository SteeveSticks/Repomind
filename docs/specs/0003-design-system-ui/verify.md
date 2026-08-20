# Verify: Design system and UI foundation · spec 0003 · updated 2026-08-17
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Dev server: `npm run dev`. Visit `http://localhost:3000`. Light theme only. No login.

## UI / manual
- [ ] Open `/` → sidebar shows RepoMind, New chat, Recents (`vercel/next.js`, `facebook/react`, `openai/whisper`), and a settings control. Main shows greeting, Paste a GitHub URL card, at least three suggestion cards, pill composer. No Gemini, Upgrade, Extensions, Public links, model picker, or mic. → **AC-1**, **AC-8**
- [ ] Click a suggestion card → composer contains that prompt and is focused. Composer placeholder when empty is `Ask a question`. Plus does not open a picker. Plus accessible name is Add. Send accessible name is Send. → **AC-4**
- [ ] Clear the composer → Send is not activatable. Type a word, press Enter → a right aligned muted user bubble appears. No new assistant row. Greeting, URL card, and suggestion cards hide. Shift+Enter inserts a newline. → **AC-4**
- [ ] Click New chat → empty canvas returns (greeting, URL card, suggestion cards). Local bubbles are gone. → **AC-1**, **AC-4**
- [ ] Click `vercel/next.js` → user bubble on the right, assistant markdown with a heading and a list, citation chips, Copy. Other recents do not open a thread. → **AC-3**
- [ ] Activate a citation chip → a new tab opens `https://github.com/vercel/next.js/blob/canary/README.md` (or the row's href). → **AC-3**
- [ ] Click Copy → clipboard holds the assistant markdown. Button reads Copied, then Copy. → **AC-3**
- [ ] Open Settings → dialog title About, body names RepoMind and says dark mode comes later. Gear name is Settings. Escape and close return focus to the gear. → **AC-6**
- [ ] Set the viewport under `768px` → sidebar hidden, menu button named Open menu, composer still at the bottom. Open the menu → visible title Menu. Backdrop click or Escape closes it and returns focus to the menu button. At `768px` and up the sidebar stays visible. → **AC-5**
- [ ] ~~Keyboard from load → first Tab is `Skip to chat` and moves focus to `#main-canvas`. Tab order reaches New chat, recents, cards, composer, plus, send, settings. Focus ring is `2px` `ring` with `2px` offset.~~ → **AC-7** skipped
- [ ] ~~OS or browser "reduce motion" → sheet and hover motion do not run a large animation.~~ → **AC-7** skipped

## Commands
- [ ] `npm run dev` then open `/` → HTTP 200, no overlay error. → **AC-1**
- [ ] `npm run build` → exits 0. → **AC-1**
- [ ] `npm run lint` → exits 0. → **AC-2**
- [ ] Read `app/globals.css` → product tokens match spec 0003 Decision hex values. No `@media (prefers-color-scheme: dark)` product override. Plus Jakarta Sans is the sans face. → **AC-2**
- [ ] `npx @google/design.md lint DESIGN.md` → exits 0. → **AC-2**
- [ ] `npx @google/design.md export --format css-tailwind DESIGN.md` → emits `--color-*`, `--font-*`, `--radius-*`. Do not keep the export file. → **AC-2**
- [ ] Search rendered `/` and `app/` source for `Gemini`, `Upgrade`, `Extensions`, `Public links`, `Flash` as visible copy → no hits in the UI. → **AC-8**

## Acceptance-criteria coverage
- **AC-1**: UI open `/` plus New chat reset
- **AC-2**: `globals.css` read, `DESIGN.md` lint and export, lint command
- **AC-3**: designated recent, citation tab, Copy
- **AC-4**: card fill, empty send, Enter send, greeting and starter cards hide, New chat restores empty canvas
- **AC-5**: narrow viewport overlay
- **AC-6**: About dialog focus
- **AC-7**: skipped (skip link, tab order, reduced motion)
- **AC-8**: brand search on `/` and source

## Value sourcing
- [ ] Wordmark and document title are `RepoMind`, not from an env var. Wordmark comes from `lib/placeholder-data.ts`. → **AC-1**, **AC-8**
- [ ] Greeting, URL card copy, suggestion prompts, recents labels, composer placeholder, skip link, menu, settings, send, plus, sheet title, and Copy name come from `lib/placeholder-data.ts`. → **AC-1**
- [ ] Canned user text, assistant markdown, and chip labels come from that module. Chip href defaults to the Decision sample blob URL. → **AC-3**
- [ ] Send bubble text is the composer input. Bubble id is created in the client. → **AC-4**
- [ ] Copy payload is the canned assistant markdown string. → **AC-3**
- [ ] Surfaces use the Decision hex tokens in `app/globals.css`. → **AC-2**
- [ ] Settings copy is About / RepoMind / Dark mode comes later, decided in spec 0003. → **AC-6**

## Appended 2026-08-15 · /develop

_Steps added after the build. The checks above stay the source list._

### UI / manual
- [ ] Deny clipboard permission, then activate Copy → the visible label stays Copy. → **AC-3**
- [ ] After a local send on New chat, the greeting `Hello` / `How can I help you today?` is not visible. The user bubble sits above the composer with no starter cards. A visually hidden `h1` named `Hello` remains. Suggestion cards are not in the tab order. → **AC-4**
- [ ] Open a citation chip and read `rel` on the link → `noopener noreferrer` is present. → **AC-3**

### Value sourcing
- [ ] A sent bubble's text matches the composer input, not a canned string. The row id is created in the client (`crypto.randomUUID()`). → **AC-4**
- [ ] ~~Skip target is `id="main-canvas"` on the main landmark.~~ → **AC-7** skipped
- [ ] Plus tooltip text is `Uploads come later` from `lib/placeholder-data.ts`. → **AC-4**

## Appended 2026-08-16 · fix-spec

_Steps from `fix-spec.md`. Check these after the original AC list._

### UI / manual
- [ ] Desktop sidebar is 240px. The top toggle collapses it to 72px with a width slide, then expands it again. Recents hide while collapsed. Reduce motion turns the slide off. → fix-spec issue 1
- [ ] Open `vercel/next.js`. Thread and composer sit in a 48rem column with extra horizontal padding from `md` up. Messages do not hug the sidebar edge. → fix-spec issue 2
- [ ] The citation `README.md:1` is an underlined text link, not a filled pill. Tab focus still shows the 2px ring. → fix-spec issue 3
- [ ] Copy puts plain text on the clipboard (`App Router pages` then numbered lines, no `##` or backticks). Hover on Copy changes text intensity only, no muted background rectangle. → fix-spec issue 4
- [ ] Type in the composer. The Send disc is accent violet and the arrow is white. Empty Send keeps a muted arrow. → fix-spec issue 5
- [ ] Paste a long prompt so the field grows past one line. The composer uses `rounded-lg`, not a full pill, plus and Send stay on the bottom edge, and the field scrolls inside `max-h-40`. → fix-spec issue 6
