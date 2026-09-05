# Plugin rules (`cc`)

Instruction modules distributed with the **cc** plugin, independently of the selected persona.
The installer writes these modules only for targets with a configured rules destination.
Confirm native loading for the installed host/version; file emission alone does not prove it.

| File | Intent |
| --- | --- |
| `01-discipline.md` | Think / simple / surgical / fail-loud |
| `02-harness-first.md` | Prefer `spur` + `superskill`; CLI-gated corpus |
| `03-safety.md` | CRITICAL safety boundaries |
| `04-verification.md` | Required gates and honest verification evidence |

## Install destinations

Paths below are relative to the installer-selected magent root.

| Target | Directory |
| --- | --- |
| claude | `.claude/rules/` |
| antigravity-cli / -ide | `.agents/rules/` |
| codex, pi, opencode, hermes, omp, grok | skipped by this installer |

Emitted by `superskill install cc` via `emitPluginRules` (independent of `--magent`).

Current global Claude emission joins `~/.claude` with `.claude/rules/`, producing
`~/.claude/.claude/rules/`. This differs from the native `~/.claude/rules/` discovery path;
global rule loading needs an installer correction and host smoke test. The path table describes
current emission, not verified host discovery. Preview destinations with `--dry-run --verbose`.

The [team-stark-children package](../../../magents/team-stark-children/README.md) keeps its
essential contract inline for targets that receive no modules. Update overlapping policy
consistently; do not move a critical boundary exclusively into this directory. Host permission
settings and hooks enforce actions; these markdown instructions guide behavior.
