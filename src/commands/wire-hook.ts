/**
 * pdctx wire-hook
 *
 * Idempotent hook installation for detected runtimes.
 *
 * Claude:
 *   - Ensures ~/.claude/hooks/pre-tool-use/pdctx-mcp-firewall.sh is executable (chmod +x)
 *   - Ensures ~/.claude/settings.json has a PreToolUse entry with matcher "mcp__.*"
 *     pointing at the hook script. Does NOT double-add if already present.
 *
 * Codex:
 *   - Logs a notice that Codex PreToolUse hook is blocked on upstream support.
 *     No file mutations.
 *
 * Pure planning function (planWireHook) is exported for unit testing.
 * All side effects are isolated to runWireHook().
 */

import { existsSync, readFileSync, chmodSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

export const CLAUDE_HOOK_SCRIPT = join(
  HOME,
  ".claude/hooks/pre-tool-use/pdctx-mcp-firewall.sh",
);
export const CLAUDE_SETTINGS = join(HOME, ".claude/settings.json");
export const CODEX_BINARY = "codex";

/** What wire-hook plans to do for a given runtime. */
export type RuntimePlan =
  | { runtime: "claude"; action: "chmod_and_wire" | "chmod_only" | "wire_only" | "already_wired" | "script_missing" }
  | { runtime: "codex"; action: "notice_only" }
  | { runtime: "codex"; action: "not_detected" };

export interface WireHookPlan {
  runtimes: RuntimePlan[];
}

export interface WireHookInput {
  /** Path to the Claude hook script (injectable for tests). */
  claudeHookScript?: string;
  /** Path to ~/.claude/settings.json (injectable for tests). */
  claudeSettings?: string;
  /** Whether the Claude binary is detected as installed. */
  claudeInstalled?: boolean;
  /** Whether the Codex binary is detected as installed. */
  codexInstalled?: boolean;
}

/**
 * Pure planning function. Returns what wire-hook *would* do without doing it.
 * Does NOT read from disk — callers supply observed state as input.
 */
export function planWireHook(input: {
  claudeInstalled: boolean;
  codexInstalled: boolean;
  claudeScriptExists: boolean;
  claudeScriptExecutable: boolean;
  claudeSettingsHasEntry: boolean;
}): WireHookPlan {
  const runtimes: RuntimePlan[] = [];

  if (input.claudeInstalled) {
    if (!input.claudeScriptExists) {
      runtimes.push({ runtime: "claude", action: "script_missing" });
    } else if (input.claudeSettingsHasEntry && input.claudeScriptExecutable) {
      runtimes.push({ runtime: "claude", action: "already_wired" });
    } else if (!input.claudeScriptExecutable && !input.claudeSettingsHasEntry) {
      runtimes.push({ runtime: "claude", action: "chmod_and_wire" });
    } else if (!input.claudeScriptExecutable) {
      runtimes.push({ runtime: "claude", action: "chmod_only" });
    } else {
      runtimes.push({ runtime: "claude", action: "wire_only" });
    }
  }

  if (input.codexInstalled) {
    runtimes.push({ runtime: "codex", action: "notice_only" });
  } else {
    runtimes.push({ runtime: "codex", action: "not_detected" });
  }

  return { runtimes };
}

/** Check if the settings.json PreToolUse array already has the pdctx-mcp-firewall entry. */
function settingsHasMcpFirewallEntry(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const hooks = json["hooks"] as Record<string, unknown> | undefined;
    if (!hooks) return false;
    const preToolUse = hooks["PreToolUse"] as unknown[] | undefined;
    if (!Array.isArray(preToolUse)) return false;
    return preToolUse.some((entry) => {
      const e = entry as Record<string, unknown>;
      const matcher = e["matcher"] as string | undefined;
      const hookList = e["hooks"] as unknown[] | undefined;
      if (matcher !== "mcp__.*" || !Array.isArray(hookList)) return false;
      return hookList.some((h) => {
        const hh = h as Record<string, unknown>;
        return typeof hh["command"] === "string" && hh["command"].includes("pdctx-mcp-firewall");
      });
    });
  } catch {
    return false;
  }
}

/** Add the pdctx-mcp-firewall entry to settings.json PreToolUse. */
function addMcpFirewallEntry(settingsPath: string, hookScript: string): void {
  const raw = existsSync(settingsPath) ? readFileSync(settingsPath, "utf-8") : "{}";
  const json = JSON.parse(raw) as Record<string, unknown>;

  if (!json["hooks"]) json["hooks"] = {};
  const hooks = json["hooks"] as Record<string, unknown>;
  if (!Array.isArray(hooks["PreToolUse"])) hooks["PreToolUse"] = [];
  const preToolUse = hooks["PreToolUse"] as unknown[];

  preToolUse.push({
    matcher: "mcp__.*",
    hooks: [
      {
        type: "command",
        command: hookScript,
        timeout: 5,
      },
    ],
  });

  writeFileSync(settingsPath, JSON.stringify(json, null, 2) + "\n", "utf-8");
}

export interface WireHookOptions {
  dryRun?: boolean;
  /** Override paths for testing (not exposed to CLI). */
  _claudeHookScript?: string;
  _claudeSettings?: string;
}

export async function runWireHook(opts: WireHookOptions = {}): Promise<void> {
  const hookScript = opts._claudeHookScript ?? CLAUDE_HOOK_SCRIPT;
  const settingsPath = opts._claudeSettings ?? CLAUDE_SETTINGS;
  const dryRun = opts.dryRun ?? false;

  // Detect runtimes
  const claudeInstalled = existsSync(join(HOME, ".claude"));
  const codexInstalled = existsSync(join(HOME, ".codex"));

  // Observe current state
  const claudeScriptExists = existsSync(hookScript);
  let claudeScriptExecutable = false;
  if (claudeScriptExists) {
    try {
      const { statSync } = await import("node:fs");
      const stat = statSync(hookScript);
      // Check if any executable bit is set (owner/group/other)
      claudeScriptExecutable = (stat.mode & 0o111) !== 0;
    } catch {
      claudeScriptExecutable = false;
    }
  }
  const claudeSettingsHasEntry = settingsHasMcpFirewallEntry(settingsPath);

  const plan = planWireHook({
    claudeInstalled,
    codexInstalled,
    claudeScriptExists,
    claudeScriptExecutable,
    claudeSettingsHasEntry,
  });

  if (dryRun) {
    console.log("pdctx wire-hook --dry-run");
    console.log("");
  }

  for (const r of plan.runtimes) {
    if (r.runtime === "claude") {
      switch (r.action) {
        case "script_missing":
          console.log(`claude: hook script not found at ${hookScript}`);
          console.log(`       install pdctx first or run: pdctx init`);
          break;
        case "already_wired":
          console.log("claude: already wired (hook executable + settings.json entry present)");
          break;
        case "chmod_and_wire":
          console.log(`claude: chmod +x ${hookScript}`);
          console.log(`       add PreToolUse entry to ${settingsPath}`);
          if (!dryRun) {
            chmodSync(hookScript, 0o755);
            addMcpFirewallEntry(settingsPath, hookScript);
            console.log("       done");
          }
          break;
        case "chmod_only":
          console.log(`claude: chmod +x ${hookScript}`);
          if (!dryRun) {
            chmodSync(hookScript, 0o755);
            console.log("       done");
          }
          break;
        case "wire_only":
          console.log(`claude: add PreToolUse entry to ${settingsPath}`);
          if (!dryRun) {
            addMcpFirewallEntry(settingsPath, hookScript);
            console.log("       done");
          }
          break;
      }
    } else if (r.runtime === "codex") {
      if (r.action === "notice_only") {
        console.log("codex: detected — PreToolUse hook event not yet available upstream (Codex CLI 0.124.0)");
        console.log("       mcp_deny is written to ~/.codex/state/pdctx-active.json for future compatibility");
        console.log("       no hook script installed");
      } else {
        console.log("codex: not detected (no ~/.codex dir)");
      }
    }
  }

  if (dryRun) {
    console.log("");
    console.log("dry run complete — no changes made");
  }
}
