"use client";

import { useEffect, useRef, useState } from "react";
import { MenuIcon } from "lucide-react";

import { Composer } from "@/components/chat/composer";
import {
  NewChatCanvas,
  type IngestStatusState,
} from "@/components/chat/new-chat-canvas";
import { ThreadView, type ThreadMessage } from "@/components/chat/thread-view";
import type { Citation } from "@/components/chat/citation-row";
import { SidebarNav, type SidebarSource } from "@/components/shell/sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { readAIStream } from "@/lib/stream-parser";
import { toast } from "sonner";
import {
  menuLabel,
  settingsNote,
  settingsProduct,
  settingsTitle,
  sheetTitle,
  skipLabel,
  suggestionPrompts,
} from "@/lib/placeholder-data";

type ApiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export function AppShell() {
  const [view, setView] = useState<"new" | "thread">("new");
  const [sources, setSources] = useState<SidebarSource[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [ingestState, setIngestState] = useState<IngestStatusState>({
    jobId: null,
    status: "idle",
    error: null,
  });

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load available sources from the API
  async function fetchSources(): Promise<SidebarSource[]> {
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.sources) ? data.sources : [];
    } catch {
      return [];
    }
  }

  // Load available sources on mount
  useEffect(() => {
    let cancelled = false;
    fetchSources().then((fetched) => {
      if (!cancelled) {
        setSources(fetched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Load chat messages when active source changes
  async function loadChatMessages(sourceId: string) {
    try {
      const res = await fetch(`/api/chats/${sourceId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setThreadMessages(
          data.messages.map((m: ApiChatMessage) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: m.citations || [],
          })),
        );
      }
    } catch {
      // If loading fails, keep current messages
    }
  }

  function resetToNew() {
    setView("new");
    setActiveSourceId(null);
    setThreadMessages([]);
    setStreamingContent("");
    setStreamingCitations([]);
    setIngestState({ jobId: null, status: "idle", error: null });
    setDraft("");
    setMenuOpen(false);
  }

  async function selectSource(sourceId: string) {
    setActiveSourceId(sourceId);
    setView("thread");
    setMenuOpen(false);
    await loadChatMessages(sourceId);
    setTimeout(() => {
      composerRef.current?.focus();
    }, 50);
  }

  function fillPrompt(prompt: string) {
    setDraft(prompt);
    composerRef.current?.focus();
  }

  async function startIngest(repoUrl: string, secret?: string) {
    setIngestState({ jobId: null, status: "submitting", error: null });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (secret) {
        headers["x-ingest-secret"] = secret;
      }

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify({ repoUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setIngestState({
          jobId: null,
          status: "failed",
          error: data.error || `Ingest failed with HTTP status ${res.status}`,
        });
        return;
      }

      const jobId = data.jobId;
      setIngestState({ jobId, status: "queued", error: null });

      // Start polling status
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/ingest/${jobId}`);
          if (!statusRes.ok) return;
          const job = await statusRes.json();

          if (job.status === "succeeded") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIngestState({ jobId, status: "succeeded", error: null });

            setSources(await fetchSources());
            if (job.sourceId) {
              setTimeout(() => {
                selectSource(job.sourceId);
              }, 600);
            }
          } else if (job.status === "failed") {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setIngestState({
              jobId,
              status: "failed",
              error: job.error || "Ingest job failed.",
            });
          } else if (job.status === "running") {
            setIngestState((prev) => ({ ...prev, status: "running" }));
          }
        } catch {
          // Poll retry on next tick
        }
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect to server.";
      setIngestState({ jobId: null, status: "failed", error: msg });
    }
  }

  async function handleSendQuestion(customText?: string) {
    const textToSend = (customText ?? draft).trim();
    if (!textToSend) return;

    if (!activeSourceId) {
      // If user types without active repository, check if we have sources
      if (sources.length > 0) {
        if (view === "thread") {
          setActiveSourceId(sources[0].id);
          setView("thread");
        } else {
          toast.error("Please index a GitHub repository first before asking questions.");
          return;
        }
      } else {
        toast.error("Please index a GitHub repository first before asking questions.");
        return;
      }
    }

    const currentSourceId = activeSourceId || sources[0]?.id;
    if (!currentSourceId) return;

    const userMessageId = crypto.randomUUID();
    const newUserMessage: ThreadMessage = {
      id: userMessageId,
      role: "user",
      content: textToSend,
    };

    setThreadMessages((prev) => [...prev, newUserMessage]);
    if (!customText) setDraft("");
    setView("thread");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingCitations([]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: currentSourceId,
          message: textToSend,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errorMsg =
          errorData?.error || `Ask request failed with HTTP ${res.status}`;

        setIsStreaming(false);
        setThreadMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            error: errorMsg,
          },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable.");
      }

      let accumulated = "";
      let finalCitations: Citation[] = [];

      await readAIStream(reader, {
        onToken: (token) => {
          accumulated += token;
          setStreamingContent(accumulated);
        },
        onCitations: (cites) => {
          finalCitations = cites;
          setStreamingCitations(cites);
        },
        onError: (err) => {
          console.error("Stream error part:", err);
        },
      });

      setIsStreaming(false);
      setThreadMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: accumulated,
          citations: finalCitations,
        },
      ]);
      setStreamingContent("");
      setStreamingCitations([]);
    } catch (err: unknown) {
      setIsStreaming(false);
      const msg = err instanceof Error ? err.message : "Stream connection failed.";
      setThreadMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          error: msg,
        },
      ]);
    }
  }

  function openSettings(trigger: HTMLButtonElement) {
    settingsTriggerRef.current = trigger;
    setSettingsOpen(true);
  }

  const showStarterCards = view === "new" && threadMessages.length === 0;
  const activeSource = sources.find((s) => s.id === activeSourceId);

  return (
    <div className="flex h-dvh bg-background">
      <a
        href="#main-canvas"
        className="bg-background text-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:px-3"
      >
        {skipLabel}
      </a>
      <aside
        data-slot="app-sidebar"
        className={cn(
          "hidden h-full shrink-0 overflow-hidden border-r border-border transition-[width] duration-200 ease-in-out md:flex md:flex-col",
          sidebarCollapsed ? "w-sidebar-collapsed" : "w-sidebar",
        )}
      >
        <SidebarNav
          view={view}
          sources={sources}
          activeSourceId={activeSourceId}
          collapsed={sidebarCollapsed}
          showCollapse
          onNewChat={resetToNew}
          onSelectSource={selectSource}
          onOpenSettings={openSettings}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between p-2 border-b border-border md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={menuLabel}
                  className="min-h-11 min-w-11"
                >
                  <MenuIcon aria-hidden />
                </Button>
              }
            />
            <SheetContent side="left" className="w-sidebar max-w-sidebar p-0">
              <SheetHeader>
                <SheetTitle>{sheetTitle}</SheetTitle>
              </SheetHeader>
              <SidebarNav
                view={view}
                sources={sources}
                activeSourceId={activeSourceId}
                onNewChat={resetToNew}
                onSelectSource={selectSource}
                onOpenSettings={openSettings}
              />
            </SheetContent>
          </Sheet>
          {activeSource ? (
            <p className="text-xs font-semibold truncate px-2 text-foreground">
              {activeSource.identity}
            </p>
          ) : null}
        </header>
        <main
          id="main-canvas"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col outline-none"
        >
          {view === "new" ? (
            <NewChatCanvas
              prompts={suggestionPrompts}
              showStarterCards={showStarterCards}
              onFillPrompt={fillPrompt}
              onStartIngest={startIngest}
              ingestState={ingestState}
              onResetIngest={() =>
                setIngestState({ jobId: null, status: "idle", error: null })
              }
            />
          ) : (
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground md:px-10">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {activeSource?.identity || "Repository"}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  indexed
                </span>
              </div>
              <button
                type="button"
                onClick={resetToNew}
                className="underline hover:text-foreground"
              >
                Switch repo
              </button>
            </div>
          )}
          {view === "thread" || threadMessages.length > 0 ? (
            <ThreadView
              messages={threadMessages}
              streamingContent={streamingContent}
              streamingCitations={streamingCitations}
              isStreaming={isStreaming}
              onRetry={(lastMsg) => handleSendQuestion(lastMsg)}
            />
          ) : null}
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={() => handleSendQuestion()}
            inputRef={composerRef}
            disabled={isStreaming}
            placeholder={
              activeSource
                ? `Ask a question about ${activeSource.identity}...`
                : "Ask a question..."
            }
          />
        </main>
      </div>
      <Dialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) {
            settingsTriggerRef.current?.focus();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{settingsTitle}</DialogTitle>
            <DialogDescription>
              <span className="block font-medium text-foreground">
                {settingsProduct}
              </span>
              <span className="mt-2 block">{settingsNote}</span>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
