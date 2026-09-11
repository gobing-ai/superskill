# Quick start

Get a plugin distributed to every coding agent you use, and author your first skill — in about five
minutes.

## 1. Install superskill

```bash
npm i -g @gobing-ai/superskill
# or: bun add -g @gobing-ai/superskill

superskill --version
```

The published package bundles the CLI, the bundled `cc` plugin, default templates, and rubrics — no
source checkout needed. Full details, including building from source, live in
[Installation](./installation.md).

## 2. Distribute a plugin to your agents

If you have a Claude Code plugin (a directory with `plugin.json` and any of `skills/`, `commands/`,
`agents/`, `hooks.json`, `mcp.json`), one command places its content into every supported target
agent:

```bash
# The bundled cc plugin, to every configured target (user-level, global)
superskill install cc

# Only specific targets
superskill install cc --targets codex,pi,hermes

# Preview every write before touching the filesystem
superskill install cc --dry-run --verbose
```

Default installs are additive and global (user-level). Use `--no-global` to write project-level
directories instead. See [install](./install.md) for every flag, the target list, and where each
entity lands per agent.

## 3. Author your first skill

```bash
# Create a skill from the built-in template
superskill skill scaffold deploy-worker --description "Deploy a Cloudflare Worker via wrangler"

# Check structure, frontmatter, and format compliance
superskill skill validate deploy-worker --strict

# Score it across five quality dimensions and persist the score
superskill skill evaluate deploy-worker --save

# Auto-fix low-risk findings
superskill skill refine deploy-worker --auto
```

`--save` appends the report to the quality store (`~/.superskill/evaluations.db`), which is what
later `evolve` runs read. The same scaffold → validate → evaluate → refine → evolve lifecycle exists
for agents, slash commands, hooks, and main-agent configs — see
[quality system](./quality-system.md).

## 4. Keep content up to date

```bash
superskill update --check          # report stale plugins without writing
superskill skill update            # refresh installed skills from their source repos
```

## Where to go next

- [install](./install.md) — distribution: every flag and target
- [skill](./skill.md) — the authoring command, including add, update, package, and migrate
- [Quality system](./quality-system.md) — rubrics, scoring, and the evolve double-loop gate
- [Bundled plugins](./bundled-plugins.md) — what ships with superskill and how to use it
- [Index](./index.md) — the full help map

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: _root.txt, install.txt,
skill.txt, verbs/skill_*.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
