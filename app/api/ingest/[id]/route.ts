import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestJobs } from "@/db/schema";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return NextResponse.json(
        { error: "Job ID is required." },
        { status: 400 },
      );
    }

    const [job] = await db
      .select({
        id: ingestJobs.id,
        repoUrl: ingestJobs.repoUrl,
        status: ingestJobs.status,
        error: ingestJobs.error,
        sourceId: ingestJobs.sourceId,
      })
      .from(ingestJobs)
      .where(eq(ingestJobs.id, id))
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { error: "Ingest job not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(job, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
