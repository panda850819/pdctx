import { test, expect, describe } from "bun:test";
import { planWireHook } from "./wire-hook.ts";

describe("planWireHook", () => {
  test("claude not installed → no claude entry in plan", () => {
    const plan = planWireHook({
      claudeInstalled: false,
      codexInstalled: false,
      claudeScriptExists: false,
      claudeScriptExecutable: false,
      claudeSettingsHasEntry: false,
    });
    expect(plan.runtimes.every((r) => r.runtime !== "claude")).toBe(true);
  });

  test("claude installed, script missing → script_missing action", () => {
    const plan = planWireHook({
      claudeInstalled: true,
      codexInstalled: false,
      claudeScriptExists: false,
      claudeScriptExecutable: false,
      claudeSettingsHasEntry: false,
    });
    const claudePlan = plan.runtimes.find((r) => r.runtime === "claude");
    expect(claudePlan?.action).toBe("script_missing");
  });

  test("claude installed, script exists + executable + settings has entry → already_wired", () => {
    const plan = planWireHook({
      claudeInstalled: true,
      codexInstalled: false,
      claudeScriptExists: true,
      claudeScriptExecutable: true,
      claudeSettingsHasEntry: true,
    });
    const claudePlan = plan.runtimes.find((r) => r.runtime === "claude");
    expect(claudePlan?.action).toBe("already_wired");
  });

  test("claude installed, script exists but not executable, no settings entry → chmod_and_wire", () => {
    const plan = planWireHook({
      claudeInstalled: true,
      codexInstalled: false,
      claudeScriptExists: true,
      claudeScriptExecutable: false,
      claudeSettingsHasEntry: false,
    });
    const claudePlan = plan.runtimes.find((r) => r.runtime === "claude");
    expect(claudePlan?.action).toBe("chmod_and_wire");
  });

  test("claude installed, script exists + executable but no settings entry → wire_only", () => {
    const plan = planWireHook({
      claudeInstalled: true,
      codexInstalled: false,
      claudeScriptExists: true,
      claudeScriptExecutable: true,
      claudeSettingsHasEntry: false,
    });
    const claudePlan = plan.runtimes.find((r) => r.runtime === "claude");
    expect(claudePlan?.action).toBe("wire_only");
  });

  test("codex installed → notice_only action", () => {
    const plan = planWireHook({
      claudeInstalled: false,
      codexInstalled: true,
      claudeScriptExists: false,
      claudeScriptExecutable: false,
      claudeSettingsHasEntry: false,
    });
    const codexPlan = plan.runtimes.find((r) => r.runtime === "codex");
    expect(codexPlan?.action).toBe("notice_only");
  });

  test("codex not installed → not_detected action", () => {
    const plan = planWireHook({
      claudeInstalled: false,
      codexInstalled: false,
      claudeScriptExists: false,
      claudeScriptExecutable: false,
      claudeSettingsHasEntry: false,
    });
    const codexPlan = plan.runtimes.find((r) => r.runtime === "codex");
    expect(codexPlan?.action).toBe("not_detected");
  });
});
