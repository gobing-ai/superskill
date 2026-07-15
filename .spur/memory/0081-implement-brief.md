# Task 0081 — Implement Context Brief

## Task File
`docs/tasks/0081_optimize-superskill-install-for-main-agent-magent-customizat.md`

Read it FIRST for the full Requirements (R1-R7), Acceptance Criteria (8 scenarios), Design, and Plan.

## Status
- Current: `todo` (transitioned from `backlog`)
- After implement: transition `todo → wip` (guard: always), then `wip → testing` (guard: `spur task check`)
- Write `## Solution` section BEFORE attempting `wip → testing` (guard requires `file:line` citations in Solution)

## What to Build (Summary)

Add first-class `magents/` support to the install pipeline — discovery, per-target variant selection with fallback, shimming, emission, CLI option, tests, docs.

### R1: Discovery in mapper
- In `packages/core/src/mapper.ts`, `mapPluginToRulesync()`: detect top-level `magents/<kebab-name>/` directory in the plugin source.
- Copy the directory tree into `.rulesync/magents/<plugin>-<name>/` (staging area, NOT through the skills path).
- Add `magents: number` to `MapResult` interface (line 13-19).
- Do NOT force magents through the "downgrade to skills" path.

### R2: Selection with fallback
- New pure function `selectMagentVariant(sourceDir: string, target: Target): string | null` (or `selectMagentFile`).
- Candidate priority (most specific first):
  - `<base>.<target>.md` (e.g. `AGENTS.claude.md`)
  - `<base>.<target-family>.md`
  - `<base>.md` (e.g. `AGENTS.md`)
  - For claude: also try `CLAUDE.md`, `CLAUDE.claude.md`
- Targets: use `TARGETS` from `packages/core/src/targets.ts` (claude, codex, pi, omp, opencode, antigravity-cli, antigravity-ide, hermes, grok).
- If no match, return null (log in verbose mode).
- Single centralized function — all targets treated uniformly.

### R3: Shimming
- After selection: read raw, run `rewriteSkillReferences(content, pluginName)`, apply target-specific adaptations.
- Reuse `rewriteSkillReferences` from `packages/core/src/pipeline/rewrite-references.ts`.
- New thin `adaptMagentForTarget(content, plugin, target)` or inline in install flow.
- Decide output filename per target (most emit `AGENTS.md`; claude may emit `CLAUDE.md`).
- Support multi-file magents (whole selected tree adapted).

### R4: Install integration
- In `apps/cli/src/commands/install.ts`, `executeInstall()`: after mapping (step 2, ~line 139), for each target, select + shim + emit magent(s).
- Write to destination: project root (cwd) for project-level, or target's installed plugin area for global.
- Special-case targets using existing patterns (see claude/hermes/omp/grok/pi blocks at lines 286-400).
- Make selection + output visible under `--verbose` / `--dry-run`.
- Add `--magent <name>` option (or auto if exactly one).

### R5: Supporting surfaces
- Update `MapResult` interface + counts in verbose output (line 140-144).
- Update `plugins/cc/skills/cc-magents/references/platform-compatibility.md` and `workflows.md` with new `magents/` convention.
- Update CLI help text (line 41-49 in install.ts).

### R6: Tests
- Selection unit tests (new file, e.g. `packages/core/tests/magent-select.test.ts` or `apps/cli/tests/commands/install-magent.test.ts`).
- Integration tests in `apps/cli/tests/commands/install*.test.ts` — add fixtures with `magents/` + overrides.
- Cover: common fallback, per-target override wins, claude special variants, shimming applied, dry-run/verbose output, no breakage without magents/.
- All existing tests + `bun run spur-check` must stay green.

### R7: Docs
- Short section in docs or help explaining `magents/` layout for plugin authors.
- CHANGELOG entry.

## Key Source Files (READ THESE)

|File|What's there|Lines of interest|
|---|---|---|
|`packages/core/src/mapper.ts`|`MapResult` interface, `mapPluginToRulesync()`|13-19 (interface), 105-220 (function body)|
|`apps/cli/src/commands/install.ts`|`InstallOptions`, `executeInstall()`, dispatch loop|70-76 (options), 117-419 (executeInstall), 286-400 (per-target dispatch)|
|`packages/core/src/pipeline/adapt-subagent.ts`|Pattern to mirror for shimming|`adaptSubagentToSkill`, `adaptSubagentToPi` exports|
|`packages/core/src/pipeline/rewrite-references.ts`|`rewriteSkillReferences(content, pluginPrefix)` — reuse this|9-24|
|`packages/core/src/targets.ts`|`TARGETS` const, `Target` type, target maps|5-15 (TARGETS), 18 (type), 100-110 (agent name map)|
|`apps/cli/tests/commands/install.test.ts`|Existing install tests — extend these||
|`apps/cli/tests/commands/install.integration.test.ts`|Integration tests with fixtures||

## Design Decisions (from task Design section)
- Override (not merge/patch) — simpler, matches user example.
- Direct staging for magents (like hooks), NOT through `.rulesync/skills/`.
- `--magent <name>` for explicit selection; auto when exactly one.
- Support both global and project-level via existing `global`/`--no-global` flag.
- Claude special: `AGENTS.claude.md` wins over `AGENTS.md`; `CLAUDE.md` variants also tried.

## Selection Pseudocode (from task Design)
```ts
const TARGET_CANDIDATES: Record<Target, string[]> = {
  claude: ['AGENTS.claude.md', 'CLAUDE.claude.md', 'AGENTS.md', 'CLAUDE.md'],
  pi: ['AGENTS.pi.md', 'AGENTS.md'],
  omp: ['AGENTS.omp.md', 'AGENTS.md'],
  // ... similarly for others, plus a 'default' fallback
  default: ['AGENTS.md'],
};
```

## Code Style (CRITICAL — Biome enforces)
- 4-space indent, `lineWidth` 120
- **Single quotes**, semicolons always, trailing commas everywhere
- `interface` for object shapes, `type` for unions
- `any` is an ERROR — narrow all types
- Extensionless relative specifiers for TS imports
- Imports auto-sorted by Biome — don't hand-order

## Verification Commands
```bash
bun run lint          # biome check + typecheck (MUST pass)
bun run test          # bun test with coverage
bun run build         # compile to standalone binary
bun run spur-check    # lint + pre-check rules + test + post-check rules
spur task check 0081  # guard check before wip→testing transition
```

## After Implementation
1. Write `## Solution` section via:
   ```bash
   spur task update 0081 --section Solution --from-file /tmp/0081-solution.md
   ```
   Format: markdown table with `file:line` ranges (e.g. `packages/core/src/mapper.ts:13-20`) and one-line what/why.
   The `wip → testing` guard REQUIRES inline `file:line` citations — not separate columns.
2. Transition: `spur task update 0081 wip` then `spur task update 0081 testing`
3. The parent agent will dispatch verification after testing transition succeeds.

## Section Writing Quirk
`spur task update --section` strips same-level headings (`###`). Use bullets/tables/bold inside section bodies. "Artifacts" is NOT a canonical section — use References.
