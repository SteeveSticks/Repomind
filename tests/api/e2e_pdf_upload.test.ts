import { describe, it, expect } from "vitest";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { POST as uploadPOST } from "@/app/api/upload/route";
import { GET as ingestGET } from "@/app/api/ingest/[id]/route";
import { GET as sourceFileGET } from "@/app/api/sources/[id]/file/route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { chunks } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("E2E Real PDF Upload and Indexing", () => {
  it("uploads a PDF, processes via local worker, and indexes chunks", async () => {
    const rawPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 85 >>
stream
BT
/F1 18 Tf
50 700 Td
(RepoMind Architecture: Upload and Markdown PDF Indexing Test Document.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000378 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
455
%%EOF`;
    const fileBytes = Buffer.from(rawPdf);
    const blob = new Blob([fileBytes], { type: "application/pdf" });
    const file = new File([blob], "repomind_test.pdf", { type: "application/pdf" });

    const formData = new FormData();
    formData.append("file", file);

    const uploadReq = new NextRequest("http://localhost:3000/api/upload", {
      method: "POST",
      headers: {
        "x-ingest-secret": process.env.INGEST_SECRET || "repomindingestsecret",
      },
      body: formData,
    });

    const uploadRes = await uploadPOST(uploadReq);
    const uploadData = await uploadRes.json();
    if (uploadRes.status !== 201) {
      console.error("Upload error:", uploadRes.status, uploadData);
    }
    expect(uploadRes.status).toBe(201);
    expect(uploadData.jobId).toBeDefined();
    expect(uploadData.sourceId).toBeDefined();

    const { jobId, sourceId } = uploadData;

    // Poll until succeeded
    let finished = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusReq = new NextRequest(`http://localhost:3000/api/ingest/${jobId}`);
      const statusRes = await ingestGET(statusReq, { params: Promise.resolve({ id: jobId }) });
      const jobStatus = await statusRes.json();

      if (jobStatus.status === "succeeded") {
        finished = true;
        break;
      }
      if (jobStatus.status === "failed") {
        throw new Error(`Job failed: ${jobStatus.error}`);
      }
    }

    expect(finished).toBe(true);

    // Verify chunks exist
    const chunkRows = await db.select().from(chunks).where(eq(chunks.sourceId, sourceId));
    expect(chunkRows.length).toBeGreaterThan(0);
    expect(chunkRows[0].text).toContain("RepoMind Architecture");
    expect(chunkRows[0].path).toBe("repomind_test.pdf (Page 1)");

    // Verify GET /api/sources/[id]/file
    const fileReq = new NextRequest(`http://localhost:3000/api/sources/${sourceId}/file`);
    const fileRes = await sourceFileGET(fileReq, { params: Promise.resolve({ id: sourceId }) });
    expect(fileRes.status).toBe(200);
    const fileMeta = await fileRes.json();
    expect(fileMeta.filename).toBe("repomind_test.pdf");
    expect(fileMeta.isPdf).toBe(true);
  }, 45000);
});
