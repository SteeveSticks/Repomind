"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  KeyIcon,
  Loader2Icon,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyHeader } from "@/components/ui/empty";
import {
  hello,
  tagline,
  urlCardBody,
  urlCardTitle,
} from "@/lib/placeholder-data";

export type IngestStatusState = {
  jobId: string | null;
  status: "idle" | "submitting" | "queued" | "running" | "succeeded" | "failed";
  error: string | null;
};

type NewChatCanvasProps = {
  prompts: readonly string[];
  showStarterCards: boolean;
  onFillPrompt: (prompt: string) => void;
  onStartIngest: (repoUrl: string, secret?: string) => Promise<void>;
  ingestState: IngestStatusState;
  onResetIngest: () => void;
};

const sampleRepos = [
  { label: "facebook/react", url: "https://github.com/facebook/react" },
  { label: "vercel/next.js", url: "https://github.com/vercel/next.js" },
  { label: "astral-sh/uv", url: "https://github.com/astral-sh/uv" },
];

export function NewChatCanvas({
  prompts,
  showStarterCards,
  onFillPrompt,
  onStartIngest,
  ingestState,
  onResetIngest,
}: NewChatCanvasProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecretInput, setShowSecretInput] = useState(false);

  if (!showStarterCards) {
    return <h1 className="sr-only">{hello}</h1>;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!repoUrl.trim()) return;
    await onStartIngest(repoUrl.trim(), secret.trim() || undefined);
  }

  const isWorking =
    ingestState.status === "submitting" ||
    ingestState.status === "queued" ||
    ingestState.status === "running";

  return (
    <Empty className="flex-1 justify-start border-0 p-6 pt-6 sm:justify-center sm:p-6 md:px-10 lg:px-16">
      <EmptyHeader className="max-w-3xl items-center gap-1">
        <h1 className="text-2xl font-semibold text-accent">{hello}</h1>
        <p className="text-2xl font-semibold text-foreground">{tagline}</p>
      </EmptyHeader>
      <EmptyContent className="max-w-3xl gap-5">
        <div className="flex w-full flex-col gap-4 rounded-sm bg-card/60 p-5 text-left border border-border">
          <div>
            <div className="flex items-center gap-2">
              <GithubIcon className="h-5 w-5 text-foreground" aria-hidden />
              <p className="text-base font-semibold text-foreground">
                {urlCardTitle}
              </p>
            </div>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              {urlCardBody}
            </p>
          </div>

          {ingestState.status === "failed" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold text-sm">Indexing Failed</p>
                  <p className="text-xs mt-1 text-foreground">
                    {ingestState.error || "An error occurred while indexing this repository."}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onResetIngest}
                  className="bg-background text-foreground"
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : isWorking ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <Loader2Icon className="h-5 w-5 animate-spin text-accent" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {ingestState.status === "submitting" && "Submitting ingest request..."}
                    {ingestState.status === "queued" && "Queued in background worker..."}
                    {ingestState.status === "running" &&
                      "Downloading repository and embedding code chunks..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This usually takes 10 to 30 seconds depending on repository size.
                  </p>
                </div>
              </div>
            </div>
          ) : ingestState.status === "succeeded" ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-4 text-primary">
              <CheckCircle2Icon className="h-5 w-5 shrink-0" aria-hidden />
              <p className="text-sm font-medium">
                Indexing complete! Opening chat thread...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type="url"
                    id="repo-url-input"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    required
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!repoUrl.trim() || isWorking}
                  className="h-11 gap-2 px-5"
                >
                  <span>Index Repo</span>
                  <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Try:</span>
                  {sampleRepos.map((sample) => (
                    <button
                      key={sample.url}
                      type="button"
                      onClick={() => setRepoUrl(sample.url)}
                      className="rounded bg-muted px-2 py-1 font-mono hover:text-foreground"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowSecretInput((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <KeyIcon className="h-3 w-3" aria-hidden />
                  <span>{showSecretInput ? "Hide Secret" : "Add Ingest Secret"}</span>
                </button>
              </div>

              {showSecretInput ? (
                <div className="pt-2">
                  <label
                    htmlFor="ingest-secret-input"
                    className="block text-xs font-medium text-muted-foreground mb-1"
                  >
                    Ingest Secret (x-ingest-secret header for production deployments)
                  </label>
                  <input
                    type="password"
                    id="ingest-secret-input"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Enter INGEST_SECRET passphrase"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : null}
            </form>
          )}
        </div>

        <div className="w-full">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested questions
          </p>
          <ul className="grid w-full gap-3 sm:grid-cols-3">
            {prompts.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-start rounded-sm bg-card/60 p-4 text-left text-sm font-medium text-foreground border border-border hover:bg-muted focus:ring-2 focus:ring-ring focus:outline-none"
                  onClick={() => onFillPrompt(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </EmptyContent>
    </Empty>
  );
}
