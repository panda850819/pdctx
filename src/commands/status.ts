import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

const STATE_DIR = join(homedir(), ".pdctx", "state");
const ACTIVE_FILE = join(STATE_DIR, "active.toml");
const CALLS_FILE = join(STATE_DIR, "calls.jsonl");

function ago(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function elapsed(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function truncate(s: string, len = 30): string {
  return s.length > len ? s.slice(0, len - 3) + "..." : s;
}

interface CallEntry {
  id: string;
  context: string;
  task: string;
  status: string;
  started_at: string;
  ended_at?: string;
  runtime: string;
  error?: string;
  duration_s?: number;
}

export async function runStatus(): Promise<void> {
  console.log("pdctx status\n");

  // --- active.toml ---
  if (existsSync(ACTIVE_FILE)) {
    const raw = readFileSync(ACTIVE_FILE, "utf8");
    const doc = parseToml(raw) as { context?: string; activated_at?: string; runtimes?: string[] };
    const ctx = doc.context ?? "<none>";
    console.log(`Active context:  ${ctx}`);
    if (doc.activated_at) {
      const ts = new Date(doc.activated_at).toISOString().replace("T", " ").slice(0, 19);
      console.log(`Activated at:    ${ts} (${ago(doc.activated_at)})`);
    }
    if (doc.runtimes && doc.runtimes.length > 0) {
      console.log(`Runtimes:        ${doc.runtimes.join(", ")}`);
    }
  } else {
    console.log("Active context: <none>");
  }

  // --- calls.jsonl ---
  if (!existsSync(CALLS_FILE)) {
    console.log("\nIn-flight calls (0)");
    return;
  }

  const allLines = readFileSync(CALLS_FILE, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Partial<CallEntry> & { id: string; status: string });

  const byId = new Map<string, CallEntry>();
  for (const entry of allLines) {
    const prev = byId.get(entry.id);
    byId.set(entry.id, { ...(prev ?? {}), ...entry } as CallEntry);
  }
  const calls = Array.from(byId.values());

  const running = calls.filter((c) => c.status === "running");
  const done = calls.filter((c) => c.status !== "running").reverse().slice(0, 5);

  console.log(`\nIn-flight calls (${running.length}):`);
  for (const c of running) {
    console.log(`  ${c.id}  ${c.context.padEnd(20)} "${truncate(c.task)}" (${elapsed(c.started_at)}, ${c.runtime})`);
  }

  if (done.length > 0) {
    console.log(`\nRecent calls (last ${done.length}):`);
    for (const c of done) {
      const sym = c.status === "done" ? "✓" : "✗";
      const dur = c.duration_s != null ? `${c.duration_s}s` : c.ended_at ? elapsed(c.started_at) : "?";
      const errNote = c.error ? ` — error` : "";
      const endedNote = c.ended_at ? ago(c.ended_at) : ago(c.started_at);
      console.log(`  ${c.id}  ${sym} ${c.context.padEnd(20)} "${truncate(c.task)}" (${endedNote}, ${c.runtime}, ${dur}${errNote})`);
    }
  }
}
