# 0003. Design system and UI foundation: rationale

## Context

> ⚠️ Premise note: The reference is Google Gemini. Shipping their wordmark, sparkle, or product chrome would make RepoMind look like a clone and would use marks we do not own. The right framing is the layout language (sidebar, empty greeting, right aligned user bubble, pill composer), with a RepoMind wordmark and no Gemini product screens.

> ⚠️ Premise note: `/` is the whole product surface (sidebar plus chat). Send is the ask action. This foundation still cannot call `/api/ask` because that route is Slice 1. The risk is a visitor thinks the unbound Send already answers. Slice 1 must bind Send on this same composer. Do not add a second chat page.

RepoMind's home is still the create-next-app page. Ingest, chat, and citations have a data model (spec 0002) and a stack (spec 0001: Next.js 16, React 19, Tailwind 4) but no shared look. Feature 4 in the scope exists so those surfaces feel like one tool, and so keyboard use and contrast are decided before Ask is built.

Two visual sources were given. The Figma file is the Gemini Material 3 kit: lilac frames, a rail, suggestion cards, a purple banner, Extensions, Public links, Settings. The third screenshot is the live Gemini web app: white canvas, recents list, user bubble on the right, long form markdown on the left, pill composer. Those are not the same product chrome. `/develop` cannot guess which one wins.

Not deciding this leaves Slice 1 to invent type, color, the sidebar, and how a citation looks. History and the public ask page would then fork a second language. The create-next-app dark preference would also fight a Gemini like light canvas.

English only is enough. Accounts, billing, and a marketing site are later. This feature must not wait on them.

## Options considered

### Option 1: Blend kit chrome with live chat, shadcn nova on Base UI, custom AppShell

Kit for the shell (sidebar, greeting, cards). Live screenshot for the thread and composer. Tokens in `globals.css`. shadcn `nova` on Base UI, then overwrite colors. Custom AppShell. shadcn chat primitives. Light only. Drop Gemini product chrome.

**Pros**:
- Matches how the two image sets were described.
- Slice 1 inherits scroll, bubbles, and overlay a11y instead of hand rolling them.
- One clickable whole, which is the skateboard for this row.

**Cons**:
- nova must be retokened or the app looks like a different kit.
- The home page lies a little: Send does not answer.

### Option 2: Tokens and DESIGN.md only

Record the language. Leave screens to Ask a public repo.

**Pros**:
- Smallest diff. No fake recents.

**Cons**:
- Slice 1 then designs the shell under time pressure. The scope Done when wants working components, not a stylesheet.

### Option 3: Faithful Figma kit, including product screens

Build Public links, Extensions, the purple banner, and the kit's existing chat (avatars, left aligned thread).

**Pros**:
- Closest to the linked file as a whole.

**Cons**:
- Those screens are Google product, not RepoMind. The live chat shot you marked as the thread would be ignored. More surface than a skateboard.

### Option 4: Raw Tailwind, no shadcn

Hand write every control.

**Pros**:
- No CLI, no nova defaults to fight.

**Cons**:
- Dialog focus, the mobile overlay, and stick to bottom get rewritten in Slice 1. The installed shadcn skill already forbids hand rolled bubbles.

## Rationale

The forces in Context are a missing visual language, two different references, a skateboard that wants a usable whole, and a later ask feature that will stream into this shell.

Option 2 fails the scope Done when (components that work from the keyboard). Option 3 builds the wrong product and contradicts the live chat shot. Option 4 spends the foundation on primitives shadcn already ships, including the chat set the skill says to use.

Option 1 is the only mix that honors both image sets and still fits the thinnest whole. Base UI is the current shadcn direction, so a greenfield init should not start on Radix and migrate. `nova` is the current Next.js default; the look comes from our tokens, not from the preset name. A custom AppShell matches the recents list in the live shot. The dense shadcn Sidebar is a dashboard rail, which is the kit's secondary chrome, not the chat home.

Light only follows the screenshots and keeps contrast work in one theme. Dark stays a Settings sentence so a later pass has a home.

The facade cost is real. It is accepted because the next scope row is Ask a public repo, which exists to replace the lie with a stream.

After the first local send on New chat, the greeting and starter cards hide so the canvas becomes the thread. Hide is derived from `view` plus a non empty local list, not a second flag. A visually hidden `Hello` heading stays so the main landmark keeps a name. New chat restores the empty canvas and may leave the composer draft. A recent that does not open a thread does not reset that canvas. An earlier draft kept the greeting visible; AC-4 now records the hide.
