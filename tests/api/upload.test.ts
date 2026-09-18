import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/upload/route";
import { GET } from "@/app/api/sources/[id]/file/route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/trigger", () => ({
  triggerIngestUploadTask: vi.fn().mockResolvedValue({ id: "task-123" }),
}));

import { db } from "@/lib/db";
import { triggerIngestUploadTask } from "@/lib/trigger";

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    delete process.env.INGEST_SECRET;
  });

  it("covers: AC-7 rejects unauthorized request when secret is set and header is missing", async () => {
    process.env.INGEST_SECRET = "super-secret";
    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  it("covers: AC-8 rejects unsupported file extensions with 422 bad_file_type", async () => {
    const formData = new FormData();
    const file = new File(["echo hello"], "malicious.sh", { type: "text/x-sh" });
    formData.append("file", file);

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("bad_file_type");
  });

  it("covers: AC-8 rejects empty files with 400 empty_file", async () => {
    const formData = new FormData();
    const file = new File([], "empty.md", { type: "text/markdown" });
    formData.append("file", file);

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("empty_file");
  });

  it("covers: AC-8 rejects concurrent job with 409 active_job_running", async () => {
    const formData = new FormData();
    const file = new File(["# Hello World\nContent"], "doc.md", { type: "text/markdown" });
    formData.append("file", file);

    // Mock reaper query then active job query returning an active job
    (db.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] }) // reaper
      .mockResolvedValueOnce({ rows: [{ id: "active-job", status: "running" }] }); // active jobs check

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("active_job_running");
  });

  it("covers: AC-1 successfully uploads markdown document and triggers ingest task", async () => {
    const formData = new FormData();
    const file = new File(["# Hello World\nDocumentation"], "doc.md", { type: "text/markdown" });
    formData.append("file", file);

    (db.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] }) // reaper
      .mockResolvedValueOnce({ rows: [] }) // active jobs
      .mockResolvedValueOnce({ rows: [{ id: "src-uuid-1" }] }) // source upsert
      .mockResolvedValueOnce({ rows: [] }); // source_files upsert

    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "job-uuid-1", status: "queued" }]),
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.jobId).toBe("job-uuid-1");
    expect(body.sourceId).toBe("src-uuid-1");
    expect(body.status).toBe("queued");
    expect(triggerIngestUploadTask).toHaveBeenCalledWith("job-uuid-1");
  });
});

describe("GET /api/sources/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers: AC-6 returns 404 when source does not exist", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

    const req = new NextRequest("http://localhost:3000/api/sources/missing-id/file");
    const res = await GET(req, { params: Promise.resolve({ id: "missing-id" }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Source not found.");
  });

  it("covers: AC-6 returns document metadata and text for markdown source", async () => {
    (db.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        rows: [
          {
            sourceId: "src-1",
            kind: "upload",
            identity: "hash123",
            originUrl: "spec.md",
            fileId: "file-1",
            filename: "spec.md",
            mimeType: "text/markdown",
            byteSize: 150,
            rawText: "# Spec\nContent",
            fileData: null,
            createdAt: "2026-09-08T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { path: "spec.md", startLine: 1, endLine: 2, text: "# Spec\nContent" },
        ],
      });

    const req = new NextRequest("http://localhost:3000/api/sources/src-1/file");
    const res = await GET(req, { params: Promise.resolve({ id: "src-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filename).toBe("spec.md");
    expect(body.mimeType).toBe("text/markdown");
    expect(body.rawText).toBe("# Spec\nContent");
    expect(body.isPdf).toBe(false);
    expect(body.chunks).toHaveLength(1);
  });

  it("covers: AC-6 returns binary raw stream when ?raw=1 requested for PDF", async () => {
    const pdfBuf = Buffer.from("%PDF-1.4 test binary");
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [
        {
          sourceId: "src-pdf-1",
          kind: "upload",
          identity: "pdfhash",
          originUrl: "report.pdf",
          fileId: "file-pdf-1",
          filename: "report.pdf",
          mimeType: "application/pdf",
          byteSize: pdfBuf.length,
          rawText: null,
          fileData: pdfBuf,
          createdAt: "2026-09-08T00:00:00Z",
        },
      ],
    });

    const req = new NextRequest("http://localhost:3000/api/sources/src-pdf-1/file?raw=1");
    const res = await GET(req, { params: Promise.resolve({ id: "src-pdf-1" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("report.pdf");
  });
});
