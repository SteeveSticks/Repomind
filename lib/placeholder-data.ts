// PLACEHOLDER: replaced by Slice 1 data integration (ingest and ask)

export const wordmark = "RepoMind";

export const hello = "Hello";
export const tagline = "How can I help you today?";

export const urlCardTitle = "Paste a GitHub URL";
export const urlCardBody = "Index a public repo, then ask it with citations.";

export const suggestionPrompts = [
  "Where does Next.js keep App Router pages?",
  "How do citations point at a file and line?",
  "What does a failed ingest look like?",
] as const;

export type PlaceholderRecent = {
  id: string;
  label: string;
  opensThread: boolean;
};

export const recents: PlaceholderRecent[] = [
  { id: "vercel-next", label: "vercel/next.js", opensThread: true },
  { id: "facebook-react", label: "facebook/react", opensThread: false },
  { id: "openai-whisper", label: "openai/whisper", opensThread: false },
];

export const recentsHeading = "Recents";
export const newChatLabel = "New chat";

export type PlaceholderCitation = {
  label: string;
  href: string;
};

export type PlaceholderThread = {
  userText: string;
  assistantMarkdown: string;
  citations: PlaceholderCitation[];
};

export const placeholderThread: PlaceholderThread = {
  userText: "Where does Next.js keep App Router pages?",
  assistantMarkdown: `## App Router pages

1. Keep routes in the \`app\` directory.
2. A folder becomes a URL segment.
3. Add \`page.tsx\` in that folder to render the screen.
4. Add \`layout.tsx\` beside it to wrap nested routes.`,
  citations: [
    {
      label: "README.md:1",
      href: "https://github.com/vercel/next.js/blob/canary/README.md",
    },
  ],
};

export const composerPlaceholder = "Ask a question";
export const skipLabel = "Skip to chat";
export const menuLabel = "Open menu";
export const copyLabel = "Copy answer";
export const copyVisible = "Copy";
export const copiedVisible = "Copied";
export const settingsTitle = "About";
export const settingsProduct = "RepoMind";
export const settingsNote = "Dark mode comes later.";
export const settingsLabel = "Settings";
export const addLabel = "Add";
export const addTooltip = "Uploads come later";
export const sendLabel = "Send";
export const sheetTitle = "Menu";
export const collapseSidebarLabel = "Collapse sidebar";
export const expandSidebarLabel = "Expand sidebar";

export type LocalUserMessage = {
  id: string;
  text: string;
};
