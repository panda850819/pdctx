import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";

export interface ContextDef {
  context: { name: string; description: string; domain: string; private: boolean };
  persona: { agent: string; voice_override: string };
  flow: { main: string; side: string[] };
  skills: { public: string[]; private: string[] };
  memory: { namespace: string; firewall_from: string[] };
  sources: { vault?: string; notion_workspace?: string; linear_team?: string };
  notes?: string;
}

function str(path: string, key: string, v: unknown): string {
  if (typeof v !== "string") throw new Error(`[pdctx] ${path}: "${key}" must be string, got ${typeof v}`);
  return v;
}

function bool(path: string, key: string, v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error(`[pdctx] ${path}: "${key}" must be boolean, got ${typeof v}`);
  return v;
}

function arr(path: string, key: string, v: unknown): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new Error(`[pdctx] ${path}: "${key}" must be string[]`);
  return v as string[];
}

function obj(path: string, key: string, v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null) throw new Error(`[pdctx] ${path}: missing [${key}]`);
  return v as Record<string, unknown>;
}

export function validate(raw: unknown, path = "<unknown>"): ContextDef {
  const o = obj(path, "<root>", raw);
  const c = obj(path, "context", o["context"]);
  const p = obj(path, "persona", o["persona"]);
  const f = obj(path, "flow", o["flow"]);
  const s = obj(path, "skills", o["skills"]);
  const m = obj(path, "memory", o["memory"]);
  const sr = o["sources"] !== undefined ? obj(path, "sources", o["sources"]) : ({} as Record<string, unknown>);
  const notes = o["notes"];

  return {
    context: {
      name: str(path, "context.name", c["name"]),
      description: str(path, "context.description", c["description"]),
      domain: str(path, "context.domain", c["domain"]),
      private: bool(path, "context.private", c["private"]),
    },
    persona: {
      agent: str(path, "persona.agent", p["agent"]),
      voice_override: str(path, "persona.voice_override", p["voice_override"]),
    },
    flow: {
      main: str(path, "flow.main", f["main"]),
      side: arr(path, "flow.side", f["side"]),
    },
    skills: {
      public: arr(path, "skills.public", s["public"]),
      private: arr(path, "skills.private", s["private"]),
    },
    memory: {
      namespace: str(path, "memory.namespace", m["namespace"]),
      firewall_from: arr(path, "memory.firewall_from", m["firewall_from"]),
    },
    sources: {
      ...(sr["vault"] !== undefined ? { vault: str(path, "sources.vault", sr["vault"]) } : {}),
      ...(sr["notion_workspace"] !== undefined ? { notion_workspace: str(path, "sources.notion_workspace", sr["notion_workspace"]) } : {}),
      ...(sr["linear_team"] !== undefined ? { linear_team: str(path, "sources.linear_team", sr["linear_team"]) } : {}),
    },
    ...(notes !== undefined && typeof notes !== "object" ? { notes: String(notes) } : {}),
  };
}

export function parse(absPath: string): ContextDef {
  return validate(parseToml(readFileSync(absPath, "utf-8")), absPath);
}
