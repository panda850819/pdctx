import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseConfig } from "../schema/config.ts";
import { loadContextsFromDefault } from "../engine/context.ts";
import { restoreOne } from "../engine/isolation.ts";
import { clearAll } from "../engine/sync.ts";
import { log as auditLog } from "../engine/audit.ts";
import type { ContextDef } from "../schema/context.ts";

const PDCTX_HOME = join(homedir(), ".pdctx");
const MEMORY_DIR = join(PDCTX_HOME, "memory");
const ARCHIVE_DIR = join(MEMORY_DIR, "_archive");
const STATE_FILE = join(PDCTX_HOME, "state", "active.toml");

export interface OffboardOptions {
  purge?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export interface OffboardPlan {
  context_name: string;
  namespace: string;
  namespace_dir: string;
  archived_path?: string;
  action: "archive" | "purge" | "absent";
  was_active: boolean;
  blocked_by_active: boolean;
}

const ARCHIVE_TIMESTAMP_KEY = /[:.]/g;

export function planOffboard(
  ctx: ContextDef,
  args: { purge?: boolean; force?: boolean; activeName?: string; now?: Date; memoryExists: boolean },
): OffboardPlan {
  const namespace = ctx.memory.namespace;
  const namespaceDir = join(MEMORY_DIR, ...namespace.split("/"));
  const wasActive = args.activeName === ctx.context.name;
  const blockedByActive = wasActive && !args.force;

  let action: OffboardPlan["action"];
  let archivedPath: string | undefined;

  if (!args.memoryExists) {
    action = "absent";
  } else if (args.purge) {
    action = "purge";
  } else {
    action = "archive";
    const ts = (args.now ?? new Date()).toISOString().replace(ARCHIVE_TIMESTAMP_KEY, "-");
    const safe = namespace.replace(/\//g, "_");
    archivedPath = join(ARCHIVE_DIR, `${safe}-${ts}`);
  }

  return {
    context_name: ctx.context.name,
    namespace,
    namespace_dir: namespaceDir,
    archived_path: archivedPath,
    action,
    was_active: wasActive,
    blocked_by_active: blockedByActive,
  };
}

function readActiveContextName(): string | undefined {
  if (!existsSync(STATE_FILE)) return undefined;
  try {
    const raw = parseToml(readFileSync(STATE_FILE, "utf-8")) as Record<string, unknown>;
    const v = raw["context"];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export async function runOffboard(contextName: string, opts: OffboardOptions = {}): Promise<void> {
  const { contexts } = loadContextsFromDefault();
  const ctx = contexts.get(contextName);
  if (!ctx) {
    const available = [...contexts.keys()].sort().join("\n  ");
    console.error(`error: context "${contextName}" not found.\navailable:\n  ${available}`);
    process.exit(1);
  }

  const activeName = readActiveContextName();
  const memoryExists = existsSync(join(MEMORY_DIR, ...ctx.memory.namespace.split("/")));
  const plan = planOffboard(ctx, {
    purge: opts.purge,
    force: opts.force,
    activeName,
    memoryExists,
  });

  if (plan.blocked_by_active) {
    console.error(
      `error: "${contextName}" is currently active. Switch to another context first or pass --force.`,
    );
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(`[dry-run] offboard ${contextName}`);
    console.log(`  namespace:    ${plan.namespace}`);
    console.log(`  memory dir:   ${plan.namespace_dir}`);
    console.log(`  action:       ${plan.action}`);
    if (plan.archived_path) console.log(`  archive to:   ${plan.archived_path}`);
    console.log(`  was active:   ${plan.was_active}`);
    return;
  }

  // Execute
  if (plan.action === "archive") {
    restoreOne(plan.namespace);
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    renameSync(plan.namespace_dir, plan.archived_path!);
  } else if (plan.action === "purge") {
    restoreOne(plan.namespace);
    rmSync(plan.namespace_dir, { recursive: true, force: true });
  }

  if (plan.was_active) {
    const config = parseConfig(join(PDCTX_HOME, "CONFIG.toml"));
    clearAll(config);
    if (existsSync(STATE_FILE)) {
      rmSync(STATE_FILE);
    }
  }

  auditLog({
    event: "offboard",
    context: contextName,
    payload: {
      action: plan.action,
      archived_path: plan.archived_path,
      was_active: plan.was_active,
      purge: !!opts.purge,
      force: !!opts.force,
    },
  });

  console.log(`✓ offboard ${contextName}`);
  console.log(`  memory: ${plan.action}${plan.archived_path ? ` → ${plan.archived_path}` : ""}`);
  if (plan.was_active) {
    console.log(`  was active: yes (cleared runtime state on claude + codex + ~/.pdctx/state/active.toml)`);
  }
}
