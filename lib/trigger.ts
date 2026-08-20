import { tasks } from "@trigger.dev/sdk";
import { spawn } from "node:child_process";
import type { ingestRepo } from "@/trigger/ingest-repo";

export async function triggerIngestTask(jobId: string): Promise<void> {
  const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;

  // Production runs only on Trigger.dev. Fail loudly so a job is never
  // silently stuck in 'queued'.
  if (process.env.NODE_ENV === "production") {
    if (!triggerSecretKey) {
      throw new Error(
        "TRIGGER_SECRET_KEY is not set. Production ingest requires Trigger.dev.",
      );
    }
    await tasks.trigger<typeof ingestRepo>("ingest-repo", { jobId });
    return;
  }

  // Local dev: prefer Trigger.dev when configured, otherwise spawn the
  // Python worker directly (uv must be installed).
  if (triggerSecretKey) {
    try {
      await tasks.trigger<typeof ingestRepo>("ingest-repo", { jobId });
      return;
    } catch (err) {
      console.warn("Trigger.dev trigger failed, falling back to local runner:", err);
    }
  }

  const child = spawn("uv", ["run", "--directory", "ingest", "python", "main.py", jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
    shell: true,
  });
  child.unref();
}
