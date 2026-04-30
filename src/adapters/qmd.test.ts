import { describe, expect, test } from "bun:test";
import { QmdBridgeAdapter, buildQmdArgs } from "./qmd.ts";

describe("buildQmdArgs", () => {
  test("query without collection or limit", () => {
    expect(buildQmdArgs({ mode: "query", text: "naval" })).toEqual(["query", "naval"]);
  });

  test("search with collection", () => {
    expect(buildQmdArgs({ mode: "search", text: "ops", collection: "knowledge" })).toEqual([
      "search",
      "ops",
      "-c",
      "knowledge",
    ]);
  });

  test("vsearch with collection and limit", () => {
    expect(
      buildQmdArgs({ mode: "vsearch", text: "agents", collection: "blog", limit: "10" }),
    ).toEqual(["vsearch", "agents", "-c", "blog", "-n", "10"]);
  });

  test("limit without collection", () => {
    expect(buildQmdArgs({ mode: "query", text: "x", limit: "5" })).toEqual([
      "query",
      "x",
      "-n",
      "5",
    ]);
  });
});

describe("QmdBridgeAdapter", () => {
  test("name is qmd", () => {
    const adapter = new QmdBridgeAdapter();
    expect(adapter.name).toBe("qmd");
  });

  test("health reports fail when binary missing", async () => {
    const adapter = new QmdBridgeAdapter({ binary: "definitely-not-a-real-binary-xyz123" });
    const h = await adapter.health();
    expect(h.status).toBe("fail");
    expect(h.detail).toContain("not found");
  });
});
