"use client";

import { useState } from "react";
import { ClipboardIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markdownToPlainText } from "@/lib/markdown-to-plain-text";
import {
  copiedVisible,
  copyLabel,
  copyVisible,
} from "@/lib/placeholder-data";

export type Citation = {
  label: string;
  href: string;
  path?: string;
  startLine?: number;
  endLine?: number;
};

type CitationRowProps = {
  citations: Citation[];
  copyText: string;
};

export function CitationRow({ citations, copyText }: CitationRowProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdownToPlainText(copyText));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {citations.map((citation, idx) => (
        <a
          key={`${citation.href}-${idx}`}
          href={citation.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground hover:bg-muted focus:ring-2 focus:ring-ring focus:outline-none"
        >
          <span>{citation.label}</span>
          <ExternalLinkIcon className="h-3 w-3 text-muted-foreground" aria-hidden />
        </a>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={copyLabel}
        className="min-h-8 gap-1.5 bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
        onClick={handleCopy}
      >
        <ClipboardIcon className="h-3.5 w-3.5" data-icon="inline-start" aria-hidden />
        {copied ? copiedVisible : copyVisible}
      </Button>
    </div>
  );
}
