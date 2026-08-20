# 0001. Stack and architecture: rationale

## Context

> ⚠️ Premise note: You want a long ingest (download, split, embed) and you also want Vercel because Fly.io is not free. Vercel functions are a poor home for that work: short timeouts, no lasting disk, no Python poller. Trigger.dev is the escape hatch, not a proof that "everything runs on Vercel." If that job runner's free tier or Python support goes away, deployed ingest dies. The honest framing is UI on a free Next.js host, long work on a job runner, data on hosted Postgres.

> ⚠️ Premise note: Local chat is Ollama and deployed chat is Groq. Answers will not match. That is the cost of a free laptop model plus a free hosted API. Keep prompts provider agnostic and treat quality gaps as expected.

> ⚠️ Premise note: A skateboard is supposed to be the thinnest usable whole. Python plus Trigger.dev plus Neon plus Voyage plus two chat providers is a lot of moving parts. You chose each piece for a real constraint (Python ingest, free host, free chat, hosted vectors that match on laptop and Vercel). Know that a TypeScript only file database would have shipped sooner.

RepoMind's first useful loop is: paste a public GitHub URL, wait until the tree is indexed, ask a question, and get an answer you can check against a file and a line. You will run that loop on a Windows laptop. You also want a URL other people can open. A Next.js 16 App Router scaffold already lives in `app/` with React 19, Tailwind 4, and TypeScript. Root `AGENTS.md` is still only the Next.js boilerplate block. There is no product screen, no database, and no worker.

The hard forces are not framework fashion. They are time, disk, and money. Cloning and embedding a repo takes minutes and temporary files. A Vercel request cannot honestly do that. A second repository for Python would split the skateboard. A paid always on host would solve disk and time, and you rejected that bill. Embeddings must be the same model in the worker and in Next.js, or search is wrong. Chat on the laptop can be local. Chat on a public URL needs an API with a real free tier.

Not deciding this leaves `/develop` to invent a clone path, a vector store, a model vendor, and a host. Those choices fight each other if made one file at a time. Auth, accounts, billing, error monitoring, and a marketing site are later slices. They must not sneak into this foundation, but the foundation must not block them.

## Options considered

### Option 1: Next.js on Vercel, Python ingest on Trigger.dev, Neon plus pgvector, Voyage, Ollama / Groq

The existing Next.js app stays the UI and the ask path. `ingest/` in this same tree owns download, chunk, embed, and writes. Trigger.dev runs that Python task locally and in production. Postgres (Compose on the laptop, Neon in production) holds records and vectors. Voyage embeds both chunks and questions. Ollama answers locally. Groq answers on Vercel.

**Pros**:
- Matches every constraint you stated: one tree, Python ingest, free Next.js host, free chat API, shared embeddings, job status you can poll.
- Does not throw away the scaffold.

**Cons**:
- Most moving parts of the four options. Trigger.dev becomes load bearing. Voyage is a bill. Two chat providers drift.

### Option 2: TypeScript only on Vercel, jobs in JS, Neon plus pgvector

Drop Python. Ingest is a Trigger.dev or Inngest TypeScript task. One language, one lockfile, one deploy mental model.

**Pros**:
- Simpler operations. Better fit for a Vercel first host. Faster for one person to keep in their head.

**Cons**:
- You explicitly wanted Python ingest in this tree. This option ignores that. RAG libraries in JS are thinner than the Python ones you were reaching for.

### Option 3: Next.js plus Python on a long running host (Fly.io, Railway, or Render) with a volume

One Docker image or two processes on a VM. The worker polls Postgres. Disk is real. No Trigger.dev. Ollama could even run beside the app if the box is big enough.

**Pros**:
- Honest home for clone and embed. Fewer vendors. Simpler failure story (the box is up or it is not).

**Cons**:
- You rejected Fly.io on cost. The other hosts are also not free once the trial ends. You still operate a machine.

### Option 4: Local first file database, deploy later

SQLite or sqlite-vec on disk. Ollama only. No Neon, no Trigger.dev, no Groq. The thinnest skateboard. Vercel comes when you are ready to pay for a host that fits.

**Pros**:
- Fastest path to a working laptop demo. Almost no vendor accounts.

**Cons**:
- Other people cannot try the loop on a URL. Conflicts with the scope line that you want to deploy. sqlite-vec is still pre v1.

## Rationale

Cost and the existing UI decided the host: Vercel stays, Fly.io goes. That single choice forbids running ingest inside the web process (basis: serverless for stateful workloads). A job runner with a Python runtime is the least bad way to keep Python and still publish a Next.js URL. Trigger.dev locally and in production is one path, so you do not maintain a laptop poller and a cloud poller (basis: one ingest path).

Postgres from day one, on Compose and on Neon, is heavier than SQLite. You picked it anyway so chats, jobs, and vectors share one engine you will already need when accounts arrive (basis: a relational database is the right default). pgvector in that same database avoids a second index to back up.

Python owns the full pipeline because a fetch only worker would not justify a second language. Next.js owns ask because the UI and the AI SDK already live there, and streaming from Python would add a second HTTP stack. Voyage for both embed calls is what makes that split safe: the question vector and the chunk vectors are the same model, even though two languages produce them.

GitHub's tarball (archive) API is enough for a snapshot. You do not need history to cite a file and a line (basis: GitHub archive API, landscape check). A custom line window keeps citation metadata honest without LangChain.

Groq replaces SpaceXAI on Vercel because you asked for a completely free chat tier. Groq's free plan is rate limited and does not require a card (basis: Groq rate limits, landscape check). The project AI default remains SpaceXAI; this spec records an override, not a new global rule. Ollama stays on the laptop so you can work offline once the model is pulled.

Shared secret on ingest and open ask is the smallest gate before accounts. Open ingest on a free Voyage plus Trigger.dev account would be an abuse magnet. Open ask still lets a visitor feel the product (basis: least privilege until Slice 4).

One job, a 50 MB cap, a 10 minute timeout, and wiping partial chunks are how a free tier survives a huge public repo. Those limits are product, not implementation trivia.

## References

**Project sources** (verifiable, in this repo):
- `docs/scope/scope.md`, feature 1 Stack and architecture, and the Skateboard / Beta header
- `package.json` and `app/`: Next.js 16.3, React 19, Tailwind 4, TypeScript scaffold
- Root `AGENTS.md`: Next.js boilerplate only, no stack conventions yet
- Installed (or installing) skills: `vercel/ai`, `triggerdotdev/skills`, `neondatabase/agent-skills`, `vercel-labs/agent-skills`

**Practices & standards**:
- Serverless for stateful workloads (long ingest does not belong in a request function)
- Relational database as the default store
- Monolith first (one repo, two runtimes, not two products)
- Same embedding model on write and on query
- Least privilege until accounts exist (secret on write, open on read)
- Skateboard: thinnest usable whole, then grow (here stretched by your constraints)

**Links** (web verified during the 2026-08-13 landscape and tool discovery checks):
- GitHub repository contents and archive API: https://docs.github.com/en/rest/repos/contents
- Vercel AI SDK providers index: https://ai-sdk.dev/providers/ai-sdk-providers
- Vercel AI SDK Voyage provider: https://ai-sdk.dev/providers/ai-sdk-providers/voyage
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Groq plus Vercel AI SDK: https://console.groq.com/docs/ai-sdk/
- Trigger.dev: https://trigger.dev/
- Neon MCP (connect in your client): https://mcp.neon.tech/sse
- Vercel MCP (connect in your client): https://mcp.vercel.com

## Landscape notes (2026-08-13)

Compact facts the stack walk used. Not a second decision.

**Repo fetch.** GitHub tarball or zipball is the practical MVP. `isomorphic-git` writes a real `.git` and is slower for snapshot only. `simple-git` needs a system git, which Vercel functions do not have. The Contents API is capped per directory and is the wrong whole repo tool.

**Vectors.** sqlite-vec and LanceDB are the zero ops local options. pgvector wins once you already want Postgres. Pinecone has no laptop file parity. Chroma and Qdrant are extra processes.

**Chat and embed.** `@ai-sdk/xai` is current for SpaceXAI chat. xAI has no first class DIY embed path for your own pgvector index (Collections is a managed side door). Voyage and OpenAI are the hosted embed options. Groq remains a no card, rate limited chat API as of this check. Gemini Flash still has a free tier with daily caps; Pro is paid.

**Host.** Vercel is fine for Q and A streams and bad for multi minute clone plus embed. A long running VM or a job runner is required for ingest. Inngest and Trigger.dev are the two Next.js friendly job products that were checked; you picked Trigger.dev because it has a Python runtime.

**Chunking.** No citation native npm or PyPI winner. Custom line windows, or a splitter plus metadata you still write yourself.
