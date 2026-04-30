import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { parse as parseContextFile } from "../schema/context.ts";
import { parse as parseConfig } from "../schema/config.ts";
import type { ContextDef, ContextOverlay } from "../schema/context.ts";
import type { PdctxConfig } from "../schema/config.ts";

const DEFAULT_CONFIG_PATH = join(homedir(), ".pdctx", "CONFIG.toml");

export interface LoadResult {
  contexts: Map<string, ContextDef>;
  sources: { name: string; path: string; count: number }[];
  warnings: string[];
  overlays_applied: { extends: string; path: string }[];
}

function dedupConcat(a: string[], b: string[] | undefined): string[] {
  if (!b || b.length === 0) return [...a];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...a, ...b]) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export function applyOverlay(base: ContextDef, overlay: ContextOverlay): ContextDef {
  const mergedKnowledge =
    overlay.knowledge !== undefined
      ? {
          allow: dedupConcat(base.knowledge?.allow ?? [], overlay.knowledge.allow),
          forbid: dedupConcat(base.knowledge?.forbid ?? [], overlay.knowledge.forbid),
        }
      : base.knowledge;

  return {
    context: { ...base.context, ...(overlay.context ?? {}) },
    persona: { ...base.persona, ...(overlay.persona ?? {}) },
    flow: {
      main: overlay.flow?.main ?? base.flow.main,
      side: dedupConcat(base.flow.side, overlay.flow?.side),
    },
    skills: {
      public: dedupConcat(base.skills.public, overlay.skills?.public),
      private: dedupConcat(base.skills.private, overlay.skills?.private),
    },
    memory: {
      namespace: overlay.memory?.namespace ?? base.memory.namespace,
      firewall_from: dedupConcat(base.memory.firewall_from, overlay.memory?.firewall_from),
    },
    sources: { ...base.sources, ...(overlay.sources ?? {}) },
    ...(mergedKnowledge !== undefined ? { knowledge: mergedKnowledge } : {}),
    ...(overlay.notes !== undefined
      ? { notes: overlay.notes }
      : base.notes !== undefined
        ? { notes: base.notes }
        : {}),
  };
}

export function loadContexts(config: PdctxConfig): LoadResult {
  const bases = new Map<string, { def: ContextDef; path: string; sourceName: string }>();
  const overlays: { def: ContextOverlay; path: string; sourceName: string }[] = [];
  const sources: LoadResult["sources"] = [];
  const warnings: string[] = [];

  for (const [name, rawPath] of Object.entries(config.stack.sources)) {
    const sourcePath = rawPath.startsWith("~") ? join(homedir(), rawPath.slice(1)) : rawPath;
    const candidateDirs = [
      join(sourcePath, "contexts"),
      join(sourcePath, "plugins", basename(sourcePath), "contexts"),
    ];

    const existingDirs = candidateDirs.filter((d) => existsSync(d));
    if (existingDirs.length === 0) {
      warnings.push(`[${name}] no contexts/ dir found at ${sourcePath}`);
      continue;
    }

    let count = 0;
    for (const dir of existingDirs) {
      for (const file of readdirSync(dir)) {
        if (extname(file) !== ".toml") continue;
        const filePath = join(dir, file);
        try {
          const parsed = parseContextFile(filePath);
          if (parsed.kind === "base") {
            const ctxName = parsed.def.context.name;
            if (bases.has(ctxName)) {
              const prior = bases.get(ctxName)!;
              warnings.push(
                `base collision "${ctxName}" — keeping ${prior.path}, ignoring ${filePath} (use [overlay] to extend instead)`,
              );
            } else {
              bases.set(ctxName, { def: parsed.def, path: filePath, sourceName: name });
            }
          } else {
            overlays.push({ def: parsed.def, path: filePath, sourceName: name });
          }
          count++;
        } catch (err) {
          warnings.push(`parse error ${filePath}: ${(err as Error).message}`);
        }
      }
    }
    sources.push({ name, path: sourcePath, count });
  }

  // Apply overlays in deterministic path order
  const sortedOverlays = [...overlays].sort((a, b) => a.path.localeCompare(b.path));
  const overlays_applied: LoadResult["overlays_applied"] = [];
  for (const overlay of sortedOverlays) {
    const baseEntry = bases.get(overlay.def.extends);
    if (!baseEntry) {
      warnings.push(
        `overlay ${overlay.path} extends "${overlay.def.extends}" but no base found — skipped`,
      );
      continue;
    }
    const merged = applyOverlay(baseEntry.def, overlay.def);
    bases.set(overlay.def.extends, {
      def: merged,
      path: baseEntry.path,
      sourceName: baseEntry.sourceName,
    });
    overlays_applied.push({ extends: overlay.def.extends, path: overlay.path });
  }

  const contexts = new Map<string, ContextDef>();
  for (const [name, entry] of bases) {
    contexts.set(name, entry.def);
  }

  return { contexts, sources, warnings, overlays_applied };
}

export function loadContextsFromDefault(): LoadResult {
  const config = parseConfig(DEFAULT_CONFIG_PATH);
  return loadContexts(config);
}
