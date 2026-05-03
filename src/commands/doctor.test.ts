import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectAliasState } from "./doctor.ts";

describe("inspectAliasState", () => {
  test("detects pd and pds aliases", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdctx-doctor-"));
    const rc = join(dir, ".zshrc");
    writeFileSync(rc, "alias pd='pdctx use'\nalias pds='pdctx switch'\n");
    try {
      expect(inspectAliasState(rc)).toEqual({
        rcPath: rc,
        hasPd: true,
        hasPds: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing rc file reports aliases missing", () => {
    const rc = join(tmpdir(), "pdctx-missing-zshrc");
    expect(inspectAliasState(rc)).toEqual({
      rcPath: rc,
      hasPd: false,
      hasPds: false,
    });
  });
});
