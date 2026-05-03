import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ContextDef } from "../schema/context.ts";
import { log as auditLog } from "./audit.ts";

export type Runtime = "claude" | "codex";

export interface DispatchResult {
  id: string;
  output: string;
  exit_code: number;
  duration_s: number;
  error?: string;
}

export interface DispatchOptions {
  runtime?: Runtime;
  model?: string;
  timeout_ms?: number;
  onStream?: (chunk: string) => void;
  /** Working dir for the spawned runtime. Codex passes via `--cd`; claude via spawn cwd. Default: process.cwd(). */
  cwd?: string;
  /** Codex sandbox mode. Defaults to `workspace-write` so the agent can edit files in `cwd`. */
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  /**
   * Grant network access to the spawned runtime. Required for tasks that
   * query gbrain Postgres / Ollama / external APIs. For codex with
   * workspace-write sandbox, translates to
   * `-c sandbox_workspace_write.network_access=true`. No-op for claude
   * (claude doesn't sandbox network) or for `danger-full-access` (already
   * unrestricted).
   */
  allowNetwork?: boolean;
}

const STATE_DIR = join(homedir(), ".pdctx", "state");
const CALLS_FILE = join(STATE_DIR, "calls.jsonl");

function writeCallLine(obj: Record<string, unknown>): void {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(CALLS_FILE, JSON.stringify(obj) + "\n");
}

function formatSources(sources: ContextDef["sources"]): string {
  const parts: string[] = [];
  if (sources.vault) parts.push(`vault:${sources.vault}`);
  if (sources.notion_workspace) parts.push(`notion:${sources.notion_workspace}`);
  if (sources.linear_team) parts.push(`linear:${sources.linear_team}`);
  return parts.length > 0 ? parts.join(", ") : "(none)";
}

function buildPrompt(context: ContextDef, task: string): string {
  const allSkills = [...context.skills.public, ...context.skills.private];
  const skillList = allSkills.length > 0
    ? allSkills.map((s) => `  - ${s}`).join("\n")
    : "  (none)";
  return [
    `You are operating inside pdctx context "${context.context.name}".`,
    ``,
    `Persona: ${context.persona.agent || "(none)"}`,
    `Voice override: ${context.persona.voice_override || "(none)"}`,
    `Memory namespace: ${context.memory.namespace}`,
    `Sources allowed: ${formatSources(context.sources)}`,
    `Skills available (do NOT invoke any not in this list):`,
    skillList,
    ``,
    `Firewall: do NOT read files outside the namespace ${context.memory.namespace} or ${context.sources.vault ?? "<no vault>"}.`,
    ``,
    `---`,
    ``,
    `Task: ${task}`,
  ].join("\n");
}

export async function dispatch(
  context: ContextDef,
  task: string,
  opts?: DispatchOptions,
): Promise<DispatchResult> {
  const id = randomBytes(3).toString("hex");
  const runtime: Runtime = opts?.runtime ?? "claude";
  const timeout_ms = opts?.timeout_ms ?? 300000;
  const model = opts?.model ?? (runtime === "claude" ? "haiku" : "default");
  const prompt = buildPrompt(context, task);

  const startedAt = new Date().toISOString();
  writeCallLine({ id, context: context.context.name, task, status: "running", started_at: startedAt, runtime });

  auditLog({
    event: "call",
    context: context.context.name,
    payload: { id, runtime, model, task_excerpt: task.slice(0, 80) },
  });

  // Build command
  const cwd = opts?.cwd ?? process.cwd();
  const sandbox = opts?.sandbox ?? "workspace-write";
  const allowNetwork = opts?.allowNetwork ?? false;
  let cmd: string[];
  if (runtime === "claude") {
    cmd = ["claude", "-p", prompt, "--model", model];
  } else {
    // codex exec [--cd <dir>] [--sandbox <mode>] [-c <override>] [-m <model>] <PROMPT>
    cmd = ["codex", "exec", "--cd", cwd, "--sandbox", sandbox];
    // workspace-write sandbox blocks network by default; opt-in via config
    // override so codex can reach gbrain Postgres, Ollama, etc.
    if (allowNetwork && sandbox === "workspace-write") {
      cmd.push("-c", "sandbox_workspace_write.network_access=true");
    }
    if (model !== "default") cmd.push("-m", model);
    cmd.push(prompt);
  }

  const startTime = Date.now();
  let timedOut = false;

  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
  });

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
  }, timeout_ms);

  // Collect stdout — stream chunks if onStream provided
  let output = "";
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      output += chunk;
      opts?.onStream?.(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  // Collect stderr
  let stderrText = "";
  const stderrReader = proc.stderr.getReader();
  try {
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      stderrText += decoder.decode(value, { stream: true });
    }
  } finally {
    stderrReader.releaseLock();
  }

  const exitCode = await proc.exited;
  clearTimeout(timer);

  const duration_s = Math.round((Date.now() - startTime) / 100) / 10;
  const endedAt = new Date().toISOString();

  const error = timedOut
    ? `timeout after ${timeout_ms}ms`
    : exitCode !== 0 && stderrText.trim()
    ? stderrText.trim().slice(0, 300)
    : undefined;

  const status = error ? "error" : "done";

  writeCallLine({ id, status, ended_at: endedAt, duration_s, exit_code: exitCode, ...(error ? { error } : {}) });

  auditLog({
    event: "call",
    context: context.context.name,
    payload: { id, status, duration_s, exit_code: exitCode },
  });

  return { id, output: output.trim(), exit_code: exitCode, duration_s, ...(error ? { error } : {}) };
}
