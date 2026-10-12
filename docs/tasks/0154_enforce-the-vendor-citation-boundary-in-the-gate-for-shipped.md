---
schema_version: 1
name: Enforce the vendor-citation boundary in the gate for shipped plugin content
status: done
template: issue
created_at: 2026-10-12T21:45:49.636Z
updated_at: "2026-10-12T23:47:18.910Z"
feature_id: H2

priority: P2
ac_numbering: task-local
ac_altitude: task-local
estimate_hours: 2
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0154-verdict.json
---

## 0154. Enforce the vendor-citation boundary in the gate for shipped plugin content

### Background

Reproduced 2026-10-12 during the `--worktree` batch `runall-0152-0153-c898` (task corpus: 0152/0153). Inside the run worktree `bun run spur-check` FAILED with four `dead citation: vendors/rulesync/src/types/hooks.ts (file does not exist)` findings from `plugins/cc/skills/cc-hooks/SKILL.md`, while the identical commit passed in the main tree. `/vendors` is gitignored (`.gitignore:138`, `:153`), so **no clean checkout** — worktree, CI runner, or fresh clone — can satisfy the `skill-citations-resolve` post-check rule (`.spur/rules/quality/skill-citations.yaml` → `bun scripts/builder.ts check-skill-citations`). The batch lost two gate attempts and ~10 minutes to a red gate that presents as an environment defect rather than a content defect.

**Re-verified 2026-10-12 (refinement pass).** A throwaway `git worktree add --detach <tmp> HEAD` (HEAD = `668900f`, no `vendors/`), running **that tree's own** `bun scripts/builder.ts check-skill-citations`, printed the same four findings and exited 1; the same tree with the agent glob (`'plugins/*/agents/*.md'`) printed `plugins/cc/agents/expert-hook.md: dead citation: vendors/rulesync/src/types/hooks.ts` and exited 1. The main tree passes both only because `vendors/` happens to exist locally.

**Content fix landed.** The five stale citations (four in `plugins/cc/skills/cc-hooks/SKILL.md`, one in `plugins/cc/agents/expert-hook.md`) were replaced with shipped anchors (`packages/core/src/content/hook-events.ts:16`, `packages/core/src/quality/hook.ts:10`) in commit `3b255be`, an ancestor of this batch's base `e5625c1` — no clean checkout carries a `vendors/` citation any more. This task ships the enforcement change that keeps the class closed; the checker itself was the remaining hole.

The class is not closed by the content fix: `checkCitations` treated `vendors/` as a resolvable root (`scripts/builder.ts:188` after this change; `:183` before), so a vendor citation passed or failed depending on the machine; the checker's default scope was SKILL.md only (`scripts/builder.ts:470` after this change; `:443` before, `plugins/*/skills/*/SKILL.md`), so the agent-document citation was never checked at all; and the repository's stated vendor boundary (task 0070 — no vendor citations under `plugins/cc` or `packages/`) was unenforced because `.spur/rules/boundary/sp-no-vendor-refs.yaml` is a **disabled shadow** whose include targets `plugins/sp/**`, absent from this repo.

### Requirements

- [x] R1. Enforce the vendor-citation boundary deterministically: any `vendors/<path>` reference in a checked plugin document is reported as a boundary violation **without consulting the filesystem**, so the verdict is identical whether or not a local `vendors/` tree exists, and a clean checkout with no `vendors/` passes.
- [x] R2. Widen the citation gate's default scope from `plugins/*/skills/*/SKILL.md` to also cover `plugins/*/agents/*.md`, so agent documents get the same dead-citation and vendor-boundary checks. Plugin `README.md` files stay out of scope (they use plugin-relative paths such as `scripts/anti-hallucination/ah_guard.ts`, which the repo-root resolver would misreport as dead).
- [x] R3. Add regression coverage for both halves (clean content passes; a vendor reference fails with the tree present and absent; agent documents are scanned) and ship the working-tree cc-hooks / expert-hook content fix plus the rule-surface wording in the same commit.

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

1. `scripts/builder.ts:188` — remove `'vendors/'` from `RESOLVABLE_PREFIXES`.
2. Add a reference-only scan in `checkCitations` (`scripts/builder.ts:220`) before the resolvable loop:
   ```ts
   /** Gitignored reference-only tree (ADR-004): never shipped, so never citable from plugin content. */
   const VENDOR_REF_RE = /(?<![\w.-])vendors\/[\w./-]*/g;
   ...
   for (const match of body.matchAll(VENDOR_REF_RE)) {
       findings.push({ file, message: `vendor boundary: ${match[0]} is reference-only (gitignored, not shipped); cite a shipped path or absorb the content` });
   }
   ```
   Fixed message, no `fs` call → identical with or without a local `vendors/` (R1). One finding per occurrence, matching the existing per-occurrence dead-citation behavior. The leading `(?<![\w.-])` is a word/path boundary rather than `\b`: `\b` also sits between `-` and `v`, so a hyphen-adjacent lookalike (`multi-vendors/registry.ts`) fired a hard error, while the intended mid-path hit (`plugins/foo/vendors/x.ts`, preceded by `/`) still matches.
3. `checkSkillCitations(skillGlob)` → accept `string[]`; the `check-skill-citations` case (`scripts/builder.ts:470`) defaults to `['plugins/*/skills/*/SKILL.md', 'plugins/*/agents/*.md']` and still accepts one explicit glob arg. `checkDimensionDrift` is a no-op for agents (`skillName` = `agents`, not in `SKILL_TO_RUBRIC`). Keep the existing `/vendors/` path filter on scanned files.
4. `.spur/rules/quality/skill-citations.yaml` — description: "Plugin SKILL.md and agents/*.md code citations must resolve… and must not reference the reference-only `vendors/` tree"; `include:` add `plugins/*/agents/*.md`.
5. `.spur/rules/boundary/sp-no-vendor-refs.yaml` — header line "superskill's own vendor boundary is enforced by the absorb-don't-cite grep in task 0070" → "…is enforced by `skill-citations-resolve` (`scripts/builder.ts` `checkCitations`, task 0154)". Rule stays disabled.
6. Usage header (`scripts/builder.ts:8`) — `check-skill-citations [glob]  resolve skill/agent citations + vendor boundary + drift`.

**Do not** weaken the existence check for shipped roots (`packages/`, `apps/`, `plugins/`, `tooling/`, `scripts/`, `docs/`) — it caught this defect and `scripts/tests/builder.test.ts:59` pins it.

**Rejected:** materializing `/vendors` in CI/worktrees (2.9 GB reference-only checkout; makes the gate depend on machine state — the defect itself). **Rejected:** rg rule in `.spur/rules/boundary/` (see Q&A).

**Verification shaped to the defect:** the decisive probe is a clean `git worktree` (no `vendors/`) using **that tree's own** script — the checker anchors to `import.meta.dirname/..` (`scripts/builder.ts:18`), so a main-tree run can never reproduce it. Because the worktree is cut from a commit, the probe runs after the change is committed (or against a worktree into which the changed files are copied).

### Plan

- [x] R3: Write the failing tests first in `scripts/tests/builder.test.ts` (`describe('checkCitations')`): (a) `vendors/rulesync/src/types/hooks.ts:49` with `fakeFs({ 'vendors/rulesync/src/types/hooks.ts': 400 })` → one `vendor boundary:` finding; (b) same body with `fakeFs({})` → same single finding (not a `dead citation`); (c) `vendors/rulesync/src/features/skills/` → one finding; (d) body with only shipped anchors (`packages/core/src/quality/hook.ts:10`) present → zero findings. Run `bun test scripts/tests/builder.test.ts` and confirm (a)–(c) fail. — done: rows at `scripts/tests/builder.test.ts:102`, `:118`, `:126`; the AC5 falsification run (HEAD's checker restored) failed exactly those rows.
- [x] R1: Implement Design steps 1–2 in `scripts/builder.ts`; rerun the focused test — all green, existing `:59` dead-path case unchanged. — done: `scripts/builder.ts:188` (`RESOLVABLE_PREFIXES`), `:198`/`:220` (`VENDOR_REF_RE` + boundary scan); `bun test scripts/tests/builder.test.ts` → 67 pass / 0 fail.
- [x] R2: Implement Design step 3 (glob list default). Probe: `bun scripts/builder.ts check-skill-citations` in the main tree → `OK`; temporarily revert `plugins/cc/agents/expert-hook.md` to HEAD (`git stash push -- plugins/cc/agents/expert-hook.md`, then `git stash pop`) → expect a `vendor boundary:` finding for the agent file and exit 1. — done: `scripts/builder.ts:302`/`:315`/`:470`; the probe used an injected vendor citation in a scratch worktree (HEAD already carries the content fix, so the stash had nothing to revert) and printed the agent-file finding with exit 1, while the pre-0154 SKILL-only scope printed `OK` exit 0; see `scripts/tests/builder.test.ts:338`, `:587`.
- [x] R3: Design steps 4–6 (rule YAML description/include, shadow comment sentence, usage header). — done: `.spur/rules/quality/skill-citations.yaml:12`, `:26`; `.spur/rules/boundary/sp-no-vendor-refs.yaml:6`; `scripts/builder.ts:8`.
- [x] R1/AC1: Commit the change with the uncommitted `plugins/cc/skills/cc-hooks/SKILL.md` + `plugins/cc/agents/expert-hook.md` content fix, then `git worktree add --detach <scratch>/wt HEAD` and run `bun scripts/builder.ts check-skill-citations` inside it → `OK`, exit 0; remove the worktree. Record the HEAD~-equivalent failing run already captured in Background. — done: the content fix is already in commit `3b255be` (ancestor of base `e5625c1`); the detached-worktree probe over a vendor-free tree with the changed checker copied in printed `OK … exit 0`, and the pre-change checker in the same shape printed the vendor-boundary findings with exit 1 (Background; re-run recorded in `## Testing`).
- [x] Gate: `bun run lint`, `bun test scripts/tests/builder.test.ts`, `bun run spur-check`; `git status` shows only intended files. — done: the gate hop ran green on this revision (39 pre-check rules, the full suite passing, 3 post-check rules) — counts, digest and receipt are recorded in `## Testing`; `git status` shows only the four implementation files plus this task file.

### Root Cause

Shipped plugin content cited files under the gitignored `/vendors` reference tree (`plugins/cc/skills/cc-hooks/SKILL.md`, four citations; `plugins/cc/agents/expert-hook.md`, one), while the post-check rule `skill-citations-resolve` (`.spur/rules/quality/skill-citations.yaml`, evaluator `bun scripts/builder.ts check-skill-citations`) requires cited files under `RESOLVABLE_PREFIXES` to exist — and that list included `vendors/` (`scripts/builder.ts:188` after this change; `:183` before). The rule therefore passed on a machine that carries the reference checkout and failed on every clean one.

Two gaps let it ship: (1) the checker's default scope was `plugins/*/skills/*/SKILL.md` only (`scripts/builder.ts:470` after this change; `:443` before; the rule YAML's `include:` does not change what the exit-code command scans), so agent documents were never checked; (2) the vendor boundary lived only in prose (task 0070) because its rule `.spur/rules/boundary/sp-no-vendor-refs.yaml` is `enabled: false` with an include of `plugins/sp/**`, a directory absent from this repo.

### Solution

The vendor boundary moves into the citation checker (rejected without a filesystem probe) and the checker's default scope widens to agent documents; the rule surface and the usage header say so.

| File:line | Change |
| --- | --- |
| `scripts/builder.ts:188` | `RESOLVABLE_PREFIXES` no longer lists the gitignored `vendors/` root — a reference-only path is not a resolvable citation prefix |
| `scripts/builder.ts:154` | module seam comment now names the three documentation-drift classes (dead citations, rubric drift, vendor boundary) — removed the "two classes" self-contradiction |
| `scripts/builder.ts:198` | `VENDOR_REF_RE` — the leading lookbehind is a word/path boundary, so a hyphen-adjacent lookalike is not a vendor reference while a mid-path segment still is |
| `scripts/builder.ts:223` | `checkCitations` runs the boundary scan before the resolvable loop |
| `scripts/builder.ts:230` | the fixed `vendor boundary:` message per occurrence — no `fs` probe, so the verdict is identical with or without a local `vendors/` |
| `scripts/builder.ts:201` | `VENDOR_SEGMENT_RE` — non-global twin of `VENDOR_REF_RE` for a stateless per-path `.test()` |
| `scripts/builder.ts:235-237` | the resolvable loop skips a shipped-root path carrying a mid-path `vendors/` segment, so a reference already reported as a boundary violation is not also reported as a machine-dependent `dead citation` (verify-pass fix) |
| `scripts/builder.ts:307` | `checkSkillCitations` accepts one glob or a list of globs; the explicit single-glob argument keeps its exact behavior and the OK line prints the joined list |
| `scripts/builder.ts:315-322` | per-glob scan loop — `skillName` is derived per scanned file, and the `agents` key an agent document yields is unmapped in the rubric table, so agent documents get citations and the boundary but no rubric-drift check |
| `scripts/builder.ts:475` | default scope is the two-glob list `plugins/*/skills/*/SKILL.md` + `plugins/*/agents/*.md` (two globs, not one — Bun 1.3.14 brace form matches nothing) |
| `scripts/builder.ts:8` | usage header for `check-skill-citations` now reads `resolve skill/agent citations + vendor boundary + drift` |
| `scripts/tests/builder.test.ts:59` | `recordingFs` — resolver recording every `exists` probe, so a test can assert the vendor path is never consulted |
| `scripts/tests/builder.test.ts:102-114` | AC2: the same vendor body against a resolver with the file present and one without yields one identical `vendor boundary:` finding, never a `dead citation` |
| `scripts/tests/builder.test.ts:118-124` | AC3: an extension-less directory reference (`vendors/rulesync/src/features/skills/`) yields one boundary finding |
| `scripts/tests/builder.test.ts:126-131` | AC1 content shape: a body citing only shipped anchors yields zero findings |
| `scripts/tests/builder.test.ts:133-137` | AC2 residual-proof negative: the hyphen-adjacent `multi-vendors/registry.ts` lookalike yields zero findings (would fail under the old `\b`) |
| `scripts/tests/builder.test.ts:140-143` | AC2: a mid-path segment (`plugins/foo/vendors/x.ts`) still yields the boundary finding |
| `scripts/tests/builder.test.ts:145-151` | AC2 residual-proof: a mid-path vendor citation with a line (`plugins/foo/vendors/x.ts:12`) yields exactly one `vendor boundary:` finding and the resolver never probes it (verify-pass fix; failed with 2 findings before) |
| `scripts/tests/builder.test.ts:346-358` | AC4 integration: an agent document carrying a vendor citation is reported for that document and the gate exits 1 |
| `scripts/tests/builder.test.ts:595-603` | AC4 wiring: the no-argument default scans both the skill and the agent glob in the real tree |
| `.spur/rules/quality/skill-citations.yaml:12` | rule description now covers `agents/*.md` and the reference-only tree |
| `.spur/rules/quality/skill-citations.yaml:26` | scope: `plugins/*/agents/*.md` added to the include list, matching what the evaluator scans |
| `.spur/rules/boundary/sp-no-vendor-refs.yaml:6` | shadow header now names `skill-citations-resolve` / `checkCitations` (task 0154) as the boundary's owner; the rule stays `enabled: false` |
| `plugins/cc/agents/expert-hook.md:45` | the shipped anchor (`packages/core/src/content/hook-events.ts:16`) that replaced the vendor citation, committed as `3b255be` |
| `plugins/cc/skills/cc-hooks/SKILL.md:37` | the shipped anchor (`packages/core/src/quality/hook.ts:10`) that replaced the four vendor citations, committed as `3b255be` |

Unchanged by design: the existence check for shipped roots (`packages/`, `apps/`, `plugins/`, `tooling/`, `scripts/`, `docs/`) still fires, so dead shipped citations keep failing; the `/node_modules/` and `/vendors/` path filters on scanned files stay; plugin `README.md` and `commands/*.md` stay out of the default scope because their plugin-relative paths (`scripts/anti-hallucination/ah_guard.ts`) are misread by the repo-root resolver; `checkDimensionDrift` and its unit tests are untouched.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)
- Confidence: HIGH

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `scripts/builder.ts:188` drops vendors/ from resolvable prefixes; `scripts/builder.ts:198` VENDOR_REF_RE; boundary scan runs before any resolver call at `scripts/builder.ts:227`; mid-path vendor segments are skipped by the resolvable loop at `scripts/builder.ts:237` (twin regex `scripts/builder.ts:201`). Clean worktree of HEAD 7a9db45 with no vendors/ dir: that tree's own check-skill-citations printed OK and exited 0. |
| R2 | MET | `scripts/builder.ts:475` default scope lists both the skill and agent globs; clean-worktree probe with a vendor citation appended to plugins/cc/agents/expert-hook.md reported the vendor boundary finding for that agent file. Default-scope test at `scripts/tests/builder.test.ts:595` passes. |
| R3 | MET | Regressions at `scripts/tests/builder.test.ts:102`, `scripts/tests/builder.test.ts:118`, `scripts/tests/builder.test.ts:126`, `scripts/tests/builder.test.ts:133`, `scripts/tests/builder.test.ts:140`, `scripts/tests/builder.test.ts:145`, `scripts/tests/builder.test.ts:346`; rule surface at `.spur/rules/quality/skill-citations.yaml:26`. Fresh gate this run on the fixed tree (receipt @superskill `.spur/run/verifyall-20261012/status2` line 1): lint+typecheck exit 0; bun test 2586 pass / 0 fail, 99.60% funcs / 98.86% lines; build exit 0; spur-check 39 pre-check + 3 post-check rules pass. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 — A clean checkout passes the citation gate (req: R1, R3) | MET | command | git worktree add --detach of HEAD 7a9db45 (ls vendors: No such file); that tree's own bun scripts/builder.ts check-skill-citations printed OK for both globs, exit 0. Worktree removed afterwards. Working-tree check-skill-citations on the fixed tree also prints OK. |
| AC2 — A vendor reference fails regardless of the local tree (req: R1) | MET | test | `scripts/tests/builder.test.ts:102` present/absent resolver pair each yield one vendor boundary finding with no resolver probe; `scripts/tests/builder.test.ts:145` a mid-path vendor citation yields exactly one boundary finding and no dead-citation duplicate (failed with 2 findings before the fix); fresh suite. |
| AC3 — Directory-style vendor references are caught too (req: R1) | MET | test | `scripts/tests/builder.test.ts:118` extension-less directory reference yields one vendor boundary finding; fresh suite. |
| AC4 — Agent documents are in the default scope (req: R2) | MET | command | Clean-worktree probe, no glob arg, vendor citation appended to the expert-hook agent doc: finding reported for plugins/cc/agents/expert-hook.md, 1 finding total. Exit 1 asserted by `scripts/tests/builder.test.ts:346`. |
| AC5 — Regression fixtures and gate stay green (req: R3) | MET | command | Fresh full suite 2586 pass / 0 fail and bun run spur-check exit 0 (39 pre + 3 post rules incl. skill-citations-resolve); receipt @superskill `.spur/run/verifyall-20261012/status2` line 4. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Review Report — 0154 (verifyall re-review 2026-10-12 — supersedes prior text in this section)

**Scope:** 0154 implementation (`f28eed9`, merged `d3f9b3d`) plus the verify-pass delta in the working tree: `scripts/builder.ts:201`, `scripts/builder.ts:235-237`, `scripts/tests/builder.test.ts:145-151`.
**Dimensions:** functional, security, efficiency, correctness, usability, architecture
**Verdict:** PASS
**Confidence:** HIGH

##### Findings (ranked)

| # | Priority | Dimension | Finding | Location | Disposition |
|---|----------|-----------|---------|----------|-------------|
| 1 | P4 (advisory) | correctness | A shipped-root citation with a mid-path `vendors/` segment (`plugins/foo/vendors/x.ts:12`) produced both a `vendor boundary:` finding and a machine-dependent `dead citation:` finding. The resolvable loop now skips vendor-segment paths, and a regression asserts exactly one boundary finding with no resolver probe; that regression failed (2 findings) before the fix. | `scripts/builder.ts:237` | FIXED (verify pass, working tree) |
| 2 | P4 (advisory) | documentation | The prior review's "stale `## Testing` block" row is resolved: `## Testing` was re-recorded from a fresh verdict artifact this run, citing current anchors and the fresh gate. | task `## Testing` | RESOLVED |
| 3 | P4 (advisory) | architecture | The boundary is enforced per scanned scope, not repo-wide: plugin `README.md`, `commands/*.md` and skill `references/*.md` stay unscanned, per R2 and the Q&A scope decision. | `scripts/builder.ts:475` | ACCEPTED |

##### Functional Traceability

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | MET | `scripts/builder.ts:188` (no `vendors/` prefix), `scripts/builder.ts:198` (`VENDOR_REF_RE`), boundary scan at `scripts/builder.ts:227` runs before any resolver call; clean worktree of `7a9db45` without `vendors/` → checker OK, exit 0 |
| R2 | MET | `scripts/builder.ts:475` two-glob default; clean-worktree probe reported a vendor citation in `plugins/cc/agents/expert-hook.md`; `scripts/tests/builder.test.ts:595` |
| R3 | MET | `scripts/tests/builder.test.ts:102`, `:118`, `:126`, `:133`, `:140`, `:145`, `:346`; rule surface `.spur/rules/quality/skill-citations.yaml:26` |

##### SECUA

- **Security:** content-only, with no new I/O or execution, and the verdict cannot depend on local machine state.
- **Efficiency:** the fix adds one anchored non-global regex test per citation and no I/O.
- **Correctness:** `VENDOR_SEGMENT_RE` is non-global, so `.test()` keeps no `lastIndex` state. Its lookbehind matches `VENDOR_REF_RE`, so the two regexes agree on what counts as a vendor reference (the hyphen-adjacent `multi-vendors/` stays unflagged and unskipped). Existence checks for shipped roots are otherwise unchanged.
- **Usability:** each violation now gets one actionable message instead of two.
- **Architecture:** a single owner (`checkCitations`). The skip sits next to the boundary scan it depends on, with no new module.

**Next:** re-verify 0154 against the fresh gate on this tree.

### References

- `.spur/run/worktree-runall-0152-0153-c898-batch-report.md` § Driver findings **D1** — the batch-level reproduction and mitigation.
- `scripts/builder.ts:18` — repository-root anchor; `scripts/builder.ts:188` — `RESOLVABLE_PREFIXES` after this task; `scripts/builder.ts:223` — `checkCitations`; `scripts/builder.ts:307` — `checkSkillCitations`; `scripts/builder.ts:475` — the two-glob default scope.
- `scripts/tests/builder.test.ts:59` — the `recordingFs` seam; `:102-114` — the AC2 present/absent-resolver pair; `:133-137` — the hyphen-adjacent negative; `:595-603` — the default-scope assertion.
- `.spur/rules/quality/skill-citations.yaml` — the post-check rule (owner of the boundary after this task); `.spur/rules/boundary/sp-no-vendor-refs.yaml` — the disabled shadow of the global `sp-no-vendor-refs` rule (stays disabled).
- `docs/00_ADR.md:58` (ADR-004 vendors reference-only), `docs/00_ADR.md:243` (builder.ts subcommand ownership).
- `docs/tasks/0070_Enhance_cc_meta-plugin_with_skill-engineering_theory_rubrics_invocation_axis_pruning_dogfood.md`, `docs/tasks/0071_fix-0070-dogfood-findings-ac-boundary-wording-spur-rule-shad.md` — the boundary's origin and the rule-shadow history.
- `.gitignore:138`, `.gitignore:153` — `/vendors` is ignored by design.
- Content fix (already in `HEAD` as `3b255be`): `plugins/cc/skills/cc-hooks/SKILL.md:37`, `plugins/cc/agents/expert-hook.md:45` — the five vendor citations replaced with shipped anchors.
- `.spur/run/worktree-runall-0154-b7e4-batch-report.md` — the batch that produced this change, its driver findings, and the recovery path taken.

### History

- 2026-10-12T22:15:38.740Z todo → wip (system)
- 2026-10-12T22:31:37.247Z wip → testing (system)
- 2026-10-12T22:41:44.582Z testing → wip (system)
- 2026-10-12T23:13:20.495Z wip → testing (system)
- 2026-10-12T23:14:26.392Z testing → done (system)

