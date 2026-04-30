# Changelog

## v0.0.3 — 2026-04-30 (offboarding ritual)

Second v0.5 batch. Adds `pdctx offboard <context>` so a context can leave cleanly: memory archived (or purged), chmod restored, runtime state cleared if active, audit log entry written.

### Added

- `pdctx offboard <context>` command. Default: archive the memory namespace to `~/.pdctx/memory/_archive/<safe-namespace>-<ISO-timestamp>/`. Flags:
  - `--purge` — `rm -rf` the namespace dir instead of archiving (destructive, no recovery)
  - `--force` — proceed even if the context is currently active (clears runtime state on claude + codex + `~/.pdctx/state/active.toml`)
  - `--dry-run` — print the plan, make no changes
- `restoreOne(namespace)` in `src/engine/isolation.ts` — restore chmod 700 on one namespace tree (BFS), versus the existing `restoreAll()` which spans the full memory root.
- `planOffboard(ctx, args)` pure function in `src/commands/offboard.ts`, exported for testing. Computes archive path, action (`archive` / `purge` / `absent`), `was_active`, `blocked_by_active`.
- `AuditEvent` extended with `"offboard"`.
- 6 unit tests over `planOffboard()` covering: archive default, --purge, memory absent, active-without-force blocked, active-with-force archived, namespace path flattening.

### Behavior

- Active context without `--force` → error, no side effects.
- Active context with `--force` → archive (or purge), then clear runtime state files for claude + codex + `~/.pdctx/state/active.toml`.
- Idempotent: re-running offboard on an absent namespace logs `action: absent` and exits cleanly.
- Audit entry: `{ event: "offboard", context, payload: { action, archived_path?, was_active, purge, force } }`.

### Verified

- `pdctx offboard <ctx> --dry-run` prints plan correctly for inactive / active-without-force / active-with-force paths.
- `bun test` 11/11 pass (5 overlay + 6 offboard), typecheck clean.

---

## v0.0.2 — 2026-04-30 (overlay merging)

First v0.5 batch. Closes the `personal-trader.toml` leak surfaced by the visibility scanner on ship day.

### Added

- Context overlays. Any `.toml` under a source's `contexts/` dir with an `[overlay]` block (`extends = "<base-name>"`) is treated as an overlay rather than a base. Loader does a two-pass merge: bases first (one base per name; collision = warning), then overlays applied in deterministic path order.
- Merge semantics: array fields concat with dedup (`skills.public`, `skills.private`, `flow.side`, `memory.firewall_from`), scalar fields override only when present in overlay, `sources` merges shallowly, `notes` is replaced.
- `validateOverlay()` in `src/schema/context.ts`, returns `ContextOverlay`. `parse(path)` now returns `ParsedContextFile` (`{kind: "base" | "overlay", def, path}`).
- `applyOverlay(base, overlay)` in `src/engine/context.ts`, exported for testing.
- `LoadResult.overlays_applied: { extends, path }[]` — surfaces which overlays merged in.
- `bun test` script + `src/engine/context.test.ts` (5 tests, locks merge contract).

### Changed

- `pandastack/plugins/pandastack/contexts/personal-trader.toml`: removed `pandastack-private:chain-scout` reference, flipped `private = false`. Public base now contains research/framing skills only.
- New `pandastack-private/contexts/personal-trader.overlay.toml`: extends `personal:trader`, adds `chain-scout` to `skills.private`, flips `private = true` on merge.

### Verified

- `pdctx use personal:trader` → `~/.claude/state/pdctx-active.json` shows merged `skills.private = ["pandastack-private:chain-scout"]`.
- `pdctx publish-check --path ~/site/skills/pandastack` clean — 147 files scanned, 0 violations. `pandastack-private:` strings no longer appear in any public file.

### Bundled in pandastack / pandastack-private

Closing the visibility scanner cleanly required a parallel split of human-facing index files:

- `pandastack/RESOLVER.md`: removed Trading + Sommet sections, removed `misalignment` / `yei-alert-triage` rows from Work execution, replaced the "Private contexts may reference `pandastack-private:*`" line with neutral wording. Added a `## Private supplement` pointer.
- `pandastack/plugins/pandastack/.codex/INSTALL.md`: removed `chain-scout` bare name from the local-CLI-bound list.
- New `pandastack-private/RESOLVER.md`: 8 private skills indexed (work execution / trading / sommet) with the same table format. Cross-references the public RESOLVER as the source of system shape.

Rule established: `pandastack-private:*` strings (and bare names of private skills) do not appear in the public repo. The visibility scanner stays an absolute gate, no allowlist mechanism needed.

---

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
