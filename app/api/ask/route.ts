import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { askRateLimits, chats, citations, messages } from "@/db/schema";
import { getVoyageQueryEmbedding } from "@/lib/voyage";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.sourceId !== "string" ||
      typeof body.message !== "string"
    ) {
      return NextResponse.json(
        { error: "sourceId and message are required fields." },
        { status: 400 },
      );
    }

    const { sourceId, message } = body;
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 },
      );
    }

    // IP Rate Limiting (20 asks per IP per hour on production)
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const now = new Date();
    const windowStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        0,
        0,
        0,
      ),
    );

    const rateLimitResult = await db
      .insert(askRateLimits)
      .values({
        ip: clientIp,
        windowStart,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [askRateLimits.ip, askRateLimits.windowStart],
        set: { count: sql`${askRateLimits.count} + 1` },
      })
      .returning({ count: askRateLimits.count });

    const currentCount = rateLimitResult[0]?.count ?? 1;

    if (process.env.NODE_ENV === "production" && currentCount > 20) {
      const nextHour = new Date(windowStart.getTime() + 60 * 60 * 1000);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((nextHour.getTime() - Date.now()) / 1000),
      );

      return NextResponse.json(
        {
          error:
            "Hourly ask rate limit exceeded (20 questions per hour). Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }

    // Check source existence
    const sourceResult = await db.execute(sql`
      SELECT id, identity, origin_url
      FROM sources
      WHERE id = ${sourceId}
      LIMIT 1
    `);

    if (sourceResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Source repository not found." },
        { status: 404 },
      );
    }

    const source = sourceResult.rows[0] as {
      id: string;
      identity: string;
      origin_url: string;
    };

    // Check if source has completed ingest
    const jobCheck = await db.execute(sql`
      SELECT id
      FROM ingest_jobs
      WHERE source_id = ${sourceId} AND status = 'succeeded'
      LIMIT 1
    `);

    if (jobCheck.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Repository indexing has not succeeded yet. Please wait for indexing to complete.",
        },
        { status: 409 },
      );
    }

    // Ensure chat row exists
    const chatResult = await db
      .insert(chats)
      .values({
        sourceId,
      })
      .onConflictDoUpdate({
        target: chats.sourceId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: chats.id });

    const chatId = chatResult[0].id;

    // Insert user message record
    await db.insert(messages).values({
      chatId,
      role: "user",
      content: trimmedMessage,
    });

    // Embed question with Voyage AI
    let queryEmbedding: number[];
    try {
      queryEmbedding = await getVoyageQueryEmbedding(trimmedMessage);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to generate question embedding.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Retrieve top 8 chunks using pgvector cosine distance
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;
    const chunkResults = await db.execute(sql`
      SELECT path, start_line, end_line, text, (embedding <=> ${vectorLiteral}::vector) AS distance
      FROM chunks
      WHERE source_id = ${sourceId}
      ORDER BY distance ASC
      LIMIT 8
    `);

    type RetrievedChunk = {
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      distance: number;
    };

    const retrievedChunks = (chunkResults.rows || []) as unknown as RetrievedChunk[];

    const formattedCitations = retrievedChunks.map((chunk) => {
      const label = `${chunk.path}:${chunk.start_line}`;
      const href = `https://github.com/${source.identity}/blob/HEAD/${chunk.path}#L${chunk.start_line}-L${chunk.end_line}`;
      return {
        label,
        href,
        path: chunk.path,
        startLine: chunk.start_line,
        endLine: chunk.end_line,
      };
    });

    // Choose AI model provider: Groq on deploy, Ollama locally
    let model;
    if (process.env.GROQ_API_KEY) {
      const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
      const modelName =
        process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      model = groq(modelName);
    } else {
      const baseURL =
        (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434") + "/v1";
      const ollama = createOpenAI({
        baseURL,
        apiKey: "ollama",
      });
      const modelName = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
      model = ollama(modelName);
    }

    // Assemble system prompt and context
    const systemPrompt = `You are RepoMind, an AI assistant specialized in answering questions about code repositories.
You are given the most relevant code chunks from the repository '${source.identity}'.
Answer the user's question accurately, concisely, and directly, explaining where in the code things happen.
Ground your response in the provided code chunks. Refer to specific files and line numbers where appropriate.`;

    const contextContent = retrievedChunks
      .map(
        (c, idx) =>
          `--- CHUNK ${idx + 1}: ${c.path} (lines ${c.start_line}-${c.end_line}) ---\n${c.text}`,
      )
      .join("\n\n");

    const userPrompt = `Repository context:\n${contextContent}\n\nUser Question:\n${trimmedMessage}`;

    const streamResult = streamText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      onFinish: async ({ text }) => {
        try {
          const [assistantMsg] = await db
            .insert(messages)
            .values({
              chatId,
              role: "assistant",
              content: text,
            })
            .returning({ id: messages.id });

          if (formattedCitations.length > 0 && assistantMsg?.id) {
            await db.insert(citations).values(
              formattedCitations.map((c) => ({
                messageId: assistantMsg.id,
                path: c.path,
                startLine: c.startLine,
                endLine: c.endLine,
              })),
            );
          }
        } catch (persistErr) {
          console.error("Failed to persist assistant message/citations:", persistErr);
        }
      },
    });

    const encoder = new TextEncoder();
    const citationsLine = `2:${JSON.stringify([{ type: "citations", citations: formattedCitations }])}\n`;

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(citationsLine));
        for await (const chunk of streamResult.textStream) {
          controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
