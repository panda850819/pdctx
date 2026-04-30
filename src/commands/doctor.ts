import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PDCTX_HOME = join(homedir(), ".pdctx");

interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export async function runDoctor(): Promise<void> {
  const checks: Check[] = [];

  checks.push({
    name: "bun version",
    status: "ok",
    detail: `${Bun.version} (require >=1.3.0)`,
  });

  const pdctxHomeExists = existsSync(PDCTX_HOME);
  checks.push({
    name: "~/.pdctx layout",
    status: pdctxHomeExists ? "ok" : "warn",
    detail: pdctxHomeExists
      ? PDCTX_HOME
      : `${PDCTX_HOME} missing — run \`pdctx init\` to bootstrap`,
  });

  if (pdctxHomeExists) {
    for (const sub of ["CONFIG.toml", "memory", "audit", "state"]) {
      const path = join(PDCTX_HOME, sub);
      checks.push({
        name: `~/.pdctx/${sub}`,
        status: existsSync(path) ? "ok" : "warn",
        detail: existsSync(path) ? path : "missing",
      });
    }
  }

  for (const runtime of [
    { label: "Claude Code shim", path: join(homedir(), ".claude") },
    { label: "Codex CLI shim", path: join(homedir(), ".codex") },
  ]) {
    checks.push({
      name: runtime.label,
      status: existsSync(runtime.path) ? "ok" : "warn",
      detail: existsSync(runtime.path)
        ? runtime.path
        : `${runtime.path} not found — pdctx sync will skip this runtime`,
    });
  }

  const symbol = { ok: "✓", warn: "!", fail: "✗" } as const;
  for (const c of checks) {
    console.log(`${symbol[c.status]} ${c.name.padEnd(28)} ${c.detail}`);
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void statSync;
