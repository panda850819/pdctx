# Changelog

## v0.0.1 — 2026-04-30 (functional)

First functional cut. Subagent-driven build session, 13 tasks across 6 phases, ~3 hours wall clock.

### Surface

- `pdctx init` — bootstrap `~/.pdctx/` (CONFIG.toml + memory/ + audit/ + state/ + contexts/). Idempotent.
- `pdctx use <ctx>` — load context, bootstrap memory tree, apply chmod firewall, sync to `~/.claude/state/pdctx-active.json` + `~/.codex/state/pdctx-active.json`, write `~/.pdctx/state/active.toml`, audit.
- `pdctx call <ctx> <task>` — dispatch a one-shot LLM task with context-injected system prompt. `--runtime claude|codex`, `--model`, `--timeout`. Foreground streaming.
- `pdctx distill --from <ctx> --to <ctx> --source <path> --target <path> --topic <s>` — sanitize cross-boundary content via claude -p, show diff, prompt y/N, write on approve. `--dry-run` and `--force` flags.
- `pdctx status` — active context + in-flight calls + recent calls (reads state/active.toml + state/calls.jsonl).
- `pdctx doctor` — health check (bun version, ~/.pdctx layout, runtime shim detection).
- `pdctx publish-check --path <dir>` — scan a repo for work-domain markers before pushing to a public remote.

### Engine

- `src/engine/context.ts` — context loader (reads `[stack.sources]` from CONFIG.toml, walks `contexts/` and `plugins/<name>/contexts/`)
- `src/engine/sync.ts` — runtime fanout (claude + codex loaders, per-runtime audit + aggregate audit)
- `src/engine/isolation.ts` — chmod firewall (700/000), bootstrap, restoreAll, BFS queue handles 000 dirs
- `src/engine/visibility.ts` — 6-marker grep scan for work-domain leakage
- `src/engine/dispatcher.ts` — Bun.spawn over `claude -p` and `codex exec`, timeout, streaming, calls.jsonl persistence
- `src/engine/audit.ts` — append-only JSONL log at `~/.pdctx/audit/YYYY-MM.jsonl`

### Schema

- `src/schema/context.ts` — `ContextDef` interface + parse/validate
- `src/schema/config.ts` — `PdctxConfig` interface + parse/validate

### Loaders

- `src/loaders/claude.ts` — applies context state to `~/.claude/state/pdctx-active.json`
- `src/loaders/codex.ts` — applies context state to `~/.codex/state/pdctx-active.json`

### Out of scope for v0 (deferred)

- Knowledge source firewall (`qmd` wrap layer) — needs qmd modification
- `BridgeAdapter` interface + 6 reference adapters — v0.5
- `pdctx onboard --org` interactive flow — v0.5
- Hermes / Gemini runtime loaders — placeholder only
- Background mode for `pdctx call` (foreground only in v0)
- Skill / agent contexts: [...] frontmatter spec (manual filter for v0)
- Overlay merging for context.toml (currently full-file replacement, last source wins)
- True token-level streaming (claude -p / codex exec batch their output)

### Known issues

- LSP sometimes shows stale "module not found" diagnostics on cli.ts after subagent file creation; `bun run typecheck` is the source of truth.
- `personal:trader.toml` references `pandastack-private:chain-scout` from the public pandastack repo — this leaks the private skill name. Tracked for v0.5 (overlay merging is the proper fix).

### Acknowledgments

Subagent-driven build via `pandastack:execute-plan` skill. Plan and audit trail at `obsidian-vault/docs/sessions/2026-04-30-pdctx-v0-execution.md`.
