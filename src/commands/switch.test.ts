import { describe, expect, test } from "bun:test";
import { levenshtein, matchContextNames } from "./switch.ts";

const contexts = [
  "personal:developer",
  "personal:trader",
  "personal:writer",
  "work:yei:ops",
];

describe("matchContextNames", () => {
  test("exact match wins", () => {
    expect(matchContextNames("personal:developer", contexts)).toEqual({
      kind: "one",
      matches: ["personal:developer"],
    });
  });

  test("substring match is case-insensitive", () => {
    expect(matchContextNames("DEV", contexts)).toEqual({
      kind: "one",
      matches: ["personal:developer"],
    });
  });

  test("Levenshtein match checks segments after colon", () => {
    expect(matchContextNames("writre", contexts)).toEqual({
      kind: "one",
      matches: ["personal:writer"],
    });
  });

  test("ambiguous matches return all candidates", () => {
    expect(matchContextNames("yei", [...contexts, "work:yei:finance"])).toEqual({
      kind: "many",
      matches: ["work:yei:finance", "work:yei:ops"],
    });
  });

  test("miss returns none", () => {
    expect(matchContextNames("zzz", contexts)).toEqual({ kind: "none", matches: [] });
  });

  test("distance helper handles insertion, deletion, substitution", () => {
    expect(levenshtein("writer", "writre")).toBe(2);
    expect(levenshtein("ops", "ops")).toBe(0);
  });
});
