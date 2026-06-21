---
name: Make cc agent-refine ready to replace rd3 agent-refine
description: Make cc agent-refine ready to replace rd3 agent-refine
status: Testing
created_at: 2026-06-21T21:05:31.607Z
updated_at: 2026-06-21T22:39:42.302Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-agents","refine","dogfood","migration","rd3-parity","dead-code"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0057. Make cc agent-refine ready to replace rd3 agent-refine

### Background

Dogfood pair-run /cc:agent-refine vs /rd3:agent-refine on plugins/cc/agents/expert-agent.md (global superskill 0.1.8). FIVE gaps. R1 [P1]: cc refine EXITS EARLY on validation errors — operations/refine.ts:323 returns 'Fix validation errors before refining.' BEFORE the fix loop, so the auto-apply path for missing required fields is UNREACHABLE. Verified: a missing-description agent prints '[ERROR] description: Missing required field' and exits WITHOUT inserting anything, even though classifyFix(error)->auto-apply (refine.ts:69) + generateAutoChange(missing)->insert default (refine.ts:106) exist. The headline 'fix issues in one step' never fixes the most common issue. R3 [MAJOR]: even if reached, missing-field fixes insert literal 'TODO'/'default' (refine.ts:86-93 getDefaultForField), and a TODO description then SCORES LOWER — the 'fix' degrades quality. R4 [MAJOR]: suggest/flag dims (description quality, skill-linkage, tool-selection) are only PRINTED, never fixed — verified: refine --auto on the 0.84 agent (tool-selection 0.70, skill-linkage 0.50) reports 'no change'. R2 [MAJOR]: no --dry-run (cc refine always mutates or prompts); rd3 has --dry-run/--best-practices/--migrate/--eval/--verbose/--output. R5 [MAJOR/doc-drift]: plugins/cc/commands/agent-refine.md:11 claims refine performs 'LLM content improvement' — cc refine does NO LLM/content work, only mechanical structural fixes; --save desc says 'to file' (it persists to the evaluation store). Engine is type-agnostic (operations/refine.ts shared by all types), so R1/R2/R3 fixes land once and benefit every type.


### Requirements

DECISIONS (operator-confirmed): R1/R3 = reorder so auto-apply STRUCTURAL fixes run BEFORE the validation-error early-return, and replace 'TODO'/'default' placeholders with schema-aware sensible defaults (or skip a fix that cannot improve the score — never degrade). R2 = add --dry-run (preview classified fixes + projected delta, no write). R5 = fix wrapper drift: strip the false 'LLM content improvement' claim, correct --save to 'evaluation store', add --dry-run to argument-hint. Apply R1/R2/R3 to the SHARED operations/refine.ts; register --dry-run on the agent refine subcommand (apps/cli/src/commands/agent.ts). Gates: bun run lint, bun run test (no skips, add regression: missing-field agent gets a real fix not TODO; --dry-run writes nothing; refine never lowers the score), bun run build, git clean. Do NOT flip /agent-refine alias until parity confirmed AND global binary carries the build (shared deployment gap).

R4 SCOPE (deferred, not a gap): R4 (content-quality suggest/flag dims — description/clarity/skill-linkage/tool-selection — are printed but never auto-fixed) is KNOWINGLY OUT OF SCOPE here. Fixing it requires LLM/content rewriting, which this task explicitly does not implement (see R5: refine stays mechanical/structural). Do NOT let a reviewer treat the unchanged 0.84-no-change behavior as a regression — it is the documented, intended boundary. Track content-improvement as a separate future task.

ENGINE-PATH NOTE (verified working tree): the refine engine to edit is apps/cli/src/operations/refine.ts (the real 16KB engine), NOT packages/core. The early-return is at refine.ts:323->330, before the fix loop (Step 6, ~:382).

DOCS SYNC (CLAUDE.md mandate): the new --dry-run flag touches the CLI command/flag surface — update docs/04_DESIGN.md (and docs/design/design-doc-phase2.md) in the SAME commit as the flag registration.

EXECUTION ORDER (Gap 5): run the refine SET (0057+0058+0059+0060) as ONE unit on one branch/PR — land the shared engine fix and wire ALL 5 subcommands + per-type wrinkles + all wrappers + all-type tests under a single gate, so the engine is proven against agent/command/magent/skill BEFORE merge (not agent-only). Cross-set order: run Add (0062-0065) FIRST, then this Refine set, then Evolve (0052-0055) — because the skill refine slice (0060) resolves directory-based <name>/SKILL.md, which only exists once 0065's scaffold-dir fix has shipped. Hooks (0056/0061/0066) are independent, run anytime.


### Q&A



### Design

Pair-run maturity assessment + fix plan for `/cc:agent-refine` → `/rd3:agent-refine`. Verified
2026-06-21 against global superskill **0.1.8** + the working tree. **Lead task of the refine set
(0057–0061)** — carries the SHARED, type-agnostic engine fix in `apps/cli/src/operations/refine.ts`
that 0058/0059/0060 inherit. Per-type tasks only register `--dry-run` on their CLI subcommand, fix
their wrapper, and add type-specific regression.

---

## Pair-run evidence (executed both, same target)

Target: `plugins/cc/agents/expert-agent.md` (0.84 PASS, Grade B; tool-selection 0.70, skill-linkage 0.50).

**cc** (`superskill agent refine <copy> --auto`):
```
Score: 0.84 (no change)
```
Two sub-0.7 dims, yet refine changes NOTHING — they are `flag`/`suggest`, never auto-fixed.

**cc on a missing-`description` agent** (`agent refine /tmp/broken.md --auto`):
```
[ERROR] description: Missing required field 'description'
Fix validation errors before refining.
```
→ exits early; inserts nothing. The auto-apply path for missing fields is dead code.

**rd3** (`bun <rd3-cache>/skills/cc-agents/scripts/refine.ts <target> --dry-run --best-practices --verbose`):
```
Dry run mode - no changes will be made
Refinement completed — No changes needed
```
rd3 exposes `--eval / --best-practices / --migrate / --dry-run / --verbose / --output`.

**Read:** cc refine does nothing on a healthy-but-imperfect agent, refuses the one fix it could make on a
broken agent, and has no preview mode. Not a like-for-like replacement.

---

## Root causes (verified against source)

### R1 [P1] — validation-error early-return makes auto-apply unreachable
`apps/cli/src/operations/refine.ts:323` — when `!validation.valid`, refine prints errors and RETURNS
before Step 4 (the fix loop). But `classifyFix(error)→'auto-apply'` (`refine.ts:69`) and
`generateAutoChange(missing)→insert field` (`refine.ts:106`) exist precisely to fix those errors. They
are never reached. The "fix in one step" promise fails on the most common defect (a missing field).

### R3 [MAJOR] — placeholder fixes degrade the score
`refine.ts:86` `getDefaultForField` returns literal `'TODO'`/`'default'`. Inserting `description: TODO`
makes the next evaluation score the description dimension LOWER — the fix is worse than the defect.

### R4 [MAJOR] — suggest/flag dims never improved
Content-quality (`description`, `clarity`, `conciseness`) → `suggest`; architecture (`skill-linkage`,
`tool-selection`, `model-fit`, `platform-coverage`) → `flag` (`refine.ts:73-79`). Both are only printed;
neither is fixed. On the sample, that's exactly why a 0.84 agent yields "no change".

### R2 [MAJOR] — no `--dry-run`
`RefineOptions` (`refine.ts:21`) has only `target/auto/save`. refine always mutates (auto) or prompts
(interactive). No preview. rd3 has `--dry-run`.

### R5 [MAJOR/doc-drift] — wrapper claims LLM content improvement that doesn't happen
`plugins/cc/commands/agent-refine.md:11`: "Run evaluation, apply deterministic fixes, then perform **LLM
content improvement** — all in one step." cc refine does NO LLM/content work. `--save` desc (`:24`) says
"Save evaluation results to file" — it persists to the evaluation store.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Engine | per-skill `skills/cc-agents/scripts/refine.ts` | shared `apps/cli/src/operations/refine.ts` (validate → evaluate → classify → fix → re-evaluate) |
| Flags | `--eval --best-practices --migrate --dry-run --verbose --output` | `--auto --save` only |
| Auto-fix | best-practice rewrites | mechanical: missing→TODO, type-coerce, trim whitespace |

Canonical files:
- Shared engine: `apps/cli/src/operations/refine.ts` (`refine`, `classifyFix`, `generateAutoChange`, `getDefaultForField`)
- Agent CLI subcommand: `apps/cli/src/commands/agent.ts` (`agentRefine`, `addAutoOption`)
- Wrapper: `plugins/cc/commands/agent-refine.md`

---

## Work Items

### A1 [P1] — Make structural auto-apply reachable + use real defaults (R1+R3)
**File:** `apps/cli/src/operations/refine.ts`.
**Fix:** before the `!validation.valid` early-return, run the auto-apply structural fixes for the
error-severity findings (the ones `classifyFix`→auto-apply, `generateAutoChange` can handle), then
re-validate. Only return early if errors REMAIN after auto-fix. Replace `getDefaultForField` placeholders
with schema-aware sensible defaults, OR skip a fix that cannot raise the score (never insert a value that
the evaluator will penalise — refine must be monotonic-or-neutral on score).
**Acceptance:** a missing-`description` agent → refine inserts a real (non-TODO) description (or skips
cleanly) and does NOT exit with "Fix validation errors"; post-score ≥ pre-score always.

### A2 [MAJOR] — Add `--dry-run` (R2)
**Files:** `refine.ts` (RefineOptions + a no-write preview path), `apps/cli/src/commands/agent.ts`.
**Fix:** `--dry-run` runs validate → evaluate → classify → generate changes, prints the classified fix
list + projected delta, and writes NOTHING (no backup needed). Register `--dry-run` on the subcommand.
**Acceptance:** `agent refine <target> --dry-run` shows what WOULD change, file is byte-identical after.

### A3 [MAJOR] — Fix wrapper drift (R5)
**File:** `plugins/cc/commands/agent-refine.md`.
**Fix:** remove the "LLM content improvement" claim (refine is mechanical/structural); correct `--save`
to "Persist the evaluation to the evaluation store"; add `--dry-run` to `argument-hint` + Arguments table.
**Acceptance:** wrapper describes only what refine actually does; `--save`/`--dry-run` documented correctly.

### A4 [MINOR] — Regression tests
Missing-field agent → real fix (not TODO), no early-return; `--dry-run` writes nothing; refine never
lowers the score (post ≥ pre); suggest/flag dims surfaced but not silently mutated.

---

## Policy decisions (operator-confirmed)
- **R1/R3:** reorder so structural auto-apply runs before the validation-error early-return; real defaults,
  never a score-lowering placeholder (refine is monotonic-or-neutral).
- **R2:** add `--dry-run` preview.
- **R5:** fix wrappers to match reality (no false LLM-content claim).
- **Shared engine:** A1/A2 land in `operations/refine.ts` ONCE; 0058/0059/0060 only register `--dry-run`
  + fix wrappers + add type-specific tests.
- **Deployment:** do NOT flip the `/agent-refine` alias until parity confirmed AND the global binary ships.

## Do-not-drift guardrails
- Refine must NEVER lower the score — skip a fix that can't improve rather than inserting a penalised value.
- `--dry-run` writes nothing and needs no backup.
- Keep the engine type-agnostic; no per-type branching beyond what `ContentType` carries.
- Do NOT claim LLM/content improvement unless it is actually implemented (it is out of scope here).


### Solution

Shared engine `apps/cli/src/operations/refine.ts` restructured so the single fix-apply phase
runs BEFORE any validation-error early-return (A1). `getDefaultForField` becomes schema-aware
and content-derived (A3/R3): `model`→`'inherit'`, `tools`→`[]` (unblocks validation, score-neutral),
`description` derived from the `name` frontmatter field (humanized) or first body H1, `name`
derived from body H1; unknown fields return `null` (skip) — never a `TODO`/`default` placeholder.
Missing-field insertion is always presence 0→1, so it is monotonic-or-neutral on every content
type's `completeness` dimension.

A `--dry-run` option (A2) is added to `RefineOptions`: validate + evaluate (baseline) + classify +
project the fixed content in-memory via the core content evaluator (`evaluate(type, content,
target)`), then print the classified fix list + projected delta. Writes nothing; needs no backup.

Monotonic guard: in `--auto`, if the post-score would fall below the pre-score, restore the backup
and report neutral (defensive — real defaults make this unreachable). Interactive mode warns on a
drop without overriding an explicit user accept.

`agent.ts` registers `--dry-run` via a new `addDryRunOption` helper and threads `dryRun` through
`agentRefine`→`refine`. `plugins/cc/commands/agent-refine.md` is corrected: drop the false
"LLM content improvement" claim, reword `--save` to "evaluation store", add `--dry-run` to the
argument-hint + Arguments table (A3/R5).

Tests (A4): the existing "exits early with zero scores on validation error" test is inverted — a
missing-`description` agent now gets a real fix (non-TODO), no early-return, post ≥ pre. New tests:
`--dry-run` leaves the file byte-identical; `getDefaultForField` skips unknown fields; refine never
lowers the score.

### Plan

Lead task of the refine set. Carries the shared-engine fix; 0058-0060 inherit it. Confirmed decisions:
R1/R3 reorder + real defaults (monotonic-or-neutral); R2 --dry-run; R5 honest wrappers.

### Phase 1 — Shared engine (operations/refine.ts)
1. **A1 (R1+R3):** run auto-apply structural fixes for error-severity findings BEFORE the
   `!validation.valid` early-return; re-validate; only exit early if errors remain. Replace
   TODO/default placeholders with schema-aware defaults or skip fixes that can't raise the score.
2. **A2 (R2):** add `--dry-run` to RefineOptions + a no-write preview path (classify + projected delta,
   no backup, no write).

### Phase 2 — Agent surface
3. Register `--dry-run` on `apps/cli/src/commands/agent.ts` (`agentRefine`).
4. **A3 (R5):** fix `plugins/cc/commands/agent-refine.md` — drop LLM-content claim, fix --save, add --dry-run.

### Phase 3 — Tests
5. **A4:** missing-field → real fix not TODO + no early-return; --dry-run writes nothing; post-score ≥ pre.

### Verification gate
- lint/test/build clean; git clean. Functional: missing-description agent refines (real fix, no error
  exit); `--dry-run` leaves file byte-identical; refine never lowers score.
- Atomic commits: `fix(refine): apply structural fixes before validation-error exit`,
  `feat(refine): add --dry-run`, `fix(cc-commands): align agent-refine wrapper to real behavior`.

### Do-not-drift
Shared fix lands once; per-type tasks consume it. Refine monotonic-or-neutral. --dry-run no write.
Coordinate alias flip + deployment with 0058-0060.


### Review

_2026-06-21_

**Status:** 1 finding (addressed inline)
**Scope:** `apps/cli/src/operations/refine.ts`, `apps/cli/src/commands/agent.ts`, `apps/cli/src/commands/helpers.ts`, `plugins/cc/commands/agent-refine.md`
**Mode:** verify (inline, channel=current)
**Gate:** `bun run lint` pass · `bun run test` 959 pass / 0 fail · `bun run build` pass

#### SECU analysis

Security: no new attack surface. `--dry-run` writes nothing; inserted defaults route through `applyFrontmatterChange` (yaml `doc.set`), so values are escaped — no frontmatter/template injection. No secrets, no shell/eval, no `any`.

| # | Title | Dimension | Location | Recommendation | P |
|---|-------|-----------|----------|----------------|---|
| 1 | Monotonic-restore guard left stale `fixesApplied` records after rollback | Correctness | `operations/refine.ts:501` | Move rolled-back fixes to `fixesSkipped` with `applied:false`; clear `fixesApplied` | P3 — **FIXED** |

Finding #1 addressed in the same engine commit: the defensive restore branch now records reverted fixes honestly as skipped, so `RefineResult` never claims success for a rolled-back change (R12).

#### Requirements traceability

| Req | Text | Status | Evidence |
-----|------|--------|----------|
| R1 | Structural auto-apply reachable before validation-error exit | **MET** | `refine.ts` apply phase (Step 6) runs before the re-validate bail (Step 7); missing-description agent fixed in one step — smoke test 0.49→0.74 |
| R2 | `--dry-run` preview, no write | **MET** | `RefineOptions.dryRun` + `dryRunPreview()` in-memory projection; registered on `agent refine`; byte-identical test + smoke test |
| R3 | Real defaults, never TODO/placeholder; monotonic-or-neutral | **MET** | `getDefaultForField` schema-aware (`model`→`inherit`, `tools`→`[]`, `description`/`name` content-derived, unknown→null); monotonic guard restores backup on regression; post ≥ pre in all tests |
| R5 | Wrapper matches reality | **MET** | `agent-refine.md` LLM-content claim dropped, `--save`→"evaluation store", `--dry-run` added to hint + table |
| R4 | Content-quality suggest/flag dims | **OUT OF SCOPE** (documented) | Knowingly deferred — requires LLM content rewriting, explicitly excluded by R5's "refine stays mechanical/structural" |

**Verdict: PASS** — all in-scope requirements met; P3 finding fixed; gate green.

### Testing

- **Command:** `bun run lint && bun run test && bun run build` (full gate) + functional smoke tests
- **Scope:** `apps/cli/tests/operations/refine.test.ts` (52 tests); functional CLI runs against a missing-`description`/`model` agent
- **Result:** 2026-06-21T23:00:00Z — lint clean · 959 tests pass / 0 fail · build OK. `refine.ts` coverage 94.15% lines / 100% funcs (≥90% threshold).
- **Evidence:**
  - Unit: `fixes a missing-description skill instead of exiting early` — applies a real fix, no early-return, post ≥ pre.
  - Unit: `raises the score on a missing-field agent` — `postScore > preScore`, `delta > 0`, inserts `model: inherit` (not TODO).
  - Unit: `aborts when unfixable validation errors remain` — empty-frontmatter/heading-less skill → skips, aborts, post == pre.
  - Unit: `--dry-run` leaves the file byte-identical, no `.bak` residue, `fixesApplied` empty.
  - Unit: schema-aware defaults (`model`→`inherit`, `tools`→`[]`, `description`→humanized name/H1, unknown→null).
  - Smoke (built binary): `agent refine /tmp/broken-agent.md --dry-run` → projects 0.34→0.64, file byte-identical.
  - Smoke (source): `agent refine /tmp/broken-agent2.md --auto` → 0.49→0.74, inserts `description: Code Reviewer` + `model: inherit`.
- **Next action:** none — gate green.
### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


