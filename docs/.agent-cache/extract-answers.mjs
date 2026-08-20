import fs from "fs";

const sessionDir =
  process.env.USERPROFILE +
  "\\.grok\\sessions\\C%3A%5CUsers%5CDELL%5CDocuments%5Cprojects%5CRepomind\\01a00569-4002-7ec2-90a1-191493b11580";

function readJsonl(file) {
  const raw = fs.readFileSync(file, "utf8");
  const out = [];
  for (const line of raw.split(/\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      out.push({ _parseError: true, preview: line.slice(0, 160) });
    }
  }
  return out;
}

function dump(v, n = 2500) {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + "\n...[trunc " + s.length + "]" : s;
}

const chat = readJsonl(sessionDir + "\\chat_history.jsonl");

console.log("=== ASK / ANSWER FROM CHAT ===\n");
let i = 0;
for (const rec of chat) {
  if (rec.type === "assistant" && rec.tool_calls) {
    for (const call of rec.tool_calls) {
      if (call.name === "ask_user_question") {
        i++;
        console.log(`\n----- ASK ${i} -----`);
        console.log(dump(call.arguments, 4000));
      }
    }
  }
  if (rec.type === "tool_result") {
    const name = rec.tool_name || rec.name || "";
    const content = rec.content || rec.result || rec;
    const s = typeof content === "string" ? content : JSON.stringify(content);
    if (
      name.includes("ask_user") ||
      s.includes("Selected:") ||
      s.includes("questions") ||
      s.includes("answers")
    ) {
      console.log("\n----- TOOL RESULT", name, "-----");
      console.log(dump(content, 2500));
    }
  }
}

console.log("\n\n=== REMAINING ASKS AFTER 9 ===");
let n = 0;
for (const rec of chat) {
  if (rec.type === "assistant" && rec.tool_calls) {
    for (const call of rec.tool_calls) {
      if (call.name === "ask_user_question") {
        n++;
        if (n >= 10) {
          console.log(`\n----- ASK ${n} -----`);
          console.log(dump(call.arguments, 5000));
        }
      }
    }
  }
}

console.log("\n\n=== UPDATES SAMPLE TYPES ===");
const updates = readJsonl(sessionDir + "\\updates.jsonl");
const ut = {};
for (const u of updates) {
  const t = u.type || u.sessionUpdate || (u.update && u.update.sessionUpdate) || "?";
  ut[t] = (ut[t] || 0) + 1;
}
console.log(ut);
console.log("\nfirst update keys", Object.keys(updates[0] || {}));
console.log(dump(updates[0], 800));
