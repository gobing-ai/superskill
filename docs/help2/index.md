# Superskill Help

superskill is a CLI for distributing and authoring agent-facing content — skills, slash commands,
subagents, hooks, and main-agent configs — across many coding-agent platforms from a single
Claude-format plugin source of truth.

Two layers:

1. **Distribution** — `superskill install` takes a plugin and places its content into every
   supported target agent (Claude Code, Codex, pi, omp, grok, OpenCode, Antigravity, Hermes,
   and the opt-in Sand host; OpenClaw reads the shared skills root implicitly).
2. **Authoring + quality** — five type commands (`agent`, `skill`, `command`, `hook`, `magent`)
   drive a scaffold → validate → evaluate → refine → evolve lifecycle with persistent quality
   history.

## Start here

```bash
npm i -g @gobing-ai/superskill
superskill install cc --dry-run --verbose   # preview the bundled plugin everywhere
superskill install cc                        # distribute for real
```

New to superskill? Follow the [quick start](./quick-start.md). Installing on a new machine? See
[installation](./installation.md).

## Task-first guides

| Guide | What it covers |
|-------|----------------|
| [Quick start](./quick-start.md) | Distribute a plugin and author your first skill in five minutes |
| [Installation](./installation.md) | Package install, source builds, verification, troubleshooting |
| [Quality system](./quality-system.md) | The lifecycle, quality dimensions, rubrics, the evolve double-loop gate |
| [Bundled plugins](./bundled-plugins.md) | The shipped `cc` plugin, zero-clone installs, delegation pattern |
| [Plugin script organization](./script-organization.md) | Where script logic lives, how it ships, how skills invoke it |
| [Native marketplace install](./native-marketplace-pilot.md) | Claude Code's own marketplace route vs the CLI route |
| [Release process](./release.md) | What ships, which gates run, how updates reach you |

## Command reference

| Command | Reference | Covers |
|---------|-----------|--------|
| `superskill install` | [install](./install.md) | Distribute a plugin to target agents |
| `superskill skill` | [skill](./skill.md) | Author and manage skills — add, update, package, migrate, quality lifecycle |
| `superskill command` | [command](./command.md) | Slash command definitions |
| `superskill agent` | [agent](./agent.md) | Subagent definitions |
| `superskill hook` | [hook](./hook.md) | Hook definitions, emit, and the runtime dispatcher |
| `superskill magent` | [magent](./magent.md) | Main-agent configurations |

Three more top-level commands round out the CLI: `update` (re-install stale plugins),
`doctor` (read-only inspection of the opt-in Sand-host layout), and `script`
(`path`, `run`, `convert` — the plugin-script invocation surfaces, documented in
[plugin script organization](./script-organization.md)).

## The shape of the CLI

```
superskill
├── install <plugin>            # distribute a plugin to target agents
├── update [plugin]             # re-install stale marketplace plugins
├── doctor                      # read-only target inspection
├── agent <op> <name>           # subagent definitions
├── skill <op> <name>           # skill definitions (+ add/list/remove/update/package/migrate)
├── command <op> <name>         # slash command definitions
├── hook <op> <name>            # hook definitions (+ emit/run)
├── magent <op> <name>          # main-agent configs
└── script <op>                 # plugin script path/run/convert
```

The five type commands share one quality lifecycle:

```
scaffold → validate → evaluate → refine → evolve
     (create)  (check)    (score)   (fix)    (improve over time)
```

`skill` extends it with content-management operations, and `hook` deliberately narrows it —
`hook refine` suggests instead of applying, and `hook evolve` analyzes instead of applying. The
model behind the lifecycle is the [quality system](./quality-system.md).

## Where content lands

Every target agent stores skills, commands, subagents, and hooks in different places, and install
adapts per target class — native plugin trees for `claude`, `omp`, and `grok`; uniform skill-based
distribution everywhere else. The per-target table with output locations is in
[install](./install.md#supported-targets).

## Every page, verified

Every command, verb, and flag in this help was generated against the live CLI output and checked at
generation time — if a page and `superskill <command> --help` ever disagree, trust the CLI and file
an issue against the docs.

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: _root.txt + all noun and
verb snapshots) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
