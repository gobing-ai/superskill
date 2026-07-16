# Bundled `cc` plugin

superskill ships with a Claude Code plugin at [`plugins/cc/`](../../plugins/cc/) (marketplace name: `cc`) that demonstrates the full authoring lifecycle and provides the meta-agent skills the expert personas reference.

## Entities

| Entity | Count | Purpose |
|--------|-------|---------|
| **commands** | 17 | 4 operations × 4 types + `hook-evaluate` — thin slash-command wrappers that delegate to skills |
| **agents** | 5 | `expert-agent`, `expert-command`, `expert-hook`, `expert-magent`, `expert-skill` — specialist subagents that route to skills |
| **skills** | 6 | `anti-hallucination`, `cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills` |
| **magents** | (repo-root) | Authoring SSOT is `magents/team-stark-children/` (not under the plugin). Install with `superskill install cc --magent team-stark-children` |
| **rules** | 4 | `plugins/cc/rules/*.md` — harness-first / safety / verification modules → `.claude/rules` or `.agents/rules` |
| **hooks** | 1 | `Stop` hook running the anti-hallucination guard |
| **scripts** | 3 | `ah_guard.ts`, `validate_response.ts`, `logger.ts` — deterministic enforcement for the anti-hallucination protocol |

## Three-tier delegation

The plugin follows a three-tier delegation pattern:

```
Commands / Agents → Skills → superskill CLI
```

1. **Commands and agents** are thin wrappers — they receive user input and delegate to skills.
2. **Skills** contain the domain knowledge — they instruct the agent on what to do and when to call the CLI.
3. **`superskill` CLI** does the deterministic work — scaffold, validate, evaluate, refine, evolve.

## Non-Claude target adaptation

For non-Claude targets, `superskill install` adapts commands and subagents as Skills 2.0 skill directories:

- `pipeline/adapt-command.ts` — command `.md` → non-invocable skill entry (`disable-model-invocation: true`)
- `pipeline/adapt-subagent.ts` — subagent `.md` → model-invocable skill entry

This ensures every target receives a uniform skill-based distribution, regardless of whether the target natively supports slash commands or subagents.

## Plugin-level scripts

Executable logic a skill invokes at the user's install site lives in `plugins/<plugin>/scripts/<skill>/` (shared across the plugin's skills, copied on install, deduped).

| Surface | Path | Purpose |
|---------|------|---------|
| Guard engine | `scripts/anti-hallucination/ah_guard.ts` | Pure `verifyAntiHallucinationProtocol(text)` + direct-invocation `main()`; payload resolved by `resolveStopContext` (stdin first — Claude Code `transcript_path` / omp `agent_end`; `$ARGUMENTS` is the legacy/test channel) |
| Validate adapter | `scripts/anti-hallucination/validate_response.ts` | Thin wrapper: `RESPONSE_TEXT`/stdin → verify → exit 0/1 |
| Shared logger | `scripts/anti-hallucination/logger.ts` | Single shared copy (dedup'd from per-skill copies) |
| Stop-hook config | `hooks/hooks.json` | `Stop` command hook → `superskill hook run cc anti-hallucination` (portable PATH command; the dispatcher routes to `ah_guard.ts`) |

Skill folders are prose-only: `skills/anti-hallucination/` holds `SKILL.md`, `references/*.md`, `agents/openai.yaml`, `metadata.openclaw` — no `.ts` runtime.

See [`plugins/cc/README.md`](../../plugins/cc/README.md) for the full entity design and relationship diagram.
