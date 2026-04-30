#!/usr/bin/env bun
import { Command } from "commander";
import { runUse } from "./commands/use.ts";
import { runCall } from "./commands/call.ts";
import { runStatus } from "./commands/status.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runInit } from "./commands/init.ts";
import { runPublishCheck } from "./commands/publish-check.ts";
import { runDistill } from "./commands/distill.ts";

const program = new Command();

program
  .name("pdctx")
  .description("Personal context-aware AI operator OS — declare contexts once, AI runtimes follow.")
  .version("0.0.1");

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
  .description("Scan a repo path for work-domain markers before pushing to a public remote.")
  .option("--path <path>", "directory to scan (defaults to cwd)")
  .action(runPublishCheck);

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

program.parseAsync(process.argv).catch((err) => {
  console.error("[pdctx error]", err.message ?? err);
  process.exit(1);
});
