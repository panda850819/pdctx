import { describe, expect, test } from "bun:test";
import { matchGlob, planMcpCall } from "./mcp.ts";
import type { ContextDef } from "../schema/context.ts";

function ctx(overrides: Partial<ContextDef> = {}): ContextDef {
  return {
    context: { name: "personal:writer", description: "x", domain: "personal", private: false },
    persona: { agent: "", voice_override: "" },
    flow: { main: "writing", side: [] },
    skills: { public: [], private: [] },
    memory: { namespace: "personal/writer", firewall_from: [] },
    sources: {},
    ...overrides,
  };
}

describe("planMcpCall", () => {
  test("no active context → allow pass-through", () => {
    const plan = planMcpCall({ context: null, toolName: "mcp__claude_ai_Linear__list_issues" });
    expect(plan.action).toBe("allow");
  });

  test("no [mcp] section → allow pass-through with reason", () => {
    const plan = planMcpCall({ context: ctx(), toolName: "mcp__claude_ai_Linear__list_issues" });
    expect(plan.action).toBe("allow");
    if (plan.action === "allow") expect(plan.reason).toContain("no [mcp] deny list");
  });

  test("empty deny list → allow pass-through", () => {
    const c = ctx({ mcp: { deny: [] } });
    const plan = planMcpCall({ context: c, toolName: "mcp__claude_ai_Linear__list_issues" });
    expect(plan.action).toBe("allow");
  });

  test("glob wildcard pattern matches → deny with matched_pattern", () => {
    const c = ctx({ mcp: { deny: ["mcp__claude_ai_Linear__*"] } });
    const plan = planMcpCall({ context: c, toolName: "mcp__claude_ai_Linear__list_issues" });
    expect(plan.action).toBe("deny");
    if (plan.action === "deny") {
      expect(plan.matched_pattern).toBe("mcp__claude_ai_Linear__*");
      expect(plan.reason).toContain("denied by pattern");
    }
  });

  test("tool name not matching any deny pattern → allow", () => {
    const c = ctx({ mcp: { deny: ["mcp__claude_ai_Linear__*", "mcp__slack_yei__*"] } });
    const plan = planMcpCall({ context: c, toolName: "mcp__qmd__hybrid" });
    expect(plan.action).toBe("allow");
  });

  test("multiple patterns, first match wins", () => {
    const c = ctx({
      mcp: { deny: ["mcp__claude_ai_Linear__*", "mcp__claude_ai_Linear__list_issues"] },
    });
    const plan = planMcpCall({ context: c, toolName: "mcp__claude_ai_Linear__list_issues" });
    expect(plan.action).toBe("deny");
    if (plan.action === "deny") expect(plan.matched_pattern).toBe("mcp__claude_ai_Linear__*");
  });
});

describe("matchGlob", () => {
  test("exact match", () => {
    expect(matchGlob("mcp__foo__bar", "mcp__foo__bar")).toBe(true);
    expect(matchGlob("mcp__foo__bar", "mcp__foo__baz")).toBe(false);
  });

  test("trailing wildcard", () => {
    expect(matchGlob("mcp__foo__*", "mcp__foo__bar")).toBe(true);
    expect(matchGlob("mcp__foo__*", "mcp__foo__")).toBe(true);
    expect(matchGlob("mcp__foo__*", "mcp__bar__baz")).toBe(false);
  });

  test("question mark single char", () => {
    expect(matchGlob("mcp__a?", "mcp__ab")).toBe(true);
    expect(matchGlob("mcp__a?", "mcp__abc")).toBe(false);
  });

  test("regex specials in tool name are matched literally", () => {
    expect(matchGlob("mcp__claude.ai_Linear__*", "mcp__claude.ai_Linear__list_issues")).toBe(true);
    expect(matchGlob("mcp__claude.ai_Linear__*", "mcp__claudeXai_Linear__list_issues")).toBe(false);
  });

  test("anchored match (no partial)", () => {
    expect(matchGlob("foo", "foobar")).toBe(false);
    expect(matchGlob("foo", "barfoo")).toBe(false);
  });
});
