import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestJobs } from "@/db/schema";
import { parseAndValidateGitHubUrl } from "@/lib/github";
import { triggerIngestTask } from "@/lib/trigger";

export async function POST(request: NextRequest) {
  try {
    const ingestSecret = process.env.INGEST_SECRET;
    const headerSecret = request.headers.get("x-ingest-secret");

    // In production the secret is mandatory and the header must match it.
    // Without the secret the endpoint would be open to anyone.
    if (process.env.NODE_ENV === "production") {
      if (!ingestSecret) {
        return NextResponse.json(
          { error: "Server misconfigured: INGEST_SECRET is not set." },
          { status: 500 },
        );
      }
      if (headerSecret !== ingestSecret) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid or missing ingest secret." },
          { status: 401 },
        );
      }
    } else if (ingestSecret && headerSecret !== ingestSecret) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing ingest secret." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.repoUrl !== "string") {
      return NextResponse.json(
        { error: "Invalid request payload. repoUrl string is required." },
        { status: 400 },
      );
    }

    let repoInfo;
    try {
      repoInfo = parseAndValidateGitHubUrl(body.repoUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid repository URL.";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    // Run 10 minute stale job reaper
    await db.execute(sql`
      UPDATE ingest_jobs
      SET status = 'failed',
          finished_at = NOW(),
          error = 'timeout: Job exceeded 10 minute duration limit and was reaped.'
      WHERE (status = 'running' AND started_at < NOW() - INTERVAL '10 minutes')
         OR (status = 'queued' AND created_at < NOW() - INTERVAL '10 minutes')
    `);

    // Check for active job (enforce partial unique index guarantee)
    const activeJobs = await db.execute(sql`
      SELECT id, repo_url, status
      FROM ingest_jobs
      WHERE status IN ('queued', 'running')
      LIMIT 1
    `);

    if (activeJobs.rows.length > 0) {
      return NextResponse.json(
        {
          error:
            "An ingest job is currently in progress. Only one repository can be indexed at a time.",
        },
        { status: 409 },
      );
    }

    // Insert new queued job
    const [newJob] = await db
      .insert(ingestJobs)
      .values({
        repoUrl: repoInfo.canonicalUrl,
        status: "queued",
      })
      .returning({ id: ingestJobs.id, status: ingestJobs.status });

    // Trigger ingest worker
    try {
      await triggerIngestTask(newJob.id);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to start ingest worker.";
      await db
        .update(ingestJobs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: `trigger_failed: ${errorMsg}`,
        })
        .where(eq(ingestJobs.id, newJob.id));
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    return NextResponse.json(
      { jobId: newJob.id, status: newJob.status },
      { status: 201 },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
