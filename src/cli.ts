#!/usr/bin/env bun
import { Command } from "commander";
import { runUse } from "./commands/use.ts";
import { runCall } from "./commands/call.ts";
import { runStatus } from "./commands/status.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runInit } from "./commands/init.ts";
import { runPublishCheck } from "./commands/publish-check.ts";
import { runSkillValidate } from "./commands/skill-validate.ts";
import { runDistill } from "./commands/distill.ts";
import { runOffboard } from "./commands/offboard.ts";
import { runQuery } from "./commands/query.ts";
import { runWireHook } from "./commands/wire-hook.ts";

const program = new Command();

program
  .name("pdctx")
  .description("Personal context-aware AI operator OS — declare contexts once, AI runtimes follow.")
  .version("0.0.9");

program
  .command("use <context>")
  .description("Wear a context. AI runtimes filter to this context's skills + memory + voice + sources.")
  .action(runUse);

program
  .command("call <context> <task>")
  .description("Delegate a task to a context as an isolated subagent. Runs claude -p or codex exec with context-injected system prompt.")
  .option("--runtime <runtime>", "claude or codex", "claude")
  .option("--model <model>", "model id (default: haiku for claude, default for codex)")
  .option("--timeout <seconds>", "timeout in seconds", "300")
  .action((context, task, opts) => runCall(context, task, {
    runtime: opts.runtime,
    model: opts.model,
    timeout: parseInt(opts.timeout, 10),
  }));

program
  .command("status")
  .description("Show active context, in-flight calls, last switch time.")
  .action(runStatus);

program
  .command("doctor")
  .description("Health check: ~/.pdctx layout, runtime versions, isolation chmod state, known issues.")
  .action(runDoctor);

program
  .command("init")
  .description("Bootstrap ~/.pdctx/ (CONFIG.toml, memory/, audit/, state/). Idempotent.")
  .action(runInit);

program
  .command("publish-check")
  .description("Scan a repo path for work-domain markers before pushing to a public remote. If the path is a stack (has skills/ or plugins/), also run skill-validate.")
  .option("--path <path>", "directory to scan (defaults to cwd)")
  .action(runPublishCheck);

program
  .command("skill-validate")
  .description("Validate skill frontmatter against the pandastack contract. Reports pass / warn / fail per skill. Exits 1 on any fail.")
  .option("--path <path>", "stack path to scan (defaults to cwd)")
  .action(runSkillValidate);

program
  .command("distill")
  .description("Sanitize content cross-boundary (work → personal) with y/N approval.")
  .requiredOption("--from <ctx>", "source context")
  .requiredOption("--to <ctx>", "target context")
  .requiredOption("--source <path>", "source file path")
  .requiredOption("--target <path>", "target file path")
  .requiredOption("--topic <topic>", "topic description (used in sanitize prompt + frontmatter)")
  .option("--dry-run", "preview only, no write", false)
  .option("--force", "overwrite existing target", false)
  .action((opts) => runDistill(opts));

for (const subcmd of ["query", "search", "vsearch"] as const) {
  program
    .command(`${subcmd} <text>`)
    .description(
      subcmd === "query"
        ? "Hybrid qmd search filtered by active context's knowledge.allow/forbid."
        : subcmd === "search"
          ? "BM25 qmd search filtered by active context's knowledge.allow/forbid."
          : "Vector qmd search filtered by active context's knowledge.allow/forbid.",
    )
    .option("-c, --collection <name>", "filter to a specific qmd collection (rejected if forbidden)")
    .option("-n, --limit <n>", "max results")
    .action((text, opts) => runQuery(subcmd, text, opts));
}

program
  .command("offboard <context>")
  .description("Clean exit ritual: archive memory namespace, restore chmod, clear active state if applicable, audit.")
  .option("--purge", "remove memory dir instead of archiving (destructive)", false)
  .option("--force", "offboard even if context is currently active", false)
  .option("--dry-run", "show plan without making any changes", false)
  .action((context, opts) => runOffboard(context, {
    purge: opts.purge,
    force: opts.force,
    dryRun: opts.dryRun,
  }));

program
  .command("wire-hook")
  .description("Install pdctx MCP firewall hooks into detected runtimes (Claude, Codex). Idempotent.")
  .option("--dry-run", "show plan without making any changes", false)
  .action((opts) => runWireHook({ dryRun: opts.dryRun }));

program.parseAsync(process.argv).catch((err) => {
  console.error("[pdctx error]", err.message ?? err);
  process.exit(1);
});
