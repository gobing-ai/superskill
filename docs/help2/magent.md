# superskill magent

Manage **magent** (main-agent) configuration files — the top-level config files (`CLAUDE.md`,
`AGENTS.md`, `GEMINI.md` and friends) that customize a coding agent's persona, routing rules, and
platform behavior. A magent has `name` and `description` frontmatter and a body of routing, safety,
and tone directives. The `magent` command exposes the five-operation quality lifecycle: `scaffold`,
`validate`, `evaluate`, `refine`, `evolve`.

Scaffolded and refined magents are harness-aware: when the spur and superskill tool surfaces are
present, templates treat them as the preferred harness, and the canonical template ships a
"Harness & Infrastructure" section.

## Synopsis

```
superskill magent <operation> <name|nameOrPath> [options]
```

## `scaffold` — create from template

```bash
superskill magent scaffold claude-config --description "Claude Code main-agent: routing, safety, persona"
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
superskill magent validate claude-config --target claude --strict
```

Flags: `--json`, `-t, --target <agent>` (default `claude`), `--strict`. Required frontmatter:
`name`, `description`.

## `evaluate` — score quality dimensions

```bash
superskill magent evaluate claude-config --save
```

Flags: `--json`, `-t, --target`, `--save`, `--rubric <file>` (envelope-out with `--json`),
`--ingest <file>` (ingest-in with `--save`).

Magent-specific dimensions: `completeness` (0.25), `platform-coverage` (0.25), `tone-consistency`
(0.20), `conciseness` (0.15), `safety` (0.15). Platform coverage and completeness carry the highest
weights on purpose — a main-agent config must cover every platform it claims.

## `refine` — auto-fix and suggest

```bash
superskill magent refine claude-config            # interactive review
superskill magent refine claude-config --auto     # apply low-risk fixes
superskill magent refine claude-config --dry-run  # preview classified fixes, write nothing
```

Flags: `--auto`, `-t, --target <agent>`, `--save`, `--dry-run`. Findings classify as `auto-apply`,
`suggest`, or `flag`, with schema-aware defaults for missing required fields.

## `evolve` — longitudinal improvement

```bash
superskill magent evolve claude-config --propose-only --json > envelope.json
# (an agent authors a proposal from the envelope)
superskill magent evolve claude-config --ingest proposal.json

superskill magent evolve claude-config --analyze   # trends only
```

Flags: `-t, --target <agent>`, `--from <date>`, `--propose-only`, `--accept <id>`, `--reject <id>`,
`--json`, `--ingest <file>`, `--margin <n>`, `--eval-gate`, `--analyze`, `--history`,
`--rollback <id>` (requires `--confirm`). Ingestion passes the four-gate double loop — see
[quality system](./quality-system.md#evolve-the-double-loop-gate).

## Installing a magent

Authoring and installing are separate steps. `superskill install` emits main-agent packages: when a
plugin or marketplace stages exactly one plugin-owned magent it is auto-selected; otherwise pass
`--magent <name>` explicitly. The full selection table and per-target output formats are in
[install](./install.md#main-agent-configs-magents).

```bash
superskill install cc --magent team-stark-children --no-global --targets claude,codex
```

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: magent.txt,
verbs/magent_*.txt, install.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal
only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
