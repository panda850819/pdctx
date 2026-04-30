import { describe, expect, test } from "bun:test";
import { applyOverlay } from "./context.ts";
import type { ContextDef, ContextOverlay } from "../schema/context.ts";

const baseTrader: ContextDef = {
  context: { name: "personal:trader", description: "research", domain: "personal", private: false },
  persona: { agent: "", voice_override: "" },
  flow: { main: "research", side: ["retro"] },
  skills: {
    public: ["pandastack:think-like-naval", "pandastack:deep-research"],
    private: [],
  },
  memory: { namespace: "personal/trader", firewall_from: ["work/yei/*"] },
  sources: { vault: "personal-vault" },
};

describe("applyOverlay", () => {
  test("private overlay adds private skill and flips private flag", () => {
    const overlay: ContextOverlay = {
      extends: "personal:trader",
      context: { private: true },
      skills: { private: ["pandastack-private:chain-scout"] },
    };
    const merged = applyOverlay(baseTrader, overlay);
    expect(merged.context.private).toBe(true);
    expect(merged.skills.private).toEqual(["pandastack-private:chain-scout"]);
    expect(merged.skills.public).toEqual(baseTrader.skills.public);
    expect(merged.context.name).toBe("personal:trader");
  });

  test("array fields concat and dedup, scalar fields override", () => {
    const overlay: ContextOverlay = {
      extends: "personal:trader",
      flow: { main: "trade", side: ["retro", "review"] },
      skills: { public: ["pandastack:deep-research", "pandastack:grill"] },
      memory: { firewall_from: ["work/sommet/*"] },
    };
    const merged = applyOverlay(baseTrader, overlay);
    expect(merged.flow.main).toBe("trade");
    expect(merged.flow.side).toEqual(["retro", "review"]);
    expect(merged.skills.public).toEqual([
      "pandastack:think-like-naval",
      "pandastack:deep-research",
      "pandastack:grill",
    ]);
    expect(merged.memory.firewall_from).toEqual(["work/yei/*", "work/sommet/*"]);
  });

  test("missing overlay sections leave base intact", () => {
    const overlay: ContextOverlay = { extends: "personal:trader" };
    const merged = applyOverlay(baseTrader, overlay);
    expect(merged).toEqual(baseTrader);
  });

  test("sources merge shallowly", () => {
    const overlay: ContextOverlay = {
      extends: "personal:trader",
      sources: { notion_workspace: "panda-personal" },
    };
    const merged = applyOverlay(baseTrader, overlay);
    expect(merged.sources.vault).toBe("personal-vault");
    expect(merged.sources.notion_workspace).toBe("panda-personal");
  });

  test("notes overlay overrides base notes", () => {
    const baseWithNotes: ContextDef = { ...baseTrader, notes: "base notes" };
    const overlay: ContextOverlay = { extends: "personal:trader", notes: "overlay notes" };
    const merged = applyOverlay(baseWithNotes, overlay);
    expect(merged.notes).toBe("overlay notes");
  });

  test("mcp.deny merges with dedup-concat", () => {
    const baseWithMcp: ContextDef = {
      ...baseTrader,
      mcp: { deny: ["mcp__claude_ai_Linear__*"] },
    };
    const overlay: ContextOverlay = {
      extends: "personal:trader",
      mcp: { deny: ["mcp__claude_ai_Linear__*", "mcp__slack_yei__*"] },
    };
    const merged = applyOverlay(baseWithMcp, overlay);
    expect(merged.mcp?.deny).toEqual(["mcp__claude_ai_Linear__*", "mcp__slack_yei__*"]);
  });

  test("mcp overlay added when base has no [mcp]", () => {
    const overlay: ContextOverlay = {
      extends: "personal:trader",
      mcp: { deny: ["mcp__claude_ai_Linear__*"] },
    };
    const merged = applyOverlay(baseTrader, overlay);
    expect(merged.mcp?.deny).toEqual(["mcp__claude_ai_Linear__*"]);
  });
});
