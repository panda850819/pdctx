import { apply as claudeApply, clear as claudeClear } from "../loaders/claude.ts";
import { apply as codexApply, clear as codexClear } from "../loaders/codex.ts";
import { log as auditLog } from "./audit.ts";
import type { ContextDef } from "../schema/context.ts";
import type { PdctxConfig } from "../schema/config.ts";

export interface SyncResult {
  applied: { runtime: string; path: string }[];
  skipped: { runtime: string; reason: string }[];
  failed: { runtime: string; error: string }[];
}

const UNIMPLEMENTED = new Set(["hermes", "gemini"]);

export function sync(context: ContextDef, config: PdctxConfig): SyncResult {
  const applied: SyncResult["applied"] = [];
  const skipped: SyncResult["skipped"] = [];
  const failed: SyncResult["failed"] = [];

  const runtimes = config.runtimes as Record<string, boolean | undefined>;

  for (const [runtime, enabled] of Object.entries(runtimes)) {
    if (!enabled) {
      skipped.push({ runtime, reason: "disabled in config" });
      continue;
    }
    if (UNIMPLEMENTED.has(runtime)) {
      skipped.push({ runtime, reason: "runtime not yet implemented (v0.5)" });
      continue;
    }
    try {
      let result: { written: string };
      if (runtime === "claude") result = claudeApply(context);
      else if (runtime === "codex") result = codexApply(context);
      else { skipped.push({ runtime, reason: "runtime not yet implemented (v0.5)" }); continue; }
      applied.push({ runtime, path: result.written });
    } catch (err) {
      failed.push({ runtime, error: err instanceof Error ? err.message : String(err) });
    }
  }

  auditLog({
    event: "use",
    context: context.context.name,
    payload: { applied: applied.length, failed: failed.length, skipped: skipped.length },
  });

  return { applied, skipped, failed };
}

export function clearAll(config: PdctxConfig): void {
  const runtimes = config.runtimes as Record<string, boolean | undefined>;
  for (const [runtime, enabled] of Object.entries(runtimes)) {
    if (!enabled || UNIMPLEMENTED.has(runtime)) continue;
    try {
      if (runtime === "claude") claudeClear();
      else if (runtime === "codex") codexClear();
    } catch {
      // best-effort
    }
  }
}
