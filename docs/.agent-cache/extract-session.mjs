import fs from "fs";

const sessionDir =
  process.env.USERPROFILE +
  "\\.grok\\sessions\\C%3A%5CUsers%5CDELL%5CDocuments%5Cprojects%5CRepomind\\01a00569-4002-7ec2-90a1-191493b11580";

function readJsonl(file) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\n/);
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      out.push({ _parseError: true, preview: line.slice(0, 200) });
    }
  }
  return out;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (!p) return "";
        if (typeof p === "string") return p;
        if (p.text) return p.text;
        if (p.content) return textFromContent(p.content);
        return "";
      })
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (content.text) return content.text;
    return JSON.stringify(content);
  }
  return "";
}

function extractUserQuery(text) {
  const m = text.match(/<user_query>([\s\S]*?)<\/user_query>/);
  if (m) return m[1].trim();
  // ask_user_question answers often appear as raw
  if (text.includes("<user_query>")) return text.split("<user_query>").pop().replace("</user_query>", "").trim();
  return text.trim();
}

const chat = readJsonl(sessionDir + "\\chat_history.jsonl");
const users = chat.filter((r) => r.type === "user");
const assistants = chat.filter((r) => r.type === "assistant");

const seen = new Set();
const userQueries = [];
for (const u of users) {
  const raw = textFromContent(u.content);
  const q = extractUserQuery(raw);
  if (!q) continue;
  const key = q.slice(0, 500);
  if (seen.has(key)) continue;
  seen.add(key);
  userQueries.push({ len: q.length, text: q });
}

console.log("=== UNIQUE USER QUERIES", userQueries.length, "===\n");
for (let i = 0; i < userQueries.length; i++) {
  console.log(`\n----- Q${i + 1} len=${userQueries[i].len} -----`);
  console.log(userQueries[i].text.slice(0, 6000));
  if (userQueries[i].text.length > 6000) console.log("...[truncated]");
}

console.log("\n\n=== ASSISTANT MESSAGES", assistants.length, "===\n");
for (let i = 0; i < assistants.length; i++) {
  const t = textFromContent(assistants[i].content);
  const tools = (assistants[i].tool_calls || []).map((c) => c.name).join(", ");
  console.log(`\n----- A${i + 1} tools=[${tools}] len=${t.length} -----`);
  console.log(t.slice(0, 3500));
  if (t.length > 3500) console.log("...[truncated]");
}

