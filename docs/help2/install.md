# superskill install

Distribute a Claude Code plugin's skills, commands, subagents, magents (main-agent configs), hooks,
and MCP config to any supported target coding agent. Hooks are routed through a separate pass so
each target reaches its native hook format.

## Synopsis

```
superskill install [options] <plugin>
```

## Arguments and options

| Argument / Option | Description | Default |
|-------------------|-------------|---------|
| `<plugin>` | Plugin name to install. Resolved via the marketplace manifest, the installed package root, or a local `plugins/<name>/` directory. | — |
| `--marketplace <locator>` | Marketplace locator — see [marketplace locators](#marketplace-locators). | CWD's `.claude-plugin/`, then the installed package root |
| `--targets <list>` | Comma-separated target agents. | all configured |
| `--no-global` | Install to project-level instead of user-level global directories. | off (global) |
| `--magent <name>` | Select a specific magent (main-agent config) to install. | auto-selects when exactly one exists |
| `--marketplace-source <mode>` | **Deprecated.** Warns and keeps behavior; removal planned. Prefer `--marketplace` with a GitHub URL or `owner/repo`. | — |
| `--dry-run` | Preview without writing files. | off |
| `--verbose` | Print each step and file copy. | off |
| `--prune` | Remove leftover destination skill dirs matching `<plugin>-*` on flattened skills destinations, then re-install. Shared skills roots stay multi-plugin — only this plugin's directories are touched. Native plugin-tree targets manage their own trees. Default installs stay additive. | off |
| `--materialize <mode>` | Sand-host (`grok-bot`) only: `bridge` (default — canonical copy plus thin workflow pointer) or `full` (everything under `workflows/`). | `bridge` |

## Examples

```bash
# Bundled plugin to every configured target (global, user-level)
superskill install cc

# Specific targets only
superskill install cc --targets codex,pi,hermes

# Skills/hooks plus the team-stark-children main-agent config, verbosely
superskill install cc --magent team-stark-children --verbose

# Project-local main-agent files at the workspace root
superskill install cc --magent team-stark-children --no-global --targets claude,codex

# Preview what would be written — no filesystem changes
superskill install cc --targets all --dry-run --verbose

# From a GitHub marketplace (URL or owner/repo shorthand)
superskill install cc --marketplace owner/superskill-repo

# Clean up renamed/deleted skills for this plugin only, then re-install
superskill install cc --targets codex,pi --prune
```

A registry install needs no locator at all — the CLI self-locates its own bundled plugin content
from any directory (see [bundled plugins](./bundled-plugins.md)).

## Marketplace locators

`--marketplace` accepts three forms, resolved local-first:

| Form | Behavior |
|------|----------|
| Local path | An existing path is local. Probes the path as a `marketplace.json` file, then `<path>/marketplace.json`, then `<path>/.claude-plugin/marketplace.json`. |
| GitHub URL | `https://…` (and `git@`) forms are always remote; the content is cached locally, and a warm cache resolves offline. |
| `owner/repo` | GitHub shorthand — but only when the path does not exist locally. An existing directory of that name wins as a local marketplace. |

When the flag is omitted, install probes the working directory's `.claude-plugin/`, then its own
installed package root (which is why the zero-clone install works), then a local
`plugins/<name>/` fallback. A project-local `superskill.jsonc` (JSONC comments and trailing commas
allowed) can provide plugin paths, targets, and feature defaults; explicit flags always win.

Feature filtering (`skills|commands|subagents|hooks|mcp`) is available via the config's `features`
key. Native targets reject partial filters because their host installers install the complete
package.

## Supported targets

| Target | Engine | Output location (global) |
|--------|--------|--------------------------|
| `claude` | host CLI (`claude plugin install`) | Claude Code plugin marketplace |
| `codex` | rulesync | `~/.agents/skills/` |
| `pi` | rulesync + superskill hook shim | `~/.agents/skills/`, agents in `~/.pi/agent/agents/`, hooks via Pi-style config |
| `omp` | host CLI (`omp plugin install`) + hook shim | omp plugin cache; hooks via Pi-style config |
| `grok` | host CLI (`grok plugin install`) | grok installed-plugins directory (full plugin tree) |
| `opencode` | rulesync | `~/.config/opencode/skills/` |
| `antigravity-cli` | rulesync (two-pass) | `~/.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | rulesync (two-pass) | `~/.gemini/config/skills/` |
| `hermes` | rulesync via opencode surrogate | `~/.hermes/skills/`, hooks copied to the Hermes hooks config |
| `openclaw` | implicit — not selectable via `--targets` | reads the shared `~/.agents/skills/` root — no dedicated dispatch |
| `grok-bot` | native workflow writer (opt-in) | Sand data root `workflows/<plugin>-<name>/` |

Notes:

- `grok-bot` is opt-in only — pass `--targets grok-bot` explicitly; it is excluded from
  `--targets all`. Placement writes files plus a registration handoff; host registration and
  per-bot enablement stay host responsibilities (see
  [native marketplace install](./native-marketplace-pilot.md)). Inspect the layout with
  `superskill doctor --targets grok-bot`.
- Antigravity skills and hooks route differently on purpose: skills share one copy in
  `~/.agents/skills/`, while hooks ride a separate pass to each Antigravity target's native hook
  config.
- Non-native targets receive commands and subagents adapted into skill directories, so every agent
  gets a uniform skill-based distribution.

## Main-agent configs (magents)

`install` also emits main-agent configuration packages. Discovery covers plugin-shipped packages
and marketplace-root authoring packages; selection follows one rule table:

| Situation | Behavior |
|-----------|----------|
| No magents staged | Silent no-op — everything else still installs |
| Exactly one plugin-owned package | Auto-selected |
| Only marketplace-root (bare) packages, or several packages without `--magent` | Skipped; `--verbose` lists the staged names. Pass `--magent <name>` to install one |
| `--magent <name>` given | Must match or the install fails loudly |

Emission adapts to the package format: import-style packages are copied modularly for Claude to
expand at session start; other targets receive an assembled single document (or a per-target
variant). Plugin rules, when the plugin ships any, are copied to each target's rules directory
independently of `--magent`.

Authoring a magent is the [magent](./magent.md) command's job; the quality lifecycle it feeds is
described in [quality system](./quality-system.md).

## How it works

Install is a five-stage pipeline: **resolve → map → transform → generate → dispatch**.

1. **Resolve** the plugin root from the marketplace locator (with the local-first probe described
   above) or the fallbacks.
2. **Map** the Claude-format plugin into a canonical layout: skills, commands, and subagents become
   prefixed entries; `hooks.json` and `mcp.json` are deep-merged.
3. **Transform** per target: commands and subagents are adapted into skill entries for flattened
   destinations, slash-command dialects are translated, and companion links are rewritten so they
   resolve from the destination layout. Native targets skip the rewrite and keep the source tree.
4. **Generate** per target class: rulesync drives the flattened destinations; `claude`, `omp`, and
   `grok` install through their own host plugin CLIs.
5. **Dispatch** the stragglers: surrogate targets copy generated output, and hooks reach their
   native format through dedicated emitters. Hook results are always printed — never silently
   dropped.

`--dry-run` propagates through every stage, including the host plugin CLI invocations.

Plugin scripts ride along: staged to the shared agents scripts root for flattened targets, or
delivered in the native tree. See
[plugin script organization](./script-organization.md) for the invocation contract.

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: install.txt, _root.txt,
doctor.txt, update.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
