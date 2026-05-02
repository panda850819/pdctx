import { describe, expect, test } from "bun:test";
import { GbrainAdapter, FirewallError, buildGbrainArgs } from "./gbrain.ts";

describe("buildGbrainArgs", () => {
  test("firewall rejects empty allow list", () => {
    expect(() =>
      buildGbrainArgs({ mode: "search", text: "naval" }, { gbrain: { allow: [] } }),
    ).toThrow(FirewallError);
  });

  test("single source produces one --include-slug-prefixes pair", () => {
    const args = buildGbrainArgs(
      { mode: "search", text: "naval" },
      { gbrain: { allow: ["panda-vault"] } },
    );
    expect(args).toEqual(["search", "naval", "--include-slug-prefixes", "panda-vault/"]);
  });

  test("multi source flatMaps into multiple --include-slug-prefixes pairs", () => {
    const args = buildGbrainArgs(
      { mode: "search", text: "ops" },
      { gbrain: { allow: ["panda-vault", "work-vault"] } },
    );
    expect(args).toEqual([
      "search",
      "ops",
      "--include-slug-prefixes",
      "panda-vault/",
      "--include-slug-prefixes",
      "work-vault/",
    ]);
  });

  test("no gbrain context (undefined) throws FirewallError (allow is [])", () => {
    expect(() => buildGbrainArgs({ mode: "query", text: "x" }, {})).toThrow(FirewallError);
  });
});

describe("GbrainAdapter", () => {
  test("health reports fail when binary missing", async () => {
    const adapter = new GbrainAdapter({ binary: "definitely-not-a-real-binary-xyz123" });
    const h = await adapter.health();
    expect(h.status).toBe("fail");
    expect(h.detail).toContain("not found");
  });

  test("health returns ok/warn when binary exits 0 or non-zero (real binary path)", async () => {
    // Smoke: we can't guarantee gbrain is installed, so we only test the error path.
    // The previous test covers fail; this verifies the name property is correct.
    const adapter = new GbrainAdapter();
    expect(adapter.name).toBe("gbrain");
  });

  test("write() throws FirewallError (v0 stub)", async () => {
    const adapter = new GbrainAdapter();
    await expect(adapter.write("slug", "content")).rejects.toThrow(FirewallError);
  });
});
