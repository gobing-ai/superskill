---
name: Make cc agent-evaluate ready to replace rd3 agent-evaluate
description: Make cc agent-evaluate ready to replace rd3 agent-evaluate
status: Done
created_at: 2026-06-21T18:12:32.323Z
updated_at: 2026-06-21T18:26:38.180Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-agents","evaluate","dogfood","migration","rd3-parity"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0048. Make cc agent-evaluate ready to replace rd3 agent-evaluate

### Background

Dogfood pair-run: /cc:agent-evaluate (superskill agent evaluate, 5-dim ASE: completeness/role-clarity/tool-selection/skill-linkage/model-fit) vs /rd3:agent-evaluate (10-dim/100-pt weighted: Frontmatter/Description/Body/Tool-Restriction/Thin-Wrapper/Platform/Naming/Operational/Security/Instruction, with profile=thin-wrapper). On target plugins/cc/agents/expert-agent.md: cc=0.84 PASS/Grade B; rd3=94% Grade A. cc agent evaluator is FUNCTIONALLY HEALTHY (unlike command/magent/hook) — no schema mismatch. Remaining gaps are command-wrapper hygiene (D1 flag boundary, --save description) and parity polish, NOT correctness bugs. Agents are FILE-based (single .md), so the skill B1 directory-resolution fix does NOT apply.


### Requirements

Bring /cc:agent-evaluate to parity with rd3 for the agent type by reusing the shared evaluate.ts improvements already landed in task 0047 (verdict/grade/findings already present for agents since evaluate.ts is type-agnostic). Apply D1 (remove --json from command, keep on CLI) and fix --save description on plugins/cc/commands/agent-evaluate.md. Confirm verdict/grade/findings render for agent type. Gates: bun run lint, bun run test (no skips), bun run build, git clean. Do NOT flip the default /agent-evaluate alias until parity confirmed AND the global superskill binary carries the build (shared P1 deployment gap with 0047).


### Q&A



### Design

Pair-run maturity assessment + fix plan for `/cc:agent-evaluate` → `/rd3:agent-evaluate`. Verified on
2026-06-21 against the working tree. **The agent evaluator is the healthiest of the four** — it works
correctly; this task is parity polish, not bug-fixing.

---

## Pair-run evidence (executed both, same target)

Target: `plugins/cc/agents/expert-agent.md`

**cc** (`bun apps/cli/src/index.ts agent evaluate <target>`):
```
completeness    1.00  All required fields present
role-clarity    1.00  Clear role defined
tool-selection  0.70  2 tools selected
skill-linkage   0.50  Skill keyword found but no structured reference
model-fit       1.00  Model: inherit
AGGREGATE       0.84   Verdict: PASS  Grade: B
```

**rd3** (`bun <rd3-cache>/skills/cc-agents/scripts/evaluate.ts <target> --scope full`):
```
Grade: A (94%)   Score: 94/100   Status: PASS   Profile: thin-wrapper
Frontmatter 10/10 · Description 15/15 · Body 10/10 · Tool-Restriction 10/10 ·
Thin-Wrapper 15/15 · Platform 8/10 · Naming 5/5 · Operational 11/15 · Security 5/5 · Instruction 5/5
Recommendations: Add Platform Notes section; Add concrete examples
```

**Read:** both PASS. cc 0.84/B vs rd3 94%/A — different scales, both healthy. No FAIL, no schema
mismatch (contrast command/magent/hook tasks 0049/0050/0051 which FAIL on cc). The agent evaluator is
production-usable today.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Engine | `skills/cc-agents/scripts/evaluate.ts` (per-skill) | `superskill agent evaluate` → `packages/core/src/quality/agent.ts` |
| Dims | 10 weighted /100 + profile (thin-wrapper/full) | 5 ASE: completeness, role-clarity, tool-selection, skill-linkage, model-fit |
| Rubric | config in evaluation.config.ts | `packages/core/src/rubrics/agent.yaml` (weights: completeness .20, role-clarity .25, tool-selection .20, skill-linkage .20, model-fit .15) |
| Input | file `.md` | file `.md` (agents are NOT directory-based — B1 dir fix N/A) |

Canonical files:
- Scorer: `packages/core/src/quality/agent.ts`
- Rubric: `packages/core/src/rubrics/agent.yaml`
- Registry: `packages/core/src/quality/types.ts` (`DIMENSION_REGISTRY.agent`, `REQUIRED_FIELDS.agent = ['name','description','model','tools']`)
- CLI op (shared): `apps/cli/src/operations/evaluate.ts` (verdict/grade/findings already landed via task 0047 — type-agnostic)
- Command wrapper: `plugins/cc/commands/agent-evaluate.md`

**Key inheritance from 0047:** `evaluate.ts` is type-agnostic. The E5 enrichment (verdict/grade/findings),
the P2#3 baseline-consistency helper, the B3 rubric-weighted default, and `--history` all already apply
to `agent` because they live in the shared op. Confirmed: cc agent run already prints `Verdict: PASS  Grade: B`.
So most of the heavy lifting is DONE — this task is mostly command-wrapper hygiene + verifying dimension findings.

---

## Work Items

### A1 [MAJOR] — Command wrapper: apply D1 flag boundary + fix --save description

**File:** `plugins/cc/commands/agent-evaluate.md` (verified current state):
- `argument-hint` (line 3): `"<agent-path> [--json] [--save] [--target <platform>]"`
- `--json` (line 24): present — REMOVE per D1 (JSON is a CLI/machine concern; the slash command's consumer
  is Claude rendering prose).
- `--save` (line 25): `"Save evaluation results to file"` — WRONG; persists to SQLite store. Fix to
  "Persist the evaluation to the evaluation store (enables evolve trend analysis)".
- `agent-path | Path to the agent .md file` (line 23): CORRECT — agents are file-based, keep file wording
  (do NOT change to "directory" — that's a skill-only convention).

**Fix:** mirror the corrected `plugins/cc/commands/skill-evaluate.md` from task 0047, but keep the
file-based arg wording. Remove `--json` row; fix `--save`; sync `argument-hint`; keep `--target`.

**Acceptance:** wrapper has no `--json` row; `--save` describes the store; arg says ".md file".

### A2 [MINOR] — Verify agent dimension findings/recommendations render

**Context:** task 0047 added `findings`/`recommendations` to the SKILL scorer (`quality/skill.ts`). The
agent scorer (`quality/agent.ts`) may NOT yet emit them — only a one-line `note`. The shared formatter
prints findings only if dimensions provide them.

**Fix:** audit `packages/core/src/quality/agent.ts`. For low-scoring dimensions (e.g. `tool-selection 0.70`,
`skill-linkage 0.50` on the sample), emit `findings` + `recommendations` like the skill scorer does
(rd3 emits "Add Platform Notes", "Add concrete examples"). Keep additive/optional (DimensionScore.findings?).

**Acceptance:** `agent evaluate` on a sub-perfect agent prints a Findings + Recommendations block, not just notes.

### A3 [MINOR] — Confirm rubric-weighted default aggregate for agent

**Context:** task 0047's B3 change wraps `loadRubric` in the default path. `agent.yaml` ships (5 dims,
weights sum to 1.0), so the agent default aggregate is already rubric-weighted via the shared op.

**Fix:** verify only — confirm `computeWeightedAggregate` uses `agent.yaml` weights (role-clarity .25
dominates). Add/confirm a test in `packages/core/tests/quality/` asserting the weighted agent aggregate.
No code change expected unless the weighting is wrong.

**Acceptance:** agent aggregate reflects rubric weights, not equal-weight mean; test covers it.

### A4 [ENHANCEMENT] — Optional: thin-wrapper awareness parity

**Context:** rd3 scores a `profile: thin-wrapper` and rewards delegation-only agents. cc has no profile
concept. This is a parity GAP but not a defect — cc's `skill-linkage` dimension partially covers it.

**Fix (optional, low priority):** consider whether `skill-linkage`/`role-clarity` adequately capture
thin-wrapper compliance, or whether a note should reward `Skill()`/delegation patterns. Decide: adopt or
explicitly document as an intentional simplification (cc's 5-dim model is deliberately leaner than rd3's 10).
Default: document as intentional, no code change.

**Acceptance:** decision recorded; if adopted, skill-linkage rewards delegation patterns.

---

## Policy decisions (inherited from 0047, apply identically)

- **D1:** `--json` CLI-only; remove from slash command. `--save` stays on command (store persistence).
- **D2:** rubric stays centralized in `packages/core/src/rubrics/agent.yaml`; do not move to skill references.
- **D3:** enrich the shared formatter/scorer in code; no template engine.
- **Shared P1 (deployment):** the global `superskill` is stale (0.1.7); `/cc:agent-evaluate` calls it.
  Same release/relink action as 0047 — do NOT flip the default alias until the binary ships.

## Do-not-drift guardrails

- Do NOT apply the skill directory-resolution (B1) fix to agents — they are file-based; `agent evaluate <dir>`
  correctly returns "File not found".
- Do NOT add a `name`-less or schema-mismatched check — agent `REQUIRED_FIELDS` (`name,description,model,tools`)
  is CORRECT for the agent format (verified: expert-agent.md scores completeness 1.00).
- Keep `QualityReport`/`DimensionScore` changes additive.
- Do NOT reintroduce per-skill scripts or a 10-dim model.


### Solution

#### A1 — Command wrapper alignment (D1 flag boundary)
Removed `--json` from `plugins/cc/commands/agent-evaluate.md` (argument-hint, Arguments table, examples). Fixed `--save` description to "Persist the evaluation to the evaluation store (enables evolve trend analysis)", matching `skill-evaluate.md` from task 0047. Kept file-based arg wording ("agent .md file") since agents are file-based.

#### A2 — Dimension findings/recommendations
Added `findings` and `recommendations` arrays to all 5 dimension scorers in `packages/core/src/quality/agent.ts`:
- `scoreCompleteness`: emits findings when required fields are missing
- `scoreRoleClarity`: emits findings when role is vague/generic/absent, with specific recs per severity
- `scoreToolSelection`: emits findings when tool count &lt; 3, with recs
- `scoreSkillLinkage`: emits findings for weak/missing structured skill refs
- `scoreModelFit`: emits findings for ambiguous/missing model field

The shared formatter in `evaluate.ts:366-385` already renders `Findings:` and `Recommendations:` blocks — no formatter changes needed.

#### A3 — Weighted aggregate test
Added 3 test cases to `packages/core/tests/quality/rubric.test.ts`:
1. Agent rubric weights produce different aggregate from equal-weight mean (0.875 vs 0.90 when role-clarity=0.5)
2. Role-clarity weight (0.25) is the dominant dimension
3. All-1.0 scores yield 1.0 aggregate for every content type

#### A4 — Thin-wrapper awareness
Documented as intentional simplification: cc&apos;s 5-dim model is deliberately leaner than rd3&apos;s 10-dim model. The `skill-linkage` dimension partially captures thin-wrapper compliance; full profile concept is deferred.

#### Verification
- `bun run lint` — clean
- `bun run test` — 921 pass, 0 fail
- `bun run build` — success
- Smoke test: `agent evaluate plugins/cc/agents/expert-agent.md` → aggregate 0.84, PASS, Grade B, Findings + Recommendations rendered
- Shared P1 deployment gap: alias flip deferred until global binary ships


### Plan

Agent evaluator is already healthy; this is parity polish. No directory-resolution work (file-based type).

### Phase 1 — Parity polish
1. **A1 command wrapper** (`plugins/cc/commands/agent-evaluate.md`): remove `--json` row (D1); fix `--save`
   description to "evaluation store"; sync `argument-hint`; keep ".md file" arg + `--target`.
2. **A2 dimension findings** (`packages/core/src/quality/agent.ts`): emit `findings`/`recommendations`
   for sub-perfect dimensions (tool-selection, skill-linkage, model-fit, role-clarity). Additive/optional.
3. **A3 weighted aggregate verify** (`packages/core/tests/quality/`): confirm/add test that agent default
   aggregate uses `agent.yaml` weights (role-clarity .25 dominant). Likely no source change.

### Phase 2 — Optional parity
4. **A4 thin-wrapper awareness**: decide adopt-or-document. Default = document as intentional simplification.

### Verification gate
- `bun run lint` clean; `bun run test` pass (no skips); `bun run build` PASS; `git status` clean.
- Functional: `agent evaluate plugins/cc/agents/expert-agent.md` → PASS + Grade + Findings block.
- Atomic commits: `fix(cc-commands): align agent-evaluate wrapper flags`, `feat(quality): agent dimension findings`.

### Do-not-drift
- File-based type: no dir resolution. Agent `REQUIRED_FIELDS` is correct as-is. Additive type changes only.
- Shared deployment P1: do not flip alias until global binary ships (coordinate with 0047 release).


### Review

## Verify — 2026-06-21 (forced re-verify; status was Done)

**Verdict:** ✅ PASS
**Mode:** verify (Phase 7 SECU + Phase 8 traceability), `--focus all`, `--fix all`
**Channel:** current (dogfood rule — verifies code-verification stack)
**Gate:** `bun run lint` clean · `bun run test` 921 pass / 0 fail · `bun run build` OK · `git status` only intentional changes

### Counts
| P1 | P2 | P3 | P4 | Unmet | Partial |
|----|----|----|----|-------|---------|
| 0  | 0  | 0  | 0  | 0     | 0       |

### Phase 7 — SECU (diff: agent.ts, rubric.test.ts, agent-evaluate.md)
No findings. Pure scoring heuristics — no secrets, no injection surface, no auth/authz. Added `findings`/`recommendations` are additive optional fields gated on score thresholds; no swallowed errors, no `any`, no unsafe casts. `quality/agent.ts` at 100% function coverage.

### Phase 8 — Requirements traceability
| Item | Verdict | Evidence |
|------|---------|----------|
| A1 — D1 flag boundary + `--save` fix | MET | `plugins/cc/commands/agent-evaluate.md:3,24` — `--json` removed (hint/table/examples); `--save` → "Persist…to the evaluation store"; `.md file` wording preserved |
| A2 — dimension findings/recommendations | MET | `packages/core/src/quality/agent.ts:11-12,58-66,83-89,116-124,153-161` all 5 scorers emit; rendered live (smoke: 2 findings + 2 recs); formatter `apps/cli/src/operations/evaluate.ts:366-385` |
| A3 — rubric-weighted aggregate + test | MET | weighting wired at `apps/cli/src/operations/evaluate.ts:162-163` (`loadRubric` + `computeWeightedAggregate`); 3 regression tests `packages/core/tests/quality/rubric.test.ts:289-344` |
| A4 — thin-wrapper awareness | MET | Documented as intentional simplification (Solution §A4); default decision recorded, no code change — per acceptance |

**Scope drift:** none. Diff touches exactly the 3 named files; no untraced code.

### Deferred (out of scope for 0048 — not a finding)
Shared P1 deployment gap: global `superskill` binary is stale (0.1.7); `/cc:agent-evaluate` calls it. Do NOT flip the default `/agent-evaluate` alias until the binary ships with this build. Coordinated with 0047 release.


### Testing

## Testing — 2026-06-21

**Gate results (all pass):**
- `bun run lint` — clean (Biome 138 files, 0 fixes; turbo typecheck exit 0 for core + cli)
- `bun run test` — 921 pass / 0 fail / 0 skipped, 2319 expect() calls across 58 files
- `bun run build` — success (bundled 768 modules → index.js 3.41 MB)

**Coverage (changed file):** `packages/core/src/quality/agent.ts` — 100.00% function, 97.89% line.

**New regression tests:** `packages/core/tests/quality/rubric.test.ts` — `weighted aggregate` describe block (3 cases): rubric weights diverge from equal-weight mean (0.875 vs 0.90 when role-clarity=0.5); role-clarity weight (0.25) is dominant; all-1.0 scores yield 1.0 for every content type.

**Functional smoke** (`bun apps/cli/src/index.ts agent evaluate plugins/cc/agents/expert-agent.md`):
```
completeness 1.00 · role-clarity 1.00 · tool-selection 0.70 · skill-linkage 0.50 · model-fit 1.00
AGGREGATE 0.84  →  Verdict: PASS  Grade: B
Findings: [tool-selection] Only 2 tool(s) selected; [skill-linkage] Skill linkage is weak or missing
Recommendations: [tool-selection] Add more tools; [skill-linkage] Use structured skill references
```
Confirms A2 (Findings + Recommendations render) and A3 (rubric-weighted aggregate).


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


