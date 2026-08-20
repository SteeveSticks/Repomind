"use client";

import { AlertCircleIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { AssistantMarkdown } from "@/components/chat/assistant-markdown";
import { CitationRow, type Citation } from "@/components/chat/citation-row";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: string | null;
};

type ThreadViewProps = {
  messages: ThreadMessage[];
  streamingContent?: string;
  streamingCitations?: Citation[];
  isStreaming?: boolean;
  onRetry?: (lastUserMessage: string) => void;
};

export function ThreadView({
  messages,
  streamingContent = "",
  streamingCitations = [],
  isStreaming = false,
  onRetry,
}: ThreadViewProps) {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-6 md:px-10 lg:px-16">
            {messages.map((message) => {
              if (message.role === "user") {
                return (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor
                  >
                    <UserBubble text={message.content} />
                  </MessageScrollerItem>
                );
              }

              return (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                >
                  <Message align="start">
                    <MessageContent>
                      {message.error ? (
                        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                          <div className="flex items-center gap-2">
                            <AlertCircleIcon className="h-4 w-4 shrink-0" aria-hidden />
                            <p className="text-xs font-semibold">Answer Error</p>
                          </div>
                          <p className="text-xs text-foreground">{message.error}</p>
                          {onRetry && lastUserMsg ? (
                            <div className="flex justify-end pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onRetry(lastUserMsg.content)}
                                className="h-8 gap-1.5 text-xs bg-background text-foreground"
                              >
                                <RotateCcwIcon className="h-3 w-3" aria-hidden />
                                <span>Retry</span>
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <AssistantMarkdown source={message.content} />
                          {message.citations && message.citations.length > 0 ? (
                            <MessageFooter className="px-0">
                              <CitationRow
                                citations={message.citations}
                                copyText={message.content}
                              />
                            </MessageFooter>
                          ) : null}
                        </>
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              );
            })}

            {isStreaming ? (
              <MessageScrollerItem messageId="streaming-assistant" scrollAnchor>
                <Message align="start">
                  <MessageContent>
                    {streamingContent ? (
                      <>
                        <AssistantMarkdown source={streamingContent} />
                        {streamingCitations.length > 0 ? (
                          <MessageFooter className="px-0">
                            <CitationRow
                              citations={streamingCitations}
                              copyText={streamingContent}
                            />
                          </MessageFooter>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2Icon className="h-4 w-4 animate-spin text-accent" aria-hidden />
                        <span>Searching codebase and generating answer...</span>
                      </div>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <Message align="end">
      <MessageContent>
        <Bubble variant="muted" align="end">
          <BubbleContent className="rounded-[var(--radius-bubble)] px-4 py-3 text-base text-foreground md:px-5">
            {text}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
