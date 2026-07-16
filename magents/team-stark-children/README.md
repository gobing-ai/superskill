# team-stark-children

Main-agent package (“Lord Robb”). **Authoring SSOT:** repo-root `magents/` only
(not under `plugins/cc/` — persona is mutable; plugin tree is distribution).

## Layout

| Path | Role |
| --- | --- |
| `IDENTITY.md` | Who the agent is |
| `SOUL.md` | Tone / decision contract |
| `AGENTS.md` | Operations (harness-first) |
| `USER.md` | Operator profile |
| `CLAUDE.md` | Claude Code entry (`@` imports of the four layers) |
| `overrides/codexcli/` | Compact Codex AGENTS layer |
| `overrides/pi/` | Pi AGENTS layer |

**Not in this package:**

- Session memory → spur `sp:indexed-context` / `.spur/context/` (or host agent memory).
- Always-on rules → `plugins/cc/rules/*.md` (installed with the **cc** plugin).

## Install

```bash
superskill install cc --magent team-stark-children --verbose

# Project-local Claude package + plugin rules
superskill install cc --magent team-stark-children --no-global --targets claude
```

| Target | Magent emission | Plugin rules |
| --- | --- | --- |
| claude | Copy `CLAUDE.md` + layers (`@` expand) | `.claude/rules/` |
| codex / pi / … | Concat IDENTITY→SOUL→AGENTS→USER | skipped if no rules dir |
| antigravity-* | Concat | `.agents/rules/` |

## Authoring

Keep `AGENTS.md` lean. Put ecosystem constraints in `plugins/cc/rules/`, not here.
