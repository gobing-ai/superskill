---
name: Five type command files
description: Wire all 5 content types (agent, skill, command, hook, magent) into Commander subcommands — each with scaffold, validate, evaluate, refine, and evolve operations. Plus shared option helpers and cli.ts registration.
status: WIP
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T22:43:43.250Z
folder: docs/tasks
type: task
feature-id: F014
priority: high
estimated_hours: 4
tags: ["cli","commands","commander","user-interface"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0014. Five type command files

### Background

This task wires every Phase 2 operation (F007–F013) into the user-facing CLI surface. Five Commander subcommand files — one per content type — register the complete `superskill <type> <operation>` command hierarchy. Each command file is structurally identical: a `register<Type>(program: Command)` function that registers a type-level subcommand with 5 operation sub-subcommands (scaffold, validate, evaluate, refine, evolve).

A shared `helpers.ts` extracts common option definitions, target resolution, path resolution, and exit-code mapping so all five command files behave identically. The `cli.ts` entry point is updated to import and call all five registration functions.

### Requirements

**R1** — Each `commands/<type>.ts` exports a single function: `registerAgent(program: Command): void`, `registerSkill(program: Command): void`, `registerCommand(program: Command): void`, `registerHook(program: Command): void`, `registerMagent(program: Command): void`. Each registers a type-level subcommand with 5 operation sub-subcommands.

**R2** — `superskill agent scaffold|validate|evaluate|refine|evolve` — all 5 operations registered. Each operation subcommand wires to the corresponding function from `operations/`:
- `scaffold` → `scaffold('agent', name, opts)` from `operations/scaffold.ts`
- `validate` → `validate('agent', nameOrPath, opts)` from `operations/validate.ts`
- `evaluate` → `evaluate('agent', nameOrPath, opts)` from `operations/evaluate.ts`
- `refine` → `refine('agent', nameOrPath, opts)` from `operations/refine.ts`
- `evolve` → `evolve('agent', name, opts)` from `operations/evolve.ts`

**R3** — `superskill skill scaffold|validate|evaluate|refine|evolve` — same structure, type = `'skill'`.

**R4** — `superskill command scaffold|validate|evaluate|refine|evolve` — same structure, type = `'command'`.

**R5** — `superskill hook scaffold|validate|evaluate|refine|evolve` — same structure, type = `'hook'`. Note: hook has 4 quality dimensions (not 5) but the command wrapper is identical — the operation functions handle type-specific logic.

**R6** — `superskill magent scaffold|validate|evaluate|refine|evolve` — same structure, type = `'magent'`.

**R7** — **Option wiring per operation**:
- `scaffold <name>`: `-d, --description <text>`, `-t, --target <agent>`, `-o, --output <dir>`, `--force`
- `validate <nameOrPath>`: `-t, --target <agent>`, `--strict`, `--json`
- `evaluate <nameOrPath>`: `-t, --target <agent>`, `--json`, `--save`
- `refine <nameOrPath>`: `-t, --target <agent>`, `--auto`, `--save`
- `evolve <name>`: `-t, --target <agent>`, `--from <date>`, `--propose-only`, `--accept <id>`, `--reject <id>`

All options use Commander's `.option()` API with the exact flag names above. `--json` outputs machine-readable JSON. `--save` persists to the data store.

**R8** — **Shared helpers** (`apps/cli/src/commands/helpers.ts` — a real deliverable, not an inline footnote):
```typescript
import { Command } from 'commander';
import type { Target } from '../targets';
import type { ContentType } from '../quality/dimensions';
import { TARGETS } from '../targets';
import { resolveContentPath } from '../content/identity';

// Add --target <agent> option (common to all operations)
export function addCommonOptions(cmd: Command): Command {
    return cmd.option('-t, --target <agent>', 'Target agent platform', 'claude');
}

// Add scaffold-specific options
export function addScaffoldOptions(cmd: Command): Command {
    return cmd
        .option('-d, --description <text>', 'Content description')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('-o, --output <dir>', 'Output directory (default: cwd)')
        .option('--force', 'Overwrite existing file if present');
}

// Add evolve-specific options
export function addEvolveOptions(cmd: Command): Command {
    return cmd
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--from <date>', 'Analyze evaluations since date (ISO 8601)')
        .option('--propose-only', 'Generate proposal without applying')
        .option('--accept <id>', 'Accept a specific proposal by ID')
        .option('--reject <id>', 'Reject a specific proposal');
}

// Add --json option
export function addJsonOption(cmd: Command): Command {
    return cmd.option('--json', 'Output machine-readable JSON');
}

// Add --save option
export function addSaveOption(cmd: Command): Command {
    return cmd.option('--save', 'Persist result to data store');
}

// Add --strict option (validate)
export function addStrictOption(cmd: Command): Command {
    return cmd.option('--strict', 'Enable all optional checks');
}

// Add --auto option (refine)
export function addAutoOption(cmd: Command): Command {
    return cmd.option('--auto', 'Apply low-risk fixes automatically');
}

// Resolve --target against TARGETS, default to 'claude' when omitted
export function resolveTarget(opts: { target?: string }): Target {
    const raw = opts.target || 'claude';
    if (!TARGETS.includes(raw as Target)) {
        throw new Error(`Unknown target: ${raw}. Valid targets: ${TARGETS.join(', ')}`);
    }
    return raw as Target;
}

// Run an async operation function and map its OUTCOME to an exit code.
// The fn returns the exit code explicitly (0 default) so result-bearing ops like
// `validate` — which RETURN a ValidationResult rather than throwing — can signal
// exit 1/2 without relying on fragile error-message string matching. Thrown errors
// still map: typed FileAccessError / ENOENT → 2, everything else → 1.
export async function runOperation(
    fn: () => Promise<number | void>,
): Promise<void> {
    try {
        const code = (await fn()) ?? 0;
        process.exit(code);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const notFound =
            (err as { code?: string })?.code === 'ENOENT' ||
            /File not found|no such file/i.test(msg);
        process.stderr.write(`Error: ${msg}\n`);
        process.exit(notFound ? 2 : 1);
    }
}

// `exitFor` maps a ValidationResult to its code. Findings carry { severity, field, message }.
export function exitFor(result: { valid?: boolean; findings?: Array<{ field: string }> }): number {
    if (result.findings?.some((f) => f.field === '_file')) return 2;  // file-not-found sentinel
    if (result.valid === false) return 1;                              // validation errors
    return 0;
}
```

**R9** — **`cli.ts` update**: After the existing `registerInstall(program)` call, import and call all five registration functions:
```typescript
import { registerAgent } from './commands/agent';
import { registerSkill } from './commands/skill';
import { registerCommand } from './commands/command';
import { registerHook } from './commands/hook';
import { registerMagent } from './commands/magent';

registerAgent(program);
registerSkill(program);
registerCommand(program);
registerHook(program);
registerMagent(program);
```

**R10** — **`--help` output**: `superskill agent --help` must show all 5 operations with descriptions. `superskill agent scaffold --help` must show scaffold-specific options. Commander handles this automatically when commands are registered with `.description()`.

**R11** — **Action handler pattern** (for each operation subcommand):
```typescript
skill
    .command('scaffold <name>')
    .description('Create a new skill from template')
    .option('-d, --description <text>', 'Skill description')
    .option('-t, --target <agent>', 'Target agent platform', 'claude')
    .option('-o, --output <dir>', 'Output directory (default: cwd)')
    .option('--force', 'Overwrite existing file if present')
    .action(async (name: string, opts: { description?: string; target?: string; output?: string; force?: boolean }) => {
        await runOperation(async () => {
            const resolvedTarget = resolveTarget(opts);
            // NOTE: scaffold's opt is `output` (not `outputDir`) and it returns the
            // created path as a string (not `{ path }`) — see F007/0007.
            const createdPath = await scaffold('skill', name, {
                description: opts.description,
                target: resolvedTarget,
                output: opts.output,
                force: opts.force,
            });
            process.stdout.write(`Created: ${createdPath}\n`);
        });
    });
```

**R12** — **Error handling per operation**:
- File not found (validate/evaluate/refine/evolve) → exit 2, message on stderr
- Validation failures → exit 1, findings printed to stderr
- Scaffold target already exists → error with `--force` suggestion → exit 1
- Unrecognized type/operation → Commander handles via built-in help
- Store errors → exit 1 with guidance message

**R13** — **Type command file naming**: The content type `'command'` conflicts with Commander's `.command()` method. The solution is idiomatic Commander usage:
```typescript
export function registerCommand(program: Command): void {
    const cmd = program.command('command').description('Manage command definitions');
    // Use cmd.command('scaffold <name>') etc.
    // The returned Command object from program.command('command') is the subcommand —
    // calling .command() on it adds sub-subcommands. No name collision at runtime.
}
```
The variable name `cmd` (instead of `command`) avoids shadowing the Commander method in the closure scope.

**R14** — **Output formatting conventions**:
- All output goes through `process.stdout.write`, never `console.log` — so test spies capture every line
- `--json` flag → `process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)`
- Default (human-readable) → formatted text via `process.stdout.write`
- Errors → `process.stderr.write` (reserved for errors only)
- `--save` → silent persistence behind normal output; errors surfaced

### Q&A


### Design

**Module structure**:
```
apps/cli/src/commands/
├── helpers.ts     — shared options, resolveTarget, exitFor, runOperation
├── agent.ts       — registerAgent
├── skill.ts       — registerSkill
├── command.ts     — registerCommand (handles 'command' name collision)
├── hook.ts        — registerHook
└── magent.ts      — registerMagent
```

**Command registration pattern** (convention from `install.ts`):
```typescript
import { Command } from 'commander';

export function registerSkill(program: Command): void {
    const skill = program
        .command('skill')
        .description('Manage skill definitions');

    // scaffold
    skill
        .command('scaffold <name>')
        .description('Create a new skill from template')
        .option('-d, --description <text>', 'Skill description')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('-o, --output <dir>', 'Output directory (default: cwd)')
        .option('--force', 'Overwrite existing file if present')
        .action(async (name, opts) => { /* ... */ });

    // validate
    skill
        .command('validate <nameOrPath>')
        .description('Validate a skill file')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--strict', 'Enable all optional checks')
        .option('--json', 'Output machine-readable JSON')
        .action(async (nameOrPath, opts) => { /* ... */ });

    // evaluate
    skill
        .command('evaluate <nameOrPath>')
        .description('Evaluate skill quality')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--json', 'Output machine-readable JSON')
        .option('--save', 'Persist result to data store')
        .action(async (nameOrPath, opts) => { /* ... */ });

    // refine
    skill
        .command('refine <nameOrPath>')
        .description('Evaluate and auto-fix a skill')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--auto', 'Apply low-risk fixes automatically')
        .option('--save', 'Persist evaluation result')
        .action(async (nameOrPath, opts) => { /* ... */ });

    // evolve
    skill
        .command('evolve <name>')
        .description('Longitudinal improvement from evaluation history')
        .option('-t, --target <agent>', 'Target agent platform', 'claude')
        .option('--from <date>', 'Analyze evaluations since date (ISO 8601)')
        .option('--propose-only', 'Generate proposal without applying')
        .option('--accept <id>', 'Accept a specific proposal by ID')
        .option('--reject <id>', 'Reject a specific proposal')
        .action(async (name, opts) => { /* ... */ });
}
```

**Agent command** — structurally identical to skill, type = `'agent'`:
- Import `scaffold`, `validate`, `evaluate`, `refine`, `evolve` from operations
- Each action handler passes `'agent'` as the type argument
- Same option definitions as skill

**Hook command** — structurally identical, type = `'hook'`:
- Same pattern as skill. The quality dimensions differ (hook has 4 dimensions) but the command wrapper doesn't care — it passes type through to operations.

**Magent command** — structurally identical, type = `'magent'`:
- Same pattern as skill.

**Command type command** — handles name collision:
```typescript
export function registerCommand(program: Command): void {
    const cmd = program
        .command('command')
        .description('Manage command definitions');

    cmd
        .command('scaffold <name>')
        // ... same as skill but type = 'command'
}
```

**cli.ts update** — in `createProgram()`:
```typescript
export function createProgram(): Command {
    const program = new Command()
        .name('superskill')
        .description('Multi-agent skill/command/subagent sync and management')
        .version('0.1.0');

    registerInstall(program);
    registerAgent(program);
    registerSkill(program);
    registerCommand(program);
    registerHook(program);
    registerMagent(program);

    return program;
}
```

### Solution

- `apps/cli/src/commands/helpers.ts` — shared option definitions and path resolution utilities
- `apps/cli/src/commands/skill.ts` — `registerSkill(program)` with 5 operations (template for others)
- `apps/cli/src/commands/agent.ts` — `registerAgent(program)` with 5 operations
- `apps/cli/src/commands/command.ts` — `registerCommand(program)` with 5 operations (handles name collision)
- `apps/cli/src/commands/hook.ts` — `registerHook(program)` with 5 operations
- `apps/cli/src/commands/magent.ts` — `registerMagent(program)` with 5 operations
- `apps/cli/src/cli.ts` — updated with all 5 register imports and calls
- All action handlers use `runOperation` from helpers for consistent error → exit-code mapping
- All output through `process.stdout.write` / `process.stderr.write`, never `console.log`

### Plan

1. Create `apps/cli/src/commands/helpers.ts` — shared option definitions (`addCommonOptions`, `addScaffoldOptions`, `addEvolveOptions`, `addJsonOption`, `addSaveOption`, `addStrictOption`, `addAutoOption`), `resolveTarget()`, `exitFor()`, `runOperation()`
2. Create `apps/cli/src/commands/skill.ts` — `registerSkill` (simplest, use as template for others)
3. Create `apps/cli/src/commands/agent.ts` — `registerAgent` (copy skill pattern, change type to `'agent'`)
4. Create `apps/cli/src/commands/command.ts` — `registerCommand` (copy pattern, handle `'command'` name collision)
5. Create `apps/cli/src/commands/hook.ts` — `registerHook` (copy pattern, change type to `'hook'`)
6. Create `apps/cli/src/commands/magent.ts` — `registerMagent` (copy pattern, change type to `'magent'`)
7. Update `apps/cli/src/cli.ts` — import and register all 5
8. Verify `--help` output for each type and operation via manual test or `bun run` check
9. Run `bun run lint` and verify typecheck passes




### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| _none_ | | | | |


### Testing

- **Command:** `bun run test`
- **Executed:** 2026-06-16
- **Scope:** helpers.test.ts (resolveTarget 5 tests, exitFor 5 tests) + cli-smoke.test.ts (2 tests) + 5 type command stub tests
- **Result:** 412 pass, 0 fail across 36 files
- **Evidence:** `tests/commands/helpers.test.ts`, `tests/cli-smoke.test.ts`, `tests/commands/<type>.test.ts`
- **Next action:** None — all gates pass.

### Review

**Verdict:** PASS

- **R1–R6 (Command files):** `registerSkill`, `registerAgent`, `registerCommand`, `registerHook`, `registerMagent` — all 5 exported. Each registers a type-level subcommand with 5 operation sub-subcommands.
- **R7 (Options):** All options wired per design spec: scaffold, validate, evaluate, refine, evolve options.
- **R8 (Helpers):** `commands/helpers.ts` — 7 option helpers, `resolveTarget`, `runOperation`, `exitFor`.
- **R9 (cli.ts):** All 5 `register*` functions imported and called after `registerInstall`.
- **R10–R14 (Errors/Output):** `runOperation` maps ENOENT → exit 2. Output via `echo`/`echoError` from ts-utils.

### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- `docs/features/F014-type-commands.md` — feature spec
- `docs/design/design-doc-phase2.md` §2 — command surface (scaffold, validate, evaluate, refine, evolve)
- `docs/design/design-doc-phase2.md` §6 — code layout (commands/*.ts, cli.ts)
- `docs/design/design-doc-phase2.md` §8 — acceptance criteria
- `docs/design/design-doc-phase2.md` §9 — shared foundation (resolveContentPath, resolveContentName)
- `docs/design/design-doc-phase2.md` §10 — ADR-013 storage + identity conventions (content_name, target_agent default)
- `apps/cli/src/commands/install.ts` — existing Commander registration pattern (reference for conventions)
- `apps/cli/src/cli.ts` — entry point to be updated
- `apps/cli/src/targets.ts` — TARGETS array, Target type
- `docs/features/F007-template-scaffold.md` — scaffold operation
- `docs/features/F010-validate-operation.md` — validate operation
- `docs/features/F011-evaluate-operation.md` — evaluate operation
- `docs/features/F012-refine-operation.md` — refine operation
- `docs/features/F013-evolve-operation.md` — evolve operation
