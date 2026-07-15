# Task 0081 — Verify Context Brief

## Task File
`docs/tasks/0081_optimize-superskill-install-for-main-agent-magent-customizat.md`

## Status
- Current: `testing`
- After verify: if PASS → write Review section → transition `testing → done` (guard requires P1-P4 findings table in Review)
- If FAIL → write Root Cause → transition back to `wip`

## What Was Implemented (from subagent report)

### Changed Files
| File | What |
|------|------|
| `packages/core/src/mapper.ts` | `MapResult.magents` at :17; discovery block at :200-223 |
| `packages/core/src/pipeline/select-magent.ts` | NEW: `selectMagentVariant` :83, `adaptMagentForTarget` :99, `magentOutputFilename` :109, `magentGlobalDir` :124 |
| `packages/core/src/index.ts` | `export * from './pipeline/select-magent'` at :34 |
| `packages/core/tests/pipeline/select-magent.test.ts` | NEW: 18 unit tests |
| `apps/cli/src/commands/install.ts` | `emitMagents()` at :731-804; `--magent` CLI option at :52-55; `InstallOptions.magent` at :86; verbose count at :153; call site at :418 |
| `apps/cli/tests/commands/install.integration.test.ts` | 9 integration tests at :671-885 |
| `apps/cli/tests/fixtures/plugin-min/magents/` | `my-agent/AGENTS.md` + `AGENTS.claude.md` fixtures |
| `CHANGELOG.md` | v0.3.3 entry at :13 |
| `plugins/cc/skills/cc-magents/references/platform-compatibility.md` | Plugin-Provided Magents subsection at :33-52 |
| `plugins/cc/skills/cc-magents/references/workflows.md` | Install section extended with `--magent` examples at :186-206 |

### Requirements Covered
- **R1**: `MapResult.magents` field + mapper discovery of `magents/<kebab-name>/` dirs → `.rulesync/magents/<plugin>-<name>/`
- **R2**: `selectMagentVariant()` pure function with target-specific → base fallback; claude accepts `CLAUDE.claude.md`/`CLAUDE.md`
- **R3**: `adaptMagentForTarget()` reuses `rewriteSkillReferences`; `magentOutputFilename()` returns `CLAUDE.md` for claude, `AGENTS.md` elsewhere
- **R4**: `emitMagents()` integrated; `--magent` CLI option; auto-select single; skip multi; fail loud on unknown
- **R5**: Verbose count includes Magents; docs updated; CLI help text updated
- **R6**: 18 unit + 9 integration tests; all 8 AC scenarios pass
- **R7**: CHANGELOG + platform-compatibility/workflows docs

### Subagent-Reported Verification
- Build: 820 modules, exit 0
- Lint: clean (Biome + typecheck, 0 errors)
- Tests: 1436 pass / 0 fail / 3586 expect()
- `spur task check 0081`: PASS (1 WARN: missing feature_id — advisory only)
- `bun run spur-check`: pass (3/3 rules, 0 violations)

## Verification Instructions

1. Read the task file for R1-R7 requirements and all 8 Acceptance Criteria scenarios.
2. Independently verify each AC by reading the cited code and tests:
   - AC1: No magents → normal install unaffected
   - AC2: Common fallback (`AGENTS.md`)
   - AC3: Target override wins (`AGENTS.claude.md`)
   - AC4: Claude naming variants (`CLAUDE.md`, `CLAUDE.claude.md`)
   - AC5: Shimming rewrites plugin-scoped refs
   - AC6: `--magent <name>` explicit selection; unknown name fails loud
   - AC7: Dry-run / verbose shows magent activity
   - AC8: Multiple magents without `--magent` → skip with clear message
3. Run verification commands yourself:
   ```bash
   bun run lint          # biome check + typecheck
   bun run test          # all tests including new ones
   bun run build         # compile
   spur task check 0081  # guard
   ```
4. SECUA review: check code quality, error handling, type safety (no `any`), pattern conformance with existing install/mapper code.
5. Produce verdict: PASS or FAIL with per-requirement evidence.

## After Verification

### If PASS:
Write `## Review` section via:
```bash
spur task update 0081 --section Review --from-file /tmp/0081-review.md
```
Format: P1-P4 findings table (P1=blocker, P2=high, P3=medium, P4=low). Example:
```
| Priority | Finding | File:Line | Status |
|----------|---------|-----------|--------|
| P1 | (none) | — | — |
| P2 | (none) | — | — |
| P3 | (none) | — | — |
| P4 | (none) | — | — |
```
Even if no findings, the table must exist (guard requires it).

Then transition: `spur task update 0081 done`

### If FAIL:
Write `## Root Cause` section with what failed and why, then `spur task update 0081 wip`.

## Section Writing Quirk
`spur task update --section` strips same-level headings (`###`). Use bullets/tables/bold inside section bodies.
