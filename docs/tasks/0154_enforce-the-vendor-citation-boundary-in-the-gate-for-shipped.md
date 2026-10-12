---
schema_version: 1
name: Enforce the vendor-citation boundary in the gate for shipped plugin content
status: todo
template: issue
created_at: 2026-10-12T21:45:49.636Z
updated_at: "2026-10-12T21:59:08.147Z"
feature_id: H2

priority: P2
ac_numbering: task-local
ac_altitude: task-local
estimate_hours: 2
---

## 0154. Enforce the vendor-citation boundary in the gate for shipped plugin content

### Background

Reproduced 2026-10-12 during the `--worktree` batch `runall-0152-0153-c898` (task corpus: 0152/0153). Inside the run worktree `bun run spur-check` FAILED with four `dead citation: vendors/rulesync/src/types/hooks.ts (file does not exist)` findings from `plugins/cc/skills/cc-hooks/SKILL.md`, while the identical commit passed in the main tree. `/vendors` is gitignored (`.gitignore:138`, `:153`), so **no clean checkout** — worktree, CI runner, or fresh clone — can satisfy the `skill-citations-resolve` post-check rule (`.spur/rules/quality/skill-citations.yaml` → `bun scripts/builder.ts check-skill-citations`). The batch lost two gate attempts and ~10 minutes to a red gate that presents as an environment defect rather than a content defect.

**Re-verified 2026-10-12 (refinement pass).** A throwaway `git worktree add --detach <tmp> HEAD` (HEAD = `668900f`, no `vendors/`), running **that tree's own** `bun scripts/builder.ts check-skill-citations`, printed the same four findings and exited 1; the same tree with the agent glob (`'plugins/*/agents/*.md'`) printed `plugins/cc/agents/expert-hook.md: dead citation: vendors/rulesync/src/types/hooks.ts` and exited 1. The main tree passes both only because `vendors/` happens to exist locally.

**Content fix is uncommitted.** The five stale citations (four in `plugins/cc/skills/cc-hooks/SKILL.md`, one in `plugins/cc/agents/expert-hook.md`) were replaced with shipped anchors (`packages/core/src/content/hook-events.ts:16`, `packages/core/src/quality/hook.ts:10`) in the working tree only — `git diff` shows both files modified, HEAD still carries the `vendors/` citations. This task ships that content fix together with the enforcement change; HEAD itself still fails on every clean checkout.

The class is not closed by the content fix: `checkCitations` treats `vendors/` as a resolvable root (`scripts/builder.ts:183`), so a vendor citation passes or fails depending on the machine; the checker's default scope is SKILL.md only (`scripts/builder.ts:443`, `plugins/*/skills/*/SKILL.md`), so the agent-document citation was never checked at all; and the repository's stated vendor boundary (task 0070 — no vendor citations under `plugins/cc` or `packages/`) is unenforced because `.spur/rules/boundary/sp-no-vendor-refs.yaml` is a **disabled shadow** whose include targets `plugins/sp/**`, absent from this repo.

### Requirements

- [ ] R1. Enforce the vendor-citation boundary deterministically: any `vendors/<path>` reference in a checked plugin document is reported as a boundary violation **without consulting the filesystem**, so the verdict is identical whether or not a local `vendors/` tree exists, and a clean checkout with no `vendors/` passes.
- [ ] R2. Widen the citation gate's default scope from `plugins/*/skills/*/SKILL.md` to also cover `plugins/*/agents/*.md`, so agent documents get the same dead-citation and vendor-boundary checks. Plugin `README.md` files stay out of scope (they use plugin-relative paths such as `scripts/anti-hallucination/ah_guard.ts`, which the repo-root resolver would misreport as dead).
- [ ] R3. Add regression coverage for both halves (clean content passes; a vendor reference fails with the tree present and absent; agent documents are scanned) and ship the working-tree cc-hooks / expert-hook content fix plus the rule-surface wording in the same commit.

### Acceptance Criteria

```gherkin
Scenario: AC1 — A clean checkout passes the citation gate (req: R1, R3)
Given a clean `git worktree` of the change's commit with no `vendors/` directory
When that tree's own `bun scripts/builder.ts check-skill-citations` runs with its default scope
Then it prints `OK: skill citations resolve and dimension claims match rubrics` and exits 0

Scenario: AC2 — A vendor reference fails regardless of the local tree (req: R1)
Given a plugin document body citing `vendors/rulesync/src/types/hooks.ts:49`
When `checkCitations` runs once with a resolver where that path exists and once where it does not
Then both runs return exactly one finding whose message starts with `vendor boundary:` and neither run calls the resolver for that path

Scenario: AC3 — Directory-style vendor references are caught too (req: R1)
Given a plugin document body mentioning `vendors/rulesync/src/features/skills/` (no file extension)
When `checkCitations` runs
Then it returns one `vendor boundary:` finding

Scenario: AC4 — Agent documents are in the default scope (req: R2)
Given the default scope of `check-skill-citations` with no glob argument
When the gate runs against a tree whose `plugins/cc/agents/expert-hook.md` carries a dead or vendor citation
Then the finding is reported for that agent file and the command exits 1

Scenario: AC5 — Regression fixtures and gate stay green (req: R3)
Given the implemented change
When `bun test scripts/tests/builder.test.ts` and `bun run spur-check` run in the main tree
Then all are green, and the new AC2/AC3 cases fail when `vendors/` is restored to `RESOLVABLE_PREFIXES` and the boundary scan is removed
```

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

#### Q&A entry — 2026-10-12T21:58:42.100Z

- **Q: Rule path (rg `vendors/` rule) or checker path?** A: **Checker path** (decided 2026-10-12 refinement). The original Design's claim that the checker path is "insufficient on its own" only holds if `vendors/` is merely dropped from `RESOLVABLE_PREFIXES`; an explicit boundary scan in `checkCitations` closes that gap. Checker path wins because it keeps one owner (`skill-citations-resolve` already runs on both trees), is unit-testable with the existing `fakeFs` seam (AC2 "tree present vs absent" is two resolver fixtures, not two filesystems), and avoids repurposing `sp-no-vendor-refs.yaml`, whose sole job is shadowing the global rule of the same id — re-enabling that id locally would change the shadow's meaning and couple this fix to the pending spur re-release noted in its header.
- **Q: Why not every `plugins/**/*.md`?** A: Verified `bun scripts/builder.ts check-skill-citations 'plugins/**/*.md'` reports `plugins/cc/README.md: dead citation: scripts/anti-hallucination/ah_guard.ts` — a valid plugin-relative path (`plugins/cc/scripts/anti-hallucination/ah_guard.ts` exists) that the repo-root resolver misreads. `commands/*.md` and `skills/**/references/*.md` currently pass; they are left out to keep the scope to the evidenced defect (agent docs) — add them when a stale citation is found there.
- **Q: Bun `Glob` brace form?** A: `new Glob('plugins/*/{skills/*/SKILL.md,agents/*.md}')` matches 0 files under Bun 1.3.14 (verified); use a list of two globs instead.
- **Q: Does `docs/04_DESIGN.md` need an update?** A: No. 04 owns the product CLI surface and does not document repo gate rules; `check-skill-citations` is owned by ADR `docs/00_ADR.md:243`, whose subcommand list is unchanged. The owning surfaces are the rule YAML description and `scripts/builder.ts`'s usage header.
- **Out of scope:** whether the `sp-no-vendor-refs.yaml` shadow can now be deleted (installed `spur` is 0.4.2, newer than the 0.3.1 its header names) — separate cleanup; only its stale "enforced by the absorb-don't-cite grep" sentence is updated here.

### Design

**Owner: `scripts/builder.ts` citation checker** (see Q&A for the rule-path rejection).

1. `scripts/builder.ts:183` — remove `'vendors/'` from `RESOLVABLE_PREFIXES`.
2. Add a reference-only scan in `checkCitations` (`scripts/builder.ts:205`) before the resolvable loop:
   ```ts
   /** Gitignored reference-only tree (ADR-004): never shipped, so never citable from plugin content. */
   const VENDOR_REF_RE = /\bvendors\/[\w./-]*/g;
   ...
   for (const match of body.matchAll(VENDOR_REF_RE)) {
       findings.push({ file, message: `vendor boundary: ${match[0]} is reference-only (gitignored, not shipped); cite a shipped path or absorb the content` });
   }
   ```
   Fixed message, no `fs` call → identical with or without a local `vendors/` (R1). One finding per occurrence, matching the existing per-occurrence dead-citation behavior. `\b` before `vendors` deliberately also matches `plugins/foo/vendors/x` — still a vendor path in shipped content.
3. `checkSkillCitations(skillGlob)` → accept `string[]`; the `check-skill-citations` case (`scripts/builder.ts:443`) defaults to `['plugins/*/skills/*/SKILL.md', 'plugins/*/agents/*.md']` and still accepts one explicit glob arg. `checkDimensionDrift` is a no-op for agents (`skillName` = `agents`, not in `SKILL_TO_RUBRIC`). Keep the existing `/vendors/` path filter on scanned files.
4. `.spur/rules/quality/skill-citations.yaml` — description: "Plugin SKILL.md and agents/*.md code citations must resolve… and must not reference the reference-only `vendors/` tree"; `include:` add `plugins/*/agents/*.md`.
5. `.spur/rules/boundary/sp-no-vendor-refs.yaml` — header line "superskill's own vendor boundary is enforced by the absorb-don't-cite grep in task 0070" → "…is enforced by `skill-citations-resolve` (`scripts/builder.ts` `checkCitations`, task 0154)". Rule stays disabled.
6. Usage header (`scripts/builder.ts:8`) — `check-skill-citations [glob]  resolve skill/agent citations + vendor boundary + drift`.

**Do not** weaken the existence check for shipped roots (`packages/`, `apps/`, `plugins/`, `tooling/`, `scripts/`, `docs/`) — it caught this defect and `scripts/tests/builder.test.ts:59` pins it.

**Rejected:** materializing `/vendors` in CI/worktrees (2.9 GB reference-only checkout; makes the gate depend on machine state — the defect itself). **Rejected:** rg rule in `.spur/rules/boundary/` (see Q&A).

**Verification shaped to the defect:** the decisive probe is a clean `git worktree` (no `vendors/`) using **that tree's own** script — the checker anchors to `import.meta.dirname/..` (`scripts/builder.ts:18`), so a main-tree run can never reproduce it. Because the worktree is cut from a commit, the probe runs after the change is committed (or against a worktree into which the changed files are copied).

### Plan

- [ ] R3: Write the failing tests first in `scripts/tests/builder.test.ts` (`describe('checkCitations')`): (a) `vendors/rulesync/src/types/hooks.ts:49` with `fakeFs({ 'vendors/rulesync/src/types/hooks.ts': 400 })` → one `vendor boundary:` finding; (b) same body with `fakeFs({})` → same single finding (not a `dead citation`); (c) `vendors/rulesync/src/features/skills/` → one finding; (d) body with only shipped anchors (`packages/core/src/quality/hook.ts:10`) present → zero findings. Run `bun test scripts/tests/builder.test.ts` and confirm (a)–(c) fail.
- [ ] R1: Implement Design steps 1–2 in `scripts/builder.ts`; rerun the focused test — all green, existing `:59` dead-path case unchanged.
- [ ] R2: Implement Design step 3 (glob list default). Probe: `bun scripts/builder.ts check-skill-citations` in the main tree → `OK`; temporarily revert `plugins/cc/agents/expert-hook.md` to HEAD (`git stash push -- plugins/cc/agents/expert-hook.md`, then `git stash pop`) → expect a `vendor boundary:` finding for the agent file and exit 1.
- [ ] R3: Design steps 4–6 (rule YAML description/include, shadow comment sentence, usage header).
- [ ] R1/AC1: Commit the change with the uncommitted `plugins/cc/skills/cc-hooks/SKILL.md` + `plugins/cc/agents/expert-hook.md` content fix, then `git worktree add --detach <scratch>/wt HEAD` and run `bun scripts/builder.ts check-skill-citations` inside it → `OK`, exit 0; remove the worktree. Record the HEAD~-equivalent failing run already captured in Background.
- [ ] Gate: `bun run lint`, `bun test scripts/tests/builder.test.ts`, `bun run spur-check`; `git status` shows only intended files.

### Root Cause

Shipped plugin content cited files under the gitignored `/vendors` reference tree (`plugins/cc/skills/cc-hooks/SKILL.md`, four citations; `plugins/cc/agents/expert-hook.md`, one), while the post-check rule `skill-citations-resolve` (`.spur/rules/quality/skill-citations.yaml`, evaluator `bun scripts/builder.ts check-skill-citations`) requires cited files under `RESOLVABLE_PREFIXES` to exist — and that list includes `vendors/` (`scripts/builder.ts:183`). The rule therefore passes on a machine that carries the reference checkout and fails on every clean one.

Two gaps let it ship: (1) the checker's default scope is `plugins/*/skills/*/SKILL.md` only (`scripts/builder.ts:443`; the rule YAML's `include:` does not change what the exit-code command scans), so agent documents were never checked; (2) the vendor boundary lived only in prose (task 0070) because its rule `.spur/rules/boundary/sp-no-vendor-refs.yaml` is `enabled: false` with an include of `plugins/sp/**`, a directory absent from this repo.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: regression command(s), outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- `.spur/run/worktree-runall-0152-0153-c898-batch-report.md` § Driver findings **D1** — the batch-level reproduction and mitigation.
- `scripts/builder.ts:18` — repository-root anchor; `scripts/builder.ts:183` — `RESOLVABLE_PREFIXES` includes `vendors/`; `scripts/builder.ts:205` — `checkCitations`; `scripts/builder.ts:279` — `checkSkillCitations`; `scripts/builder.ts:443` — default SKILL.md-only glob.
- `scripts/tests/builder.test.ts:59` — the pinned cc-hooks dead-path regression case; `fakeFs` seam at `scripts/tests/builder.test.ts:51`.
- `.spur/rules/quality/skill-citations.yaml` — the post-check rule (owner of the boundary after this task); `.spur/rules/boundary/sp-no-vendor-refs.yaml` — the disabled shadow of the global `sp-no-vendor-refs` rule (stays disabled).
- `docs/00_ADR.md:58` (ADR-004 vendors reference-only), `docs/00_ADR.md:243` (builder.ts subcommand ownership).
- `docs/tasks/0070_Enhance_cc_meta-plugin_with_skill-engineering_theory_rubrics_invocation_axis_pruning_dogfood.md`, `docs/tasks/0071_fix-0070-dogfood-findings-ac-boundary-wording-spur-rule-shad.md` — the boundary's origin and the rule-shadow history.
- `.gitignore:138`, `.gitignore:153` — `/vendors` is ignored by design.
- Uncommitted content fix: `plugins/cc/skills/cc-hooks/SKILL.md`, `plugins/cc/agents/expert-hook.md` (five citations replaced with shipped anchors).

### History
