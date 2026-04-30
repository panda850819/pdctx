import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

export async function runUse(contextName: string): Promise<void> {
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
