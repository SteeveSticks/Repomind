"use client";

import { useEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  FileCodeIcon,
  FileTextIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DocumentViewerTarget = {
  sourceId: string;
  path?: string;
  startLine?: number;
  endLine?: number;
};

type FileResponse = {
  id: string;
  sourceId: string;
  kind: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  rawText: string | null;
  isPdf: boolean;
  hasRawData: boolean;
  chunks?: Array<{
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  }>;
};

type DocumentViewerProps = {
  target: DocumentViewerTarget | null;
  onClose: () => void;
};

export function DocumentViewer({ target, onClose }: DocumentViewerProps) {
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<FileResponse | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const isOpen = Boolean(target);
  const loading = Boolean(
    target?.sourceId &&
      fileData?.sourceId !== target.sourceId &&
      !error,
  );

  useEffect(() => {
    const sourceId = target?.sourceId;
    if (!sourceId) {
      return;
    }

    let isCancelled = false;

    fetch(`/api/sources/${sourceId}/file`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || `Failed to fetch file (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data: FileResponse) => {
        if (!isCancelled) {
          setFileData(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load document content.";
          setError(msg);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [target?.sourceId]);

  // Scroll to highlighted lines when content is ready
  useEffect(() => {
    if (!loading && fileData && highlightRef.current) {
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loading, fileData, target?.startLine, target?.endLine]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const startLine = target?.startLine || 1;
  const endLine = target?.endLine || startLine;

  const lines = fileData?.rawText ? fileData.rawText.split("\n") : [];
  const hasDirectText = lines.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Document Viewer"
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity duration-200"
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200"
        tabIndex={-1}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-card/50">
          <div className="flex items-center gap-2.5 min-w-0">
            {fileData?.isPdf ? (
              <FileTextIcon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
            ) : (
              <FileCodeIcon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate text-foreground">
                {fileData?.filename || target?.path || "Document"}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {target?.startLine ? (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono font-medium text-accent">
                    {target.endLine && target.endLine > target.startLine
                      ? `Lines ${target.startLine}–${target.endLine}`
                      : `Line ${target.startLine}`}
                  </span>
                ) : null}
                {fileData?.byteSize ? (
                  <span>({Math.round(fileData.byteSize / 1024)} KB)</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {fileData?.hasRawData ? (
              <a
                href={`/api/sources/${target?.sourceId}/file?raw=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
                title="Download original file"
              >
                <DownloadIcon className="h-3.5 w-3.5" aria-hidden />
                <span>Raw</span>
              </a>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close document viewer"
              className="h-8 w-8 rounded-md hover:bg-muted"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </header>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2Icon className="h-6 w-6 animate-spin text-accent" aria-hidden />
              <p className="text-xs">Loading document contents...</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
              <p className="font-semibold text-sm">Failed to Load Document</p>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          ) : hasDirectText ? (
            <div className="rounded-md border border-border bg-card/30 p-2">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((lineText, idx) => {
                    const lineNum = idx + 1;
                    const isHighlighted = lineNum >= startLine && lineNum <= endLine;
                    const isFirstHighlighted = lineNum === startLine;

                    return (
                      <tr
                        key={lineNum}
                        ref={isFirstHighlighted ? (el) => { highlightRef.current = el; } : undefined}
                        className={cn(
                          "transition-colors",
                          isHighlighted
                            ? "bg-accent/15 font-semibold text-foreground"
                            : "hover:bg-muted/60 text-foreground/90",
                        )}
                      >
                        <td
                          className={cn(
                            "w-12 select-none border-r border-border/40 pr-3 text-right text-[11px] tabular-nums",
                            isHighlighted
                              ? "font-bold text-accent"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {lineNum}
                        </td>
                        <td className="pl-3.5 whitespace-pre-wrap break-words py-0.5">
                          {lineText || " "}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : fileData?.chunks && fileData.chunks.length > 0 ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p>
                  Extracted text chunks for{" "}
                  <strong className="text-foreground">{fileData.filename}</strong>:
                </p>
              </div>

              {fileData.chunks.map((chunk) => {
                const isMatchingTarget =
                  !target?.path ||
                  chunk.path.toLowerCase().includes(target.path.toLowerCase()) ||
                  target.path.toLowerCase().includes(chunk.path.toLowerCase());

                const isTargetChunk =
                  isMatchingTarget &&
                  chunk.startLine <= endLine &&
                  chunk.endLine >= startLine;

                const chunkLines = chunk.text.split("\n");

                return (
                  <div
                    key={`${chunk.path}-${chunk.startLine}-${chunk.endLine}`}
                    ref={isTargetChunk ? (el) => { highlightRef.current = el; } : undefined}
                    className={cn(
                      "rounded-lg border p-3.5 text-xs transition-colors",
                      isTargetChunk
                        ? "border-accent bg-accent/10 shadow-xs"
                        : "border-border bg-card/30",
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
                      <span className="font-semibold text-foreground">
                        {chunk.path}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Lines {chunk.startLine}–{chunk.endLine}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {chunkLines.map((cL, clIdx) => {
                        const actualLine = chunk.startLine + clIdx;
                        const isLineActive =
                          actualLine >= startLine && actualLine <= endLine;
                        return (
                          <div
                            key={actualLine}
                            className={cn(
                              "flex gap-3 px-1 py-0.5 rounded",
                              isLineActive ? "bg-accent/20 font-semibold" : "",
                            )}
                          >
                            <span className="w-8 shrink-0 text-right select-none text-muted-foreground/60 text-[10px]">
                              {actualLine}
                            </span>
                            <span className="whitespace-pre-wrap break-words">
                              {cL || " "}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              <p>No text content available for this document.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
