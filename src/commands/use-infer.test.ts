import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { inferContextFromCwd, resolveUseContext } from "./use.ts";

const site = join(homedir(), "site");

describe("inferContextFromCwd", () => {
  test("work vault maps to yei ops", () => {
    expect(inferContextFromCwd(join(site, "knowledge", "work-vault", "Ops"))).toMatchObject({
      contextName: "work:yei:ops",
    });
  });

  test("daily and draft blog paths map to writer", () => {
    expect(inferContextFromCwd(join(site, "knowledge", "obsidian-vault", "Blog", "_daily", "x.md"))).toMatchObject({
      contextName: "personal:writer",
    });
    expect(inferContextFromCwd(join(site, "knowledge", "obsidian-vault", "Blog", "Drafts", "x.md"))).toMatchObject({
      contextName: "personal:writer",
    });
  });

  test("developer workspaces map to developer", () => {
    for (const dir of ["cli", "apps", "skills", "infra"]) {
      expect(inferContextFromCwd(join(site, dir, "pdctx"))).toMatchObject({
        contextName: "personal:developer",
        label: `~/site/${dir}/*`,
      });
    }
  });

  test("trading workspace maps to trader", () => {
    expect(inferContextFromCwd(join(site, "trading", "waves"))).toMatchObject({
      contextName: "personal:trader",
    });
  });

  test("fallback is used only when no rule matches", () => {
    expect(resolveUseContext("personal:writer", {
      infer: true,
      cwd: join(homedir(), "Downloads"),
    })).toEqual({
      contextName: "personal:writer",
      usedFallback: true,
    });
  });

  test("no fallback throws actionable switch hint", () => {
    expect(() => resolveUseContext(undefined, {
      infer: true,
      cwd: join(homedir(), "Downloads"),
    })).toThrow("no inference rule");
  });
});
