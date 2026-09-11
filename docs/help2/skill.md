# superskill skill

Manage **skill** definitions — markdown files with `name` and `description` frontmatter and a body
that teaches an agent a technique. Skills are the primary reusable knowledge unit superskill
distributes, and the `skill` command has the widest surface of the five type commands: the standard
quality lifecycle plus installation management (`add`, `list`, `remove`, `update`) and distribution
helpers (`package`, `migrate`).

## Synopsis

```
superskill skill <operation> [args] [options]
```

## Operations at a glance

| Operation | Purpose |
|-----------|---------|
| `add` | Install skills from a local directory or GitHub repository |
| `list` | List installed skills |
| `remove` / `rm` | Remove installed skills across all targets and lock files |
| `update` | Update installed skills from their source repositories |
| `scaffold` | Create a new skill from template |
| `validate` | Validate a skill file |
| `evaluate` | Score skill quality |
| `refine` | Evaluate and auto-fix |
| `evolve` | Longitudinal improvement from evaluation history |
| `package` | Bundle a skill for distribution |
| `migrate` | Merge/migrate skills into a destination |

## Manage installed skills

```bash
# Install from a local directory or GitHub repo, previewing first
superskill skill add ./my-skills --list
superskill skill add ./my-skills --skill deploy-worker --global
superskill skill add owner/repo --agent codex,pi

# Inspect
superskill skill list --json

# Refresh from source, or remove entirely (rm is an alias)
superskill skill update deploy-worker
superskill skill remove old-skill
```

`add` options: `--skill <name...>` picks specific skills, `--agent <targets...>` picks target
agents, `--global` installs user-level instead of project-level, `--copy` forces copy mode instead
of relative symlinking, `--list` lists discovered skills without installing, `--dry-run` previews,
`--json` emits a structured envelope, and `-y, --yes` auto-confirms (it defaults to on).
`list`, `remove`, and `update` share `--global` and `--json`; `remove` and `update` also accept
`--yes`.

## The quality lifecycle

### `scaffold` — create from template

```bash
superskill skill scaffold deploy-worker --description "Deploy a Cloudflare Worker via wrangler"
```

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --description <text>` | Content description | — |
| `-t, --target <agent>` | Target agent platform | `claude` |
| `-o, --output <dir>` | Output directory | CWD |
| `--template <tier>` | Template tier (e.g. minimal / standard / specialist) | — |
| `--tools <list>` | Comma-separated tool names to pre-populate frontmatter | — |
| `--invocation-mode <mode>` | `user` (user-invoked only) or `model` (trigger-rich description) | `model` |
| `--force` | Overwrite an existing file | off |

### `validate`, `evaluate`, `refine`, `evolve`

These four follow the shared type-command lifecycle — see
[quality system](./quality-system.md) for the model. Surfaces:

- `validate <nameOrPath>` — flags `--json`, `-t, --target <agent>`, `--strict` (enable all optional
  checks). Checks required fields, field types, and target format compliance.
- `evaluate <nameOrPath>` — flags `--history` (show prior evaluation rows), `--json`,
  `-t, --target`, `--save`, `--rubric <file>`, `--ingest <file>`.
- `refine <nameOrPath>` — flags `--auto` (apply low-risk fixes), `-t, --target`, `--save`,
  `--dry-run` (preview classified fixes and the projected delta without writing).
- `evolve <name>` — flags `-t, --target`, `--from <date>`, `--propose-only`, `--accept <id>`,
  `--reject <id>`, `--json`, `--ingest <file>`, `--margin <n>`, `--eval-gate`, `--analyze`,
  `--history`, `--rollback <id>` (requires `--confirm`).

Skill quality is scored across five dimensions — completeness (0.25), clarity (0.25),
trigger-accuracy (0.20), anti-hallucination (0.15), conciseness (0.15). Required frontmatter:
`name`, `description`.

```bash
superskill skill validate deploy-worker --strict
superskill skill evaluate deploy-worker --save
superskill skill refine deploy-worker --auto --save
superskill skill evolve deploy-worker --propose-only --json > proposal-brief.json
```

## `package` — bundle a skill for distribution

```bash
superskill skill package deploy-worker --output ./dist --include-companions
```

Bundles `SKILL.md` plus `references/` into `<output>/<skill-name>/`. Options: `-o, --output <dir>`
(default CWD) and `--include-companions` (also copy companion configs such as the OpenClaw metadata
file and `agents/` directories).

## `migrate` — merge skills into a destination

The last positional argument is the destination skill name; sources are parsed, deduplicated, and
merged — frontmatter fields merge with arrays unioned, bodies concatenate with duplicate lines
collapsed:

```bash
superskill skill migrate ./old-a.md ./old-b.md ./old-c.md merged-skill

# Refine the merge through the generation seam
superskill skill migrate ./old-a.md ./old-b.md merged --refine --json > proposal.json
# (an agent authors the rewrite)
superskill skill migrate ./old-a.md ./old-b.md merged --ingest agent-proposal.json
```

Options: `--refine` routes the merged content through the evolve generation seam, `--ingest <file>`
applies an authored proposal through the double-loop gate, `-t, --target <agent>` sets the target
platform, and `--margin <n>` sets the Δ-margin gate threshold.

## Where installed skills live

`skill add` places content in project- or user-level skill directories per target agent; the
per-target table is in [install](./install.md#supported-targets). To distribute a plugin's skills
together with its commands, agents, and hooks, use [install](./install.md) instead.

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: skill.txt,
verbs/skill_*.txt, install.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal
only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
