import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { log as auditLog } from "../engine/audit.ts";
import type { ContextDef } from "../schema/context.ts";

export interface ApplyResult {
  runtime: "codex";
  written: string;
  applied_at: string;
}

const CODEX_HOME = join(homedir(), ".codex");
const STATE_FILE = join(CODEX_HOME, "state", "pdctx-active.json");

export function apply(context: ContextDef): ApplyResult {
  if (!existsSync(CODEX_HOME)) {
    throw new Error("~/.codex/ not found — Codex CLI shim required");
  }

  const stateDir = join(CODEX_HOME, "state");
  mkdirSync(stateDir, { recursive: true });

  const applied_at = new Date().toISOString();
  const payload = {
    context_name: context.context.name,
    domain: context.context.domain,
    persona: { agent: context.persona.agent, voice_override: context.persona.voice_override },
    skills: { public: context.skills.public, private: context.skills.private },
    memory_namespace: context.memory.namespace,
    firewall_from: context.memory.firewall_from,
    sources: context.sources,
    mcp_deny: context.mcp?.deny ?? [],
    applied_at,
    applied_by: "pdctx",
  };

  writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2));

  auditLog({
    event: "use",
    context: context.context.name,
    payload: { runtime: "codex", path: STATE_FILE },
  });

  return { runtime: "codex", written: STATE_FILE, applied_at };
}

export function clear(): void {
  if (existsSync(STATE_FILE)) {
    rmSync(STATE_FILE);
  }
}
