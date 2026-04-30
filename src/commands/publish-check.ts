import { resolve } from "node:path";
import { scan } from "../engine/visibility.ts";
import { log as auditLog } from "../engine/audit.ts";

export async function runPublishCheck(opts: { path?: string }): Promise<void> {
  const root = resolve(opts.path ?? process.cwd());
  const result = scan(root);

  if (result.violations.length === 0) {
    console.log(`✓ visibility check clean — ${result.scanned} files scanned in ${root}`);
    auditLog({
      event: "publish-check",
      payload: { scan_root: root, scanned: result.scanned, violations: 0 },
    });
    return;
  }

  for (const v of result.violations) {
    console.log(`  [${v.marker}] ${v.file}:${v.line}`);
    console.log(`    ${v.excerpt}`);
  }
  console.log(`\n✗ ${result.violations.length} violations found — block publish`);

  auditLog({
    event: "publish-check",
    payload: { scan_root: root, scanned: result.scanned, violations: result.violations.length },
  });

  process.exit(1);
}
