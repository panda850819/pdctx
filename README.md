# pdctx

> Personal context-aware AI operator OS — declare your contexts once, switch instantly, AI runtimes follow.

**Status**: in development (v0 design phase, 2026-04-29)

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
5. **Sources** (Vault / Notion / Slack / GitHub / Custom MCP, via BridgeAdapter)

## Hard isolation guarantees

- Repo split: framework (public) / personal stack (public) / work stack (private)
- Memory namespace firewall (chmod-enforced, not honor system)
- Knowledge source firewall (per-context allow/forbid lists)
- Cross-boundary writes (work → personal) only via `pdctx distill` ritual with sanitization + approval
- Append-only audit log for clean-exit evidence

## Roadmap

| Version | Scope | ETA |
|---|---|---|
| v0 | Context engine, sync to Claude/Codex, isolation, distill, audit | 4 weeks |
| v0.5 | Source adapters (vault, Notion, Slack, GitHub, MCP), `onboard` flow | +3 weeks |
| v1 | Clean offboarding ritual, Hermes/Gemini support, alpha testers | +1-4 weeks |

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
