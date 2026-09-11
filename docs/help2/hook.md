# superskill hook

Manage **hook** definitions — JSON configs that register commands to fire on agent lifecycle events
(such as `PreToolUse`, `PostToolUse`, and `Stop`), so agent actions can be validated, blocked, or
augmented automatically.

Hooks are authored by hand as entries in `hooks.json` (event → matcher → command → timeout); there
is deliberately no `scaffold` operation. The command exposes `validate`, `evaluate`, `refine`,
`evolve`, plus two hook-only operations: `emit` (install hooks to a single target) and `run` (the
runtime dispatcher installed hook configs invoke).

## Synopsis

```
superskill hook <operation> [args] [options]
```

## `validate` — schema and format compliance

```bash
superskill hook validate block-force-push --strict --json
```

Flags: `--json`, `-t, --target <agent>` (default `claude`), `--strict`.

## `evaluate` — score quality dimensions

```bash
superskill hook evaluate block-force-push --save
```

Flags: `--json`, `-t, --target`, `--save`, `--rubric <file>` (envelope-out with `--json`),
`--ingest <file>` (ingest-in with `--save`).

Hook-specific dimensions: `correctness` (0.25), `event-coverage` (0.20), `safety` (0.35),
`pattern-match-quality` (0.20) — safety carries the highest weight on purpose.

## `refine` — suggest-only, by design

```bash
superskill hook refine block-force-push
superskill hook refine block-force-push --dry-run
```

Unlike the other types, `refine` never auto-applies or mutates the file — it surfaces findings as
recommendations. Flags: `-t, --target <agent>` and `--dry-run` (preview classified findings and
recommendations without writing). There is no `--auto`: hooks are security-critical config, and
automated mutation is too risky.

## `evolve` — analyze-only, by design

```bash
superskill hook evolve block-force-push --from 2026-01-01 --analyze --json
```

Trends and summaries only — no proposal application, no `--history`, no rollback. Flags:
`-t, --target <agent>`, `--from <date>` (analyze evaluations since an ISO 8601 date), `--analyze`
(print the analysis summary — trends, score, data sources — analyze-only), `--json`.

## `emit` — install hooks to a single target

```bash
superskill hook emit my-plugin --target pi
superskill hook emit my-plugin --target hermes --dry-run
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --target <agent>` | Target agent platform | `claude` |
| `--global` | Install to the user-level global directory | on (default) |
| `--dry-run` | Preview without writing files | off |

`emit` resolves a plugin to its canonical hooks config and dispatches hooks to one target — a thin
wrapper over the install hook path, useful when only one agent's hooks should change without a full
install. Each target gets its native hook format (for example, surrogate targets receive converted
Pi-style or verbatim copies).

## `run` — the runtime dispatcher

```bash
superskill hook run <plugin> <hook-id>
```

Installed hook configs invoke this stable `PATH` command instead of a plugin-checkout script path
or a host-specific plugin-root variable:

```json
{ "type": "command", "command": "superskill hook run cc anti-hallucination", "timeout": 10 }
```

The dispatcher resolves a runner from its registry by `<plugin>/<hook-id>`, hands it stdin plus the
process environment, writes the runner's canonical hook JSON to stdout, and exits with the runner's
code. `--profile <block|deny>` selects the prevent-stop output profile (`block` for Claude-family
hosts, `deny` for others). Agents that cannot parse the output shape fail open (treat as allow) —
the intended cross-agent default. An unknown `<plugin>/<hook-id>` exits `2`: a config bug is never
silently allowed.

Registering new runners is a first-party CLI change — external plugins cannot self-register. See
[plugin script organization](./script-organization.md#optional-contract--binary-registry) for the
boundary, and [bundled plugins](./bundled-plugins.md) for the shipped example.

## Hook configs at install time

A full `superskill install` routes hooks through a dedicated pass so each Antigravity flavor
reaches its own native hook generator, surrogate targets get converted hook configs, and
`grok-bot` receives none (its hosts use different mechanisms). See
[install](./install.md#how-it-works).

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: hook.txt,
verbs/hook_*.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
