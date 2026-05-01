import { resolve } from "node:path";
import { log as auditLog } from "../engine/audit.ts";
import { isStackPath, validateStack } from "../engine/skill-validate.ts";
import { scan } from "../engine/visibility.ts";

export async function runPublishCheck(opts: { path?: string }): Promise<void> {
  const root = resolve(opts.path ?? process.cwd());
  const visibility = scan(root);

  let blocking = visibility.violations.length;

  if (visibility.violations.length === 0) {
    console.log(
      `✓ visibility check clean — ${visibility.scanned} files scanned in ${root}`,
    );
  } else {
    for (const v of visibility.violations) {
      console.log(`  [${v.marker}] ${v.file}:${v.line}`);
      console.log(`    ${v.excerpt}`);
    }
    console.log(
      `\n✗ ${visibility.violations.length} visibility violations found`,
    );
  }

  let skillScanned = 0;
  let skillPass = 0;
  let skillWarn = 0;
  let skillFail = 0;

  if (isStackPath(root)) {
    const skill = validateStack(root);
    skillScanned = skill.scanned;
    skillPass = skill.pass.length;
    skillWarn = skill.warn.length;
    skillFail = skill.fail.length;

    if (skillFail > 0) {
      console.log(`\n✗ skill-validate ${skillFail} fail`);
      for (const issue of skill.fail) {
        console.log(`  FAIL  ${issue.skill}`);
        for (const r of issue.reasons) console.log(`        - ${r}`);
      }
      blocking += skillFail;
    }
    if (skillWarn > 0) {
      console.log(
        `\n  ${skillWarn} skill-validate warnings (non-blocking)`,
      );
      for (const issue of skill.warn) {
        console.log(`  WARN  ${issue.skill}`);
        for (const r of issue.reasons) console.log(`        - ${r}`);
      }
    }
    if (skillFail === 0 && skillWarn === 0) {
      console.log(`✓ skill-validate clean — ${skillScanned} skills`);
    }
  }

  auditLog({
    event: "publish-check",
    payload: {
      scan_root: root,
      scanned: visibility.scanned,
      violations: visibility.violations.length,
      skill_scanned: skillScanned,
      skill_pass: skillPass,
      skill_warn: skillWarn,
      skill_fail: skillFail,
    },
  });

  if (blocking > 0) {
    console.log(`\nblocking issues: ${blocking}`);
    process.exit(1);
  }
}
