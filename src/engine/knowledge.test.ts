import { describe, expect, test } from "bun:test";
import { planQueryArgs } from "./knowledge.ts";
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

describe("planQueryArgs", () => {
  test("no active context → allow pass-through", () => {
    const plan = planQueryArgs({ context: null });
    expect(plan.action).toBe("allow");
    expect(plan.collections).toEqual([]);
  });

  test("no [knowledge] section → allow pass-through with reason", () => {
    const plan = planQueryArgs({ context: ctx(), userCollection: "knowledge" });
    expect(plan.action).toBe("allow");
    expect(plan.collections).toEqual(["knowledge"]);
    expect(plan.reason).toContain("no [knowledge] section");
  });

  test("-c forbidden → reject", () => {
    const c = ctx({ knowledge: { allow: ["work-vault"], forbid: ["knowledge", "blog"] } });
    const plan = planQueryArgs({ context: c, userCollection: "knowledge" });
    expect(plan.action).toBe("reject");
    expect(plan.collections).toEqual([]);
    expect(plan.reason).toContain("forbidden");
  });

  test("-c allowed → allow with single collection", () => {
    const c = ctx({ knowledge: { allow: ["knowledge", "blog"], forbid: ["work-vault"] } });
    const plan = planQueryArgs({ context: c, userCollection: "knowledge" });
    expect(plan.action).toBe("allow");
    expect(plan.collections).toEqual(["knowledge"]);
    expect(plan.reason).toContain("in allow list");
  });

  test("no -c with allow list → filter to allowed collections", () => {
    const c = ctx({
      knowledge: { allow: ["knowledge", "blog", "lennys", "sessions"], forbid: ["work-vault"] },
    });
    const plan = planQueryArgs({ context: c });
    expect(plan.action).toBe("filter");
    expect(plan.collections).toEqual(["knowledge", "blog", "lennys", "sessions"]);
  });

  test("forbid takes precedence when -c is in both allow and forbid", () => {
    const c = ctx({ knowledge: { allow: ["knowledge"], forbid: ["knowledge"] } });
    const plan = planQueryArgs({ context: c, userCollection: "knowledge" });
    expect(plan.action).toBe("reject");
  });
});
