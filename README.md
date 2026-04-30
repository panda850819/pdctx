# pdctx

> Personal context-aware AI operator OS — declare your contexts once, switch instantly, AI runtimes follow.

**Status**: v0.5 in progress (2026-04-30) — `use` / `call` / `distill` / `query` / `search` / `vsearch` / `status` / `doctor` / `init` / `publish-check` / `offboard` wired against Claude Code + Codex CLI. Memory chmod firewall + knowledge source firewall + JSONL audit log live. Author dogfood window active. Not stable yet.

## Quick start

```bash
git clone https://github.com/panda850819/pdctx
cd pdctx && bun install
bun link
pdctx init                        # bootstraps ~/.pdctx/
pdctx doctor                      # all green if Claude Code + Codex CLI installed
pdctx use personal:writer         # wear a context (8 ship with pandastack)
pdctx call personal:writer "..."  # delegate (foreground stream)
pdctx query "naval"               # qmd hybrid search filtered by active context
pdctx search "ops" -c work-vault  # rejected if work-vault is forbidden in active context
pdctx distill --from work:yei:ops --to personal:knowledge-manager \
  --source <path> --target <path> --topic "..." --dry-run
pdctx offboard personal:trader --dry-run  # archive memory, restore chmod
```

`pdctx use` writes runtime state to `~/.claude/state/pdctx-active.json` and `~/.codex/state/pdctx-active.json`. Future Claude Code / Codex hooks read these to filter visible skills (out of scope for v0).

## Why

You wear many hats: Ops Manager, Writer, Trader, Developer, Knowledge Manager. Today, your AI assistants don't know which hat you're wearing right now, so they treat all skills as equally available — context bloat, no prioritization, generic responses, no bounding-curve value-add.

`pdctx` lets you declare your contexts (each with its own skills, memory namespace, voice, priority rules, knowledge sources), switch between them with one command, and have Claude Code / Codex CLI / Hermes all follow.

LifeOS is to Obsidian what pdctx is to Claude Code / Codex / Hermes.

## Core mental model

```
You = orchestrator (always)
Contexts = your specialized teams (Ops / Writing / Trading / ...)

  pdctx use work:ops          # wear the Ops hat, work alongside AI
  pdctx call work:ops <task>  # delegate to Ops agent, you stay strategic
```

## Architecture (5 layers)

1. **You** (orchestrator)
2. **Framework** (pdctx CLI — context engine + sync + isolation + adapters + hooks)
3. **Stack content** (pandastack public + pandastack-private + community stacks)
4. **AI Runtimes** (Claude Code / Codex CLI / Hermes / Gemini)
5. **Sources** — mixed, by source nature:
   - **CLI adapter (BridgeAdapter)** for local + owned + search-read sources (Vault via qmd today)
   - **MCP allowlist** for external API services (Notion / Linear / Slack / GitHub MCP servers)

## Hard isolation guarantees

- Repo split: framework (public) / personal stack (public) / work stack (private)
- Memory namespace firewall (chmod-enforced, not honor system)
- Knowledge source firewall (per-context allow/forbid lists)
- Cross-boundary writes (work → personal) only via `pdctx distill` ritual with sanitization + approval
- Append-only audit log for clean-exit evidence

## Roadmap

| Version | Scope | Status |
|---|---|---|
| v0 | Context engine, sync to Claude/Codex, chmod firewall, distill, audit, publish-check | functional 2026-04-30 |
| v0.5 batch 1 | Overlay merging for context.toml | shipped 2026-04-30 (v0.0.2) |
| v0.5 batch 2 | Clean offboarding ritual | shipped 2026-04-30 (v0.0.3) |
| v0.5 batch 3 | Knowledge source firewall (qmd wrap, allow/forbid per context) | shipped 2026-04-30 (v0.0.4) |
| v0.5 batch 4 | `BridgeAdapter` interface + `QmdBridgeAdapter` reference + registry | shipped 2026-04-30 (v0.0.5) |
| v0.5 batch 5 | MCP allowlist: `[mcp]` block in context.toml + runtime mcp config writer + Notion/Linear/Slack MCP integration | planned |
| v1 | Hermes/Gemini runtime loaders, alpha testers | planned |

## Related repos

- [`panda850819/pandastack`](https://github.com/panda850819/pandastack) — personal skills + agents (public stack content)
- `panda850819/pandastack-private` — work contexts and skills (private)

## Tech stack

- Bun + TypeScript
- Config: TOML
- Distribution: npm (`pdctx`), Homebrew tap (planned)

## License

MIT (planned)

---

Built by [@panda850819](https://github.com/panda850819).
Inspired by [LifeOS](https://github.com/quanru/obsidian-example-lifeos) (personal-OS pattern), [gstack](https://github.com/garrytan/gstack) (skill stack), [Hanko](https://github.com/teamhanko/hanko) (multi-tier install model).
