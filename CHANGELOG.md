# Changelog

## v0.0.5 — 2026-04-30 (BridgeAdapter)

Fourth v0.5 batch. Refactors v0.0.4's inline `qmd` spawn into a `BridgeAdapter` interface + a single reference adapter (`QmdBridgeAdapter`). The interface is the contract for **CLI-style local sources** (qmd today; potentially other local CLI tools later). External services (Notion / Linear / Slack / GitHub) will NOT use BridgeAdapter — they go through MCP allowlist instead (see "Layer 5 architecture correction" below).

### Added

- `BridgeAdapter` interface in `src/adapters/types.ts`. Required surface:
  - `name: string` — registry key
  - `query(input: BridgeQueryInput): Promise<BridgeQueryResult>` — read-only query
  - `health(): Promise<BridgeHealth>` — doctor probe
- `QmdBridgeAdapter` in `src/adapters/qmd.ts`. Wraps `qmd query/search/vsearch` via `spawn()`. Configurable binary name (default `"qmd"`). Health check runs `qmd --version`.
- `AdapterRegistry` + `getDefaultRegistry()` in `src/adapters/registry.ts`. In-memory registry, preloaded with `QmdBridgeAdapter`. Exposes `get(name)`, `list()`, `healthAll()`.
- `pdctx doctor` now appends one `bridge:<name>` row per registered adapter, status from `health()`.
- 6 unit tests over `buildQmdArgs()` argument shapes + `QmdBridgeAdapter.health()` failure path.

### Changed

- `src/commands/query.ts` no longer spawns `qmd` inline. Looks up the `qmd` adapter from the default registry and delegates `query()` calls. Firewall (`planQueryArgs()`) still runs in the CLI layer first — adapter never sees rejected requests.

### Behavior

- `pdctx query/search/vsearch` behavior unchanged from v0.0.4 (firewall + audit log + filter expansion all preserved).
- `pdctx doctor` adds one new line per adapter, e.g. `✓ bridge:qmd 0.1.0`.

### Verified

- `bun test` 23/23 pass (5 overlay + 6 offboard + 6 knowledge + 6 qmd adapter).
- `tsc --noEmit` clean.
- Manual smoke: `pdctx doctor` shows `bridge:qmd` row; `pdctx query "naval" -c knowledge -n 2` returns real results from active `personal:writer` context.

### Out of scope (deferred)

- Config-driven adapter binding via `[sources.<name>] adapter = "..."` schema (decision 3a in the brief). Deferred: with one adapter, code-registration is sufficient. The binding question is moot under the corrected Layer 5 model — see below.
- `BridgeQueryResult` shape redesign (exit-code coupling to shell semantics, filter-mode stdout interleaving). Deferred: with one CLI adapter and no external consumers of the interface, YAGNI applies. Revisit when a second CLI adapter materializes (unlikely soon — see corrected Layer 5).
- Write surface on `BridgeAdapter` (read-only contract for now; write goes through `pdctx distill` ritual).

### Layer 5 architecture correction

Surfaced during this batch's review (not part of the original v0 plan). The original framing in README — "Sources (Vault / Notion / Slack / GitHub / Custom MCP), via BridgeAdapter" — was wrong. MCP servers are not a sub-type of BridgeAdapter; they are a parallel substrate.

**Corrected Layer 5 model**:

```
Sources (Layer 5) — mixed, by source nature

A. CLI adapter (BridgeAdapter)
   - Trigger: human / pdctx CLI
   - Fits: local + owned + read-as-search
   - Today: QmdBridgeAdapter (personal vault search)
   - Firewall: CLI-layer (planQueryArgs from v0.0.4)

B. MCP allowlist
   - Trigger: LLM agent inside Claude Code / Codex / Hermes runtime
   - Fits: external API service + structured read+write
   - Future: Notion / Linear / Slack / GitHub MCP servers (use official / community, do NOT wrap)
   - Firewall: per-context allow list written into runtime mcp.json
```

**Why source nature decides binding (not unification)**:

- qmd over personal vault is a sweet spot: local markdown you own, search-read primary use → CLI adapter is correct
- Wrapping Notion through qmd-like adapter would break on 5 axes: stale snapshot, structure loss (property/relation/block), read-only (Notion's core action is write), sync hell, LLM agent UX mismatch → must be MCP

**Implications for upcoming batches**:

- Batch 5 was originally planned as "Notion / Linear reference adapters". That plan is wrong. Batch 5 will be: design `[mcp]` block in context.toml (allow / forbid for MCP server names), runtime mcp config writer, integration with Notion / Linear / Slack official MCP servers.
- Long-horizon (v2, ~6 months): if company-os's gbrain stack proves stable in work-vault and LLM agents start needing high-frequency vault search inside conversations, `qmd` backend may migrate to a PGLite-based long-running service (still fronted by an MCP server). pdctx Layer 5 schema does not need to change for this — it is just a swap from BridgeAdapter "qmd" to MCP allowlist "personal-brain-mcp".

Full reasoning: [`docs/sessions/2026-04-30-pdctx-layer5-architecture-fork.md`](docs/sessions/2026-04-30-pdctx-layer5-architecture-fork.md) (vault-side).

---

## v0.0.4 — 2026-04-30 (knowledge source firewall)

Third v0.5 batch. Layer 4 of the 4-layer firewall: `pdctx query/search/vsearch` wrap qmd with active-context allow/forbid enforcement. Forbidden collections are rejected outright; bare queries auto-expand to the allowed list.

### Added

- `[knowledge]` block in context.toml schema. Two array fields:
  - `allow` — qmd collection names auto-expanded to when no `-c` is passed
  - `forbid` — qmd collection names always rejected even if user passes `-c <forbidden>`
- `pdctx query <text>`, `pdctx search <text>`, `pdctx vsearch <text>` commands. Wrap qmd's hybrid / BM25 / vector search respectively. Inherit qmd's `-c <collection>` and `-n <limit>` flags but enforce the active context's firewall first.
- `planQueryArgs(input)` pure function in `src/engine/knowledge.ts`. Returns `{ action: "allow" | "filter" | "reject", collections, reason }`. Exported for testing.
- `AuditEvent` extended with `"query"`. Every `pdctx query/search/vsearch` invocation writes an audit entry with subcommand, query, action, and reason.
- 6 unit tests over `planQueryArgs()` covering: no-active-context pass-through, no-`[knowledge]`-section pass-through, `-c` forbidden rejection, `-c` allowed pass-through, no-`-c` filter expansion, forbid-takes-precedence on conflict.

### Changed

- 8 context.toml files in pandastack + pandastack-private declare `[knowledge]` block:
  - 4 personal contexts: `allow = ["knowledge", "blog", "lennys", "sessions"]`, `forbid = ["work-vault"]`
  - 4 work contexts: `allow = ["work-vault"]`, `forbid = ["knowledge", "blog", "lennys", "sessions"]`
- Context overlay merge in `applyOverlay()` extended to merge `knowledge` block (allow/forbid use dedup-concat, mirroring skills/firewall_from semantics).

### Behavior

- No active context, or context without `[knowledge]` block → pass-through unchanged.
- `-c <forbidden>` → exit 1 with `pdctx: rejected — collection "X" forbidden in context "Y"`.
- `-c <allowed>` → invoke qmd once with that collection.
- No `-c`, allow list non-empty → invoke qmd N times, one per allowed collection, with `--- <name> ---` separator on stderr.
- No `-c`, allow list empty → pass-through (forbid not enforceable without explicit `-c`).
- Audit entry: `{ event: "query", context, payload: { subcmd, query, user_collection, action, collections, reason } }`.

### Verified

- 4 manual smokes:
  - `personal:writer` + `-c work-vault` → reject
  - `personal:writer` + `-c knowledge` → results from knowledge collection only
  - `work:yei:ops` + `-c knowledge` → reject
  - `personal:writer` no `-c` → 4-collection auto-expand with per-collection results
- `bun test` 17/17 pass (5 overlay + 6 offboard + 6 knowledge).
- `~/.config/qmd/index.yml` extended with `work-vault` collection (143 docs indexed).

### Out of scope (deferred)

- PATH shim that aliases bare `qmd` to `pdctx query` (defer; risk breaking direct qmd usage).
- Native `--respect-context` flag in qmd itself (defer; pdctx wrap is the cleaner separation).
- Slack / Notion / Linear source firewall (waits for BridgeAdapter in Batch 4).

---

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
