# Bundled plugins

superskill ships with a Claude Code plugin — marketplace name `cc` — that serves two purposes: it is
a working example of a complete plugin, and it installs a practical quality toolkit (expert skills,
subagents, and an anti-hallucination guard) into your agents.

## Zero-clone install

The published npm package bundles the plugin, the marketplace manifest, and the main-agent configs
at its package root, and the CLI self-locates them. A registry install works from any directory —
no clone, no checkout, no `--marketplace` flag:

```bash
npm i -g @gobing-ai/superskill
superskill install cc
superskill install cc --magent team-stark-children
```

Installing from a source checkout is the same command plus a locator:

```bash
superskill install cc --marketplace /path/to/superskill
```

Marketplace locators accept a local path, a GitHub URL, or `owner/repo` shorthand — see
[install](./install.md#marketplace-locators).

## What the bundled plugin contains

| Entity | What ships | Purpose |
|--------|------------|---------|
| Commands | Slash-command wrappers for the type-command lifecycle | Thin entry points that delegate to skills |
| Subagents | Five expert personas (agent, command, hook, magent, skill) | Specialist delegation targets |
| Skills | Authoring guides per type plus an anti-hallucination protocol | Domain knowledge that drives the CLI |
| Hooks | One `Stop` hook | Anti-hallucination guard at session stop |
| Rules | Harness-first and safety rule modules | Copied to target rules directories on install |
| Scripts | Deterministic enforcement scripts | Staged to targets, invoked via portable paths |

The plugin follows a three-tier delegation pattern:

```
commands / subagents  →  skills  →  superskill CLI
(thin wrappers)         (knowledge)  (deterministic work)
```

Wrappers receive input and delegate; skills hold the knowledge and decide when to call the CLI; the
CLI does the deterministic work — scaffold, validate, evaluate, refine, evolve.

## Main-agent configs (magents)

The package root also carries main-agent configuration packages under `magents/`. Unlike the
marketplace-root authoring copies, these ship with the package, so the persona is installable
zero-clone:

```bash
superskill install cc --magent team-stark-children --no-global --targets claude,codex
```

Selection rules — when a plugin ships zero, one, or several magents — are documented in
[install](./install.md#main-agent-configs-magents). Authoring your own magent is the
[magent](./magent.md) command's job.

## Non-Claude targets get skills, not wrappers

Targets without native slash-command or subagent support receive the plugin content adapted into
skill directories: commands become non-invocable skill entries and subagents become
model-invocable skill entries, so every agent ends up with a uniform skill-based distribution.
Native plugin targets (`claude`, `omp`, `grok`) instead receive the full plugin tree through their
own host installers. The per-target matrix is in [install](./install.md#supported-targets).

## Using the shipped toolkit

After `superskill install cc --targets claude`, a Claude Code session can invoke the expert
subagents and slash commands directly. The anti-hallucination hook routes through the portable
`superskill hook run` dispatcher, so the same guard works on any target that supports hooks — see
[hook](./hook.md#run--the-runtime-dispatcher) and
[plugin script organization](./script-organization.md).

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: install.txt, hook.txt,
verbs/hook_run.txt, script.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
