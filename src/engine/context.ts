import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { parse as parseContext } from "../schema/context.ts";
import { parse as parseConfig } from "../schema/config.ts";
import type { ContextDef } from "../schema/context.ts";
import type { PdctxConfig } from "../schema/config.ts";

const DEFAULT_CONFIG_PATH = join(homedir(), ".pdctx", "CONFIG.toml");

export interface LoadResult {
  contexts: Map<string, ContextDef>;
  sources: { name: string; path: string; count: number }[];
  warnings: string[];
}

export function loadContexts(config: PdctxConfig): LoadResult {
  const contexts = new Map<string, ContextDef>();
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
          const def = parseContext(filePath);
          const ctxName = def.context.name;
          if (contexts.has(ctxName)) {
            warnings.push(`name collision "${ctxName}" — overriding with ${filePath}`);
          }
          contexts.set(ctxName, def);
          count++;
        } catch (err) {
          warnings.push(`parse error ${filePath}: ${(err as Error).message}`);
        }
      }
    }
    sources.push({ name, path: sourcePath, count });
  }

  return { contexts, sources, warnings };
}

export function loadContextsFromDefault(): LoadResult {
  const config = parseConfig(DEFAULT_CONFIG_PATH);
  return loadContexts(config);
}
