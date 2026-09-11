# Native Claude Code marketplace install

superskill content reaches Claude Code two ways: through the superskill CLI (cross-host, uniform),
or through Claude Code's own native plugin marketplace. This page records the native route, how it
differs from the CLI route, and what each is responsible for.

## The architectural invariant

> **Marketplaces discover the installer; the CLI places files; host registration and per-bot
> enablement remain host responsibilities.**

- The superskill CLI is a cross-host conversion and placement engine: it takes a Claude-format
  plugin and places skills, commands, subagents, magents, hooks, and MCP config into each target
  agent's filesystem.
- Marketplace registration and installation via a host's own mechanism (`claude plugin marketplace
  add`, `claude plugin install`) are executed by the host runtime, not by superskill.
- Filesystem placement is not the same as slash-menu visibility. After placement, host-side
  registration and per-bot enablement belong to the host.

## The native route on Claude Code

```bash
# 1. Register the marketplace (remote repo shorthand or a local checkout)
claude plugin marketplace add gobing-ai/superskill
claude plugin marketplace list

# 2. Install the plugin from that marketplace
claude plugin install cc@superskill --scope user    # or --scope project

# 3. Verify
claude plugin list
claude plugin details cc@superskill

# 4. Refresh later
claude plugin marketplace update superskill
claude plugin update cc@superskill
```

Inside a session, the installed commands, subagents, and skills are invocable immediately — for
example the anti-hallucination protocol skill or the expert subagents. Re-running the install
command over an existing installation completes cleanly and idempotently.

## Native route vs superskill CLI route

| | Native host marketplace | superskill CLI |
|---|--------------------------|----------------|
| Command | `claude plugin install cc@superskill` | `superskill install cc --targets claude` |
| Scope | `--scope user` / `--scope project` | global default / `--no-global` |
| Reach | Claude Code only | All supported targets with one command |
| Entity surface | Full native plugin | Adapted per target class (native tree for `claude`, `omp`, `grok`; skill-based elsewhere) |

The two routes agree on plugin content and can coexist; pick the CLI route when one command must
update several agents, and the native route when Claude Code's marketplace UI and lifecycle should
own the plugin.

## Three-tier lifecycle model

| Tier | Stage | Owner |
|------|-------|-------|
| 1 | Content installation — files placed on disk | superskill CLI or host package manager |
| 2 | Host registration — entry in the host's slash-command catalog | target host platform |
| 3 | Per-bot / per-session enablement | operator, via the host's UI |

Tier 2 and 3 are never claimed by superskill. The clearest example is the opt-in Sand-host
(`grok-bot`) target: install writes workflow files and a deterministic registration handoff
manifest, but a human (or a Bot following the handoff) performs registration, and enablement happens
in the host's settings. `superskill doctor --targets grok-bot` inspects that layout read-only.

## Trust and provenance

- Native Claude Code installs verify against the marketplace manifest in the repository
  (`.claude-plugin/marketplace.json`, plugin source `./plugins/cc`).
- CLI installs write a manifest receipt with SHA-256 hashes of installed files, which is what
  `superskill update --check` reads to report stale plugins.
- Sand-host workflows carry an origin marker plus a per-plugin manifest so foreign content is never
  silently overwritten.

## Known limitations

- Native host installers require the host CLI on `PATH` (for example `claude`).
- Placement does not grant chat-UI visibility on hosts that require registration or enablement.
- A filesystem target never implies slash-menu registration; consume the registration handoff where
  one is provided.

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: _root.txt, install.txt,
update.txt, doctor.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
