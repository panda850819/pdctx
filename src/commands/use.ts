import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { stringify } from "smol-toml";
import { parse as parseConfig } from "../schema/config.ts";
import { loadContextsFromDefault } from "../engine/context.ts";
import { bootstrapMemoryTree, applyFirewall } from "../engine/isolation.ts";
import { sync } from "../engine/sync.ts";
import { log as auditLog } from "../engine/audit.ts";

const PDCTX_HOME = join(homedir(), ".pdctx");
const CONFIG_PATH = join(PDCTX_HOME, "CONFIG.toml");
const STATE_DIR = join(PDCTX_HOME, "state");
const STATE_FILE = join(STATE_DIR, "active.toml");

export interface InferRule {
  path: string;
  contextName: string;
  label: string;
}

export interface InferResult {
  contextName: string;
  label: string;
}

export interface UseOptions {
  infer?: boolean;
  cwd?: string;
}

const SITE_ROOT = join(homedir(), "site");
const PERSONAL_VAULT = join(SITE_ROOT, "knowledge", "obsidian-vault");

export const INFER_RULES: InferRule[] = [
  {
    path: join(SITE_ROOT, "knowledge", "work-vault"),
    contextName: "work:yei:ops",
    label: "~/site/knowledge/work-vault/*",
  },
  {
    path: join(PERSONAL_VAULT, "Blog", "_daily"),
    contextName: "personal:writer",
    label: "~/site/knowledge/obsidian-vault/Blog/_daily/*",
  },
  {
    path: join(PERSONAL_VAULT, "Blog", "Drafts"),
    contextName: "personal:writer",
    label: "~/site/knowledge/obsidian-vault/Blog/Drafts/*",
  },
  {
    path: join(SITE_ROOT, "cli"),
    contextName: "personal:developer",
    label: "~/site/cli/*",
  },
  {
    path: join(SITE_ROOT, "apps"),
    contextName: "personal:developer",
    label: "~/site/apps/*",
  },
  {
    path: join(SITE_ROOT, "skills"),
    contextName: "personal:developer",
    label: "~/site/skills/*",
  },
  {
    path: join(SITE_ROOT, "infra"),
    contextName: "personal:developer",
    label: "~/site/infra/*",
  },
  {
    path: join(SITE_ROOT, "trading"),
    contextName: "personal:trader",
    label: "~/site/trading/*",
  },
];

function isInsidePath(cwd: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(cwd));
  return rel === "" || (!rel.startsWith("..") && rel !== ".." && !isAbsolute(rel));
}

export function inferContextFromCwd(cwd: string = process.cwd()): InferResult | null {
  for (const rule of INFER_RULES) {
    if (isInsidePath(cwd, rule.path)) {
      return { contextName: rule.contextName, label: rule.label };
    }
  }
  return null;
}

export function resolveUseContext(
  contextName: string | undefined,
  opts: UseOptions = {},
): { contextName: string; inferred?: InferResult; usedFallback: boolean } {
  if (!opts.infer) {
    if (!contextName) {
      throw new Error("context required unless --infer is passed");
    }
    return { contextName, usedFallback: false };
  }

  const inferred = inferContextFromCwd(opts.cwd);
  if (inferred) {
    return { contextName: inferred.contextName, inferred, usedFallback: false };
  }

  if (contextName) {
    return { contextName, usedFallback: true };
  }

  const cwd = opts.cwd ?? process.cwd();
  throw new Error(`no inference rule for ${cwd}; use \`pdctx switch <name>\` instead`);
}

export async function activateContext(contextName: string): Promise<void> {
  // 1. Load config
  if (!existsSync(CONFIG_PATH)) {
    console.error(`error: ~/.pdctx/CONFIG.toml not found — run \`pdctx init\` first`);
    process.exit(1);
  }
  const config = parseConfig(CONFIG_PATH);

  // 2. Load contexts
  const { contexts, warnings } = loadContextsFromDefault();
  for (const w of warnings) console.warn(`warn: ${w}`);

  // 3. Resolve context
  if (!contexts.has(contextName)) {
    const available = [...contexts.keys()].sort().join("\n  ");
    console.error(`error: context "${contextName}" not found.\navailable:\n  ${available}`);
    process.exit(1);
  }
  const activeContext = contexts.get(contextName)!;

  // 4. Bootstrap memory tree
  const allNamespaces = Array.from(contexts.values()).map((c) => c.memory.namespace);
  const { created } = bootstrapMemoryTree(allNamespaces);
  if (created.length > 0) {
    console.log(`memory: bootstrapped ${created.length} new namespace(s)`);
  }

  // 5. Apply firewall
  const fw = applyFirewall(activeContext);
  const activePart = fw.active_path.replace(join(PDCTX_HOME, "memory") + "/", "");
  console.log(`firewall: active=${activePart}, blocked=${fw.firewalled.length} dirs`);

  // 6. Sync runtimes
  const { applied, failed } = sync(activeContext, config);
  const syncParts = applied.map((a) => `${a.runtime} ✓`).join(", ");
  const syncLine = syncParts || "(none applied)";
  console.log(`sync: ${syncLine}`);
  for (const f of failed) {
    console.error(`sync error [${f.runtime}]: ${f.error}`);
  }

  // 7. Write state file
  mkdirSync(STATE_DIR, { recursive: true });
  const stateObj = {
    context: contextName,
    activated_at: new Date().toISOString(),
    runtimes: applied.map((a) => a.runtime),
  };
  writeFileSync(STATE_FILE, stringify(stateObj));

  // 8. Audit
  auditLog({
    event: "use",
    context: contextName,
    payload: {
      firewall_blocked: fw.firewalled.length,
      runtimes_applied: applied.map((a) => a.runtime),
    },
  });

  // 9. Final summary
  console.log(`✓ pdctx use ${contextName}`);
}

export async function runUse(contextName?: string, opts: UseOptions = {}): Promise<void> {
  let resolved: ReturnType<typeof resolveUseContext>;
  try {
    resolved = resolveUseContext(contextName, opts);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    process.exit(1);
  }

  if (resolved.inferred) {
    console.log(`inferred: ${resolved.contextName} (matched ${resolved.inferred.label})`);
  } else if (resolved.usedFallback) {
    const cwd = opts.cwd ?? process.cwd();
    console.log(`inferred: ${resolved.contextName} (fallback; no rule matched for ${cwd})`);
  }

  await activateContext(resolved.contextName);
}
