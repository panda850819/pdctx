import type { ContextDef } from "../schema/context.ts";

export interface McpPlanInput {
  context: ContextDef | null;
  toolName: string;
}

export type McpPlan =
  | { action: "allow"; reason: string }
  | { action: "deny"; reason: string; matched_pattern: string };

export function planMcpCall(input: McpPlanInput): McpPlan {
  const { context, toolName } = input;

  if (!context) {
    return { action: "allow", reason: "no active context — pass-through" };
  }

  const mcp = context.mcp;
  if (!mcp || mcp.deny.length === 0) {
    return {
      action: "allow",
      reason: `context "${context.context.name}" has no [mcp] deny list — pass-through`,
    };
  }

  for (const pattern of mcp.deny) {
    if (matchGlob(pattern, toolName)) {
      return {
        action: "deny",
        reason: `tool "${toolName}" denied by pattern "${pattern}" in context "${context.context.name}"`,
        matched_pattern: pattern,
      };
    }
  }

  return {
    action: "allow",
    reason: `tool "${toolName}" not matched by any deny pattern in context "${context.context.name}"`,
  };
}

export function matchGlob(pattern: string, name: string): boolean {
  const regex = pattern
    .replace(/[.+^$()|[\]{}\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(name);
}
