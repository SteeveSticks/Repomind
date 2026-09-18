import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { python } from "@trigger.dev/python";

type IngestResult =
  | { status: "succeeded"; jobId: string; sourceId: string; chunksCount: number }
  | { status: "failed"; jobId: string; error: string };

export const ingestUpload = task({
  id: "ingest-upload",
  machine: "medium-1x",
  maxDuration: 600,
  run: async (payload: { jobId: string }) => {
    const { jobId } = payload;
    logger.info("Starting upload document ingest pipeline", { jobId });

    const script = `
import json
import sys

sys.path.insert(0, "./ingest")
from pipeline import process_upload_job

result = process_upload_job(${JSON.stringify(jobId)})
print(json.dumps(result))
`;

    const result = await python.runInline(script, {
      env: {
        DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT,
        DATABASE_URL: process.env.DATABASE_URL,
        VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
      },
    });
    logger.info("Upload ingest pipeline finished", { jobId, stdout: result.stdout });

    let parsed: IngestResult;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(
        `Upload ingest worker returned invalid JSON.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }

    if (parsed.status === "failed") {
      throw new AbortTaskRunError(`Upload ingest failed: ${parsed.error}`);
    }

    return parsed;
  },
});
