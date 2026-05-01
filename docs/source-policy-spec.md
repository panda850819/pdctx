# pdctx source-policy spec — Layer 4 firewall for gbrain

> Draft 2026-05-02. Borrowed shape from `gstack-gbrain-repo-policy` (`~/.gstack/gbrain-repo-policy.json`). Adapts to pdctx's per-context policy rather than per-repo.

## Why

pdctx Layer 4 firewall today operates against qmd collections (`[knowledge] allow / forbid` keys). We are migrating retrieval to gbrain (`gbrain sources`) and need the equivalent allow/forbid semantics to land on `source_id`.

In multi-source brain, a query in context `personal:writer` should only see `panda-vault`; a query in `work:yei:ops` should only see `work-vault`; both contexts use the same brain.pglite, the firewall is per-query.

## Shape

### Per-context (in context TOML)

Add a new `[gbrain]` section to context TOML (siblings to existing `[knowledge]`):

```toml
[gbrain]
# Source allowlist — query in this context only matches these source_ids.
# Empty list = "no gbrain access from this context" (read denied).
allow = ["panda-vault"]

# Optional explicit forbid (defense-in-depth — overrides allow if a source
# id appears in both, which never should but a policy mistake won't leak).
forbid = []

# Write policy — does this context's skills get to write back into the brain?
# - "read-only": only gbrain query / search / get_page allowed
# - "read-write": also allows put / sources sync
# - "deny": no gbrain interaction at all
write_mode = "read-only"
```

Keep `[knowledge]` for qmd-era backward compat until qmd is fully retired (see migration below).

### System-wide (`~/.pdctx/source-policy.json`)

Per-source defaults that apply when a context does not name the source explicitly. Mode 0600.

```json
{
  "schema_version": 1,
  "sources": {
    "panda-vault": {
      "default_write_mode": "read-only",
      "tags_required_for_write": ["pdctx-managed"],
      "secret_scan": true
    },
    "work-vault": {
      "default_write_mode": "deny",
      "secret_scan": true
    }
  }
}
```

`tags_required_for_write` echoes gstack's pre-sync filter: a brain page can be written only if its frontmatter has at least one of the listed tags. Prevents accidental whole-vault sync.

`secret_scan: true` runs the same regex scan gstack does (AWS keys, GitHub tokens, PEM, JWTs, bearers) before any write.

## Resolution order

1. Context's `[gbrain]` block (most specific)
2. System policy `~/.pdctx/source-policy.json` defaults
3. Hardcoded fallback: `default_write_mode = "deny"`, `allow = []` — fail closed

## Adapter implementation

Add `src/adapters/gbrain.ts` mirroring `qmd.ts`:

```ts
export class GbrainAdapter implements KnowledgeAdapter {
  query(q: string, ctx: ContextDef): Promise<Result[]> {
    const allow = ctx.gbrain?.allow ?? [];
    if (allow.length === 0) {
      throw new FirewallError(`context ${ctx.name} has no allowed gbrain sources`);
    }
    // gbrain CLI accepts --include-slug-prefixes; map source_id → prefix
    return spawn('gbrain', [
      'search', q,
      ...allow.flatMap(s => ['--include-slug-prefixes', `${s}/`])
    ]);
  }

  put(slug: string, content: string, ctx: ContextDef): Promise<void> {
    if (ctx.gbrain?.write_mode !== 'read-write') {
      throw new FirewallError(`context ${ctx.name} is ${ctx.gbrain?.write_mode}, cannot write`);
    }
    // Run secret scan before spawn
    if (containsSecret(content)) {
      throw new FirewallError(`secret-shaped content detected, write blocked`);
    }
    return spawn('gbrain', ['put', slug], { stdin: content });
  }
}
```

## Migration from qmd

Three-phase, no flag day:

| Phase | qmd | gbrain | pdctx |
|---|---|---|---|
| 1 (today) | live, indexed | live, single-source `panda-vault` | reads `[knowledge]`, qmd adapter |
| 2 (2-3 weeks dogfood) | quiet retire — no new updates | primary | reads `[gbrain]` if present, falls back to `[knowledge]`; gbq wraps `gbrain search` with allow filter |
| 3 (post-dogfood) | uninstall | only retrieval path | strip qmd adapter + `[knowledge]` block |

`personal-writer.toml` migration sketch:

```toml
# Phase 2 — both blocks, [gbrain] takes precedence when adapter is gbrain
[knowledge]
allow  = ["knowledge", "blog", "lennys", "sessions"]
forbid = ["work-vault"]

[gbrain]
allow      = ["panda-vault"]
forbid     = []
write_mode = "read-only"
```

## Open questions

1. **Tag-based vs slug-prefix-based filter**: gbrain `--include-slug-prefixes` filters by slug shape (`tech/foo` etc), not source_id directly. Confirmed by reading `pglite-engine.ts` searchKeyword params. Filter by source_id may need `WHERE p.source_id = ANY(...)` patch — open issue against gbrain or post-process client-side.

2. **Audit trail**: pdctx already writes `~/.pdctx/audit/YYYY-MM.jsonl` for context use. Should every gbrain query that hits the firewall (denied or filtered) emit an audit row? Likely yes — gives Panda a "what got blocked when" log.

3. **Cross-context bleed via skills**: a skill invoked under context A may shell out to `gbrain` directly, bypassing pdctx's adapter. Either wrap `gbrain` in PATH with a checking shim, or rely on PreToolUse hook (Layer 5 model) to intercept. Layer 5 hook is the simpler mechanism — extend the existing MCP-allowlist hook to also gate Bash commands matching `^gbrain` and rewrite/reject per active context.

## Status

Draft only. Implementation gated on: Phase 2 dogfood signal that gbrain holds for daily use (TBD).
