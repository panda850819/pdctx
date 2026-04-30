import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { planOffboard } from "./offboard.ts";
import type { ContextDef } from "../schema/context.ts";

const sampleCtx: ContextDef = {
  context: { name: "personal:trader", description: "x", domain: "personal", private: false },
  persona: { agent: "", voice_override: "" },
  flow: { main: "research", side: [] },
  skills: { public: [], private: [] },
  memory: { namespace: "personal/trader", firewall_from: [] },
  sources: {},
};

const fixedNow = new Date("2026-04-30T15:00:00.000Z");
const memoryDir = join(homedir(), ".pdctx", "memory", "personal", "trader");
const archiveBase = join(homedir(), ".pdctx", "memory", "_archive");

describe("planOffboard", () => {
  test("default: archive plan when memory exists and not active", () => {
    const plan = planOffboard(sampleCtx, { memoryExists: true, now: fixedNow });
    expect(plan.action).toBe("archive");
    expect(plan.namespace).toBe("personal/trader");
    expect(plan.namespace_dir).toBe(memoryDir);
    expect(plan.archived_path).toBe(
      join(archiveBase, "personal_trader-2026-04-30T15-00-00-000Z"),
    );
    expect(plan.was_active).toBe(false);
    expect(plan.blocked_by_active).toBe(false);
  });

  test("--purge plan does not produce archive path", () => {
    const plan = planOffboard(sampleCtx, { purge: true, memoryExists: true, now: fixedNow });
    expect(plan.action).toBe("purge");
    expect(plan.archived_path).toBeUndefined();
  });

  test("memory absent → action=absent, no archive path", () => {
    const plan = planOffboard(sampleCtx, { memoryExists: false, now: fixedNow });
    expect(plan.action).toBe("absent");
    expect(plan.archived_path).toBeUndefined();
  });

  test("active without --force → blocked_by_active=true", () => {
    const plan = planOffboard(sampleCtx, {
      memoryExists: true,
      activeName: "personal:trader",
      now: fixedNow,
    });
    expect(plan.was_active).toBe(true);
    expect(plan.blocked_by_active).toBe(true);
  });

  test("active with --force → blocked_by_active=false, archive proceeds", () => {
    const plan = planOffboard(sampleCtx, {
      memoryExists: true,
      activeName: "personal:trader",
      force: true,
      now: fixedNow,
    });
    expect(plan.was_active).toBe(true);
    expect(plan.blocked_by_active).toBe(false);
    expect(plan.action).toBe("archive");
  });

  test("namespace with slash flattens to underscore in archive path", () => {
    const ctx: ContextDef = {
      ...sampleCtx,
      memory: { namespace: "work/yei/ops", firewall_from: [] },
    };
    const plan = planOffboard(ctx, { memoryExists: true, now: fixedNow });
    expect(plan.namespace_dir).toBe(join(homedir(), ".pdctx", "memory", "work", "yei", "ops"));
    expect(plan.archived_path).toBe(
      join(archiveBase, "work_yei_ops-2026-04-30T15-00-00-000Z"),
    );
  });
});
