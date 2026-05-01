import { resolve } from "node:path";
import { log as auditLog } from "../engine/audit.ts";
import { isStackPath, validateStack } from "../engine/skill-validate.ts";

export async function runSkillValidate(opts: { path?: string }): Promise<void> {
  const root = resolve(opts.path ?? process.cwd());

  if (!isStackPath(root)) {
    console.error(
      `✗ ${root} does not look like a stack (no skills/ or plugins/ subdir)`,
    );
    process.exit(1);
  }

  const result = validateStack(root);

  for (const issue of result.fail) {
    console.log(`  FAIL  ${issue.skill}`);
    for (const r of issue.reasons) console.log(`        - ${r}`);
  }
  for (const issue of result.warn) {
    console.log(`  WARN  ${issue.skill}`);
    for (const r of issue.reasons) console.log(`        - ${r}`);
  }
  for (const issue of result.pass) {
    console.log(`  PASS  ${issue.skill}`);
  }

  console.log(
    `\n${result.scanned} scanned — ${result.pass.length} pass, ${result.warn.length} warn, ${result.fail.length} fail`,
  );

  auditLog({
    event: "skill-validate",
    payload: {
      stack_root: root,
      scanned: result.scanned,
      pass: result.pass.length,
      warn: result.warn.length,
      fail: result.fail.length,
    },
  });

  if (result.fail.length > 0) process.exit(1);
}
