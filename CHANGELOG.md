# Changelog

## v0.0.9 — 2026-05-02 (qmd retirement — gbrain sole query path)

qmd adapter unregistered. All `pdctx query/search/vsearch` calls now route through `GbrainAdapter`. [knowledge] blocks removed from all 8 context TOMLs (they were the qmd collection firewall; gbrain firewall lives in [gbrain] blocks, already present since v0.0.8).

### Changed

- `src/adapters/registry.ts`: removed `QmdBridgeAdapter` import and registration. `buildDefaultRegistry()` now registers only `GbrainAdapter`.
- `src/commands/query.ts`: `ADAPTER_NAME` changed from `"qmd"` to `"gbrain"`. Query commands delegate to `GbrainAdapter` exclusively.
- `[knowledge]` blocks removed from all 8 context TOMLs:
  - 4 personal contexts (writer/trader/developer/knowledge-manager) in pandastack
  - 3 work-yei contexts (ops/hr/finance) in pandastack-private
  - 1 work-sommet context (abyss-po) in pandastack-private
- [gbrain] block comments cleaned up (removed "Phase 1 placeholder" and stale toggle guidance).

### Behavior

- `pdctx query/search/vsearch` now routes through gbrain. Work contexts (yei/sommet) have `allow = ["work-vault"]` or `allow = []` with `write_mode = "deny"` — queries will return empty until work-vault is ingested as a gbrain source (Phase 2).
- `pdctx doctor` no longer shows `bridge:qmd` row.
- `qmd` binary is unlinked from PATH (bun unlink). Source at `~/site/cli/qmd` and gbrain DB are untouched.

### Out of scope

- work-vault gbrain ingestion (Phase 2 — separate cut once ingestion is confirmed stable).
- Removing `src/adapters/qmd.ts` source file (kept for reference until Phase 2 is done and there is no rollback need).

---

## v0.0.8 — 2026-05-02 (gbrain adapter + wire-hook)

Seventh slice on top of v0.0.7 baseline. Two features: (1) `GbrainAdapter` — Layer 4 gbrain source firewall with per-context allow/forbid/write_mode, registered in the default adapter registry so `pdctx doctor` surfaces `bridge:gbrain`; (2) `pdctx wire-hook` — idempotent hook installer for detected runtimes (Claude gets script chmod + settings.json entry; Codex gets a notice-only placeholder pending upstream hook event support).

### Added

- `GbrainAdapter` in `src/adapters/gbrain.ts`. Implements `BridgeAdapter`:
  - `query()`: spawns `gbrain search <text> [--include-slug-prefixes <source>/]*` based on `ctx.gbrain.allow`. Throws `FirewallError` when `allow = []`.
  - `health()`: spawns `gbrain doctor --fast --json`, parses `{ status }` field.
  - `write()`: stub that rejects with `FirewallError` (v0 — gbrain writes not yet in scope).
- `FirewallError` class in `src/adapters/gbrain.ts` (extends `Error`). Used for both allow-list enforcement and write-stub rejection.
- `buildGbrainArgs(input, ctx)` pure function exported for testing. Builds the CLI args array; throws `FirewallError` when allow list is empty.
- `[gbrain]` block in `ContextDef` and `ContextOverlay` in `src/schema/context.ts`:
  - `allow: string[]`, `forbid: string[]`, `write_mode: "read-only" | "read-write" | "deny"` (defaults to `"deny"` when absent — fail-closed).
- `applyOverlay()` in `src/engine/context.ts` extended to merge `gbrain` block (allow/forbid use dedup-concat; write_mode uses overlay-over-base scalar override; mirrors `knowledge` semantics).
- `~/.pdctx/source-policy.json` (mode 0600) written with `schema_version: 1` shape. System-wide per-source defaults for Phase 2.
- `pdctx wire-hook` command in `src/commands/wire-hook.ts`:
  - Detects Claude (~/.claude present) and Codex (~/.codex present).
  - Claude path: ensures `~/.claude/hooks/pre-tool-use/pdctx-mcp-firewall.sh` is executable + ensures `PreToolUse` entry with matcher `mcp__.*` in `~/.claude/settings.json`. Idempotent — `already_wired` if both conditions met.
  - Codex path: notice only — PreToolUse hook event not yet available upstream (Codex 0.124.0).
  - `planWireHook(input)` pure function exported for testing (no disk I/O).
  - `--dry-run` flag: prints plan without making changes.

### Changed

- `src/adapters/registry.ts`: `GbrainAdapter` registered in `buildDefaultRegistry()` → `bridge:gbrain` appears in `pdctx doctor` output automatically.
- 8 context.toml files updated to declare `[gbrain]` block:
  - 4 personal contexts (writer/trader/developer/knowledge-manager): `allow = ["panda-vault"]`, `write_mode = "read-only"`. Phase 1 placeholder — panda-vault not yet ingested into gbrain. gbrain adapter exists; Phase 2 toggle is a separate cut.
  - 3 work-yei contexts (ops/hr/finance): `allow = ["work-vault"]`, `write_mode = "deny"`. Fails closed — work-vault not yet a gbrain source.
  - 1 work-sommet context (abyss-po): `allow = []`, `write_mode = "deny"`. No gbrain source for Sommet yet.
- `src/cli.ts` registers `wire-hook` command.
- `package.json` + `src/cli.ts` version: `0.0.7` → `0.0.8`.

### Behavior

- gbrain firewall: `allow = []` → `FirewallError` thrown before spawning any subprocess. Non-empty allow list → each source maps to `--include-slug-prefixes <source>/` arg pair.
- `pdctx doctor` now shows `bridge:gbrain` row. Health: runs `gbrain doctor --fast --json`; `{ status: "ok" }` → healthy; binary missing or non-zero exit → unhealthy with reason.
- `pdctx wire-hook`: if both chmod + settings.json entry already correct → prints `already_wired`, exits 0, no writes. Safe to run on any machine.

### Phase 1 / Phase 2 boundary

- gbrain adapter is registered and context TOMLs have `[gbrain]` blocks, but **`pdctx query/search/vsearch` still routes through the `qmd` adapter only** (Phase 2 toggle deferred). The gbrain block is a data contract + firewall spec, not an active query path yet.
- Phase 2 will add `pdctx gbrain-query` (or toggle existing query commands) to route through `GbrainAdapter`. That cut is a separate PR once work-vault and panda-vault are confirmed gbrain sources.

### Out of scope

- Codex PreToolUse hook script: blocked on upstream Codex CLI hook event support.
- gbrain as active query path (Phase 2).
- `pdctx wire-hook --runtime <name>` flag to install for one runtime only (deferred; two runtimes is manageable without it).

### Files

- New: `src/adapters/gbrain.ts`, `src/adapters/gbrain.test.ts`, `src/commands/wire-hook.ts`, `src/commands/wire-hook.test.ts`, `~/.pdctx/source-policy.json`
- Changed: `src/adapters/registry.ts`, `src/schema/context.ts`, `src/engine/context.ts`, `src/cli.ts`, `package.json`, `CHANGELOG.md`
- Context TOMLs: all 4 personal contexts + 3 work-yei + 1 work-sommet

### Tests

68/68 (7 gbrain + 7 wire-hook + 54 existing). `tsc --noEmit` clean.

---

## v0.0.7 — 2026-05-01 (skill frontmatter contract + validator)

Sixth slice on top of v0.5 baseline. Skill content (pandastack and any pandastack-compatible stack) gets a frontmatter contract; pdctx gains a validator that enforces it. Spec lives in pandastack repo as `SKILL-FRONTMATTER.md`; pdctx provides the schema-agnostic `skill-validate` tool that any future stack can use.

### Added

- `skill-validate` command. `pdctx skill-validate --path <stack>` walks `<stack>/skills/*/SKILL.md` and `<stack>/plugins/*/skills/*/SKILL.md`, parses frontmatter, classifies each as pass / warn / fail. Exits 1 on any fail.
- `src/engine/skill-validate.ts` engine: `parseFrontmatter()` (YAML subset — inline scalars, `|`/`>` block scalars, comment lines, single/double quote stripping), `validateSkill(dir)`, `validateStack(path)`, `isStackPath(path)`.
- 18 unit tests covering parseFrontmatter (5), validateSkill (7 — pass/warn/fail combinations), validateStack (3 — direct + plugin layouts + aggregation), isStackPath (3).

### Changed

- `publish-check` now also runs skill-validate when target path looks like a stack (has `skills/` or `plugins/` subdir). `fail` adds to blocking count, `warn` reports but does not block. Visibility scan + skill-validate share one audit log payload.
- `AuditEvent` union extended with `"skill-validate"`.
- `cli.ts` version: `0.0.4` → `0.0.7` (catching up after v0.0.5/0.0.6 missed bumps).

### Contract

Codified in `pandastack/SKILL-FRONTMATTER.md`:

- Required fields: `name` (must equal folder name, plain — no `pandastack:` or `ps-` prefix), `description`.
- Optional fields: `allowed-tools`, `version`, `user-invocable`, `type`. Other keys are not warned and not blocked.
- HOT/COLD: `name` + `description` are HOT (in skill index every session); other fields are COLD (loaded on invocation).
- No character or token budgets in spec or validator. Length discipline is qualitative; downstream tools reading budget numbers may convert them into hard truncation.

### Baseline drift signal

Run on `~/site/skills/pandastack` at ship time:

- 36 scanned
- 27 pass
- 8 warn (all `ps-` prefix on legacy skills: init, freeze, checkpoint, careful, qa, review, brief, ship)
- 1 fail (feed-curator missing frontmatter entirely)

Drift is intentionally not auto-fixed in this slice. Migration is a follow-up sprint after dogfood window.

### Out of scope

- Auto-fix mode (`--fix`). Deferred until spec is stable and dogfood gives signal on which drift forms are safe to rewrite.
- JSON schema export. Useful for IDE/LSP integration but premature when spec is one week old.
- pandastack-private same-treatment. Personal stack ships first; private stack follows after public dogfood.
- Frontmatter consumption by pdctx itself (firewall hint, visibility, user-invocable enforcement). v1 territory.

### Files

- New: `src/engine/skill-validate.ts`, `src/engine/skill-validate.test.ts`, `src/commands/skill-validate.ts`
- Changed: `src/cli.ts`, `src/commands/publish-check.ts`, `src/engine/audit.ts`, `package.json`, `CHANGELOG.md`, `README.md`
- Companion in pandastack: `SKILL-FRONTMATTER.md`

### Tests

54/54 (18 new + 36 existing). `tsc --noEmit` clean.

## v0.0.6 — 2026-04-30 (MCP allowlist firewall)

Fifth v0.5 batch. Layer 5 firewall for MCP tools: `[mcp].deny` block in context.toml lists tool-name glob patterns; pdctx publishes them to `~/.claude/state/pdctx-active.json` and `~/.codex/state/pdctx-active.json`; a Claude Code PreToolUse hook reads the state and blocks matching MCP tool calls. Hook-based runtime enforcement, not config mutation — see "Design rationale" below.

### Added

- `[mcp]` block in context.toml schema. Single field `deny: string[]` of tool-name glob patterns (`*` = any, `?` = single char). No allow list, no read/write classifier — v0 is denylist only by deliberate scope cut.
- `planMcpCall(input)` pure function in `src/engine/mcp.ts`. Returns `{ action: "allow" | "deny", reason, matched_pattern? }`. Exported for testing. First matching pattern wins.
- `matchGlob(pattern, name)` glob matcher in `src/engine/mcp.ts`. Translates `*` → `.*`, `?` → `.`, escapes regex specials. Anchored full match (`^...$`).
- `~/.claude/hooks/pre-tool-use/pdctx-mcp-firewall.sh` PreToolUse hook script. Reads `~/.claude/state/pdctx-active.json`, glob-matches `tool_name` against `mcp_deny`, emits `permissionDecision: "deny"` on hit. Exits 0 silently for non-MCP calls (early exit on `tool_name == mcp__*` check). Wired into `~/.claude/settings.json` PreToolUse with matcher `mcp__.*`.
- 11 unit tests over `planMcpCall()` + `matchGlob()` covering: no-context pass-through, no-`[mcp]` pass-through, empty-deny pass-through, glob match, no match, multi-pattern first-wins, exact match, trailing wildcard, `?` single-char, regex specials in tool names, anchored match.

### Changed

- 8 context.toml files declare `[mcp].deny`:
  - 4 personal contexts (`personal-writer/trader/developer/knowledge-manager`): deny `mcp__claude_ai_Linear__*` (Sommet ticketing) + `mcp__claude_ai_Atlassian__*` (Yei Jira).
  - 3 work-yei contexts (`work-yei-ops/hr/finance`): deny `mcp__claude_ai_Linear__*` (Sommet's tool, different team).
  - 1 work-sommet context (`work-sommet-abyss-po`): deny `mcp__claude_ai_Atlassian__*` (Yei's tool, different team).
- Context overlay merge in `applyOverlay()` extended to merge `mcp` block (deny uses dedup-concat, mirroring `knowledge.allow/forbid` and `memory.firewall_from`).
- Both runtime loaders (`claude.ts`, `codex.ts`) include `mcp_deny: context.mcp?.deny ?? []` in the JSON payload.

### Behavior

- No active context, or context without `[mcp]` block → hook silent pass-through (allow).
- `tool_name` not starting with `mcp__` → hook early-exit, no firewall logic runs.
- `tool_name` matching any deny glob pattern → hook emits PreToolUse deny JSON; Claude Code blocks the call and surfaces `permissionDecisionReason` to the LLM.
- Cross-context behavior: `pdctx use <ctx>` re-publishes state file. New tool calls in the same Claude Code session pick up new firewall (hook re-reads state file each time).
- Codex side: `mcp_deny` is written to `~/.codex/state/pdctx-active.json` for symmetry, but Codex CLI 0.124.0 does not yet expose a PreToolUse-equivalent hook event (only SessionStart / Stop / UserPromptSubmit). Enforcement on Codex side is deferred until upstream support lands. Schema is forward-compatible — only the hook script needs writing.

### Verified

- `bun test` 36/36 pass (5 overlay + 6 offboard + 6 knowledge + 6 qmd adapter + 11 mcp + 2 mcp overlay merge).
- `tsc --noEmit` clean.
- Manual smokes (with `pdctx use personal:writer` then `work:yei:ops`):
  - personal:writer + `mcp__claude_ai_Linear__list_issues` → hook emits deny JSON
  - personal:writer + `mcp__claude_ai_qmd__hybrid` → hook silent pass-through
  - personal:writer + non-MCP tool (e.g. `Bash`) → hook early-exits, no overhead
  - work:yei:ops + `mcp__claude_ai_Atlassian__list_issues` → hook silent pass-through (Yei uses Atlassian)
  - work:yei:ops + `mcp__claude_ai_Linear__list_issues` → hook emits deny JSON (Linear is Sommet's, not Yei's)

### Out of scope (deferred per grill 2026-04-30)

- **Allow-list / read-write classifier** (originally B2 in grill): only adds value if Panda needs intra-context tool-class gates (preventing personal:writer from accidentally invoking destructive personal tools). Deferred until `mcp_deny`-only proves insufficient after a week of use.
- **Usage log** (`~/.pdctx/usage/<context>.jsonl` of all MCP tool calls): valuable for retro ("did I use any work tool from a personal context this week?") but adds write surface and disk churn. Deferred until v0.0.6 dogfood reveals retro need.
- **JIT `/pdctx allow <tool>` slash command**: in-flow allowlist editing. Deferred — current denylist is short and edit-by-hand is fine at this scale.
- **Haiku per-call read/write judge**: latency cost on agentic loops too high; permanently parked.
- **Codex PreToolUse hook script**: blocked on upstream Codex CLI hook event support. Schema and state file already carry `mcp_deny`.
- **`pdctx wire-hook` install command**: hook script is currently placed at `~/.claude/hooks/pre-tool-use/pdctx-mcp-firewall.sh` and wired into settings.json by hand. Auto-install via `pdctx init` or `pdctx wire` is a v0.5+ ergonomic improvement.

### Design rationale (grill 2026-04-30)

The original Layer 5 plan (v0.0.5 changelog) framed Batch 5 as "runtime mcp config writer" — i.e. mutating `~/.claude/settings.json` mcpServers section per active context. A grill session on 2026-04-30 (`Inbox/grill-pdctx-batch-5-mcp-allowlist-2026-04-30.md` in the personal vault) reframed three structural questions:

1. **Enforcement layer**: runtime hook (this implementation) instead of config mutation. Reasons: doesn't break manual `claude mcp add`; doesn't fight user-edited settings.json; supports `/pdctx use <ctx>` mid-session hot-swap (next session's tool calls pick up new firewall, no restart).
2. **Curation strategy**: predeclared denylist instead of JIT learning. Reasons: with Yei (Atlassian) and Sommet (Linear) being the only structural cross-team boundaries, the deny list is 1-2 entries per context — hand-maintained is fine. JIT learning is overhead without clear payoff at this scale.
3. **Failure semantics**: deny-on-match is the only mode; no fail-open + log, no read/write classifier. The user's stated concern was "don't let personal context touch work systems" — denylist solves that. Read/write classifier and JIT are layered designs that earn their keep only after v0 proves insufficient.

The grill log records the full reasoning trail and lists explicit triggers for when to add the deferred features. This batch implements **only what the stated concern requires**, no more.

### MCP loading clarification

A reality check surfaced during the grill: in current Claude Code, MCP server **subprocesses** spawn eagerly at session start (the runtime needs them up to enumerate tool names). What can be filtered is the **LLM's view of available tools** — schemas are deferred via ToolSearch, and PreToolUse hooks can block calls. So the firewall does not reduce subprocess footprint — it bounds what the LLM is permitted to call. This is fine for the cross-team contamination use case, which is about boundary enforcement, not resource reduction.

---

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
