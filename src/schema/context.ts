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

export interface ContextOverlay {
  extends: string;
  context?: Partial<ContextDef["context"]>;
  persona?: Partial<ContextDef["persona"]>;
  flow?: { main?: string; side?: string[] };
  skills?: { public?: string[]; private?: string[] };
  memory?: { namespace?: string; firewall_from?: string[] };
  sources?: ContextDef["sources"];
  notes?: string;
}

export type ParsedContextFile =
  | { kind: "base"; def: ContextDef; path: string }
  | { kind: "overlay"; def: ContextOverlay; path: string };

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

function strOpt(path: string, key: string, v: unknown): string | undefined {
  if (v === undefined) return undefined;
  return str(path, key, v);
}

function boolOpt(path: string, key: string, v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  return bool(path, key, v);
}

function arrOpt(path: string, key: string, v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  return arr(path, key, v);
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

export function validateOverlay(raw: unknown, path = "<unknown>"): ContextOverlay {
  const o = obj(path, "<root>", raw);
  const ovl = obj(path, "overlay", o["overlay"]);
  const extendsName = str(path, "overlay.extends", ovl["extends"]);

  const out: ContextOverlay = { extends: extendsName };

  if (o["context"] !== undefined) {
    const c = obj(path, "context", o["context"]);
    const partial: Partial<ContextDef["context"]> = {};
    const name = strOpt(path, "context.name", c["name"]);
    if (name !== undefined) partial.name = name;
    const description = strOpt(path, "context.description", c["description"]);
    if (description !== undefined) partial.description = description;
    const domain = strOpt(path, "context.domain", c["domain"]);
    if (domain !== undefined) partial.domain = domain;
    const priv = boolOpt(path, "context.private", c["private"]);
    if (priv !== undefined) partial.private = priv;
    if (Object.keys(partial).length > 0) out.context = partial;
  }

  if (o["persona"] !== undefined) {
    const p = obj(path, "persona", o["persona"]);
    const partial: Partial<ContextDef["persona"]> = {};
    const agent = strOpt(path, "persona.agent", p["agent"]);
    if (agent !== undefined) partial.agent = agent;
    const voice = strOpt(path, "persona.voice_override", p["voice_override"]);
    if (voice !== undefined) partial.voice_override = voice;
    if (Object.keys(partial).length > 0) out.persona = partial;
  }

  if (o["flow"] !== undefined) {
    const f = obj(path, "flow", o["flow"]);
    const partial: { main?: string; side?: string[] } = {};
    const main = strOpt(path, "flow.main", f["main"]);
    if (main !== undefined) partial.main = main;
    const side = arrOpt(path, "flow.side", f["side"]);
    if (side !== undefined) partial.side = side;
    if (Object.keys(partial).length > 0) out.flow = partial;
  }

  if (o["skills"] !== undefined) {
    const s = obj(path, "skills", o["skills"]);
    const partial: { public?: string[]; private?: string[] } = {};
    const pub = arrOpt(path, "skills.public", s["public"]);
    if (pub !== undefined) partial.public = pub;
    const prv = arrOpt(path, "skills.private", s["private"]);
    if (prv !== undefined) partial.private = prv;
    if (Object.keys(partial).length > 0) out.skills = partial;
  }

  if (o["memory"] !== undefined) {
    const m = obj(path, "memory", o["memory"]);
    const partial: { namespace?: string; firewall_from?: string[] } = {};
    const ns = strOpt(path, "memory.namespace", m["namespace"]);
    if (ns !== undefined) partial.namespace = ns;
    const fw = arrOpt(path, "memory.firewall_from", m["firewall_from"]);
    if (fw !== undefined) partial.firewall_from = fw;
    if (Object.keys(partial).length > 0) out.memory = partial;
  }

  if (o["sources"] !== undefined) {
    const sr = obj(path, "sources", o["sources"]);
    const partial: ContextDef["sources"] = {};
    const vault = strOpt(path, "sources.vault", sr["vault"]);
    if (vault !== undefined) partial.vault = vault;
    const nw = strOpt(path, "sources.notion_workspace", sr["notion_workspace"]);
    if (nw !== undefined) partial.notion_workspace = nw;
    const lt = strOpt(path, "sources.linear_team", sr["linear_team"]);
    if (lt !== undefined) partial.linear_team = lt;
    if (Object.keys(partial).length > 0) out.sources = partial;
  }

  if (o["notes"] !== undefined && typeof o["notes"] !== "object") {
    out.notes = String(o["notes"]);
  }

  return out;
}

export function parse(absPath: string): ParsedContextFile {
  const raw = parseToml(readFileSync(absPath, "utf-8")) as Record<string, unknown>;
  const ovl = raw["overlay"];
  if (ovl !== undefined && typeof ovl === "object" && ovl !== null && "extends" in (ovl as Record<string, unknown>)) {
    return { kind: "overlay", def: validateOverlay(raw, absPath), path: absPath };
  }
  return { kind: "base", def: validate(raw, absPath), path: absPath };
}
