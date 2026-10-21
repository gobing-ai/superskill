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
| `05-hook-feedback.md` | Answer tagged guard feedback tersely; never user authority |

## Install destinations

Paths below are relative to the installer-selected magent root.

| Target | Project | Global |
| --- | --- | --- |
| claude | `.claude/rules/` | `~/.claude/rules/` |
| antigravity-cli | `.agents/rules/` | `~/.gemini/antigravity-cli/rules/` |
| antigravity-ide | `.agents/rules/` | `~/.gemini/config/rules/` |
| codex, pi, opencode, hermes, omp, grok | skipped by this installer | skipped by this installer |

Emitted by `superskill install cc` via `emitPluginRules` (independent of `--magent`).

Global destinations are the native modular-rules directories
([Claude user rules](https://code.claude.com/docs/en/claude-md),
[Antigravity rules](https://antigravity.google/docs/rules/)). A reinstall removes a
byte-identical copy left at the old doubled path (`~/.claude/.claude/rules/`,
`~/.gemini/*/.agents/rules/`) and leaves any other file there with a note.
Antigravity modular rules may still need `trigger` frontmatter before the host loads them;
these files are copied as shipped. Preview destinations with `--dry-run --verbose`.

The [team-stark-children package](../magents/team-stark-children/README.md) keeps its
essential contract inline for targets that receive no modules. Update overlapping policy
consistently; do not move a critical boundary exclusively into this directory. Host permission
settings and hooks enforce actions; these markdown instructions guide behavior.
