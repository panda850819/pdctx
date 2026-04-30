import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { loadContextsFromDefault } from "../engine/context.ts";
import { planQueryArgs } from "../engine/knowledge.ts";
import { log as auditLog } from "../engine/audit.ts";
import type { ContextDef } from "../schema/context.ts";

const STATE_FILE = join(homedir(), ".pdctx", "state", "active.toml");

export type QmdSubcommand = "search" | "vsearch" | "query";

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

function spawnQmd(subcmd: QmdSubcommand, queryText: string, collection: string | undefined, limit: string | undefined): Promise<number> {
  return new Promise((resolve) => {
    const args: string[] = [subcmd, queryText];
    if (collection) args.push("-c", collection);
    if (limit) args.push("-n", limit);
    const child = spawn("qmd", args, { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      console.error(`[pdctx] qmd spawn failed: ${err.message}`);
      resolve(1);
    });
  });
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

  if (plan.action === "allow") {
    const exitCode = await spawnQmd(
      subcmd,
      queryText,
      plan.collections[0],
      opts.limit,
    );
    process.exit(exitCode);
  }

  // filter: run qmd once per allowed collection
  console.error(`pdctx: ${plan.reason}`);
  let lastCode = 0;
  for (const col of plan.collections) {
    console.error(`\n--- ${col} ---`);
    const code = await spawnQmd(subcmd, queryText, col, opts.limit);
    if (code !== 0) lastCode = code;
  }
  process.exit(lastCode);
}
