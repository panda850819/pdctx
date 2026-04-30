import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { stdin } from "process";
import { loadContextsFromDefault } from "../engine/context.ts";
import { dispatch } from "../engine/dispatcher.ts";
import { log as auditLog } from "../engine/audit.ts";

export interface DistillOptions {
  from: string;
  to: string;
  source: string;
  target: string;
  topic: string;
  dryRun?: boolean;
  force?: boolean;
}

function expandTilde(p: string): string {
  return p.startsWith("~/") ? homedir() + p.slice(1) : p;
}

async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl >= 0) { stdin.off("data", onData); stdin.pause(); resolve(buf.slice(0, nl).trim()); }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

export async function runDistill(opts: DistillOptions): Promise<void> {
  // 1. Validate contexts
  const { contexts, warnings } = loadContextsFromDefault();
  for (const w of warnings) console.warn(`warn: ${w}`);

  if (!contexts.has(opts.from)) { console.error(`error: context "${opts.from}" not found`); process.exit(1); }
  if (!contexts.has(opts.to)) { console.error(`error: context "${opts.to}" not found`); process.exit(1); }

  const fromCtx = contexts.get(opts.from)!;
  const toCtx = contexts.get(opts.to)!;

  if (fromCtx.context.domain === toCtx.context.domain) {
    console.error(`error: --from and --to must cross domain boundaries; use plain mv/cp for same-domain moves`);
    process.exit(1);
  }

  const sourcePath = expandTilde(opts.source);
  const targetPath = expandTilde(opts.target);

  // 2. Validate files
  if (!existsSync(sourcePath)) { console.error(`error: source file not found: ${sourcePath}`); process.exit(1); }
  if (existsSync(targetPath) && !opts.force) {
    console.error(`error: target already exists: ${targetPath} (use --force to overwrite)`);
    process.exit(1);
  }

  // 3. Read source
  const sourceContent = readFileSync(sourcePath, "utf8");
  const sourceKB = sourceContent.length / 1024;
  if (sourceKB > 50) {
    console.error(`error: source file is large (${Math.round(sourceKB)}kb); split into a smaller excerpt for distillation`);
    process.exit(1);
  }

  // 4. Build sanitize prompt
  const todayISO = new Date().toISOString().slice(0, 10);
  const sourceFilenameOnly = basename(sourcePath);
  const first30Lines = sourceContent.split("\n").slice(0, 30).map((l) => `  ${l}`).join("\n");
  const hasMore = sourceContent.split("\n").length > 30;

  const prompt = `You are performing cross-boundary distillation for pdctx. The user is moving content from a private/work context to a personal/public context. Your job: extract the generalizable principle, framework, or lesson — strip all confidential specifics.

From context: ${opts.from} (domain=${fromCtx.context.domain})
To context: ${opts.to} (domain=${toCtx.context.domain})
Topic: ${opts.topic}

ORIGINAL CONTENT:
"""
${sourceContent}
"""

INSTRUCTIONS:
- Output ONLY the sanitized markdown. No preamble, no explanation, no diff annotations.
- Start with frontmatter:
  ---
  date: ${todayISO}
  type: knowledge
  topic: "${opts.topic}"
  derived_from: "${opts.from}"
  source_excerpt: "${sourceFilenameOnly}"
  ---
- Then the sanitized body in markdown.

REMOVE:
- All proper names of people (replace with role: "the CEO", "an engineer")
- Company / org names (Yei, Sommet, Abyss, specific protocols by name)
- Specific project codenames
- Internal Slack/Notion/Linear IDs (UUIDs, page hashes, channel names)
- Specific dates → relative ("recently", "during the rollout")
- Specific dollar amounts → magnitude ("under $1k", "low six figures")

KEEP:
- The principle / pattern / mechanism
- The "why it matters" (generic)
- Trade-offs and edge cases (generic)
- Generic example or analogy

If the content is too narrow to generalize meaningfully (e.g. it's purely about "the CEO said X on Tuesday"), output the literal string ABORT_DISTILL_TOO_NARROW on a line by itself. The CLI will detect and skip the write.`;

  // 5. Dispatch
  console.log(`dispatching sanitize via ${opts.to} (haiku)...`);
  const r = await dispatch(toCtx, prompt, { runtime: "claude", model: "haiku", timeout_ms: 120000 });

  if (r.error || r.exit_code !== 0) { console.error(`error: dispatch failed — ${r.error ?? `exit ${r.exit_code}`}`); process.exit(1); }
  if (r.output.includes("ABORT_DISTILL_TOO_NARROW")) { console.log("LLM judged content too narrow to generalize. Skipping write."); process.exit(0); }

  // 6. Show diff
  const reduction = Math.round((1 - r.output.length / sourceContent.length) * 100);
  console.log(`\n=== ORIGINAL (${sourceContent.length} chars) ===\n${first30Lines}`);
  if (hasMore) console.log("  [... truncated ...]");
  console.log(`\n=== SANITIZED (${r.output.length} chars) ===`);
  console.log(r.output.split("\n").map((l) => `  ${l}`).join("\n"));
  console.log(`\n=== DIFF SUMMARY ===\n- Source bytes: ${sourceContent.length}\n- Sanitized bytes: ${r.output.length}\n- Reduction: ${reduction}%`);

  // 7. Approve (shared audit payload builder)
  const auditPayload = (approved: boolean) => auditLog({
    event: "distill",
    context: opts.from,
    payload: { to_context: opts.to, source: opts.source, target: opts.target, topic: opts.topic,
      dispatch_id: r.id, duration_s: r.duration_s, source_bytes: sourceContent.length,
      sanitized_bytes: r.output.length, approved },
  });

  if (opts.dryRun) { console.log("\n(dry run — no write)"); auditPayload(false); process.exit(0); }

  process.stdout.write(`\nApprove write to ${targetPath}? [y/N]: `);
  const answer = await readLine();
  if (answer !== "y" && answer !== "Y") { console.log("Aborted."); process.exit(0); }

  // 8. Write target
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, r.output);
  console.log(`✓ wrote ${targetPath} (${r.output.length} bytes)`);

  // 9. Audit
  auditPayload(true);
}
