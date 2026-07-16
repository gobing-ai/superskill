# Plugin rules (`cc`)

Always-on instruction modules installed with the **cc** plugin into each target’s
auto-load rules directory (when one exists). **Not** part of a magent persona
package — harness/safety constraints belong here so they apply regardless of
which `--magent` is selected.

| File | Intent |
| --- | --- |
| `01-discipline.md` | Think / simple / surgical / fail-loud |
| `02-harness-first.md` | Prefer `spur` + `superskill`; CLI-gated corpus |
| `03-safety.md` | CRITICAL safety boundaries |
| `04-verification.md` | Done = gates green; no silent skips |

## Install destinations

| Target | Directory |
| --- | --- |
| claude | `.claude/rules/` (global: `~/.claude/rules/`) |
| antigravity-cli / -ide | `.agents/rules/` |
| codex, pi, opencode, hermes, omp, grok | skipped (no modular rules folder) |

Emitted by `superskill install cc` via `emitPluginRules` (independent of `--magent`).
