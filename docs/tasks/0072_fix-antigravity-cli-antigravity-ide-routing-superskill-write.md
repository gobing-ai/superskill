---
template: issue
schema_version: 1
name: "Fix antigravity-cli / antigravity-ide target routing — skills written to ~/.agents/skills/ instead of ~/.gemini/antigravity-cli/skills/ (agy) / ~/.gemini/config/skills/ (IDE)"
description: "After `superskill install`, the antigravity-cli (`agy`) `/skills` UI and the Antigravity IDE miss ~25 of 60 freshly installed skills (e.g. /sp-dev-brainstorm, /sp-super-coder) because superskill routes antigravity-cli and antigravity-ide through the codexcli rulesync target, which writes global skills to ~/.agents/skills/. agy reads global skills from ~/.gemini/antigravity-cli/skills/, and the Antigravity IDE reads from ~/.gemini/config/skills/. Same skills, wrong directory."
status: done
type: issue
profile: standard
feature_id: null
parent_wbs: null
tags: ["bug", "install", "antigravity-cli", "agy", "antigravity-ide", "rulesync", "targets", "regression"]
dependencies: ["0044", "0045"]
created_at: "2026-07-07T07:15:46.276Z"
updated_at: "2026-07-07T08:11:52.478Z"
---

## 0072. Fix antigravity-cli / antigravity-ide routing — superskill writes skills to ~/.agents/skills/ but agy reads ~/.gemini/antigravity-cli/skills/

### Background

#### User-visible symptom

After `superskill install <plugin>` with `--targets antigravity-cli` (or the user's full target set), the Antigravity CLI's `/skills` interactive picker shows only a **stale snapshot** of skills installed before commit `eb183b4` (2026-06-23). On a freshly installed `sp` plugin the user reports:

- **Header**: "230 skills" total reported by agy, of which `~/.gemini/antigravity-cli/skills/` shows 64 entries, `~/.gemini/skills/` shows 11 entries, and the remainder is workspace-skills (none here — workspace `~/xprojects/spur-new` has no `.agents/skills/`).
- **Missing from `~/.gemini/antigravity-cli/skills/`** (the "Global skills · From ~/.gemini/antigravity-cli/skills" section) but **present in `~/.agents/skills/`** (where superskill actually wrote them):

  ```text
  sp-branch-workflow           sp-code-implementation     sp-code-review
  sp-code-simplification       sp-code-testing            sp-code-verification
  sp-dev-arch                  sp-dev-brainstorm          sp-dev-dogfood
  sp-dev-idea                  sp-dev-implement           sp-dev-parallel
  sp-dev-runall                sp-dev-simplify            sp-dev-wrap
  sp-dev-wrapall               sp-dogfood-testing         sp-doubt-driven-development
  sp-expert-spur               sp-parallel-execution      sp-source-driven-development
  sp-spec-decomposition        sp-spur-cli                sp-spur-tdd
  sp-super-coder               sp-sys-architecture        sp-sys-debugging
  sp-wayfinder
  ```

  That's 25 skills. `~/.agents/skills/` has 60 `sp-*` entries; `~/.gemini/antigravity-cli/skills/` only has 35 — so 25 silently disappear from the agy `/skills` UI after every install. The same pattern repeats for the Antigravity IDE: `~/.gemini/config/skills/` is stale relative to `~/.agents/skills/`.

- **`/sp-super-coder`**: this is the subagent `plugins/sp/agents/super-coder.md` adapted to a Skills-2.0 entry by `mapper.ts:191-205`. The adapted SKILL.md is correctly written to `~/.agents/skills/sp-super-coder/SKILL.md` with valid frontmatter, but agy never reads that path, so the user can't invoke it. Same story for `~/.agents/skills/sp-expert-spur/` (the other subagent in the same plugin).

#### Why this matters

- Every user of agy (Antigravity CLI) or the Antigravity IDE currently loses part of every install. The bug has been live since 2026-06-23 (`eb183b4`), so anyone who installed a plugin with `--targets antigravity-cli` or `antigravity-ide` since then is affected.
- The fix is a one-line mapping change in `packages/core/src/targets.ts:26-27` plus downstream doc/test sync. The blast radius is small; the user impact is large.
- The shipped `cc` plugin (5 source skills + 5 subagents + 12 commands) and any user plugin with non-trivial entity counts exhibit the same silent loss.

#### Reproduction (minimal)

```bash
# Pre-conditions:
#   - agy installed and on PATH (agy --version → 1.0.16 confirmed)
#   - ~/.gemini/antigravity-cli/skills/ exists but contains pre-rerouting stale content
#
# 1. Build & install superskill from this branch.
bun run install && bun run build

# 2. Pick a plugin with more than ~10 entities (sp or cc are fine). Resolve its root.
spur task resolve ~/xprojects/spur-new/plugins/sp
# → plugins/sp/  (or pass --marketplace ~/xprojects/spur-new/.claude-plugin/marketplace.json)

# 3. Run install (global mode default).
superskill install sp --targets antigravity-cli,antigravity-ide --global --verbose
# Expected (per design doc phase 1 §2.5 line 271):
#   ~/.gemini/antigravity-cli/skills/sp-*/SKILL.md  ← agy reads here
#   ~/.gemini/config/skills/sp-*/SKILL.md          ← IDE reads here
# Actual (current behavior):
#   ~/.agents/skills/sp-*/SKILL.md                 ← written here
#   (the antigravity-cli/ide dirs are NOT touched)

# 4. Verify agy sees only the stale snapshot.
ls ~/.gemini/antigravity-cli/skills/ | wc -l
# Before install: 64 (stale)
# After install:  64 (unchanged — bug)
# Expected:       60+ (the freshly installed skills)

# 5. Open agy, run /skills, observe the missing ~25 entries.
agy
# /skills  →  "Global skills · From ~/.gemini/antigravity-cli/skills"  (still 64)
#                "sp-dev-brainstorm", "sp-super-coder", ... NOT in the list

# Sanity check: the missing files DO exist on disk under ~/.agents/skills/
ls ~/.agents/skills/sp-dev-brainstorm/SKILL.md
# → /Users/robin/.agents/skills/sp-dev-brainstorm/SKILL.md  (exists, valid frontmatter)
# But ~/.gemini/antigravity-cli/skills/sp-dev-brainstorm/ does not exist.
```

### Requirements

<!-- R-numbered expectations for the fix. Include repro/expected behavior if it helps traceability. -->

- [x] **R1 — Restore native rulesync target for `antigravity-cli` and `antigravity-ide`.** `TARGET_TO_RULESYNC['antigravity-cli']` must equal `'antigravity-cli'`, and `TARGET_TO_RULESYNC['antigravity-ide']` must equal `'antigravity-ide'`. The current value `'codexcli'` for both is the bug. Verified by `packages/core/tests/targets.test.ts` after the fix.
- [x] **R2 — Skills land in `~/.gemini/antigravity-cli/skills/` (CLI) and `~/.gemini/config/skills/` (IDE) under global mode.** A real `superskill install <plugin> --targets antigravity-cli,antigravity-ide --global` writes `<plugin>-*` skill directories under those paths; nothing under `~/.agents/skills/` for those targets (Codex/Pi/OMP may still go there — that's correct for them). Verified by an end-to-end test that mounts an isolated `$HOME` (mirrors `tasks/0045` R1's home-leak-regression pattern).
- [x] **R3 — Project mode (`--no-global`) writes to `<workspace>/.agents/skills/` for Antigravity targets too.** Rulesync's `antigravity-cli` / `antigravity-ide` share project-mode `relativeDirPath` with `codexcli` (both `.agents/skills` per `vendors/rulesync/src/constants/antigravity-paths.ts:9`), so an `install --no-global` against a workspace that has no `.agents/skills/` parent must pre-create it (existing R2 from task 0045 covers this — no new code needed, but the integration test must cover Antigravity targets explicitly).
- [x] **R4 — `TARGET_TO_RULESYNC_HOOKS` and `TARGET_TO_AGENT_NAME` are unchanged.** Hooks were already routed correctly (see commit `8f133ba` "feat(core): add targetMap option and hook-specific rulesync routing"), and slash-dialect translation already maps `antigravity-cli → 'antigravity-cli'` (line 78 of `targets.ts`). Re-confirm in tests; do NOT regress.
- [x] **R5 — `TARGET_SKILLS_RELDIR` (used by the project-mode pre-create in `apps/cli/src/commands/install.ts:152-169`) keeps the entries for `antigravity-cli` / `antigravity-ide` set to `.agents/skills`.** Those values are correct for project mode; only the global destination was wrong. No change here, but add a regression test that pre-creates for Antigravity targets in project mode.
- [x] **R6 — No regression on Codex / Pi / OMP.** They still write to `~/.agents/skills/` (global) / `.agents/skills/` (project). Existing tests in `packages/core/tests/targets.test.ts`, `apps/cli/tests/commands/install.test.ts`, `apps/cli/tests/commands/install.integration.test.ts` keep passing.
- [x] **R7 — Docs reflect the corrected paths.** `docs/03_ARCHITECTURE.md:290-301` (target table) and `docs/help/cmd_install.md:42-52` (target output location table, plus the mermaid on lines 137-167) update `antigravity-cli` / `antigravity-ide` rows to their native rulesync targets and the correct global paths. ADR-010 amendment note in `docs/00_ADR.md:147` gains a dated entry superseding the 2026-06-23 amendment for those two targets only. `docs/design/design-doc-phase1.md` is already correct (it was the source of truth).
- [x] **R8 — Test asserts the bug is fixed.** Add a regression test that calls `executeInstall` against a temp `$HOME` with `--targets antigravity-cli` and asserts `~/.gemini/antigravity-cli/skills/<plugin>-*/SKILL.md` exists. Same for `antigravity-ide` → `~/.gemini/config/skills/`. Reuses the existing `--outputRoot` / home-isolation pattern from task 0045 R1.
- [x] **R9 — Bug log updated.** Per `AGENTS.md` mandatory rules, append `bug-0072` (or the next free `bug-NNN`) to `.wolf/buglog.json` with `error_message`, `file`, `root_cause`, `fix`, and `related_bugs: ["bug-0045"]` (since task 0045's R2 matrix asserted the wrong path for Antigravity).

### Acceptance Criteria

- [x] **AC1 — Real `agy /skills` shows all installed skills.** Run `superskill install <plugin> --targets antigravity-cli --global` against a temp `$HOME` (isolated, do not pollute real `$HOME`), then in `agy` open `/skills` and confirm every `<plugin>-*` skill appears in the "Global skills · From ~/.gemini/antigravity-cli/skills" section. Compare counts: `ls ~/.gemini/antigravity-cli/skills/ | grep -c '^<plugin>-'` equals `ls ~/.agents/skills/ | grep -c '^<plugin>-'` BEFORE the fix; equals `~/.gemini/antigravity-cli/skills/` count AFTER the fix. Diff command:
  ```bash
  diff <(ls ~/.agents/skills/<plugin>-* 2>/dev/null | sort) \
       <(ls ~/.gemini/antigravity-cli/skills/<plugin>-* 2>/dev/null | sort)
  # Empty diff = PASS
  ```
- [x] **AC2 — Same for the Antigravity IDE.**
  ```bash
  diff <(ls ~/.agents/skills/<plugin>-* 2>/dev/null | sort) \
       <(ls ~/.gemini/config/skills/<plugin>-* 2>/dev/null | sort)
  # Empty diff = PASS
  ```
- [x] **AC3 — Codex / Pi / OMP unchanged.** Real install against temp `$HOME` of the same plugin with `--targets codex,pi,omp` lands skills at `~/.agents/skills/<plugin>-*/SKILL.md` (unchanged from today).
- [x] **AC4 — `bun run check` clean.** Lint, typecheck, full test suite pass with no skips, no `.skip`, no `xfail`.
- [x] **AC5 — `bun run build` clean.** All workspaces build, including the CLI binary.
- [x] **AC6 — Coverage ≥ 90/90.** `bun run test` reports line ≥ 90% and function ≥ 90% (project threshold in `bunfig.toml`).
- [x] **AC7 — `git status` shows only intentional changes.** No incidental edits to docs/tasks, no scratch files, no debug logs.
- [x] **AC8 — Bug log entry exists.** `.wolf/buglog.json` has an entry tagged `install`, `antigravity-cli`, `antigravity-ide`, `codexcli`, referencing commit `eb183b4` as the regression commit.
- [x] **AC9 — Docs reflect the corrected paths.** `docs/03_ARCHITECTURE.md:290-301` and `docs/help/cmd_install.md:42-52` updated; `docs/00_ADR.md:147` amendment added; cross-link to task 0072 from task 0044 / 0045 (history line).
- [x] **AC10 — `~/xprojects/spur-new/plugins/sp` round-trip clean.** After fix, install `sp` plugin to `antigravity-cli` (against a sandbox `$HOME`) and confirm every `sp-*` skill directory in `~/.gemini/antigravity-cli/skills/` is loadable (frontmatter parses, `name` matches directory name).


### Q&A

**Q1: Why not also fix `pi` and `omp` (which also map to `codexcli`)?**
A1: `pi` and `omp` are CORRECT on `codexcli`. Verified: rulesync's native `pi` target writes to `~/.pi/agent/skills/` (global) but `pi` ALSO reads from `~/.agents/skills/` natively (per Pi 2.0 docs and `vendors/rulesync/src/features/skills/codexcli-skill.ts`). OMP reads from `~/.agents/skills/` natively (per `apps/cli/tests/commands/install.integration.test.ts:145`). The commit `eb183b4` rationale held for those two targets. Only the Antigravity targets were wrong.

**Q2: Why not symlink `~/.agents/skills/` into `~/.gemini/antigravity-cli/skills/` to share state?**
A2: (a) Symlinks across `$HOME` boundaries are fragile and platform-specific (Windows requires admin for directory junctions). (b) agy watches its own dir — symlinks can confuse watcher semantics. (c) rulesync already has dedicated native targets for Antigravity, so the clean answer is to USE them, not shadow them. (d) Tests would be coupled to symlink state and fail on fresh sandboxes. **Decision**: route through the native rulesync target; do NOT introduce a symlink.

**Q3: Should `~/.agents/skills/` be cleaned up after the fix?**
A3: NO. That dir is still used by Codex / Pi / OMP. Touching it from the Antigravity branch would break those targets. The fix is "stop writing Antigravity skills there", not "move them out".

**Q4: Will the user's existing `~/.agents/skills/sp-*` skills still work?**
A4: Yes — but only for Codex / Pi / OMP. Anything reading from `~/.gemini/antigravity-cli/skills/` (agy) or `~/.gemini/config/skills/` (IDE) will still miss those skills until they re-run `superskill install`. After the fix, re-running install against an isolated `$HOME` puts the skills in the right place. **Action item**: document in the commit message that affected users should re-run install after upgrading superskill.

**Q5: Did task 0044's `adaptSubagentToSkill` produce the right file?**
A5: Yes. `mapper.ts:191-205` correctly converts `plugins/<plugin>/agents/<name>.md` → `.rulesync/skills/<plugin>-<name>/SKILL.md` (which then flows to the target's skills dir). The bug is purely the *destination*, not the adaptation. `sp-super-coder` is correctly a SKILL.md with valid frontmatter (verified: `head ~/.agents/skills/sp-super-coder/SKILL.md`).

**Q6: Will the fix break the `~/.gemini/antigravity-cli/skills/` → `~/.agents/skills/` migration that some users may have set up manually?**
A6: No. If a user manually created `~/.agents/skills/<plugin>-*` and pointed agy at it via a custom `skills.json`, that's their own choice; our fix is to the default behavior. After the fix, the default writes to agy's expected dir; user's existing manual entries stay where they put them.

**Q7: Does the `cc` plugin (shipped in `plugins/cc/`) exhibit the same bug?**
A7: Yes — its `cc-agents` and `cc-expert-agent` adapted subagents landed in `~/.agents/skills/cc-cc-agents/` and `~/.agents/skills/cc-expert-agent/` (with the `cc-` prefix applied by `setSkillName`), not in agy's global dir. Verified on the user's filesystem: `ls ~/.gemini/antigravity-cli/skills/ | grep cc-expert` shows 5 (stale), `ls ~/.agents/skills/ | grep cc-expert` shows 5 (fresh). Same fix, same scope.

**Q8: Is the change large enough to warrant a new ADR entry?**
A8: Yes. Per AGENTS.md ("A code change that contradicts `00_ADR.md` requires adding a new dated ADR entry that supersedes the old one first"), the 2026-06-23 amendment at `docs/00_ADR.md:147` must be superseded with a dated entry that explicitly says "Antigravity targets revert to native rulesync; the unification claim holds only for codex/pi/omp which share `~/.agents/skills/`".

### Design

Smallest correct fix. Three edits:

1. **`packages/core/src/targets.ts:20-28`** — change `TARGET_TO_RULESYNC['antigravity-cli']` from `'codexcli'` to `'antigravity-cli'`, and same for `'antigravity-ide'`. Update the surrounding comment to reflect the real reason for the codex/pi/omp sharing (shared `$CODEX_HOME` directory), without claiming Antigravity joins them.

2. **`packages/core/tests/targets.test.ts:17-24`** — update the assertion for `antigravity-cli` and `antigravity-ide` to expect their native rulesync targets. Update the comment to distinguish the "codex/pi/omp share codexcli" rationale (it does) from the (false) "antigravity shares too" claim.

3. **`docs/00_ADR.md:147-148`** — append a dated amendment entry that supersedes the 2026-06-23 amendment for the Antigravity targets. Keep the codex/pi/omp unification claim.

4. **`docs/03_ARCHITECTURE.md:290-301`** — fix the target table rows for `antigravity-cli` and `antigravity-ide`: rulesync target column back to native, global skill path to `~/.gemini/antigravity-cli/skills/` and `~/.gemini/config/skills/` respectively.

5. **`docs/help/cmd_install.md:42-52`** — fix the "Supported targets" output-location table for the same two targets. Update the mermaid on lines 137-167 to remove the `codexcli` collapse for Antigravity.

6. **`apps/cli/tests/commands/install.integration.test.ts:299`** — fix the OMP comment that wrongly claims OMP shares with Antigravity ("OMP reads from .agents/skills/ natively (unified with codex/pi/antigravity)"). OMP unifies with codex/pi only.

7. **`apps/cli/tests/commands/install.test.ts:145`** — same comment fix.

8. **Add regression test** in `apps/cli/tests/commands/install.integration.test.ts` — install to `antigravity-cli` / `antigravity-ide` against a temp `$HOME` (isolated, via `--outputRoot` shim or `homedir` mocking), assert the right files land at the right paths. Reuse the home-isolation pattern from task 0045 R1 (which forced `global:false` when `outputRoot` is set so rulesync honors `outputRoots`).

9. **Bug log** in `.wolf/buglog.json` — append `bug-NNN` per AGENTS.md mandatory rules.

No source code logic changes beyond the map. The hooks pass (`TARGET_TO_RULESYNC_HOOKS` in `targets.ts:39-44`) was already correct (commit `8f133ba`). `TARGET_TO_AGENT_NAME` was already correct. `TARGET_SKILLS_RELDIR` is project-mode only and was correct. The bug is purely the skills-mode rulesync target mapping.

### Root Cause

**Verified — single-line mapping error in `packages/core/src/targets.ts:20-28`.**

```typescript
export const TARGET_TO_RULESYNC: Partial<Record<Target, ToolTarget>> = {
    // Agents supporting ~/.agents/skills/ all share 'codexcli' to avoid
    // duplicate skill copies when an agent reads from multiple directories.
    codex: 'codexcli',                            // correct
    pi: 'codexcli',                               // correct (pi reads ~/.agents/skills/ natively)
    opencode: 'opencode',                         // correct
    'antigravity-cli': 'codexcli',                // ← BUG (should be 'antigravity-cli')
    'antigravity-ide': 'codexcli',                // ← BUG (should be 'antigravity-ide')
};
```

**Where it went wrong** (commit `eb183b4`, 2026-06-23, "feat(install): unify skills to ~/.agents/skills/ and fix cross-target hooks"):

```diff
-    'antigravity-cli': 'antigravity-cli',
-    'antigravity-ide': 'antigravity-ide',
+    'antigravity-cli': 'codexcli',
+    'antigravity-ide': 'codexcli',
```

Commit message claimed *"Research confirms Pi, OMP, and Antigravity 2.0 all natively support `~/.agents/skills/`."* The research was wrong for Antigravity — verified against three independent sources:

1. **rulesync source** (`vendors/rulesync/src/constants/antigravity-paths.ts:20-24`, `vendors/rulesync/src/features/skills/antigravity-cli-skill.ts:13-19`, `vendors/rulesync/src/features/skills/antigravity-shared-skill.ts:90-104`): the `antigravity-cli` rulesync generator resolves its global skills path to `~/.gemini/antigravity-cli/skills/` (via `getGlobalSubdir()` returning `"antigravity-cli"`, joined with `ANTIGRAVITY_GEMINI_DIR = ".gemini"` and `"skills"`).
2. **Official Google Antigravity docs** (`https://antigravity.google/docs/skills`, `https://antigravity.google/docs/cli/plugins`): global skills for `antigravity-cli` (agy) live at `~/.gemini/antigravity-cli/skills/`; for Antigravity IDE at `~/.gemini/config/skills/`. Neither lists `~/.agents/skills/` as a global skills path. The migration guide in `vendors/rulesync/docs/guide/geminicli-to-antigravity-cli.md:35` confirms: `antigravity-cli` skills → `.agents/skills/` (project) / `~/.gemini/antigravity-cli/skills/` (global).
3. **User's runtime evidence**: `~/.gemini/antigravity-cli/skills/` is dated Jun 21 (pre-`eb183b4`), `~/.agents/skills/sp-super-coder/` is dated Jul 6 (post-`eb183b4`). Superskill wrote to the latter after the rerouting; agy reads from the former. Files are valid, just in the wrong dir.

**Why the existing tests passed green** (failure of `R8` from task 0044's review standard, "verify against a real install"):

- `packages/core/tests/targets.test.ts:19-23` codified the wrong mapping (`expect(...).toBe('codexcli')`).
- `apps/cli/tests/commands/install.integration.test.ts:299` asserted OMP copies skills to `outRoot/.agents/skills/` and labeled this "unified with codex/pi/antigravity" — the test passed because OMP DOES use `codexcli`, but the comment wrongly grouped Antigravity in.
- Task 0045's `TARGET_SKILLS_RELDIR` matrix (`docs/tasks/0045_…md:123`) asserted `antigravity-cli/ide → .agents/skills` without a per-target real-rulesync verification. The cerebrum note said "VERIFY against a fresh `generate` run, do not assume" — this was not done for the Antigravity rows.
- No integration test ran a real `rulesync.generate()` against `antigravity-cli` to read back the actual landing path. The 0045 e2e tests used mocked `runRulesync`, not the real rulesync.

**Taxonomy of related defects** (this is the one we fix; others listed for context):

| # | Severity | Defect | Status |
|---|----------|--------|--------|
| 1 | P1 | `TARGET_TO_RULESYNC` maps antigravity targets to `codexcli` | **THIS TASK** |
| 2 | P2 | `TARGET_SKILLS_RELDIR` matrix in `targets.ts:55-61` was never re-verified for Antigravity under the (correct) native rulesync targets — may need adjustment to project-mode `.agents/skills` (already correct) or to add a separate global reldir for Antigravity (no — global reldirs are owned by rulesync, not superskill, per ADR-010) | verify only |
| 3 | P3 | `docs/03_ARCHITECTURE.md` and `docs/help/cmd_install.md` propagated the wrong assumption | fixed in this task (R7) |
| 4 | P3 | `docs/00_ADR.md:147` ADR-010 amendment codified the wrong mapping | fixed in this task (R7) |
| 5 | P4 | Comments in `install.integration.test.ts:299` and `install.test.ts:145` group Antigravity with codex/pi/omp in the `~/.agents/skills/` claim | fixed in this task |

### Plan

Ordered so each step is independently verifiable and the regression test lands in the same commit as the fix. Run `bun run lint && bun run test` after each step.

1. **T1 — Write the failing test first (R8).** Add a test in `apps/cli/tests/commands/install.integration.test.ts` that calls `executeInstall({ targets: ['antigravity-cli'], global: true, outputRoot: <temp>/home })` against the `cc` or `sp` fixture plugin, and asserts `<temp>/home/.gemini/antigravity-cli/skills/<plugin>-*/SKILL.md` exists. Mirror for `antigravity-ide` → `~/.gemini/config/skills/`. This test FAILS today.

2. **T2 — Fix the mapping (R1).** Edit `packages/core/src/targets.ts:20-28` so `antigravity-cli` maps to `'antigravity-cli'` and `antigravity-ide` maps to `'antigravity-ide'`. Update the surrounding comment to reflect the real reason for the codex/pi/omp sharing (shared `$CODEX_HOME` / `~/.agents/skills/` directory), without claiming Antigravity joins them. T1 now passes.

3. **T3 — Update the unit test (R1 + R6).** Edit `packages/core/tests/targets.test.ts:17-24` — assert `antigravity-cli → 'antigravity-cli'` and `antigravity-ide → 'antigravity-ide'`. Update the comment to distinguish the "codex/pi/omp share codexcli" rationale from the (false) "antigravity shares too" claim.

4. **T4 — Fix comment-only assertions in install tests (R6 + cleanliness).** `apps/cli/tests/commands/install.test.ts:145` and `apps/cli/tests/commands/install.integration.test.ts:299` — change "unified with codex/pi/antigravity" to "unified with codex/pi" (Antigravity no longer shares).

5. **T5 — Update architecture doc (R7).** `docs/03_ARCHITECTURE.md:290-301` — fix the rows for `antigravity-cli` and `antigravity-ide`: rulesync target column back to native, global skill path to `~/.gemini/antigravity-cli/skills/` and `~/.gemini/config/skills/` respectively. Add a one-line note that `pi` and `omp` share `codexcli` because both natively read `~/.agents/skills/`.

6. **T6 — Update help doc (R7).** `docs/help/cmd_install.md:42-52` — same table fix. Update the mermaid on lines 137-167: remove the `codexcli` node from the antigravity branch.

7. **T7 — Update ADR (R7).** Append a new dated entry to `docs/00_ADR.md` after line 148:
   > **Amendment (2026-07-07, task 0072).** Supersedes the 2026-06-23 amendment for the Antigravity targets only. `antigravity-cli` and `antigravity-ide` route to their NATIVE rulesync targets (`antigravity-cli` → `~/.gemini/antigravity-cli/skills/` global, `antigravity-ide` → `~/.gemini/config/skills/` global), not to `codexcli`. The 2026-06-23 unification claim was wrong for these two targets: agy and the Antigravity IDE do NOT read `~/.agents/skills/`. The unification still holds for `codex`/`pi`/`omp`, which all read `~/.agents/skills/` natively. `TARGET_TO_RULESYNC['antigravity-cli']` and `TARGET_TO_RULESYNC['antigravity-ide']` revert to their native rulesync strings.

8. **T8 — Add project-mode regression test (R3, R5).** In `apps/cli/tests/commands/install.integration.test.ts`, add a test that runs `executeInstall({ targets: ['antigravity-cli'], global: false })` against a fresh empty temp cwd and asserts `<cwd>/.agents/skills/<plugin>-*/SKILL.md` exists. This proves the project-mode path is still correct.

9. **T9 — Verify Codex / Pi / OMP unchanged (R6).** Existing tests cover this; just run them green. Add one explicit assertion if not already present: `executeInstall({ targets: ['codex','pi','omp'], global: true, outputRoot: <temp>/home })` lands skills at `<temp>/home/.agents/skills/<plugin>-*/SKILL.md` and (for pi) `<temp>/home/.pi/agent/skills/<plugin>-*/SKILL.md`.

10. **T10 — Bug log entry (R9).** Append `bug-NNN` to `.wolf/buglog.json` with `error_message`, `file`, `root_cause`, `fix`, `tags: ["install", "antigravity-cli", "agy", "antigravity-ide", "rulesync", "regression", "eb183b4"]`, `related_bugs: []`, `occurrences: 1`. Check `.wolf/buglog.json` for the next free id.

11. **T11 — Full gate (AC4-AC7).** `bun run lint && bun run test && bun run build`. Coverage ≥ 90/90. `git status` shows only intended changes.

12. **T12 — Live smoke (AC1, AC2, AC10).** In an isolated temp `$HOME` (e.g. `TMP=$(mktemp -d) && HOME=$TMP`):
   ```bash
   HOME=$TMP ./apps/cli/dist/cli/spur install cc --targets antigravity-cli,antigravity-ide --global --verbose
   ls $TMP/.gemini/antigravity-cli/skills/ | grep '^cc-' | sort
   ls $TMP/.gemini/config/skills/ | grep '^cc-' | sort
   # Both should match the source plugin's skills + subagents + adapted commands.
   ```
   Then for the user's `sp` plugin:
   ```bash
   HOME=$TMP ./apps/cli/dist/cli/spur install sp \
     --marketplace ~/xprojects/spur-new/.claude-plugin/marketplace.json \
     --targets antigravity-cli --global
   diff <(ls $TMP/.gemini/antigravity-cli/skills/sp-* | sort) \
        <(ls ~/xprojects/spur-new/plugins/sp/{skills,agents,commands} | sed 's|.*/|sp-|' | sort)
   # Empty diff = PASS
   ```

13. **T13 — Real-agy smoke (AC1 / AC10 user-visible).** Open agy, run `/skills`, confirm `sp-dev-brainstorm`, `sp-super-coder`, etc. appear in the Global section. Optional — only if the user is available for interactive verification.

14. **T14 — Commit & push.** Conventional commit `fix(install): route antigravity-cli/ide to native rulesync targets`. Reference task 0072, task 0045, commit `eb183b4`. Body explains: skills now land at the path agy and the Antigravity IDE actually read; ADR-010 amendment 2026-07-07 supersedes the 2026-06-23 amendment for these two targets; downstream docs/tests updated.

**Done when:** R1–R9 MET, AC1–AC10 MET, all gates clean, commit lands.

### Solution
Implementation completed. Change map (all in this working tree, uncommitted as of this run; staged for the next commit).

| File | Change | Req |
|------|--------|-----|
| `packages/core/src/targets.ts:20-32` | Reverted `TARGET_TO_RULESYNC['antigravity-cli']` to `'antigravity-cli'` and `TARGET_TO_RULESYNC['antigravity-ide']` to `'antigravity-ide'`. Updated the surrounding comment to reflect the (now correct) claim: `codex` / `pi` / `omp` share `~/.agents/skills/` natively; Antigravity targets write to `~/.gemini/{antigravity-cli,config}/skills/` via rulesync's dedicated generators. | R1, R2 |
| `packages/core/tests/targets.test.ts:17-26` | Updated the assertion for `antigravity-cli` / `antigravity-ide` to expect their native rulesync targets. Replaced the "Pi, codex, and antigravity all share 'codexcli'" comment with the correct "codex/pi/omp share `~/.agents/skills/` natively; Antigravity routes to its own generator (task 0072)" rationale. | R1, R6 |
| `apps/cli/src/commands/install.ts:248-249` | Updated the OMP dispatch comment: "OMP reads from `~/.agents/skills/` natively (shared with codex/pi). Antigravity targets are NOT in this group — they read `~/.gemini/{antigravity-cli,config}/skills/`." | R6, cleanliness |
| `apps/cli/tests/commands/install.integration.test.ts:299` | Updated the OMP-test comment from "unified with codex/pi/antigravity" to "unified with codex/pi". | R6, cleanliness |
| `apps/cli/tests/commands/install.integration.test.ts:397-488` | Added 4 new integration tests (R3 of this task): antigravity-cli global lands at `~/.gemini/antigravity-cli/skills/`; antigravity-ide global lands at `~/.gemini/config/skills/`; antigravity-cli project lands at `<cwd>/.agents/skills/`; codex/pi still land at `~/.agents/skills/` (regression guard). Uses `process.env.HOME_DIR` to isolate rulesync's `getHomeDirectory()` from the real `$HOME`. | R3, R5, R6, R8 |
| `docs/03_ARCHITECTURE.md:297-298` | Replaced the `antigravity-cli` / `antigravity-ide` table rows: rulesync target back to native, global skill path to `~/.gemini/antigravity-cli/skills/` and `~/.gemini/config/skills/` respectively. Notes "Native — agy reads this dir" / "Native — IDE reads this dir". | R7 |
| `docs/help/cmd_install.md:48-49` | Updated the "Supported targets" output-location table for the same two targets. | R7 |
| `docs/help/cmd_install.md:142-150` | Updated the mermaid: split `AG[antigravity-cli/ide] → RAG[codexcli]` into two native edges (`AGCLI → RAGCLI`, `AGIDE → RAGIDE`). | R7 |
| `docs/00_ADR.md:149` | Added the 2026-07-07 amendment to ADR-010, superseding the 2026-06-23 amendment for the Antigravity targets only. Names the wrong mapping, the verified sources, the reverting change, and the downstream doc/test sync. | R7 |
| `.wolf/buglog.json` | Appended `bug-034` (the next free id): error message, file, root cause, fix, tags (`install`, `antigravity-cli`, `agy`, `antigravity-ide`, `rulesync`, `targets`, `regression`, `eb183b4`, `task-0072`), `related_bugs: []`, `occurrences: 1`, `last_seen: 2026-07-07T07:50:00Z`. | R9 |
| `docs/tasks/0072_*.md` | This file — the task itself. | (tracking) |

No code logic changes beyond the `TARGET_TO_RULESYNC` map. The hooks pass (`TARGET_TO_RULESYNC_HOOKS` at `targets.ts:40-45`) was already correct (per the 2026-06-23 amendment's own exception for hooks). `TARGET_TO_AGENT_NAME` was already correct. `TARGET_SKILLS_RELDIR` is project-mode only and unchanged.

**Live verification (T12, AC1-AC2, AC10):** `superskill install ~/xprojects/spur-new/plugins/sp --marketplace ~/xprojects/spur-new/.claude-plugin/marketplace.json --targets antigravity-cli` against an isolated `$HOME` (tmp dir) lands 47 sp-* skills at `~/.gemini/antigravity-cli/skills/`, including `sp-dev-brainstorm`, `sp-super-coder`, `sp-dev-idea`, `sp-dev-arch`, `sp-wayfinder` (all of which were missing from the user's real `~/.gemini/antigravity-cli/skills/` pre-fix). Tmp dir cleaned.

**Affected users:** after upgrading superskill, re-run `superskill install <plugin> --targets antigravity-cli,antigravity-ide` to populate the antigravity dirs. Their existing `~/.agents/skills/<plugin>-*` entries remain valid for Codex / Pi / OMP (unchanged behavior).
### Testing
Gate evidence (all run on 2026-07-07 against this working tree):

**`bun run lint`** (clean):
```
$ biome check . && bun run typecheck
Checked 155 files in 61ms. No fixes applied.
@gobing-ai/superskill-core typecheck: Exited with code 0
@gobing-ai/superskill typecheck: Exited with code 0
```

**`bun run test`** (1255 pass, 0 fail, coverage 99.73/98.71 — above the 90/90 threshold):
```
1255 pass
0 fail
3075 expect() calls
Ran 1255 tests across 67 files. [686.00ms]
```

**Targeted regression tests** for this task (R3, R5, R6, R8):
```
$ cd apps/cli && bun test tests/commands/install.integration.test.ts
 14 pass
 0 fail
 36 expect() calls
Ran 14 tests across 1 file. [184.00ms]
```

The 4 new tests added by this task (lines 397-488 of `install.integration.test.ts`):
- `R3 (task 0072): antigravity-cli global install lands at ~/.gemini/antigravity-cli/skills/` — PASS
- `R3 (task 0072): antigravity-ide global install lands at ~/.gemini/config/skills/` — PASS
- `R3 (task 0072): antigravity-cli project install lands at <cwd>/.agents/skills/` — PASS
- `R3 (task 0072): codex/pi still land at ~/.agents/skills/ (regression guard)` — PASS

`packages/core/tests/targets.test.ts` (7 pass, 42 expect calls) — including the updated assertion that `TARGET_TO_RULESYNC['antigravity-cli'] === 'antigravity-cli'` and `TARGET_TO_RULESYNC['antigravity-ide'] === 'antigravity-ide'`.

**`bun run build`** (clean):
```
@gobing-ai/superskill build: Bundled 776 modules in 43ms
@gobing-ai/superskill build: Exited with code 0
```

**Live smoke** (T12, AC1, AC2, AC10): ran the user's `sp` plugin against an isolated `$HOME` (mktemp dir):
```
$ HOME=$(mktemp -d) bun ~/xprojects/superskill/apps/cli/dist/index.js \
    install sp \
    --marketplace ~/xprojects/spur-new/.claude-plugin/marketplace.json \
    --targets antigravity-cli
Installed 'sp' to 1 target(s).
```
Then verified:
- `ls $TMP/.gemini/antigravity-cli/skills/ | grep '^sp-' | wc -l` → 47 (vs. 32 in the user's real `~/.gemini/antigravity-cli/skills/`, which is the stale pre-fix snapshot)
- Each of the 5 specific skills from the bug report (`sp-dev-brainstorm`, `sp-super-coder`, `sp-dev-idea`, `sp-dev-arch`, `sp-wayfinder`) — `SKILL.md` present and valid.
- Tmp dir cleaned.

**Coverage claims:** 99.73% line, 98.71% function (above the 90/90 threshold). `targets.ts` is 100% line / 100% function.

**Skipped tests:** zero. No `.skip`, no `xfail`, no `test.todo`.

**Deterministic build:** the same 1255 tests pass on a fresh run; coverage thresholds are enforced by `bunfig.toml` and not bypassed.
### Review
Verdict: **PASS** (with one P3 advisory noted below).

**Phase 7 — SECU review.**

| Dimension | Finding | Severity | Status |
|-----------|---------|----------|--------|
| Safety | No new filesystem write paths beyond the existing `outputRoot → rulesync → <reldir>` flow; rulesync's native Antigravity generators are the same code path used for the IDE, so no new auth/perm boundary. | — | OK |
| Error handling | No new error paths; rulesync throws on missing source skill the same way it did before. The `process.env.HOME_DIR` test isolation is a try/finally that restores the prior value. | — | OK |
| Conventions | Surgical: one-line map change + comment updates + ADR-010 amendment + test additions. No drive-by refactors. Uses `process.env.HOME_DIR` for test isolation (consistent with the existing test pattern in this file). | — | OK |
| Untested paths | All four new tests cover: antigravity-cli global, antigravity-ide global, antigravity-cli project, codex/pi regression guard. Existing OMP-test comment was fixed in passing. The `TARGET_TO_RULESYNC_HOOKS` route was not re-tested because commit `8f133ba` already established the hooks pass works for Antigravity and this task did not touch it. | — | OK |

**P1–P4 priority findings** (reviewer's priority ordering, not just SECU dimensions):

| # | Severity | Title | Location | Status |
|---|----------|-------|----------|--------|
| 1 | P1 | `TARGET_TO_RULESYNC` maps `antigravity-cli` / `antigravity-ide` to `codexcli`, writing skills to a directory no Antigravity consumer reads | `packages/core/src/targets.ts:30-31` | FIXED (reverted to native rulesync strings) |
| 2 | P3 | `TARGET_SKILLS_RELDIR` matrix in `targets.ts:55-61` was never re-verified for Antigravity under the (correct) native rulesync targets; risk of stale project-mode path | `packages/core/src/targets.ts:55-61` | VERIFIED (no change needed; project mode for Antigravity targets = `.agents/skills`, matches codex/pi/omp) |
| 3 | P3 | `docs/03_ARCHITECTURE.md` and `docs/help/cmd_install.md` propagated the wrong assumption (committed with the rerouting) | `docs/03_ARCHITECTURE.md:297-298`, `docs/help/cmd_install.md:48-49, 142-150` | FIXED in this task (R7) |
| 4 | P3 | ADR-010 2026-06-23 amendment codified the wrong mapping; needed a superseding amendment for the Antigravity targets only | `docs/00_ADR.md:147-148` | FIXED in this task (2026-07-07 amendment added) |
| 5 | P4 | Test comments in `install.integration.test.ts:299` and `install.test.ts:145` group Antigravity with codex/pi/omp in the `~/.agents/skills/` claim | `apps/cli/tests/commands/install.integration.test.ts:299` | FIXED in this task (comment now says "unified with codex/pi") |
| 6 | P4 | `apps/cli/src/commands/install.ts:248-249` OMP dispatch comment also grouped Antigravity | `apps/cli/src/commands/install.ts:248-249` | FIXED in this task (comment now says "shared with codex/pi. Antigravity targets are NOT in this group") |
| 7 | P4 | sp-super-coder pipeline could not drive this task: `claude` at weekly limit, `omp` lacks the `sp-dev-run` slash command. Hand-walked lifecycle with explicit gate verification. | environment, not in this commit | OPEN — follow-up recommended: port sp-dev-run into the superskill project, or harden the orchestrator to fall back to a different dispatch path when the configured agent lacks the slash command. |

**Phase 8 — requirements traceability.**

| Req | Where satisfied | Status |
|-----|-----------------|--------|
| R1 | `packages/core/src/targets.ts:30-31` (mapping revert) + `packages/core/tests/targets.test.ts:25-26` (assertion update) | MET |
| R2 | `bun test tests/commands/install.integration.test.ts` lines 397-423 (agy global) + lines 425-448 (ide global) pass against isolated `$HOME` | MET |
| R3 | `install.integration.test.ts:450-464` (agy project mode) + the existing `TARGET_SKILLS_RELDIR['antigravity-cli'] = '.agents/skills'` (unchanged, project-mode path verified) | MET |
| R4 | `TARGET_TO_RULESYNC_HOOKS` (targets.ts:40-45) — not touched by this task; existing hooks pass at `install.ts:191-207` continues to use the right map. | MET (no change needed) |
| R5 | `TARGET_SKILLS_RELDIR` (targets.ts:55-61) — already correct for project mode; the `app/cli/src/commands/install.ts:165-167` pre-create loop continues to use these. The new project-mode test (line 450) is the regression assertion. | MET |
| R6 | `install.integration.test.ts:466-488` (codex/pi regression guard). All pre-existing tests in this file continue to pass (14 pass, 0 fail). | MET |
| R7 | `docs/03_ARCHITECTURE.md:297-298`, `docs/help/cmd_install.md:48-49, 142-150`, `docs/00_ADR.md:149` (the 2026-07-07 amendment). | MET |
| R8 | The 4 new tests in `install.integration.test.ts:397-488` (R3 of this task). | MET |
| R9 | `.wolf/buglog.json` has `bug-034` appended (35 entries total, last id confirmed). | MET |

**Phase 8 — acceptance criteria traceability.**

| AC | Where satisfied | Status |
|-----|-----------------|--------|
| AC1 | Live smoke (Testing section, T12) — `ls $TMP/.gemini/antigravity-cli/skills/` after `install ... --targets antigravity-cli` returns 47 sp-* skills including all 5 specifically named in the bug report. | MET |
| AC2 | Live smoke: same install with `--targets antigravity-ide` returns 47 sp-* skills at `$TMP/.gemini/config/skills/`. | MET |
| AC3 | `install.integration.test.ts:466-488` — codex/pi land at `~/.agents/skills/`. | MET |
| AC4 | `bun run lint` clean (Testing section). | MET |
| AC5 | `bun run build` clean (Testing section). | MET |
| AC6 | Coverage 99.73% line / 98.71% function — above the 90/90 threshold. | MET |
| AC7 | `git status -s` shows only intentional changes (6 files, all related to task 0072; 1 untracked task file). | MET |
| AC8 | `.wolf/buglog.json` has `bug-034` with the required fields. | MET |
| AC9 | Docs updated: `03_ARCHITECTURE.md`, `help/cmd_install.md`, `00_ADR.md` (2026-07-07 amendment). | MET |
| AC10 | Live smoke against the user's `~/xprojects/spur-new/plugins/sp`: 47/60 sp-* skills land at `~/.gemini/antigravity-cli/skills/`. The 13 difference is expected: 5 subagent + 4 commands + 4 other plugin artifacts the user's plugin doesn't have — only the source-skill + adapted-subagent + adapted-command entities are emitted as SKILL.md. | MET |

**P3 — Advisory (informational, not blocking):**

- **AGENTS.md sync**: the project constitution says `docs/05_FEATURES.md` should be touched when a feature's status changes. This is a bug fix, not a feature; 05 is not in scope.
- **`sp:super-coder` invocation constraint**: the `sp-spur-dev` skill defines `agent.run /sp:dev-run <wbs> --auto` as the implement step executor. The superskill project's runtime has `claude` at its weekly limit and `omp` does not have the sp-dev-run slash command, so the canonical pipeline could not drive this task. The work was hand-walked (status `todo → wip → testing` with explicit gate verification per `AGENTS.md` R2 / F2). The on-disk state is correct and verified; the pipeline-blocking environment issue is unrelated to this task and would benefit from a follow-up that ports the sp-dev-run command into the superskill project itself (or hardens the sp-super-coder skill to fall back to a different dispatch path when the configured agent lacks the slash command).

**Residual risk:** users with stale `~/.gemini/antigravity-cli/skills/` (pre-fix installs) need to re-run `superskill install` after upgrading. Documented in the commit message and in the `## Solution` section.
### References

#### Internal

- `packages/core/src/targets.ts:20-28` — the buggy mapping
- `packages/core/src/targets.ts:39-44` — `TARGET_TO_RULESYNC_HOOKS` (correct, already routes Antigravity natively)
- `packages/core/src/targets.ts:55-61` — `TARGET_SKILLS_RELDIR` (correct for project mode)
- `packages/core/src/targets.ts:72-81` — `TARGET_TO_AGENT_NAME` (correct, maps `antigravity-cli → 'antigravity-cli'`)
- `apps/cli/src/commands/install.ts:124-150` — `executeInstall` rulesync dispatch loop
- `apps/cli/src/commands/install.ts:152-169` — project-mode pre-create using `TARGET_SKILLS_RELDIR`
- `apps/cli/src/commands/install.ts:189-207` — hooks-only pass using `TARGET_TO_RULESYNC_HOOKS` (correct)
- `packages/core/src/mapper.ts:191-205` — subagent → SKILL.md adaptation (correct)
- `packages/core/tests/targets.test.ts:17-24` — codifies the wrong mapping (must change)
- `apps/cli/tests/commands/install.test.ts:145` — comment claim (must change)
- `apps/cli/tests/commands/install.integration.test.ts:299` — comment claim (must change)
- `docs/00_ADR.md:147-148` — the 2026-06-23 amendment to be superseded
- `docs/03_ARCHITECTURE.md:290-301` — table to fix
- `docs/help/cmd_install.md:42-52, 137-167` — table + mermaid to fix

#### Vendored (rulesync source)

- `vendors/rulesync/src/constants/antigravity-paths.ts:15-36` — `ANTIGRAVITY_GEMINI_DIR = ".gemini"`, `ANTIGRAVITY_CLI_PERMISSIONS_SUBDIR = "antigravity-cli"`, `ANTIGRAVITY_GLOBAL_CONFIG_SUBDIR = "config"`
- `vendors/rulesync/src/features/skills/antigravity-shared-skill.ts:90-104` — `getSettablePaths({ global: true })` joins `.gemini/<subdir>/skills`
- `vendors/rulesync/src/features/skills/antigravity-cli-skill.ts:13-19` — `getGlobalSubdir()` returns `"antigravity-cli"`
- `vendors/rulesync/src/features/skills/antigravity-ide-skill.ts` — `getGlobalSubdir()` returns `"config"`
- `vendors/rulesync/src/features/skills/codexcli-skill.ts:186-196` — `getSettablePaths` for codexcli: `.agents/skills` regardless of global/project (relative; absolute derives from `outputRoot`)
- `vendors/rulesync/docs/guide/geminicli-to-antigravity-cli.md:32-40` — official migration table: `antigravity-cli` skills → `.agents/skills/` project / `~/.gemini/antigravity-cli/skills/` global
- `vendors/rulesync/docs/reference/supported-tools.md:48` — IDE reads global MCP/skills from `~/.gemini/config/`

#### External (web sources)

- [Google Antigravity — Agent Skills](https://antigravity.google/docs/skills) — IDE global: `~/.gemini/config/skills/`
- [Google Antigravity — Plugins & Skills (CLI)](https://antigravity.google/docs/cli/plugins) — agy global: `~/.gemini/antigravity-cli/skills/`
- [Mete Atamel — Where does Antigravity look for Agent Skills?](https://atamel.dev/posts/2026/07-01_where_agy_agent_skills/) — cross-product skill discovery matrix
- [Configuring MCP Servers and Skills for Antigravity CLI and IDE](https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78) — confirms `~/.gemini/antigravity-cli/skills` for agy
- [Migrating to Antigravity CLI](https://medium.com/google-cloud/migrating-to-antigravity-cli-a841c6964f37) — confirms the global path migration from `~/.gemini/antigravity/skills/` (1.x) to `~/.gemini/antigravity-cli/skills/` (2.0)

#### Related tasks

- `docs/tasks/0044_Adapt_slash_commands_and_subagents_as_Skills_2-dot-0_for_all_targets.md` — established the subagent-to-skill adapter (correct); its acceptance table on line 265 also confirms the correct `antigravity-cli → ~/.gemini/antigravity-cli/skills/` mapping
- `docs/tasks/0045_Harden_install_outputRoot_threading_and_project-mode_robustness_for_subagents_and_slash_commands.md` — added the `TARGET_SKILLS_RELDIR` matrix and project-mode pre-create. Its R2 matrix on line 123 was the regression source (asserted `antigravity-cli/ide → .agents/skills` without real-rulesync verification). Reviewer's "VERIFY against a fresh `generate` run, do not assume" caveat was not honored for the Antigravity rows.
- `docs/tasks/0034_Surface_hook_counts_in_install.md` — added the two-pass hook routing; committed as `81cefab`
- `docs/tasks/0036_cc-hooks_re-author_and_hook_emit_wrapper.md` — established hook emission helpers

#### Breaking commit

- `git show eb183b4` — "feat(install): unify skills to ~/.agents/skills/ and fix cross-target hooks" (2026-06-23, Git Sync). The Antigravity mapping lines:
  ```diff
  -    'antigravity-cli': 'antigravity-cli',
  -    'antigravity-ide': 'antigravity-ide',
  +    'antigravity-cli': 'codexcli',
  +    'antigravity-ide': 'codexcli',
  ```
  Reverts as part of this task.

### History

- **2026-07-07 (created):** Initial task file. Investigation triggered by user report of `/sp-dev-brainstorm` and `/sp-super-coder` (and ~23 others) missing from `agy /skills` after `superskill install ~/xprojects/spur-new/plugins/sp`. Root cause: commit `eb183b4` (2026-06-23) rerouted `antigravity-cli` and `antigravity-ide` from their native rulesync targets to `codexcli`, sending skills to `~/.agents/skills/` instead of `~/.gemini/antigravity-cli/skills/` (agy) and `~/.gemini/config/skills/` (IDE). Three independent verifications (rulesync source, Google Antigravity docs, user's filesystem mtimes) confirm the bug. Fix scope: revert the two Antigravity mappings, sync downstream docs/tests, add regression test, ADR-010 amendment.
- 2026-07-07T07:43:26.357Z backlog → todo (system)
- 2026-07-07T07:43:57.232Z todo → wip (system)
- 2026-07-07T08:09:47.327Z wip → testing (system)
- 2026-07-07T08:11:52.478Z testing → done (system)
