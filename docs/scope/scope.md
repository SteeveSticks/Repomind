# Scope: RepoMind

RepoMind helps you open an unfamiliar GitHub repository or a pile of docs and ask questions in plain language. Answers come back with the exact source file and line, so you can check the claim. You will run it locally first, and you also want to deploy it so other people can try the same loop.

**Build approach:** Skateboard (ship the thinnest usable whole first, then grow it).
**Workflow:** Beta (after `/develop`, `/check verify` then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | App scaffold | Foundation | existing |
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Design system & UI foundation | Foundation | done |
| 5 | Ask a public repo | Slice 1 | done |
| 6 | Document history | Slice 2 | planned |
| 7 | Upload markdown and PDF | Slice 3 | planned |
| 8 | Sign in and accounts | Slice 4 | planned |
| 9 | Public ask page | Slice 5 | in-progress |
| 10 | Usage metering | Slice 6 | planned |

## Foundations

### A. App scaffold · existing
Starter from create-next-app: App Router UI, Tailwind, TypeScript, and the default home page. No product screens yet. code in `app/`

### 1. Stack & architecture · done
You pick how the app will clone a public repo, chunk and embed it, store the index, and stream an answer, in a way you can run locally and deploy for others to try. A UI scaffold already lives in `app/`; this is the rest of the stack, not a new frontend from zero.
**Done when:** the stack is recorded in a spec, and an empty app boots locally and can be deployed as a web app.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `ingest/`, `docker-compose.yml`, `db/`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Verify it: `/check verify stack & architecture`
- [x] Test it: `/test stack & architecture`

### 2. Coding standards & tooling · done
You capture conventions from the real scaffold, then put lint, format, and pre-commit checks in place. Root `AGENTS.md` today is only Next.js boilerplate, so this pass should write the real project context.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and pre-commit run clean.
code in `.pre-commit-config.yaml`, `eslint.config.mjs`, `ingest/pyproject.toml`, `package.json`
- [x] Capture conventions + tooling choices: `/audit`
- [x] Build it: `/develop coding standards & tooling`
  - [x] Install Ruff in ingest and add its config
  - [x] Confirm ESLint still runs on the app
  - [x] Add the pre-commit config for Ruff and ESLint
  - [x] Run lint, format, and pre-commit until they are clean
- [x] Verify it: `/check verify coding standards & tooling` · skipped
- [x] Test it: `/test coding standards & tooling` · skipped`

### 3. Data model · done
The few records Slice 1 needs: one source (a public repo), chunks that know their file and line, a chat, messages, and citations. Later slices grow this for history, uploads, and accounts.
**Done when:** those records support cited chat now, and history, uploads, and accounts can land later without a breaking rewrite.
spec [0002](../specs/0002-data-model/index.md) · code in `db/`, `drizzle.config.ts`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Schema, checks, indexes, and `drizzle.config.ts` (AC-1, AC-2, AC-4, AC-5, AC-6, AC-7)
  - [x] Generate and apply one migration on Compose (AC-1)
  - [x] Worker name contract and live constraint checks (AC-1 through AC-7)
- [x] Verify it: `/check verify data model`
- [x] Test it: `/test data model`

### 4. Design system & UI foundation · done
Visual language, layout primitives, and base components so ingest, chat, and citations feel like one tool. Keyboard use and contrast matter; English only is enough.
**Done when:** type, color, spacing, and base components are recorded, and those components work from the keyboard with readable contrast.
spec [0003](../specs/0003-design-system-ui/index.md) · code in `app/`, `components/`, `lib/placeholder-data.ts`, `DESIGN.md`
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Tokens and shadcn init (AC-2)
  - [x] AppShell, empty New chat, composer (AC-1, AC-4, AC-5, AC-8)
  - [x] Placeholder thread, citation chips, Copy (AC-3)
  - [x] Settings, keyboard pass, DESIGN.md (AC-2, AC-6, AC-7)
- [x] Verify it: `/check verify design system & UI foundation` · skipped
- [x] Test it: `/test design system & UI foundation` · skipped

## Slice 1: Smallest usable whole

### 5. Ask a public repo · done
The skateboard. You paste a public GitHub URL, wait until it is indexed, ask a question, and get a streamed answer with file and line citations you can open.
**Done when:** you can paste a public repo URL, wait until indexing finishes (including a visible empty or failed ingest), ask a question about that repo, see a streamed answer, and open a cited file and line in the browser.
spec [0004](../specs/0004-ask-public-repo/index.md) · code in `app/api/`, `components/chat/`, `ingest/`
- [x] Design it (spec): `/architect ask a public repo`
- [x] Build it: `/develop ask a public repo`
  - [x] Python ingest worker pipeline in Trigger.dev (AC-1, AC-2, AC-8)
  - [x] Ingest and status route handlers with reaper (AC-1, AC-2, AC-8)
  - [x] Ask route handler, Voyage embedding, and AI SDK streaming (AC-4, AC-5, AC-6, AC-7)
  - [x] UI ingest card workflow and status polling (AC-1, AC-2, AC-3, AC-8)
  - [x] UI chat stream, citation chips, and retry controls (AC-4, AC-5, AC-6, AC-8)
- [ ] Verify it: `/check verify ask a public repo` · skipped
- [ ] Test it: `/test ask a public repo` · skipped

## Slice 2: Switch sources

### 6. Document history · needs a decision
A sidebar of past indexed sources so you can work on a second repo without losing the first, including its chat.
**Done when:** you can leave one indexed repo, open another, and come back to the first with its chat still there.
- [ ] Design it (spec): `/architect document history`

## Slice 3: Docs, not only GitHub

### 7. Upload markdown and PDF · needs a decision
Another way in, so API docs and writeups work when there is no GitHub repo to clone.
**Done when:** you can drop a markdown or PDF file, it indexes, and you can ask it with the same cited chat as a repo.
- [ ] Design it (spec): `/architect upload markdown and PDF`

## Slice 4: A person to attach work to

### 8. Sign in and accounts · needs a decision · GA
A person can sign in so a deployed app, a public ask page, and later billing have someone to attach indexes and usage to.
**Done when:** you can create an account, sign in, sign out, and your indexes stay tied to you.
- [ ] Design it (spec): `/architect sign in and accounts`

## Slice 5: Other people can ask

### 9. Public ask page · in-progress
A shareable page where anyone with the link can ask an indexed repo without installing the app. This is how you let people experience RepoMind after you deploy.
**Done when:** you can publish an indexed repo to a URL, and a visitor can ask it and see citations without creating an account.
spec [0005](../specs/0005-public-ask-page/index.md)
- [x] Design it (spec): `/architect public ask page`
- [ ] Build it: `/develop public ask page`
  - [ ] Migration plus shared ask core (AC-1, AC-3, AC-4, AC-5, AC-6)
  - [ ] Publish and revoke handlers (AC-1, AC-5, AC-7)
  - [ ] Public ask route (AC-3, AC-4, AC-7)
  - [ ] Public page at /ask/[slug] (AC-2, AC-7)
  - [ ] App publish control (AC-1, AC-5)
- [ ] Verify it: `/check verify public ask page`
- [ ] Test it: `/test public ask page`

## Slice 6: Numbers for a later plan

### 10. Usage metering · needs a decision
Count indexes or questions per account so a paid plan has a number to hang a cap on. No checkout in this slice.
**Done when:** each account has a visible count of indexes and questions, ready for a plan to cap later.
- [ ] Design it (spec): `/architect usage metering`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Marketing site and SEO**: public pages, metadata, sitemap for the future paid product · needs a decision
- **Product analytics**: know which questions and features get used · needs a decision
- **Error monitoring**: crash and failed ingest reports once more than you run it · needs a decision
- **Privacy and terms**: cookie notice, privacy policy, and terms when you host accounts · needs a decision · GA
- **Billing and plans**: free tier plus a paid plan, since you want a subscription later · needs a decision · GA
- **Dark mode**: light only shipped in spec 0003. Settings already says it comes later · from spec 0003

## Legend

**The decision box.** Every feature carries exactly one, the sub-task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
