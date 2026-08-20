import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.execute(sql`
      SELECT s.id, s.identity, s.origin_url AS "originUrl", s.created_at AS "createdAt",
             j.status AS "latestJobStatus"
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT status
        FROM ingest_jobs
        WHERE source_id = s.id
        ORDER BY created_at DESC
        LIMIT 1
      ) j ON true
      ORDER BY s.updated_at DESC
    `);

    return NextResponse.json({ sources: result.rows }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to load sources.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
