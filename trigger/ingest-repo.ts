import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";
import { python } from "@trigger.dev/python";

type IngestResult =
  | { status: "succeeded"; jobId: string; sourceId: string; chunksCount: number }
  | { status: "failed"; jobId: string; error: string };

export const ingestRepo = task({
  id: "ingest-repo",
  machine: "medium-1x",
  maxDuration: 600,
  run: async (payload: { jobId: string }) => {
    const { jobId } = payload;
    logger.info("Starting ingest pipeline", { jobId });

    const script = `
import json
import sys

sys.path.insert(0, "./ingest")
from pipeline import process_ingest_job

result = process_ingest_job(${JSON.stringify(jobId)})
print(json.dumps(result))
`;

    const result = await python.runInline(script);
    logger.info("Ingest pipeline finished", { jobId, stdout: result.stdout });

    let parsed: IngestResult;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(
        `Ingest worker returned invalid JSON.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }

    if (parsed.status === "failed") {
      throw new AbortTaskRunError(`Ingest failed: ${parsed.error}`);
    }

    return parsed;
  },
});
