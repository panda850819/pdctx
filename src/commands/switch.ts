import { loadContextsFromDefault } from "../engine/context.ts";
import { runUse } from "./use.ts";

export interface FuzzyMatchResult {
  kind: "one" | "many" | "none";
  matches: string[];
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    prev.splice(0, prev.length, ...curr);
  }

  return prev[b.length] ?? 0;
}

export function matchContextNames(fuzzy: string, contextNames: string[]): FuzzyMatchResult {
  const needle = fuzzy.toLowerCase();
  const exact = contextNames.filter((name) => name === fuzzy);
  if (exact.length > 0) {
    return { kind: exact.length === 1 ? "one" : "many", matches: uniqueSorted(exact) };
  }

  const substring = contextNames.filter((name) => name.toLowerCase().includes(needle));
  if (substring.length > 0) {
    const matches = uniqueSorted(substring);
    return { kind: matches.length === 1 ? "one" : "many", matches };
  }

  const close = contextNames.filter((name) =>
    name
      .split(":")
      .slice(1)
      .some((segment) => levenshtein(needle, segment.toLowerCase()) <= 2),
  );
  const matches = uniqueSorted(close);
  if (matches.length === 0) return { kind: "none", matches: [] };
  return { kind: matches.length === 1 ? "one" : "many", matches };
}

function formatList(items: string[]): string {
  return items.map((item) => `  ${item}`).join("\n");
}

export async function runSwitch(fuzzy: string): Promise<void> {
  const { contexts, warnings } = loadContextsFromDefault();
  for (const w of warnings) console.warn(`warn: ${w}`);

  const available = [...contexts.keys()].sort();
  const result = matchContextNames(fuzzy, available);

  if (result.kind === "one") {
    await runUse(result.matches[0]);
    return;
  }

  if (result.kind === "many") {
    console.error(`error: multiple contexts matched '${fuzzy}':\n${formatList(result.matches)}`);
    process.exit(1);
  }

  console.error(`error: no context matched '${fuzzy}'. Available:\n${formatList(available)}`);
  process.exit(1);
}
