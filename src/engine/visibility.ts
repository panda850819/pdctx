import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface Violation {
  file: string;    // absolute path
  line: number;    // 1-indexed
  marker: string;  // which regex matched
  excerpt: string; // matched line, trimmed
}

export interface ScanResult {
  scanned: number;
  violations: Violation[];
  scan_root: string;
}

const MARKERS: Array<{ label: string; re: RegExp }> = [
  { label: 'domain = "work:',    re: /domain\s*=\s*"work:/ },
  { label: "private = true",     re: /private\s*=\s*true/ },
  { label: "pandastack-private:", re: /pandastack-private:/ },
  { label: "notion.so DB id",    re: /notion\.so\/[0-9a-f]{32}/ },
  { label: "linear_team =",      re: /linear_team\s*=/ },
  { label: "NDA",                re: /\bNDA\b/ },
];

const SKIP_DIRS = new Set([".git", "node_modules", "dist", ".bun", "_archive", "attachments"]);

const SKIP_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".pdf",
  ".zip", ".tar", ".gz", ".lock", ".db", ".sqlite",
]);

const MAX_BYTES = 1_000_000; // 1MB

function shouldSkipFile(absPath: string, selfPath: string): boolean {
  if (absPath === selfPath) return true;
  // Skip dogfood and self-audit files that intentionally describe markers
  const base = absPath.split("/").pop() ?? "";
  if (/^dogfood-.*\.md$/.test(base)) return true;
  if (/^feedback_self_audit.*\.md$/.test(base)) return true;
  const ext = "." + base.split(".").pop();
  if (SKIP_EXTS.has(ext.toLowerCase())) return true;
  try {
    if (statSync(absPath).size > MAX_BYTES) return true;
  } catch {
    return true;
  }
  return false;
}

function walkDir(
  dir: string,
  selfPath: string,
  violations: Violation[],
  count: { n: number },
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    process.stderr.write(`[visibility] cannot read dir ${dir}: ${(err as Error).message}\n`);
    return;
  }

  for (const entry of entries) {
    const abs = join(dir, entry);
    let stat;
    try {
      stat = statSync(abs);
    } catch (err) {
      process.stderr.write(`[visibility] stat error ${abs}: ${(err as Error).message}\n`);
      continue;
    }

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkDir(abs, selfPath, violations, count);
      continue;
    }

    if (!stat.isFile()) continue;
    if (shouldSkipFile(abs, selfPath)) continue;

    count.n++;
    let text: string;
    try {
      text = readFileSync(abs, "utf-8");
    } catch (err) {
      process.stderr.write(`[visibility] cannot read ${abs}: ${(err as Error).message}\n`);
      continue;
    }

    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { label, re } of MARKERS) {
        if (re.test(line)) {
          violations.push({
            file: abs,
            line: i + 1,
            marker: label,
            excerpt: line.trim(),
          });
        }
      }
    }
  }
}

export function scan(rootPath: string): ScanResult {
  const abs = resolve(rootPath);
  const selfPath = resolve(import.meta.path);
  const violations: Violation[] = [];
  const count = { n: 0 };

  walkDir(abs, selfPath, violations, count);

  return {
    scanned: count.n,
    violations,
    scan_root: abs,
  };
}
