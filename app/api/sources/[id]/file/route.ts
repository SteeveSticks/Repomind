import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await props.params;

    if (!id) {
      return NextResponse.json(
        { error: "Source ID is required." },
        { status: 400 },
      );
    }

// Query source and associated source_files
    const result = await db.execute(sql`
      SELECT s.id AS "sourceId", s.kind, s.identity, s.origin_url AS "originUrl",
             f.id AS "fileId", f.filename, f.mime_type AS "mimeType", f.byte_size AS "byteSize",
             f.raw_text AS "rawText", f.file_data AS "fileData", f.created_at AS "createdAt"
      FROM sources s
      LEFT JOIN source_files f ON f.source_id = s.id
      WHERE s.id = ${id}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Source not found." },
        { status: 404 },
      );
    }

    const row = result.rows[0] as {
      sourceId: string;
      kind: string;
      identity: string;
      originUrl: string;
      fileId: string | null;
      filename: string | null;
      mimeType: string | null;
      byteSize: number | null;
      rawText: string | null;
      fileData: Buffer | string | null;
      createdAt: string | null;
    };

    if (!row.fileId && row.kind !== "upload") {
      return NextResponse.json(
        { error: "Source is not an uploaded document." },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const isRaw = url.searchParams.get("raw") === "1" || url.searchParams.get("download") === "1";

    const filename = row.filename || row.originUrl || "document";
    const mimeType = row.mimeType || (filename.endsWith(".pdf") ? "application/pdf" : "text/plain");
    const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

    // Return binary stream if requested
    if (isRaw && row.fileData) {
      const buffer = typeof row.fileData === "string" ? Buffer.from(row.fileData, "hex") : Buffer.from(row.fileData);
      return new Response(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
          "Content-Length": String(buffer.length),
        },
      });
    }

// Fetch chunk snippets for this source to assist PDF viewer and text viewer
    const chunksResult = await db.execute(sql`
      SELECT path, start_line AS "startLine", end_line AS "endLine", text
      FROM chunks
      WHERE source_id = ${id}
      ORDER BY path ASC, start_line ASC
    `);

    return NextResponse.json({
      id: row.fileId || row.sourceId,
      sourceId: row.sourceId,
      kind: row.kind,
      filename,
      mimeType,
      byteSize: row.byteSize || 0,
      rawText: row.rawText,
      isPdf,
      hasRawData: Boolean(row.fileData),
      createdAt: row.createdAt,
      chunks: chunksResult.rows || [],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
