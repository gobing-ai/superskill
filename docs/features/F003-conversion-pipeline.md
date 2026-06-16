---
feature_id: F003
title: Conversion pipeline + rulesync integration
phase: 1
status: planned
depends_on: [F001]
deliverables:
  - apps/cli/src/pipeline/convert.ts
  - apps/cli/src/pipeline/rewrite-colons.ts
  - apps/cli/src/pipeline/pi-subagent.ts
  - apps/cli/src/rulesync.ts
  - apps/cli/tests/pipeline/
created: 2026-06-16
---

# F003 — Conversion pipeline + rulesync integration

## What

Two concerns: (1) a ConversionPipeline of named stages that transform content per target agent, and (2) a thin wrapper around `rulesync.generate()`.

## Why

The bash scripts in cc-agents/scripts do these transformations by hand with regex. rulesync handles the heavy format conversion (30+ targets × 8 features), but cc-agents-specific transforms (colon→hyphen, Pi subagent format, slash dialect) must still run. The pipeline is the home for those.

## Change

### `pipeline/convert.ts`

- `ConversionPipeline` class or factory
- `registerStage(target: Target, stage: Stage)` — per-target stage registration
- `run(content: string, target: Target): string` — runs registered stages in order
- Pipeline stages are pure: `(content: string) => string`

### `pipeline/rewrite-colons.ts`

- `rewriteColonRefs(content: string): string` — `rd3:foo` → `rd3-foo` in prose text
- Applied to ALL targets
- Regex: `/\b(rd3|wt):([a-z][a-z0-9-]*)/g` → `$1-$2`

### `pipeline/pi-subagent.ts`

- `convertToPiSubagent(content: string): string` — Skills 2.0 YAML → Pi native agent YAML
- Applied only to Pi target subagents
- Frontmatter transformation: `tools:` → CSV, `model: inherit` → removed, `skill:` field remapped
- References `@gobing-ai/ts-ai-runner` for tool name normalization

### Target → AgentName bridge (for slash translation)

- `translateSlashCommand` takes a ts-ai-runner `AgentName`, **not** a superskill `Target`; the sets are disjoint on `antigravity-cli`/`antigravity-ide`/`hermes`/`omp` (ADR-009 amendment, verified against ts-ai-runner@0.3.19)
- Bridge via `TARGET_TO_AGENT_NAME` (F001/`targets.ts`): `omp→pi`; the antigravity/hermes targets fall to the function's `default` branch (`/plugin-command`)
- `@gobing-ai/ts-ai-runner` is **not yet a dependency** — add `"@gobing-ai/ts-ai-runner": "^0.3.19"` to `apps/cli/package.json` (published version, not `workspace:*`)

### `rulesync.ts`

- `runRulesync(targets: Target[], features: Feature[], inputRoot: string, options: { global, dryRun, verbose }): Promise<GenerateResult>`
- Maps superskill `Target` → rulesync `ToolTarget` via `TARGET_TO_RULESYNC`
- Calls `generate()` from `rulesync` npm package — **not** the CLI, **not** a shell command:
  ```typescript
  import { generate } from 'rulesync';
  import os from 'node:os';

  await generate({
    targets: mappedTargets,        // ToolTarget[]
    features: requestedFeatures,   // Feature[]
    inputRoot: '.rulesync',        // canonical source dir
    outputRoots: [global ? os.homedir() : process.cwd()],  // REQUIRED — ADR-010
    global,                        // swaps relative subdir per target
    delete: false,
    dryRun,
    verbose,
  });
  ```
- **`outputRoots` is mandatory (ADR-010).** rulesync writes to `<outputRoot>/<relativeDirPath>` and never resolves `~`; its `global` flag only swaps the relative subdir. Omitting `outputRoots` writes to `process.cwd()`, so a global install would land in the wrong place. Verified against rulesync@8.28.1 (`Config.getOutputRoots()` defaults to cwd; no `os.homedir()` in src).
- For every rulesync-supported target, `generate()` does the write — no copy step. Only `hermes` and `omp` (absent from rulesync's `ToolTarget`) are copied by superskill afterward.
- Handles targets not in rulesync (hermes, omp, claude — skip in `generate()`, handled separately)

## Acceptance

```
# Pipeline stages are pure
import { rewriteColonRefs } from './pipeline/rewrite-colons';
rewriteColonRefs('use rd3:dev-run to start')
// → 'use rd3-dev-run to start'

# rulesync programmatic API
import { runRulesync } from './rulesync';
await runRulesync(['codex', 'pi'], ['skills', 'commands', 'subagents'], '.rulesync', { global: true, dryRun: false, verbose: false });
// → generate() called with targets: ['codexcli', 'pi'], outputRoots: [os.homedir()]
// → exit 0
```
