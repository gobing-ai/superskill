---
feature_id: F004
title: superskill install command + target dispatch
phase: 1
status: planned
depends_on: [F001, F002, F003]
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
  plugin          Plugin name (required)

Options:
  --targets <list>  Comma-separated targets (default: all in config)
  --global          Install to user-level global dirs (default: true)
  --dry-run         Preview without writing
  --verbose         Print each step and file copy
```

**Implementation flow:**

1. **Resolve plugin** — look up `plugin` in config or `plugins/<name>/`; validate `plugin.json` exists
2. **Map to canonical** — call `mapPluginToRulesync()` (F002)
3. **Run pipeline** — for each content file, apply per-target pipeline stages (F003)
4. **Run rulesync** — call `runRulesync()` with mapped targets and features (F003)
5. **Post-process** — Pi subagent conversion for Pi/omp targets
6. **Dispatch to targets** — for each target, copy generated output to resolved path:
   - `claude`: run `claude plugin install <name>@local --path plugins/<name>`
   - All others: copy from `.rulesync/` output to target's global/project path
7. **Report** — per-target summary of files installed

### Target path resolution (from `targets.ts`)

| Target | Global path | Project path |
|--------|------------|--------------|
| `codex` | `~/.agents/skills/` | `.codex/skills/` |
| `pi` | `~/.agents/skills/` (+ `~/.pi/agent/agents/` for subagents) | `.pi/agent/skills/` |
| `omp` | `~/.agents/skills/` | `.omp/agent/skills/` |
| `opencode` | `~/.agents/skills/` | `.opencode/skills/` |
| `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | `.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | `~/.gemini/config/skills/` | `.gemini/config/skills/` |
| `hermes` | `~/.hermes/skills/` | `.hermes/skills/` |

### Error handling

- Plugin not found → exit 1 with message listing available plugins
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

superskill install rd3 --targets pi,codex
# → Skills land in ~/.agents/skills/rd3-*/
# → Subagents land in ~/.pi/agent/agents/ (Pi native format)
# → exit 0

# Idempotency
superskill install rd3 --targets pi,codex   # second run
# → Same output, exit 0

# Error: missing plugin
superskill install nonexistent --targets pi
# → "Plugin 'nonexistent' not found. Available: rd3, wt"
# → exit 1
```
