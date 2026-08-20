import type { Citation } from "@/components/chat/citation-row";

export type StreamCallbacks = {
  onToken: (token: string) => void;
  onCitations: (citations: Citation[]) => void;
  onError: (error: string) => void;
};

export async function readAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<{ text: string; citations: Citation[] }> {
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let extractedCitations: Citation[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("0:")) {
          try {
            const token = JSON.parse(trimmed.slice(2));
            if (typeof token === "string") {
              fullText += token;
              callbacks.onToken(token);
            }
          } catch {
            // Skip unparseable line
          }
        } else if (trimmed.startsWith("2:")) {
          try {
            const dataParts = JSON.parse(trimmed.slice(2));
            if (Array.isArray(dataParts)) {
              for (const part of dataParts) {
                if (part && part.type === "citations" && Array.isArray(part.citations)) {
                  extractedCitations = part.citations;
                  callbacks.onCitations(part.citations);
                }
              }
            }
          } catch {
            // Skip unparseable line
          }
        } else if (trimmed.startsWith("e:") || trimmed.startsWith("3:")) {
          try {
            const errVal = JSON.parse(trimmed.slice(2));
            const msg = typeof errVal === "string" ? errVal : errVal?.message || "Stream error";
            callbacks.onError(msg);
          } catch {
            callbacks.onError(trimmed.slice(2));
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: fullText, citations: extractedCitations };
}
