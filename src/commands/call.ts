import { loadContextsFromDefault } from "../engine/context.ts";
import { dispatch } from "../engine/dispatcher.ts";

export interface CallOptions {
  runtime?: "claude" | "codex";
  model?: string;
  timeout?: number;
  cwd?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
}

export async function runCall(
  contextName: string,
  task: string,
  opts: CallOptions = {},
): Promise<void> {
  // 1. Load contexts
  const { contexts, warnings } = loadContextsFromDefault();
  for (const w of warnings) console.warn(`warn: ${w}`);

  // 2. Resolve context
  if (!contexts.has(contextName)) {
    const available = [...contexts.keys()].sort().join("\n  ");
    console.error(`error: context "${contextName}" not found.\navailable:\n  ${available}`);
    process.exit(1);
  }
  const activeContext = contexts.get(contextName)!;

  const runtime = opts.runtime ?? "claude";
  const model = opts.model ?? (runtime === "claude" ? "haiku" : "default");

  // 3. Header
  process.stdout.write(`pdctx call ${contextName} via ${runtime} (model=${model})\n---\n`);

  // 4. Dispatch with streaming
  const r = await dispatch(activeContext, task, {
    runtime,
    model: opts.model,
    timeout_ms: (opts.timeout ?? 300) * 1000,
    cwd: opts.cwd,
    sandbox: opts.sandbox,
    onStream: (chunk) => process.stdout.write(chunk),
  });

  // 5. Footer
  if (r.error) {
    process.stdout.write(
      `\n---\n✗ failed — id=${r.id}, duration=${r.duration_s}s, exit=${r.exit_code}, error: ${r.error}\n`,
    );
  } else {
    process.stdout.write(
      `\n---\n✓ done — id=${r.id}, duration=${r.duration_s}s, exit=${r.exit_code}\n`,
    );
  }

  // 6. Exit code
  process.exit(r.error ? 1 : r.exit_code);
}
