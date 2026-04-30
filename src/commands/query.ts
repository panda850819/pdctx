import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { loadContextsFromDefault } from "../engine/context.ts";
import { planQueryArgs } from "../engine/knowledge.ts";
import { log as auditLog } from "../engine/audit.ts";
import type { ContextDef } from "../schema/context.ts";
import { getDefaultRegistry } from "../adapters/registry.ts";
import type { BridgeQueryMode } from "../adapters/types.ts";

const STATE_FILE = join(homedir(), ".pdctx", "state", "active.toml");
const ADAPTER_NAME = "qmd";

export type QmdSubcommand = BridgeQueryMode;

export interface QueryRunOptions {
  collection?: string;
  limit?: string;
}

function readActiveContext(): { name: string; def: ContextDef } | null {
  if (!existsSync(STATE_FILE)) return null;
  const raw = parseToml(readFileSync(STATE_FILE, "utf-8")) as { context?: string };
  const name = raw.context;
  if (!name) return null;
  const { contexts } = loadContextsFromDefault();
  const def = contexts.get(name);
  if (!def) return null;
  return { name, def };
}

export async function runQuery(
  subcmd: QmdSubcommand,
  queryText: string,
  opts: QueryRunOptions,
): Promise<void> {
  const active = readActiveContext();
  const plan = planQueryArgs({
    context: active?.def ?? null,
    userCollection: opts.collection,
  });

  auditLog({
    event: "query",
    context: active?.name,
    payload: {
      subcmd,
      query: queryText,
      user_collection: opts.collection,
      action: plan.action,
      collections: plan.collections,
      reason: plan.reason,
    },
  });

  if (plan.action === "reject") {
    console.error(`pdctx: rejected — ${plan.reason}`);
    process.exit(1);
  }

  const adapter = getDefaultRegistry().get(ADAPTER_NAME);
  if (!adapter) {
    console.error(`pdctx: adapter "${ADAPTER_NAME}" not registered`);
    process.exit(1);
  }

  if (plan.action === "allow") {
    const { exitCode } = await adapter.query({
      mode: subcmd,
      text: queryText,
      collection: plan.collections[0],
      limit: opts.limit,
    });
    process.exit(exitCode);
  }

  // filter: run adapter once per allowed collection
  console.error(`pdctx: ${plan.reason}`);
  let lastCode = 0;
  for (const col of plan.collections) {
    console.error(`\n--- ${col} ---`);
    const { exitCode } = await adapter.query({
      mode: subcmd,
      text: queryText,
      collection: col,
      limit: opts.limit,
    });
    if (exitCode !== 0) lastCode = exitCode;
  }
  process.exit(lastCode);
}
