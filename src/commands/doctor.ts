import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { getDefaultRegistry } from "../adapters/registry.ts";

const PDCTX_HOME = join(homedir(), ".pdctx");

interface Check {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface AliasState {
  rcPath: string;
  hasPd: boolean;
  hasPds: boolean;
}

function shellRcPath(shell = process.env["SHELL"] ?? ""): string {
  const name = basename(shell);
  if (name === "bash") return join(homedir(), ".bashrc");
  if (name === "fish") return join(homedir(), ".config", "fish", "config.fish");
  return join(homedir(), ".zshrc");
}

export function inspectAliasState(rcPath = shellRcPath()): AliasState {
  if (!existsSync(rcPath)) {
    return { rcPath, hasPd: false, hasPds: false };
  }
  const content = readFileSync(rcPath, "utf8");
  return {
    rcPath,
    hasPd: /^\s*alias\s+pd=/m.test(content),
    hasPds: /^\s*alias\s+pds=/m.test(content),
  };
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

  const reports = await getDefaultRegistry().healthAll();
  for (const r of reports) {
    checks.push({
      name: `bridge:${r.name}`,
      status: r.health.status,
      detail: r.health.detail,
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

  const aliases = inspectAliasState();
  console.log("\nShell aliases:");
  if (aliases.hasPd && aliases.hasPds) {
    console.log("✓ pd / pds aliases configured");
  } else {
    console.log(`! pd / pds aliases missing in ${aliases.rcPath}`);
    console.log("Suggested: alias pd='pdctx use' && alias pds='pdctx switch'  >> ~/.zshrc");
  }
}

void statSync;
