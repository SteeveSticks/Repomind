import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ingestJobs } from "@/db/schema";
import { triggerIngestUploadTask } from "@/lib/trigger";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".pdf"]);

function getMimeType(extension: string, providedMime?: string): string {
  switch (extension) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".pdf":
      return "application/pdf";
    default:
      return providedMime || "application/octet-stream";
  }
}

export async function POST(request: NextRequest) {
  try {
    const ingestSecret = process.env.INGEST_SECRET;
    const headerSecret = request.headers.get("x-ingest-secret");

    // In production the secret is mandatory and the header must match it.
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

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart form data.", code: "bad_file" },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "File field 'file' is required in form data.", code: "bad_file" },
        { status: 400 },
      );
    }

    // Size validation
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds maximum allowed size of 10 MB (${file.size} bytes provided).`,
          code: "too_large",
        },
        { status: 413 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty (0 bytes).", code: "empty_file" },
        { status: 400 },
      );
    }

    // Filename and extension validation
    const rawFilename = file.name || "uploaded_document.txt";
    // Sanitize filename to prevent path traversal or special chars
    const sanitizedBase = path.basename(rawFilename).replace(/[^\w\s.-]/gi, "_").trim();
    const filename = sanitizedBase || "document.txt";
    const extension = path.extname(filename).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        {
          error: `Unsupported file extension '${extension}'. Supported formats: .md, .markdown, .txt, .pdf`,
          code: "bad_file_type",
        },
        { status: 422 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Compute SHA-256 hex identity
    const identity = createHash("sha256").update(fileBuffer).digest("hex").toLowerCase();
    const mimeType = getMimeType(extension, file.type);
    const byteSize = fileBuffer.length;

    let rawText: string | null = null;
    let fileData: Buffer | null = null;

    if (extension === ".pdf") {
      fileData = fileBuffer;
    } else {
      try {
        rawText = fileBuffer.toString("utf-8");
      } catch {
        return NextResponse.json(
          { error: "Text file contains invalid UTF-8 encoding.", code: "bad_file_type" },
          { status: 422 },
        );
      }
      if (!rawText.trim()) {
        return NextResponse.json(
          { error: "Uploaded document contains no text.", code: "empty_file" },
          { status: 400 },
        );
      }
    }

    // Stale job reaper (10 minutes)
    await db.execute(sql`
      UPDATE ingest_jobs
      SET status = 'failed',
          finished_at = NOW(),
          error = 'timeout: Job exceeded 10 minute duration limit and was reaped.'
      WHERE (status = 'running' AND started_at < NOW() - INTERVAL '10 minutes')
         OR (status = 'queued' AND created_at < NOW() - INTERVAL '10 minutes')
    `);

    // Check for active job (one job at a time invariant)
    const activeJobs = await db.execute(sql`
      SELECT id, status
      FROM ingest_jobs
      WHERE status IN ('queued', 'running')
      LIMIT 1
    `);

    if (activeJobs.rows.length > 0) {
      return NextResponse.json(
        {
          error: "An ingest job is currently in progress. Only one source can be indexed at a time.",
          code: "active_job_running",
        },
        { status: 409 },
      );
    }

    // Upsert source
    const sourceResult = await db.execute(sql`
      INSERT INTO sources (id, kind, identity, origin_url, created_at, updated_at)
      VALUES (gen_random_uuid(), 'upload', ${identity}, ${filename}, NOW(), NOW())
      ON CONFLICT (kind, identity) DO UPDATE
      SET updated_at = NOW(), origin_url = ${filename}
      RETURNING id
    `);

    const sourceId = (sourceResult.rows[0] as { id: string }).id;

    // Upsert source_files
    await db.execute(sql`
      INSERT INTO source_files (id, source_id, filename, mime_type, byte_size, raw_text, file_data, created_at)
      VALUES (gen_random_uuid(), ${sourceId}, ${filename}, ${mimeType}, ${byteSize}, ${rawText}, ${fileData}, NOW())
      ON CONFLICT (source_id) DO UPDATE
      SET filename = ${filename},
          mime_type = ${mimeType},
          byte_size = ${byteSize},
          raw_text = ${rawText},
          file_data = ${fileData},
          created_at = NOW()
    `);

    // Insert new queued job
    const [newJob] = await db
      .insert(ingestJobs)
      .values({
        kind: "upload",
        sourceId,
        status: "queued",
      })
      .returning({ id: ingestJobs.id, status: ingestJobs.status });

    // Trigger ingest-upload worker
    try {
      await triggerIngestUploadTask(newJob.id);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to trigger background upload ingest task.";
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
      {
        jobId: newJob.id,
        sourceId,
        status: newJob.status,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
