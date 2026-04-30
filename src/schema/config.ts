import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";

export interface PdctxConfig {
  schema_version: number;
  active: { context: string };
  stack: { sources: Record<string, string> };
  runtimes: { claude: boolean; codex: boolean; hermes?: boolean; gemini?: boolean };
  hooks: { on_context_activate?: string; on_context_deactivate?: string };
}

function field(path: string, key: string, val: unknown, type: string): void {
  if (typeof val !== type) {
    throw new Error(`[pdctx] ${path}: field "${key}" must be ${type}, got ${typeof val}`);
  }
}

export function validate(obj: unknown, path = "<unknown>"): PdctxConfig {
  if (typeof obj !== "object" || obj === null) {
    throw new Error(`[pdctx] ${path}: top-level must be an object`);
  }
  const o = obj as Record<string, unknown>;

  // schema_version
  field(path, "schema_version", o["schema_version"], "number");

  // [active]
  const act = o["active"];
  if (typeof act !== "object" || act === null) throw new Error(`[pdctx] ${path}: missing [active]`);
  const a = act as Record<string, unknown>;
  field(path, "active.context", a["context"], "string");

  // [stack]
  const stk = o["stack"];
  if (typeof stk !== "object" || stk === null) throw new Error(`[pdctx] ${path}: missing [stack]`);
  const st = stk as Record<string, unknown>;
  const srcs = st["sources"] ?? {};
  if (typeof srcs !== "object" || srcs === null) throw new Error(`[pdctx] ${path}: [stack.sources] must be an object`);
  const sourcesRec = srcs as Record<string, unknown>;
  for (const [k, v] of Object.entries(sourcesRec)) {
    if (typeof v !== "string") throw new Error(`[pdctx] ${path}: stack.sources["${k}"] must be string`);
  }

  // [runtimes]
  const rt = o["runtimes"];
  if (typeof rt !== "object" || rt === null) throw new Error(`[pdctx] ${path}: missing [runtimes]`);
  const r = rt as Record<string, unknown>;
  field(path, "runtimes.claude", r["claude"], "boolean");
  field(path, "runtimes.codex", r["codex"], "boolean");
  if (r["hermes"] !== undefined) field(path, "runtimes.hermes", r["hermes"], "boolean");
  if (r["gemini"] !== undefined) field(path, "runtimes.gemini", r["gemini"], "boolean");

  // [hooks] — fully optional
  const hk = o["hooks"] ?? {};
  if (typeof hk !== "object" || hk === null) throw new Error(`[pdctx] ${path}: [hooks] must be an object`);
  const h = hk as Record<string, unknown>;
  if (h["on_context_activate"] !== undefined) field(path, "hooks.on_context_activate", h["on_context_activate"], "string");
  if (h["on_context_deactivate"] !== undefined) field(path, "hooks.on_context_deactivate", h["on_context_deactivate"], "string");

  return {
    schema_version: o["schema_version"] as number,
    active: { context: a["context"] as string },
    stack: { sources: sourcesRec as Record<string, string> },
    runtimes: {
      claude: r["claude"] as boolean,
      codex: r["codex"] as boolean,
      ...(r["hermes"] !== undefined ? { hermes: r["hermes"] as boolean } : {}),
      ...(r["gemini"] !== undefined ? { gemini: r["gemini"] as boolean } : {}),
    },
    hooks: {
      ...(h["on_context_activate"] !== undefined ? { on_context_activate: h["on_context_activate"] as string } : {}),
      ...(h["on_context_deactivate"] !== undefined ? { on_context_deactivate: h["on_context_deactivate"] as string } : {}),
    },
  };
}

export function parse(absPath: string): PdctxConfig {
  const raw = readFileSync(absPath, "utf-8");
  const obj = parseToml(raw);
  return validate(obj, absPath);
}
