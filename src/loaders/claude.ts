import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { log as auditLog } from "../engine/audit.ts";
import type { ContextDef } from "../schema/context.ts";

const CLAUDE_DIR = join(homedir(), ".claude");
const STATE_DIR = join(CLAUDE_DIR, "state");
const STATE_FILE = join(STATE_DIR, "pdctx-active.json");

export interface ApplyResult {
  runtime: "claude";
  written: string;
  applied_at: string;
}

export function apply(context: ContextDef): ApplyResult {
  if (!existsSync(CLAUDE_DIR)) {
    throw new Error("~/.claude/ not found — Claude Code shim required");
  }

  mkdirSync(STATE_DIR, { recursive: true });

  const applied_at = new Date().toISOString();

  const payload = {
    context_name: context.context.name,
    domain: context.context.domain,
    persona: {
      agent: context.persona.agent,
      voice_override: context.persona.voice_override,
    },
    skills: {
      public: context.skills.public,
      private: context.skills.private,
    },
    memory_namespace: context.memory.namespace,
    firewall_from: context.memory.firewall_from,
    sources: context.sources,
    applied_at,
    applied_by: "pdctx",
  };

  writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2));

  auditLog({
    event: "use",
    context: context.context.name,
    payload: { runtime: "claude", path: STATE_FILE },
  });

  return { runtime: "claude", written: STATE_FILE, applied_at };
}

export function clear(): void {
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
}
