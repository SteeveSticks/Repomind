import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="text-lg font-semibold text-foreground">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-base font-normal text-foreground">{children}</p>
  ),
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-base font-normal">
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-base font-normal">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="text-base font-normal">{children}</li>,
  code: ({ children }) => (
    <code className="rounded-md bg-muted px-1 font-mono text-sm">
      {children}
    </code>
  ),
  img: () => null,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
    >
      {children}
    </a>
  ),
};

type AssistantMarkdownProps = {
  source: string;
};

export function AssistantMarkdown({ source }: AssistantMarkdownProps) {
  return (
    <div className="flex flex-col gap-3 text-base font-normal">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {source}
      </Markdown>
    </div>
  );
}
