---
feature_id: F001
title: Target taxonomy + config schema
phase: 1
status: planned
depends_on: []
deliverables:
  - apps/cli/src/targets.ts
  - apps/cli/src/config.ts
  - apps/cli/tests/targets.test.ts
  - apps/cli/tests/config.test.ts
created: 2026-06-16
---

# F001 — Target taxonomy + config schema

## What

Define the canonical `Target` enum (8 agents), the `TARGET_TO_RULESYNC` mapping, per-target path resolution, and the `superskill.jsonc` config schema with zod.

## Why

Every other module depends on knowing what agents exist, how they map to rulesync targets, and where their skill/subagent/config directories live. The config schema is the user-facing contract.

## Change

### `targets.ts`

- Export `TARGETS` const array (8 agents: claude, codex, pi, omp, opencode, antigravity-cli, antigravity-ide, hermes)
- Export `Target` type from `typeof TARGETS[number]`
- Export `TARGET_TO_RULESYNC: Partial<Record<Target, string>>` — maps superskill targets to rulesync `ToolTarget` strings
- Export `TARGET_TO_AGENT_NAME: Record<Target, AgentName>` — bridges to ts-ai-runner's `AgentName` for `translateSlashCommand` (the two sets are disjoint on the four new targets; ADR-009 amendment). `omp→pi`; antigravity/hermes → any non-claude/codex/pi name (default `/plugin-command` dialect).
- `getSkillPath` is **not** a superskill responsibility for rulesync-supported targets (ADR-010 — rulesync resolves paths from `outputRoots`). Only `hermes`/`omp` need a superskill-owned path helper.

### `config.ts`

- Zod schema: `{ version: 1, plugins: [{ name, path }], targets: Target[], features: string[] }`
- Export `loadConfig(): SuperskillConfig` — reads and validates `superskill.jsonc`
- Handle missing config file gracefully (fallback to defaults)

### Tests

- `targets.test.ts`: `TARGETS` has 8 entries, `TARGET_TO_RULESYNC` covers all non-Claude targets, `getSkillPath` returns correct paths for each target
- `config.test.ts`: valid config parses, invalid config throws, missing config uses defaults

## Acceptance

```
# Targets
import { TARGETS, TARGET_TO_RULESYNC, TARGET_TO_AGENT_NAME } from './targets';
// TARGETS.length === 8
// TARGET_TO_RULESYNC.codex === 'codexcli'
// TARGET_TO_RULESYNC['antigravity-cli'] === 'antigravity-cli'
// TARGET_TO_AGENT_NAME.omp === 'pi'           // omp speaks Pi's slash dialect
// TARGET_TO_AGENT_NAME.codex === 'codex'
// (paths for rulesync-supported targets are NOT in targets.ts — rulesync owns them, ADR-010)

# Config
import { loadConfig } from './config';
// loadConfig('./superskill.jsonc') returns validated config
// loadConfig() with no file returns sensible defaults
```
