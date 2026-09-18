import { tasks } from "@trigger.dev/sdk";
import { spawn } from "node:child_process";
import type { ingestRepo } from "@/trigger/ingest-repo";
import type { ingestUpload } from "@/trigger/ingest-upload";

export async function triggerIngestTask(jobId: string): Promise<void> {
  const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";
  const forceTriggerDev = process.env.TRIGGER_DEV_DEV === "true";

  // Production runs only on Trigger.dev. Fail loudly so a job is never
  // silently stuck in 'queued'.
  if (isProduction || forceTriggerDev) {
    if (!triggerSecretKey) {
      throw new Error(
        "TRIGGER_SECRET_KEY is not set. Production ingest requires Trigger.dev.",
      );
    }
    await tasks.trigger<typeof ingestRepo>("ingest-repo", { jobId });
    return;
  }

  // Local dev: spawn the Python worker directly (uv must be installed).
  const child = spawn("uv", ["run", "--directory", "ingest", "python", "main.py", jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
    shell: true,
  });
  child.unref();
}

export async function triggerIngestUploadTask(jobId: string): Promise<void> {
  const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";
  const forceTriggerDev = process.env.TRIGGER_DEV_DEV === "true";

  if (isProduction || forceTriggerDev) {
    if (!triggerSecretKey) {
      throw new Error(
        "TRIGGER_SECRET_KEY is not set. Production ingest requires Trigger.dev.",
      );
    }
    await tasks.trigger<typeof ingestUpload>("ingest-upload", { jobId });
    return;
  }

  // Local dev: spawn the Python worker directly (uv must be installed).
  const child = spawn("uv", ["run", "--directory", "ingest", "python", "main.py", jobId], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
    shell: true,
  });
  child.unref();
}

