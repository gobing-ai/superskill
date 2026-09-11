# superskill agent

Manage **subagent** definitions — the specialized workers a main agent delegates to. Each subagent
is a markdown file with frontmatter (`name`, `description`, `model`, `tools`) and a system-prompt
body. The `agent` command exposes the five-operation quality lifecycle: `scaffold`, `validate`,
`evaluate`, `refine`, `evolve`.

## Synopsis

```
superskill agent <operation> <name|nameOrPath> [options]
```

## `scaffold` — create from template

```bash
superskill agent scaffold code-reviewer --description "Senior code reviewer for PR quality checks"
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
superskill agent validate code-reviewer --strict --json
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `-t, --target <agent>` | Target agent platform for format-compliance checks (default `claude`) |
| `--strict` | Enable all optional checks |

Checks cover required fields (`name`, `description`, `model`, `tools`), field types, model aliases
(`inherit`, `sonnet`, `opus`, `haiku`), target-specific format compliance, and links to referenced
skills.

## `evaluate` — score quality dimensions

```bash
superskill agent evaluate code-reviewer --save
```

| Option | Description |
|--------|-------------|
| `--json` | Machine-readable JSON output |
| `-t, --target <agent>` | Target agent formatting rules (default `claude`) |
| `--save` | Persist the report to the quality store |
| `--rubric <file>` | Rubric file — envelope-out mode with `--json` emits a scoring work order |
| `--ingest <file>` | Agent-authored scores JSON — ingest-in mode with `--save` |

Agent-specific dimensions: `completeness`, `role-clarity`, `tool-selection`, `skill-linkage`,
`model-fit` — each explained in [quality system](./quality-system.md#quality-dimensions-by-type).

## `refine` — auto-fix and suggest

```bash
superskill agent refine code-reviewer --auto
superskill agent refine code-reviewer --dry-run   # preview classified fixes, write nothing
```

| Option | Description |
|--------|-------------|
| `--auto` | Apply low-risk fixes automatically |
| `-t, --target <agent>` | Target agent formatting rules (default `claude`) |
| `--save` | Persist the post-remediation report |
| `--dry-run` | Preview classified fixes and projected delta without writing |

Findings are classified as `auto-apply` (safe defaults), `suggest` (needs judgment), or `flag`
(manual review). Missing required fields get schema-aware defaults — a `model` field becomes
`inherit`, empty `tools` stay empty, a missing description is humanized from the name — so refine
never inserts placeholder text, and structural fixes run before validation short-circuits. Without
`--auto`, each finding can be accepted, rejected, or skipped interactively.

## `evolve` — longitudinal improvement

```bash
superskill agent evolve code-reviewer --propose-only --json > envelope.json
# (an agent authors a proposal from the envelope)
superskill agent evolve code-reviewer --ingest proposal.json

superskill agent evolve code-reviewer --analyze      # trends only, no proposal
superskill agent evolve code-reviewer --history      # list applied versions
superskill agent evolve code-reviewer --eval-gate    # replay eval cases before accepting
superskill agent evolve code-reviewer --rollback <id> --confirm
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --target <agent>` | Target agent formatting rules | `claude` |
| `--from <date>` | Analyze evaluations since an ISO 8601 date | all history |
| `--propose-only` | Generate a proposal without applying | off |
| `--accept <id>` / `--reject <id>` | Act on a specific draft proposal | — |
| `--json` | Machine-readable JSON (envelope-out with `--propose-only`) | off |
| `--ingest <file>` | Agent-authored proposal JSON (ingest-in mode) | — |
| `--margin <n>` | Δ-margin gate threshold for accept | `0.05` |
| `--eval-gate` | Enable the empirical behavior gate (requires `skills/<name>/eval/cases.yaml`) | off |
| `--analyze` | Print analysis summary (trends, score, data sources) without writing | off |
| `--history` | List applied proposal versions from the store | off |
| `--rollback <id>` | Roll back to a prior version by proposal id | — |
| `--confirm` | Confirm the destructive operation (required with `--rollback`) | off |

Ingested proposals pass the four-gate double loop before the file is rewritten — see
[quality system](./quality-system.md#evolve-the-double-loop-gate).

## Where agents land on install

When a plugin's agents are distributed, native plugin targets receive the original subagent files,
and flattened targets receive each agent adapted into a model-invocable skill entry — see
[install](./install.md#supported-targets).

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: agent.txt,
verbs/agent_*.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
