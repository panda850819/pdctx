import { chmodSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type { ContextDef } from "../schema/context.ts";
import { log } from "./audit.ts";

const MEMORY_ROOT = join(homedir(), ".pdctx", "memory");

export interface IsolationResult {
  active_path: string;
  firewalled: string[];
  unchanged: string[];
}

function safeRelative(target: string): string {
  const rel = relative(MEMORY_ROOT, target);
  if (rel.startsWith("..")) throw new Error(`[isolation] path escapes MEMORY_ROOT: ${target}`);
  return rel;
}

function patternToRegex(p: string): RegExp {
  const escaped = p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp("^" + escaped + "$");
}

function collectDirs(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    try {
      if (statSync(abs).isDirectory()) {
        acc.push(abs);
        collectDirs(abs, acc);
      }
    } catch {
      // stat failed, skip
    }
  }
}

export function applyFirewall(context: ContextDef): IsolationResult {
  const activePath = join(MEMORY_ROOT, context.memory.namespace);
  mkdirSync(activePath, { recursive: true });
  chmodSync(activePath, 0o700);

  // Collect all dirs BEFORE any chmod 000 to avoid EACCES mid-walk
  const allDirs: string[] = [];
  collectDirs(MEMORY_ROOT, allDirs);

  const regexes = context.memory.firewall_from.map(patternToRegex);

  const firewalled: string[] = [];
  const unchanged: string[] = [];

  for (const abs of allDirs) {
    const rel = safeRelative(abs);
    if (regexes.some((re) => re.test(rel))) {
      chmodSync(abs, 0o000);
      firewalled.push(abs);
    } else {
      unchanged.push(abs);
    }
  }

  log({
    event: "use",
    context: context.context.name,
    payload: { firewall_active: activePath, firewall_blocked: firewalled.length },
  });

  return { active_path: activePath, firewalled, unchanged };
}

export function restoreOne(namespace: string): { restored: string[] } {
  const root = join(MEMORY_ROOT, namespace);
  safeRelative(root);
  const restored: string[] = [];
  try {
    chmodSync(root, 0o700);
  } catch {
    return { restored };
  }
  const queue: string[] = [root];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    try {
      chmodSync(dir, 0o700);
      if (!restored.includes(dir)) restored.push(dir);
    } catch {
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      try {
        if (statSync(abs).isDirectory()) queue.push(abs);
      } catch {
        // skip unreadable entry
      }
    }
  }
  return { restored };
}

export function restoreAll(): { restored: string[] } {
  const queue: string[] = [MEMORY_ROOT];
  const restored: string[] = [];

  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch {
      chmodSync(dir, 0o700); restored.push(dir);
      try { entries = readdirSync(dir); } catch { continue; }
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      try { if (statSync(abs).isDirectory()) queue.push(abs); }
      catch { chmodSync(abs, 0o700); restored.push(abs); queue.push(abs); }
    }
    if (dir !== MEMORY_ROOT) {
      chmodSync(dir, 0o700);
      if (!restored.includes(dir)) restored.push(dir);
    }
  }

  log({ event: "use", payload: { firewall_restored: restored.length } });
  return { restored };
}

export function bootstrapMemoryTree(allNamespaces: string[]): { created: string[] } {
  const created: string[] = [];
  for (const ns of allNamespaces) {
    const abs = join(MEMORY_ROOT, ns);
    safeRelative(abs);
    let existed = false; try { statSync(abs); existed = true; } catch { /* new */ }
    mkdirSync(abs, { recursive: true });
    chmodSync(abs, 0o700);
    if (!existed) created.push(abs);
  }
  return { created };
}
