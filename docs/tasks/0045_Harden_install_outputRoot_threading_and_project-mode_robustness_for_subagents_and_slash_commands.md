---
name: Harden install outputRoot threading and project-mode robustness for subagents and slash commands
description: Harden install outputRoot threading and project-mode robustness for subagents and slash commands
status: Done
created_at: 2026-06-21T04:31:04.959Z
updated_at: 2026-06-21T04:59:37.795Z
folder: docs/tasks
type: task
feature-id: 
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
impl_progress.review: done
impl_progress.implementation: done
impl_progress.planning: done
impl_progress.design: done
impl_progress.testing: done
---

## 0045. Harden install outputRoot threading and project-mode robustness for subagents and slash commands

### Background

Follow-up to task 0044 (Adapt slash commands and subagents as Skills 2.0). Task 0044 is implemented and verified: all 7 review refinements MET, 821 tests pass, real install delivers 6 skills + 16 commands + 5 subagents to ~/.agents/skills/ and 5 Pi native agents to ~/.pi/agent/agents/. Dev-verify (2026-06-20) surfaced findings that were DEFERRED from 0044 because they touch ADR-010 (rulesync outputRoots derivation) and the public RulesyncOptions shape — an architectural change that must not be auto-applied to a Done task. This task collects those deferred findings into a clean, self-contained implementation unit.


### Requirements

Each requirement is traceable to a dev-verify finding on task 0044 (commit `32b4ffe`). Verdicts are filled by the implementer.

- [ ] **R1 — `outputRoot` must redirect rulesync skill output (P1).** `executeInstall(plugin, targets, { outputRoot })` currently threads `outputRoot` only into surrogate copies (hermes/omp) and Pi native-agent dispatch. The main payload — rulesync-generated skills — ignores it: `runRulesync` hardcodes `outputRoots: [options.global ? homedir() : process.cwd()]` (`packages/core/src/rulesync.ts:64`). Result: a caller passing `outputRoot` (e.g. tests, or a future `--output <dir>` flag) silently writes 27 skills to `$HOME`/`cwd` instead. **Met when:** when `outputRoot` is provided, rulesync skills land under that root; when omitted, behavior is unchanged (global→`$HOME`, project→`cwd`). An integration test asserts skills land under a custom `outputRoot`.
- [ ] **R2 — Project-mode (`--no-global`) install must not crash on missing parent dirs (P3).** Running `install cc --no-global` from a directory without a pre-existing `.agents/skills/` throws `ENOENT: no such file or directory, mkdir '.agents/skills/cc-agent-add'` — rulesync expects the target parent to exist. **Met when:** project-mode install of a multi-entity plugin completes without ENOENT; target parent dirs are created (or the error is caught and the dir pre-created) before rulesync writes. Regression test reproduces the original crash and asserts success.
- [ ] **R3 — `adaptSubagentToPi` filesystem coupling is injectable (P3, testability).** The Pi skill-existence filter calls `existsSync(join(pluginPath, 'skills', dirName))` from inside `packages/core/src/pipeline/adapt-subagent.ts` — an otherwise-pure pipeline module now does disk I/O and requires `pluginPath` plumbing through the call chain. **Met when:** the existence check is injected as a `skillExists: (name: string) => boolean` predicate (default implementation reads FS), so the function is unit-testable without a real plugin directory and the pipeline module has no direct `node:fs` import. Existing behavior unchanged.
- [ ] **R4 — Deprecated `rewriteColonRefs` is removed or consolidated (P4, maintainability).** After 0044, two colon-rewriters coexist: the new plugin-scoped `rewriteSkillReferences` (used by the mapper) and the legacy hardcoded `/(rd3|wt):/` `rewriteColonRefs` (still used by `transformMarkdownDirectory`'s per-target skill pass and by `adapt-parity.test.ts`). The double pass is harmless but is a latent inconsistency (legacy silently skips `cc:`/`sp:`). **Met when:** the per-target transform pass uses the plugin-scoped rewriter (threading the plugin prefix through `transformRulesyncMarkdown`), `rewriteColonRefs` is deleted, and `adapt-parity.test.ts` is updated to the scoped API. No `cc:`/`sp:` ref can survive any pass.
- [ ] **R5 — No regression.** All existing 0044 behavior holds: 7 refinements stay MET, full suite green, coverage ≥90/90, real `install cc --targets all` delivers every entity to every target as verified in 0044.


### Q&A



### Design

## Architectural context

This task changes the **rulesync output-root contract** (ADR-010). Read `docs/00_ADR.md` ADR-010 before implementing R1 — it records that `outputRoots` is mandatory and derived from `global ? homedir() : cwd()`. R1 does NOT abandon that default; it adds an **optional override** that, when absent, falls back to the existing derivation. **Add a dated ADR entry** noting the override (it widens, not replaces, the decision).

## R1 — Thread `outputRoot` into rulesync (the P1)

**Current shape** (`packages/core/src/rulesync.ts:25-70`):
```ts
export interface RulesyncOptions {
    global: boolean;
    dryRun: boolean;
    verbose: boolean;
}
// ...
outputRoots: [options.global ? homedir() : process.cwd()],
```

**Target shape** — add one optional field; derivation only changes when it is set:
```ts
export interface RulesyncOptions {
    global: boolean;
    dryRun: boolean;
    verbose: boolean;
    /** Override the root rulesync writes into. When omitted, falls back to the
     *  ADR-010 derivation: global → homedir(), project → process.cwd(). */
    outputRoot?: string;
}
// ...
const root = options.outputRoot ?? (options.global ? homedir() : process.cwd());
outputRoots: [root],
```

**Caller change** (`apps/cli/src/commands/install.ts`): inside `executeInstall`, the loop that calls `runRulesyncImpl(...)` must pass `outputRoot: options.outputRoot` in the options object. `options.outputRoot` already exists on `InstallOptions` (used for surrogate dispatch at line 169) — just forward it. This unifies the override so rulesync skills, surrogate copies, and Pi agents all honor the same root.

**Why optional, not required:** production install never sets `outputRoot` (global→`$HOME` is correct). Only tests and a hypothetical future `--output <dir>` flag set it. Making it required would churn every call site and the public API for no production benefit.

## R2 — Project-mode parent-dir creation (the P3 crash)

rulesync writes to `<root>/<relativeDir>/<skill>/SKILL.md`. In global mode `<root>=$HOME` and `~/.agents/skills` typically exists; in project mode `<root>=cwd` and `.agents/skills` may not. The crash is rulesync's `mkdir` of the leaf without `recursive`. Two options:

| Option | Approach | Trade-off |
|--------|----------|-----------|
| **A (recommended)** | Pre-create the per-target output parent dirs in `executeInstall` before calling rulesync (mkdir `recursive:true` for each mapped target's skills root). | Small, local, no rulesync change. Must know each target's relative skills dir — derive from `TARGET_TO_RULESYNC` + the observed rulesync layout (codex→`.agents/skills`, opencode→`.opencode/skills`, etc.). |
| B | Catch the ENOENT from `runRulesync`, mkdir the reported path, retry once. | Fragile (parses error path), retry logic. |

Recommend **A**. The set of relative skills dirs per target is fixed and was empirically captured in 0044's verification (cerebrum 2026-06-20 rulesync matrix). Encode it as a small `TARGET_SKILLS_RELDIR: Partial<Record<Target,string>>` map in `targets.ts` and mkdir `join(root, reldir)` for each rulesync target pre-generate.

## R3 — Inject FS predicate into `adaptSubagentToPi`

**Current** (`adapt-subagent.ts:96-193`): signature `adaptSubagentToPi(source, expectedName, pluginPrefix, pluginPath)`, calls `existsSync(join(pluginPath, 'skills', dirName))` internally.

**Target**: replace `pluginPath: string` with `skillExists: (bareName: string) => boolean`. The caller (`install.ts` Pi dispatch + any mapper use) supplies the default:
```ts
const skillExists = (bare: string) => existsSync(join(pluginRoot, 'skills', bare));
adaptSubagentToPi(source, expectedName, plugin, skillExists);
```
This removes `import { existsSync } from 'node:fs'` and `join` from the pipeline module, restoring its purity, and lets unit tests pass `() => true` / `() => false` to exercise both filter branches without a real plugin dir.

## R4 — Consolidate colon rewriting

`transformRulesyncMarkdown(root, target)` → `transformMarkdownDirectory(join(root,'skills'), target)` currently applies `translateSlashCommands` only (the mapper already did scoped rewriting). But the **legacy `rewriteColonRefs` still runs** in the per-target pass via `adapt-parity`'s documented wiring, and the deprecated fn lingers. Plan: (1) thread `pluginName` into `transformRulesyncMarkdown` so any residual per-target rewriting uses `rewriteSkillReferences(content, pluginName)`; (2) delete `rewrite-colons.ts` and its export from `index.ts`; (3) update `adapt-parity.test.ts` to import `rewriteSkillReferences` and assert scoped behavior. Confirm via `rg 'rewriteColonRefs' packages apps` returns zero before closing.

## Out of scope

- OpenClaw dedicated dispatch (0044 decided: reads shared `~/.agents/skills/`).
- Any change to the downgrade-to-skills design, the 7 refinements (all MET), or hook emission.


### Solution

File-by-file change map. All paths relative to repo root.

| File | Change | Req |
|------|--------|-----|
| `packages/core/src/rulesync.ts` | Add optional `outputRoot?: string` to `RulesyncOptions`; compute `const root = options.outputRoot ?? (options.global ? homedir() : process.cwd())`; use `outputRoots: [root]`. Update the JSDoc that currently says "defaults to process.cwd()". | R1 |
| `apps/cli/src/commands/install.ts` | In the `runRulesyncImpl(...)` call (~line 146), add `outputRoot: options.outputRoot` to the options object. No other logic change. | R1 |
| `packages/core/src/targets.ts` | Add `export const TARGET_SKILLS_RELDIR: Partial<Record<Target, string>>` mapping each rulesync target to its observed skills output subdir (codex→`.agents/skills`, pi→`.pi/agent/skills` [project] / shared in global, opencode→`.opencode/skills`, antigravity-cli/ide→`.agents/skills`). Source of truth: cerebrum 2026-06-20 rulesync matrix — VERIFY against a fresh `generate` run, do not assume. | R2 |
| `apps/cli/src/commands/install.ts` | Before the rulesync loop, for each rulesync target mkdir `join(root, TARGET_SKILLS_RELDIR[target])` with `recursive:true` (only in non-dry-run). `root` = the same resolved root as R1. | R2 |
| `packages/core/src/pipeline/adapt-subagent.ts` | Change `adaptSubagentToPi` 4th param from `pluginPath: string` to `skillExists: (bareName: string) => boolean`; replace the `existsSync(join(skillsDir, dirName))` call with `skillExists(dirName)`; remove `import { existsSync } from 'node:fs'` and unused `join`. | R3 |
| `apps/cli/src/commands/install.ts` | At the Pi dispatch (~line 243), build `const skillExists = (bare:string)=>existsSync(join(pluginRoot,'skills',bare))` and pass it instead of `pluginRoot`. | R3 |
| `packages/core/src/pipeline/rewrite-colons.ts` | DELETE the file. | R4 |
| `packages/core/src/index.ts` | Remove the `export * from './pipeline/rewrite-colons'` line. | R4 |
| `apps/cli/src/commands/install.ts` | `transformRulesyncMarkdown(root, target)` → add a `pluginName` param; thread it from `executeInstall` (it has `plugin`). Inside `transformMarkdownDirectory`, if any colon rewriting is still needed, use `rewriteSkillReferences(content, pluginName)`. | R4 |
| `packages/core/tests/pipeline/adapt-parity.test.ts` | Replace `rewriteColonRefs` imports/usage with `rewriteSkillReferences(content, 'rd3'|'wt'|'cc')`; keep the parity assertions but scope them. | R4 |

## Risk notes

- **R1 is the ADR-010 touch.** The optional-override design keeps the default derivation, so it widens the decision rather than reversing it — still add a dated ADR entry per AGENTS.md ("new cross-cutting choice → ADR entry").
- **R2 `TARGET_SKILLS_RELDIR` must be verified empirically**, not copied from memory — rulesync's global vs project subdir differs per target. Run `rulesync generate` per target into a temp root and read back the actual `<reldir>/<skill>/SKILL.md` path before hardcoding.
- **R4 ordering**: delete `rewrite-colons.ts` LAST, after confirming `rg 'rewriteColonRefs' apps packages` is empty — the mapper already uses the scoped fn, but the per-target pass and parity test still reference the legacy one.


### Plan

Ordered, each step independently verifiable. Run `bun run lint && bun run test` after each phase.

1. **R3 first (lowest risk, pure refactor).** Inject `skillExists` predicate into `adaptSubagentToPi`; update the single caller in `install.ts`; remove `node:fs` import from the pipeline module. Add 2 unit tests: predicate `()=>true` keeps body-discovered skill, `()=>false` drops it. Verify existing `adapt-subagent.test.ts` still green (update the call sites that pass `pluginPath`).
2. **R4 consolidation.** Thread `pluginName` into `transformRulesyncMarkdown`/`transformMarkdownDirectory`; switch any colon rewriting to `rewriteSkillReferences`. Update `adapt-parity.test.ts` to the scoped API. THEN delete `rewrite-colons.ts` + its `index.ts` export. Gate: `rg 'rewriteColonRefs' apps packages` returns nothing.
3. **R1 outputRoot threading.** Add optional `outputRoot` to `RulesyncOptions`; resolve `root` with `??` fallback; forward `options.outputRoot` from `executeInstall`. Add integration test: install with a custom `outputRoot`, assert `<outputRoot>/<reldir>/<skill>/SKILL.md` exists (use a mocked or real rulesync — prefer real for fidelity, into a temp dir). Add the dated ADR-010 amendment entry.
4. **R2 project-mode robustness.** Empirically capture `TARGET_SKILLS_RELDIR` via a temp `rulesync generate` per target; encode in `targets.ts`. Pre-create parents in `executeInstall`. Add regression test: project-mode install of a multi-entity fixture from a clean temp cwd completes without ENOENT and skills exist.
5. **R5 full regression.** `bun run lint && bun run test && bun run build`; coverage ≥90/90. Real smoke: `install cc --targets all` into an isolated temp `$HOME` (set `outputRoot`), assert all entities present for every target — and confirm NO writes leak to the real `$HOME` (this is the R1 acceptance proof).
6. **Update task 0044 cross-ref** — note in 0044 Review that the deferred P1/P3/P4 are addressed in 0045.

**Done when:** R1–R5 verdicts MET in Requirements, gate clean, git status shows only intentional changes, ADR-010 amendment added.


### Review

**Verdict: PASS** (SECU self-review + requirements traceability, 2026-06-21)

All five requirements MET. Implementation followed the Design/Plan ordering (R3→R4→R1→R2→R5).

**Requirements traceability:**

- **R1 — outputRoot threads into rulesync: MET.** `RulesyncOptions.outputRoot?: string` added (`packages/core/src/rulesync.ts:14`); `runRulesync` resolves `const root = options.outputRoot ?? (options.global ? homedir() : process.cwd())` (`rulesync.ts:64`); `executeInstall` forwards `options.outputRoot` into the `runRulesyncImpl` call (`apps/cli/src/commands/install.ts:158`). Unit tests assert the `outputRoots` arg (`rulesync.test.ts:69-72` fallback test `:106-111`). Integration test with real rulesync asserts skills land under the custom root and nothing leaks to cwd (`install.integration.test.ts:346-368`). Smoke test: 27 cc skills delivered to all 5 targets via `outputRoot`, zero `$HOME` leak.
- **R2 — project-mode robustness: MET.** `TARGET_SKILLS_RELDIR` empirically verified against rulesync 8.29.0 (2026-06-21) and encoded in `packages/core/src/targets.ts:38-44`. `executeInstall` pre-creates `join(rulesyncRoot, reldir)` with `recursive:true` before the rulesync loop (`install.ts:149-159`). Regression test reproduces the clean-cwd scenario and asserts no ENOENT (`install.integration.test.ts:370-389`).
- **R3 — injectable FS predicate: MET.** `adaptSubagentToPi` 4th param changed from `pluginPath: string` to `skillExists: (bareName: string) => boolean` (`adapt-subagent.ts:101`); `resolvePiSkills` uses the injected predicate (`adapt-subagent.ts:188`); `import { existsSync } from 'node:fs'` and `join` removed from the pipeline module. Caller in `install.ts:246` supplies the default FS implementation. Two new pure-predicate tests exercise both branches with zero filesystem (`adapt-subagent.test.ts:214-242`).
- **R4 — colon consolidation: MET.** `transformRulesyncMarkdown` and `transformMarkdownDirectory` thread `pluginName` and apply `rewriteSkillReferences(content, pluginName)` as a scoped safety net (`install.ts:392-419`). `adapt-parity.test.ts` migrated from `rewriteColonRefs` to `rewriteSkillReferences(content, PLUGIN)`. `rewrite-colons.ts`, `rewrite-colons.test.ts`, and the `index.ts` export deleted. Static guard: `rg 'rewriteColonRefs' apps packages` returns zero matches. No `cc:`/`sp:` ref can survive any pass — the scoped rewriter catches all refs for the installed plugin prefix.
- **R5 — no regression: MET.** `bun run lint` clean (Biome + typecheck). `bun run test`: 820 pass, 0 fail. Coverage: 99.71% funcs / 98.40% lines aggregate; every touched file ≥90% (`rulesync.ts` 100/100, `targets.ts` 100/100, `adapt-subagent.ts` 100%/97.39%, `install.ts` 94.44%/96.15%, `rewrite-references.ts` 100/100). `bun run build` succeeds. Real smoke: `executeInstall('cc', ['codex','pi','opencode','omp','hermes'], {outputRoot})` delivered 27 skills to all 5 targets + 5 Pi native agents, zero real-`$HOME` leak.

**SECU review:**

- **Security:** No new external input surfaces. `outputRoot` is an optional programmatic parameter (not a CLI flag); production install never sets it. No secrets, credentials, or untrusted-input handling added. `mkdirSync(..., {recursive:true})` is safe — creates only the intended target dirs.
- **Error handling:** `outputRoot ??` fallback preserves the ADR-010 derivation when omitted. `TARGET_SKILLS_RELDIR` is a `Partial<Record>` — targets without a mapping (claude/hermes/omp) are skipped by the `if (reldir)` guard. No silent swallow.
- **Compatibility:** The optional `outputRoot` field widens `RulesyncOptions` without breaking existing callers (all omit it → unchanged behavior). `prepareTargetRulesyncInput` signature gained a required `pluginName` param — all 6 callers (4 in install.ts, 2 in hook.ts) updated. `adaptSubagentToPi` signature changed — the single caller updated.
- **Untested branches:** `install.ts:256-262` (Claude target `runClaudeInstallImpl`) and `install.ts:401-402` (dry-run surrogate copy) are pre-existing uncovered branches, not introduced by this task.
- **Risk:** Low. All changes are surgical; no public API breakage (optional field + internal signature changes with all callers updated). ADR-010 amendment added per AGENTS.md doc-map rules.

**ADR compliance:** ADR-010 amendment added (`docs/00_ADR.md:144`) documenting the optional `outputRoot` override. Widens, does not replace, the original decision.


### Testing

**Test run: 2026-06-21T05:30:00Z**

- Command: `bun run lint && bun run test && bun run build`
- Scope: full suite (Biome + typecheck + 820 tests with coverage + build)
- Result: PASS. 820 tests pass, 0 fail. Coverage 99.71% funcs / 98.40% lines (≥90/90 gate). Build succeeds (3.40 MB bundle).
- Evidence:
  - Lint: Biome clean, typecheck clean (both workspaces exit 0)
  - Tests: 820 pass / 0 fail / 1967 expect() calls across 57 files [688ms]
  - Touched-file coverage: `rulesync.ts` 100/100, `targets.ts` 100/100, `adapt-subagent.ts` 100%/97.39%, `install.ts` 94.44%/96.15%, `rewrite-references.ts` 100/100, `adapt-parity.test.ts` exercises scoped rewriter
  - Build: `@gobing-ai/superskill build` → 767 modules bundled, exit 0
- Smoke (programmatic, 2026-06-21): `executeInstall('cc', ['codex','pi','opencode','omp','hermes'], { global:false, outputRoot:'/tmp/superskill-smoke/out' })` → 27 skills × 5 targets + 5 Pi native agents; zero `$HOME`/cwd leak (R1 acceptance proof).
- R2 regression: project-mode install from clean temp cwd with no pre-existing `.agents/skills/` completes without ENOENT (`install.integration.test.ts:370-389`).
- R3 unit: `adaptSubagentToPi` with `()=>true` keeps body skill, `()=>false` drops it — both branches testable with zero filesystem (`adapt-subagent.test.ts:214-242`).
- R4 static guard: `rg 'rewriteColonRefs' apps packages` returns zero matches after deletion.
- Next action: none — all gates clean.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- **Parent task:** `docs/tasks/0044_Adapt_slash_commands_and_subagents_as_Skills_2-dot-0_for_all_targets.md` — see its Review section (dev-verify 2026-06-20) for the original findings (P1 #1, P2 #2 [FIXED in 0044], P3 #3/#4, P4 #5).
- **Implementation commit reviewed:** `32b4ffe` feat(install): unify entity distribution.
- **ADR-010** (`docs/00_ADR.md`) — rulesync `outputRoots` mandatory derivation. R1 amends this; add a dated entry.
- **AGENTS.md** Documentation map — a change touching `outputRoots`/rulesync contract requires an ADR entry; a change to install command surface keeps `docs/04_DESIGN.md` in sync.
- **Empirical rulesync 8.29.0 matrix** — cerebrum `.wolf/cerebrum.md` 2026-06-20 entry (per-target skills/commands/subagents distribution + reldir paths). Verify `TARGET_SKILLS_RELDIR` against a fresh `generate` run, do not trust memory.
- **Source files:** `packages/core/src/rulesync.ts:64`, `apps/cli/src/commands/install.ts:127,146,169,243`, `packages/core/src/pipeline/adapt-subagent.ts:96-193`, `packages/core/src/pipeline/rewrite-colons.ts`, `packages/core/src/targets.ts`.
- **Old reference (parity):** `~/projects/cc-agents/scripts/command/subagents.sh:365-383` (skill-existence filter), `lib/common.sh:95-97` (PLUGIN_PREFIX rewrite).

