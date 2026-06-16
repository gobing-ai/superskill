---
feature_id: F004
title: superskill install command + target dispatch
phase: 1
status: planned
depends_on: [F001, F002, F003, F006]
deliverables:
  - apps/cli/src/commands/install.ts
  - apps/cli/tests/install.test.ts
created: 2026-06-16
---

# F004 — `superskill install` command + target dispatch

## What

The `superskill install <plugin>` Commander subcommand that wires the full pipeline: resolve plugin → map to `.rulesync/` → run conversion pipeline → `rulesync.generate()` → post-process → copy to target directories.

## Why

This is the primary deliverable of Phase 1. It replaces `cc-agents/scripts/setup-all.sh` and its four delegate bash scripts with a single TypeScript command.

## Change

### `commands/install.ts`

Register a Commander subcommand:

```
superskill install <plugin>

Arguments:
  plugin             Plugin name (required) — resolved via marketplace (F006)

Options:
  --marketplace <p>  Path to .claude-plugin/marketplace.json (or its dir);
                     default CWD marketplace, else plugins/<name>/ fallback (ADR-011)
  --targets <list>   Comma-separated targets (default: all in config)
  --global           Install to user-level global dirs (default: true)
  --dry-run          Preview without writing
  --verbose          Print each step and file copy
```

**Implementation flow:**

0. **Register the command** — `cli.ts` registers `install` and removes the scaffold `add` demo command.
1. **Resolve plugin** — `resolvePlugin(marketplacePath, plugin)` (F006/ADR-011): `--marketplace` → CWD `.claude-plugin/marketplace.json` → `plugins/<name>/` fallback; validate `plugin.json` exists. Remote (`github`/`url`/`npm`) sources and `../`-escapes are rejected with distinct exit-1 messages. The "not found" message lists resolvable plugins, not a hardcoded list.
2. **Map to canonical** — call `mapPluginToRulesync()` (F002)
3. **Run pipeline** — for each content file, apply per-target pipeline stages (F003)
4. **Run rulesync** — call `runRulesync()` with mapped targets and features (F003)
5. **rulesync writes supported targets** — `runRulesync` (F003) sets `outputRoots=[~]` for `--global` and `generate()` writes every rulesync-supported target to its resolved path. No superskill copy step for these (ADR-010).
6. **Dispatch the rest** — only the targets rulesync can't write:
   - `claude`: run `claude plugin install <name>@local --path plugins/<name>` (marketplace, not rulesync)
   - `hermes`, `omp`: copy generated output to their trees (rulesync has no `ToolTarget` for them)
7. **Report** — per-target summary of files installed

### Target path resolution (reference — rulesync owns supported targets, ADR-010)

rulesync resolves these from `<outputRoot>/<relativeDirPath>`; superskill does **not** reimplement them. Verified against rulesync@8.28.1.

| Target | Global path (rulesync-resolved, `outputRoot=~`) | Owner |
|--------|--------------------------------------------------|-------|
| `codex` | `~/.agents/skills/` (under `$CODEX_HOME`) | rulesync |
| `pi` | `~/.pi/agent/skills/` (+ Pi native subagent format) | rulesync |
| `omp` | `~/.omp/agent/skills/` | **superskill copy** |
| `opencode` | `~/.agents/skills/` | rulesync |
| `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | rulesync |
| `antigravity-ide` | `~/.gemini/config/skills/` | rulesync |
| `hermes` | `~/.hermes/skills/` | **superskill copy** |

### Error handling

- Plugin not found → exit 1 with message listing available plugins
- `--marketplace` path missing / unparseable manifest → exit 1
- Remote `source` (`github`/`url`/`git-subdir`/`npm`) → exit 1 "remote sources not yet supported" (F006)
- `source` escaping marketplace root (`../`) → exit 1
- `rulesync.generate()` failure → exit 1 with stderr
- Unwritable target directory → fail before touching any target
- `--dry-run` → print what would be written, exit 0

### Tests

- `install.test.ts`: mocks filesystem and rulesync, verifies correct calls for each target, verifies dry-run output, verifies error paths

## Acceptance

```
# Happy path (with --dry-run first)
superskill install rd3 --targets pi,codex --dry-run
# → Lists files that would be installed

superskill install rd3 --targets pi,codex --global
# → Pi skills → ~/.pi/agent/skills/rd3-*/ ; Codex skills → ~/.agents/skills/rd3-*/
# → Pi subagents emitted in Pi native agent format
# → all paths resolved by rulesync given outputRoots=[~] (ADR-010); exit 0

# Idempotency
superskill install rd3 --targets pi,codex   # second run
# → Same output, exit 0

# Error: missing plugin
superskill install nonexistent --targets pi
# → "Plugin 'nonexistent' not found. Available: <resolvable plugins>"
# → exit 1
```
