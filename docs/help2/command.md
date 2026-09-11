# superskill command

Manage **slash command** definitions — markdown files with `name` and `description` frontmatter
that define user-invoked `/command` shortcuts for a coding agent. A command file typically carries
argument hints, allowed-tools declarations, and an instruction body. The `command` command exposes
the five-operation quality lifecycle: `scaffold`, `validate`, `evaluate`, `refine`, `evolve`.

## Synopsis

```
superskill command <operation> <name|nameOrPath> [options]
```

## `scaffold` — create from template

```bash
superskill command scaffold deploy --description "Deploy the current project to production"
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --description <text>` | Content description | — |
| `-t, --target <agent>` | Target agent platform | `claude` |
| `-o, --output <dir>` | Output directory | CWD |
| `--template <tier>` | Template tier (e.g. minimal / standard / specialist) | — |
| `--tools <list>` | Comma-separated tool names to pre-populate frontmatter | — |
| `--force` | Overwrite an existing file | off |

## `validate` — schema and format compliance

```bash
superskill command validate deploy --strict
```

Flags: `--json` (machine-readable output), `-t, --target <agent>` (format-compliance target,
default `claude`), `--strict` (enable all optional checks). Required frontmatter: `name`,
`description`.

## `evaluate` — score quality dimensions

```bash
superskill command evaluate deploy --save
```

| Option | Description |
|--------|-------------|
| `--base-path <dir>` | Directory relative markdown links resolve against (default: the file's own directory) |
| `--json` | Machine-readable JSON output |
| `-t, --target <agent>` | Target agent formatting rules (default `claude`) |
| `--save` | Persist the report to the quality store |
| `--rubric <file>` | Rubric file — envelope-out mode with `--json` emits a scoring work order |
| `--ingest <file>` | Agent-authored scores JSON — ingest-in mode with `--save` |

Command-specific dimensions: `completeness`, `clarity`, `argument-hints`, `tool-references`,
`slash-syntax`. `--base-path` matters when a command body links to files with paths relative to a
directory other than its own — point it at that directory so link checks resolve.

## `refine` — auto-fix and suggest

```bash
superskill command refine deploy --auto
superskill command refine deploy --dry-run   # preview classified fixes, write nothing
```

Flags: `--auto` (apply low-risk fixes automatically), `-t, --target <agent>`, `--save` (persist the
post-remediation report), `--dry-run` (preview classified fixes and the projected score delta
without writing). Findings are classified as `auto-apply`, `suggest`, or `flag`; without `--auto`,
findings are reviewed interactively.

## `evolve` — longitudinal improvement

```bash
superskill command evolve deploy --propose-only --json > envelope.json
# (an agent authors a proposal from the envelope)
superskill command evolve deploy --ingest proposal.json

superskill command evolve deploy --analyze   # trends only, no proposal
```

Flags mirror the other type commands: `-t, --target <agent>`, `--from <date>`, `--propose-only`,
`--accept <id>`, `--reject <id>`, `--json`, `--ingest <file>`, `--margin <n>`, `--eval-gate`,
`--analyze`, `--history`, `--rollback <id>` (requires `--confirm`). The four-gate double loop that
guards ingestion is described in
[quality system](./quality-system.md#evolve-the-double-loop-gate).

## Example lifecycle

```bash
superskill command scaffold deploy --description "Deploy to production"
superskill command validate deploy --strict
superskill command evaluate deploy --save
superskill command refine deploy --auto
superskill command evolve deploy --analyze
```

On distribution, commands become slash commands on native targets and non-invocable skill entries
elsewhere — see [install](./install.md#supported-targets).

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: command.txt,
verbs/command_*.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
