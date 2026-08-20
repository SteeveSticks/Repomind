# 0004. Ask a public repo (Rationale)

**Date**: 2026-08-17

## Context

RepoMind aims to allow developers and users to explore unfamiliar public GitHub codebases through plain English questions with verifiable source citations. Up to this point, the foundation layers have defined the architectural stack (spec 0001), the Postgres relational and vector schema (spec 0002), and the light design system with chat chrome (spec 0003).

Slice 1 represents the first end to end functional milestone of RepoMind (the skateboard). It must bridge the interactive UI with the background indexing pipeline and question answering flow. Without this feature, the application remains a visual mock without working data or AI capabilities.

Key forces influencing this design include:
- Operational simplicity and cost: Indexing large repositories requires downloading snapshots, chunking code files, and generating embeddings without exceeding serverless execution limits or incurring cloud infrastructure bills.
- Grounding integrity: Answers must be strictly grounded in the retrieved code chunks, providing accurate file and line citations so users can immediately verify claims against the real repository on GitHub.
- Security and quota protection: Public deployment on Vercel requires guarding the ingest entry point with a secret while allowing open, rate limited asking from any browser.

## Options considered

### Option 1: Trigger.dev background task for Python ingest with Next.js route polling and Vercel AI SDK streaming (Chosen)

In this approach, Next.js handles user interactions and creates an initial job record in Postgres before dispatching the `ingest-repo` task to Trigger.dev. The Python worker downloads the GitHub snapshot, chunks the files, computes Voyage embeddings, and writes to Postgres with psycopg 3. The client polls the job status via `GET /api/ingest/[id]`. Once indexed, questions are handled directly by Next.js route handler `POST /api/ask`, which computes query embeddings, queries pgvector for the top 8 nearest chunks, and streams answers using the Vercel AI SDK with citation data parts.

**Pros**:
- Decouples long running ingest workloads from Next.js serverless execution constraints.
- Reuses the existing Postgres database and pgvector extension for unified data storage.
- Real time streaming with native citation data parts in the Vercel AI SDK provides a smooth chat experience.
- Deep links to GitHub blob URLs give instant verification without building complex internal code viewer components.

**Cons**:
- Requires Trigger.dev worker setup and environment configuration.
- Client polling introduces minor HTTP overhead compared to WebSockets.

### Option 2: Synchronous Next.js Server Actions with child process execution

In this approach, Next.js executes the Python ingest script directly as a child process during a Server Action or route handler invocation.

**Pros**:
- Avoids background task runner configuration.
- Simpler local development setup.

**Cons**:
- Fails completely on serverless hosts like Vercel due to strict function timeout limits (15 to 60 seconds).
- Consumes heavy memory and CPU within the web server process during zip unpacking and embedding generation.
- Cannot reliably recover from interrupted or dropped connections.

### Option 3: Separate standalone FastAPI microservice

In this approach, the Python ingest and asking capabilities are packaged into a standalone FastAPI microservice deployed on a dedicated container host (such as Railway or Render).

**Pros**:
- Consolidates all AI and ingestion logic in Python.
- Keeps Next.js strictly as a frontend presentation layer.

**Cons**:
- Adds a second service to deploy, monitor, and maintain.
- Increases operational complexity and hosting costs for a small prototype application.
- Splitting database access across multiple services complicates migrations and local development orchestration.

## Rationale

Option 1 is selected because it strictly honors the architectural decisions established in spec 0001 while delivering the thinnest usable whole. Using Trigger.dev offloads the heavy, time consuming repository download and embedding pipeline to a resilient worker runtime that operates cleanly in both local and deployed environments.

Client polling against Postgres job status keeps the interface simple and eliminates the operational overhead of persistent WebSocket servers. Performing vector retrieval and streaming directly in Next.js via `@ai-sdk/groq` or local Ollama minimizes latency for chat responses while keeping costs at zero.

## References

None. (Keep it clean per engineer preference).
