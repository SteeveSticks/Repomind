import { defineConfig } from "@trigger.dev/sdk";
import { pythonExtension } from "@trigger.dev/python/extension";

export default defineConfig({
  // TODO: replace with your Trigger.dev project ref from the dashboard (proj_...).
  project: "proj_atqmftbglvgdcwkhiogc",
  dirs: ["./trigger"],
  maxDuration: 600,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      randomize: true,
    },
  },
  build: {
    extensions: [
      pythonExtension({
        // Keep in sync with the runtime dependencies in ingest/pyproject.toml.
        requirements: [
          "pgvector>=0.3.6",
          "psycopg[binary]>=3.2.0",
          "requests>=2.32.0",
          "voyageai>=0.3.2",
        ],
        scripts: ["./ingest/**/*.py"],
        devPythonBinaryPath:
          process.platform === "win32"
            ? "ingest/.venv/Scripts/python.exe"
            : "ingest/.venv/bin/python",
      }),
    ],
  },
});
