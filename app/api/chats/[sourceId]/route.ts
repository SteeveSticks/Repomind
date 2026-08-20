import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ sourceId: string }> },
) {
  try {
    const { sourceId } = await props.params;

    if (!sourceId) {
      return NextResponse.json(
        { error: "sourceId is required." },
        { status: 400 },
      );
    }

    const messagesResult = await db.execute(sql`
      SELECT m.id, m.role, m.content, m.created_at AS "createdAt",
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', c.id,
                   'path', c.path,
                   'startLine', c.start_line,
                   'endLine', c.end_line,
                   'label', c.path || ':' || c.start_line,
                   'href', 'https://github.com/' || s.identity || '/blob/HEAD/' || c.path || '#L' || c.start_line || '-L' || c.end_line
                 )
               ) FILTER (WHERE c.id IS NOT NULL),
               '[]'
             ) AS citations
      FROM messages m
      JOIN chats ch ON m.chat_id = ch.id
      JOIN sources s ON ch.source_id = s.id
      LEFT JOIN citations c ON c.message_id = m.id
      WHERE ch.source_id = ${sourceId}
      GROUP BY m.id, m.role, m.content, m.created_at
      ORDER BY m.created_at ASC
    `);

    return NextResponse.json({ messages: messagesResult.rows }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to load chat thread.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
