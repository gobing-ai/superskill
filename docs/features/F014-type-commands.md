---
feature_id: F014
title: Five type command files
phase: 2
status: planned
depends_on: [F007, F008, F009, F010, F011, F012, F013]
deliverables:
  - apps/cli/src/commands/helpers.ts
  - apps/cli/src/commands/agent.ts
  - apps/cli/src/commands/skill.ts
  - apps/cli/src/commands/command.ts
  - apps/cli/src/commands/hook.ts
  - apps/cli/src/commands/magent.ts
  - apps/cli/src/cli.ts
created: 2026-06-16
---

# F014 — Five type command files

## What

Five Commander subcommand files, one per content type. Each registers 5 operations (scaffold, validate, evaluate, refine, evolve) as sub-subcommands with type-specific option names. Plus updating `cli.ts` to register all five. All five share identical structure — just the type name and any type-specific option variations differ.

Command surface (from design doc §2):
```
superskill <type> <operation> [target] [options]
  type:      agent | skill | command | hook | magent
  operation: scaffold | validate | evaluate | refine | evolve
  target:    content name or file path
```

## Why

These are the user-facing CLI surface. Everything built in F007–F013 is called through these thin Commander wrappers. Each command file is a registration function that wires the operations library to CLI arguments and options.

## Change

### Shared option parsing — `apps/cli/src/commands/helpers.ts` (deliverable)

This is a real deliverable, not an inline footnote — every command consumes it, and the exit-code mapping lives here so all five types behave identically:

- `addCommonOptions(cmd: Command): Command` — adds `--target <agent>`, `--json`, `--save`.
- `addScaffoldOptions(cmd: Command): Command` — adds `--description`, `--target`, `--output`, `--force`.
- `addEvolveOptions(cmd: Command): Command` — adds `--from`, `--propose-only`, `--accept`, `--reject`.
- `resolveTarget(opts: { target?: string }): Target` — validates `--target` against `TARGETS`; **returns `'claude'` when omitted** (the single default; ADR-013). Throws on an unknown target.
- `resolvePath(type, name, opts): string` — thin wrapper over `resolveContentPath` from `content/identity.ts` (F007). Does **not** re-implement path resolution.
- `exitFor(result): number` / `runOperation(fn): Promise<void>` — maps operation outcomes to exit codes (validation errors → 1, `FileAccessError`/not-found → 2, success → 0) and routes all output through `process.stdout.write` (never `console.log`). This is where `validate`'s pure `ValidationResult` (F010) becomes an exit code.

### `commands/agent.ts`

```
Export registerAgent(program: Command): void
```
Registers `superskill agent` with 5 subcommands:

- `superskill agent scaffold <name>` — calls `scaffold('agent', name, opts)`. Options: `--description`, `--target`, `--output`.
- `superskill agent validate <name|path>` — calls `validate('agent', name, opts)`. Options: `--target`, `--strict`.
- `superskill agent evaluate <name|path>` — calls `evaluate('agent', name, opts)`. Options: `--target`, `--json`, `--save`.
- `superskill agent refine <name|path>` — calls `refine('agent', name, opts)`. Options: `--target`, `--auto`, `--save`.
- `superskill agent evolve <name>` — calls `evolve('agent', name, opts)`. Options: `--target`, `--from`, `--propose-only`, `--accept`, `--reject`.

### `commands/skill.ts`

Same structure as agent, type = `'skill'`.

### `commands/command.ts`

Same structure as agent, type = `'command'`.

### `commands/hook.ts`

Same structure as agent, type = `'hook'`. Note: hook has 4 quality dimensions (not 5) but the command wrapper is identical.

### `commands/magent.ts`

Same structure as agent, type = `'magent'`.

### `cli.ts` (updated)

After the existing `registerInstall` call, add:

```ts
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

Each register function adds its subcommand group to the `program` Commander instance.

**Error handling per command:**

- File not found (validate/evaluate/refine/evolve) → exit 2.
- Validation failures → exit 1.
- Scaffold target already exists → error with `--force` suggestion.
- Unrecognized type/operation → Commander handles via built-in help.

**Output formatting:**

- `--json` flag → `process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)` (not `console.log`, so test spies capture it).
- Default → human-readable output (tables for evaluate, bullet lists for validate findings, prose for evolve steps), all via `process.stdout.write`.
- `--save` → silent persistence behind normal output; errors surfaced.

## Acceptance

```
# Each command wired
superskill agent --help     # → shows scaffold/validate/evaluate/refine/evolve
superskill skill --help     # → same structure
superskill command --help   # → same structure
superskill hook --help      # → same structure
superskill magent --help    # → same structure

# Full operation on one type
superskill skill scaffold test-skill
superskill skill validate test-skill.md
superskill skill evaluate test-skill.md --json
# → all exit 0, no errors
```
