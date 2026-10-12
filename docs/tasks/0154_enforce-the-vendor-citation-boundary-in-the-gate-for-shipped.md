---
schema_version: 1
name: Enforce the vendor-citation boundary in the gate for shipped plugin content
status: done
template: issue
created_at: 2026-10-12T21:45:49.636Z
updated_at: "2026-10-12T23:14:26.399Z"
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
| `scripts/builder.ts:220` | `checkCitations` runs the boundary scan before the resolvable loop |
| `scripts/builder.ts:227` | the fixed `vendor boundary:` message per occurrence — no `fs` probe, so the verdict is identical with or without a local `vendors/` |
| `scripts/builder.ts:302` | `checkSkillCitations` accepts one glob or a list of globs; the explicit single-glob argument keeps its exact behavior and the OK line prints the joined list |
| `scripts/builder.ts:310-317` | per-glob scan loop — `skillName` is derived per scanned file, and the `agents` key an agent document yields is unmapped in the rubric table, so agent documents get citations and the boundary but no rubric-drift check |
| `scripts/builder.ts:470` | default scope is the two-glob list `plugins/*/skills/*/SKILL.md` + `plugins/*/agents/*.md` (two globs, not one — Bun 1.3.14 brace form matches nothing) |
| `scripts/builder.ts:8` | usage header for `check-skill-citations` now reads `resolve skill/agent citations + vendor boundary + drift` |
| `scripts/tests/builder.test.ts:59` | `recordingFs` — resolver recording every `exists` probe, so a test can assert the vendor path is never consulted |
| `scripts/tests/builder.test.ts:102-114` | AC2: the same vendor body against a resolver with the file present and one without yields one identical `vendor boundary:` finding, never a `dead citation` |
| `scripts/tests/builder.test.ts:118-124` | AC3: an extension-less directory reference (`vendors/rulesync/src/features/skills/`) yields one boundary finding |
| `scripts/tests/builder.test.ts:126-131` | AC1 content shape: a body citing only shipped anchors yields zero findings |
| `scripts/tests/builder.test.ts:133-137` | AC2 residual-proof negative: the hyphen-adjacent `multi-vendors/registry.ts` lookalike yields zero findings (would fail under the old `\b`) |
| `scripts/tests/builder.test.ts:140-143` | AC2: a mid-path segment (`plugins/foo/vendors/x.ts`) still yields the boundary finding |
| `scripts/tests/builder.test.ts:338-350` | AC4 integration: an agent document carrying a vendor citation is reported for that document and the gate exits 1 |
| `scripts/tests/builder.test.ts:587-595` | AC4 wiring: the no-argument default scans both the skill and the agent glob in the real tree |
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
| R1 | MET | `scripts/builder.ts:188` — `RESOLVABLE_PREFIXES` no longer lists `vendors/`; `scripts/builder.ts:198` — `VENDOR_REF_RE = /(?<![\w.-])vendors\/[\w./-]*/g`; `scripts/builder.ts:224` — the boundary loop pushes one fixed-message `vendor boundary:` finding per match *before* the resolvable loop (`scripts/builder.ts:230`) and never touches the injected `FileResolver`, so no filesystem probe for a vendor reference is structurally possible. Executed probe (prose, not an anchor): a detached worktree of HEAD `e5625c1` created outside this tree with this tree's `scripts/builder.ts` copied in and NO `vendors/` (`test -e vendors` → exit 1) ran that tree's own `bun scripts/builder.ts check-skill-citations` → `OK: skill citations resolve and dimension claims match rubrics (plugins/*/skills/*/SKILL.md, plugins/*/agents/*.md)`, `exit=0`. In the same worktree with a probe plugin document citing `vendors/rulesync/src/types/hooks.ts` line 49, the checker produced one `vendor boundary:` finding with `exit=1`; after materializing a 400-line `vendors/rulesync/src/types/hooks.ts` the output was byte-identical (`diff` exit 0) with `exit=1` — identical verdict with the vendor tree present vs absent. This execution tree itself has no `vendors/` (`test -e vendors` → exit 1). |
| R2 | MET | `scripts/builder.ts:470` — default scope is the two-glob list `['plugins/*/skills/*/SKILL.md', 'plugins/*/agents/*.md']`; `scripts/builder.ts:303` normalizes a single glob string or an array; the per-glob scan at `scripts/builder.ts:311` computes `skillName` as `rel.split('/').at(-2)`, which is `agents` for an agent document — absent from `SKILL_TO_RUBRIC` (`scripts/builder.ts:207`), so agent documents get citation + boundary checks and no rubric-drift check. Enumerated default scope in this tree: 8 `plugins/cc/skills/*/SKILL.md` + 5 `plugins/cc/agents/*.md`; `plugins/cc/README.md` exists but is not matched by either glob. Rule surface matches: `.spur/rules/quality/skill-citations.yaml:12` (description names `agents/*.md` and the reference-only tree) and `.spur/rules/quality/skill-citations.yaml:26` (`plugins/*/agents/*.md` in `include:`). Executed: `bun scripts/builder.ts check-skill-citations` (no glob arg) in this tree prints the OK line naming both globs, exit 0. |
| R3 | MET | Regression rows: `scripts/tests/builder.test.ts:102` (present/absent resolver pair, `recordingFs` at `:59`), `:118` (directory-style), `:126` (shipped-only body → 0 findings), `:133` (residual-proof negative), `:140` (mid-path positive), `:338` (AC4 integration: finding keyed to the agent file, `process.exit(1)`), `:587` (AC4 wiring: no-arg default names both globs). Content fix verified present in the base: `plugins/cc/agents/expert-hook.md:45` cites `packages/core/src/content/hook-events.ts:16`, `plugins/cc/skills/cc-hooks/SKILL.md:37` cites `packages/core/src/quality/hook.ts:10`, `git merge-base --is-ancestor 3b255be HEAD` → exit 0, and `rg 'vendors/' plugins` → exit 1 (zero matches). Rule-surface wording in the same change: `scripts/builder.ts:8` (usage header), `.spur/rules/quality/skill-citations.yaml:3`, `.spur/rules/boundary/sp-no-vendor-refs.yaml:6` (shadow header names `skill-citations-resolve`; the rule stays `enabled: false` at `.spur/rules/boundary/sp-no-vendor-refs.yaml:33`). Executed `bun test scripts/tests/builder.test.ts` → 67 pass / 0 fail / 122 expect() calls, exit 0. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 — A clean checkout passes the citation gate (req: R1, R3) | MET | command | Detached worktree of HEAD `e5625c1a9d2508e482ec97862bfb4e8a61aa1050` created outside this tree with this tree's changed `scripts/builder.ts` copied in: `test -e vendors` → `vendors-present=1` (no vendor tree). That tree's own `bun scripts/builder.ts check-skill-citations` printed `OK: skill citations resolve and dimension claims match rubrics (plugins/*/skills/*/SKILL.md, plugins/*/agents/*.md)` with `exit=0`. Default scope is `scripts/builder.ts:470`; the same evaluator with the same default scope is what the certified gate ran green (`.spur/run/0154-test-gate.log:9`). The probe worktree was removed; `git worktree list` shows only the main tree and this execution tree. |
| AC2 — A vendor reference fails regardless of the local tree (req: R1) | MET | test | `scripts/tests/builder.test.ts:102` runs a body citing the vendor hooks path (`vendors/rulesync/src/types/hooks.ts` line 49) against a resolver with the file present (400 lines) and one without: both yield exactly 1 finding, message starts with `vendor boundary:`, contains the vendor path, does not contain `dead citation`, and `probed` never contains the vendor path. Independent real-filesystem cross-check (prose): the probe worktree run with the 400-line vendor file present and the run with it absent produced byte-identical output (`diff` exit 0) and `exit=1` in both cases, from a plugin document citing `vendors/rulesync/src/types/hooks.ts` line 49; mechanism at `scripts/builder.ts:198` + `scripts/builder.ts:224`. |
| AC3 — Directory-style vendor references are caught too (req: R1) | MET | test | `scripts/tests/builder.test.ts:118` runs the body `Study the feature layout under \`vendors/rulesync/src/features/skills/\` before editing.` and asserts exactly 1 `vendor boundary:` finding containing `vendors/rulesync/src/features/skills/` — an extension-less shape `CITATION_RE` (`scripts/builder.ts:201`) cannot match, so only the boundary scan can produce it. |
| AC4 — Agent documents are in the default scope (req: R2) | MET | command | Probe worktree, no glob argument, with a probe agent document citing `vendors/rulesync/src/types/hooks.ts` line 49: this tree's checker reported `<agent document>: vendor boundary: vendors/rulesync/src/types/hooks.ts is reference-only (gitignored, not shipped); cite a shipped path or absorb the content` plus `1 citation/drift finding(s).` and `new-default-exit=1`; restoring HEAD's `scripts/builder.ts` in the same tree printed `OK: skill citations resolve and dimension claims match rubrics (plugins/*/skills/*/SKILL.md)` and `head-default-exit=0` (agent never scanned). Pinned in-tree by `scripts/tests/builder.test.ts:338` (`process.exit(1)`, finding keyed to the agent file) and `scripts/tests/builder.test.ts:587` (no-arg default names both globs); default scope at `scripts/builder.ts:470`. |
| AC5 — Regression fixtures and gate stay green (req: R3) | MET | command | `bun test scripts/tests/builder.test.ts` → `67 pass`, `0 fail`, `122 expect() calls`, exit 0. Certified full gate on this code, quoted from `.spur/run/0154-test-gate.log`: `:9` `All 39 rules passed — no violations found.` (recommended-pre-check), `:137` `2585 pass`, `:138` `0 fail`, `:142` `All 3 rules passed — no violations found.` (recommended-post-check), `:144` `GATE_EXIT=0`, `:144` `proof-digest: sha256:cdb7fc039f26506aa9d95b536a531d2bbae4ba18b8004aad77a726442256dc7f`; receipt `.spur/run/0154-check-receipt.json` records `status "PASS"` with the same `inputDigest` and `cmd "bun run spur-check"`, and `.spur/run/run-0154-b21f/vars.json` pins `proofDigest` to the same value. Mutation half, in the probe worktree only: with HEAD's `scripts/builder.ts` restored (no `VENDOR_REF_RE` scan, `vendors/` back in `RESOLVABLE_PREFIXES`) and this tree's `scripts/tests/builder.test.ts` copied in, the run was `62 pass / 5 fail` — the AC2 pair row, the AC3 row, the AC2 mid-path row, the AC4 integration row, and the AC4 default-scope wiring row all fail. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Review Report — 0154 (final pass — supersedes the previous review text in this section)

**Scope.** The current uncommitted working-tree diff on `sp/runall-0154-b7e4` vs base `e5625c1a` (`.spur/run/0154-base.sha` = `e5625c1a9d2508e482ec97862bfb4e8a61aa1050`) — 5 files / 279 insertions / 49 deletions (`.spur/run/0154-diffstat.json`, `sensitive: false`): `scripts/builder.ts`, `scripts/tests/builder.test.ts`, `.spur/rules/quality/skill-citations.yaml`, `.spur/rules/boundary/sp-no-vendor-refs.yaml`, and this task file. Certified gate evidence on this exact revision: digest `sha256:cdb7fc039f26506aa9d95b536a531d2bbae4ba18b8004aad77a726442256dc7f` — `.spur/run/0154-test-gate.log:143` (`proof-digest`), `.spur/run/0154-check-receipt.json:6,16` (`inputDigest` = same, `status PASS`, `gateRuntimeMs 38038`), `run-0154-b21f/vars.json` `proofDigest` = same.

**Method.** Independent read-only static review: every hunk plus its surrounding source, both rule YAMLs, the ADR entries the Q&A cites, the certified gate log/receipt, and the run artifacts. Every anchor in the task file was re-derived against file contents with symbol/line searches rather than trusted from the diff's own numbering. No shell was available in this dispatch, so nothing was executed here and no file was modified. The `git` content-fix commit identity (`3b255be`) is outside what the working-tree diff can show and is verified indirectly (below).

**Dimensions.** Functional traceability (R1–R3, AC1–AC5), SECUA (Security, Efficiency, Correctness, Usability, Architecture), architecture depth.

**Verdict:** PASS — 0 P1 (blocker), 0 P2 (major), 0 P3 (minor); one P4 (advisory) row, which does not invalidate any requirement, acceptance criterion, or the gate, and must not block shipping.

##### Disposition of the prior passes' findings

Every prior row was re-checked against the current tree; none was taken on trust.

| Prior finding (pass) | Location | Status now | Independent evidence |
| --- | --- | --- | --- |
| "two documentation-drift defect classes" while the change adds a third (pass 1, #1) | `scripts/builder.ts:152-162` | **FIXED** | `:152` reads `Catches three documentation-drift defect classes`; class 3 is enumerated at `:158-162`, matching the implementation. Sibling prose agrees (`.spur/rules/quality/skill-citations.yaml:3-8`). |
| `/\bvendors\/[\w./-]*/g` over-matched a hyphen-adjacent lookalike (pass 1, #2) | `scripts/builder.ts:198` | **FIXED** | Shipped pattern is `/(?<![\w.-])vendors\/[\w./-]*/g` with the rationale at `:193-196`; pinned by the residual-proof negative `scripts/tests/builder.test.ts:133-138` (body carries the trigger half `vendors/` inside `multi-vendors/registry.ts`, so it fires under `\b` and the row fails) plus the positive mid-path row `:140-143`. |
| `## References` / defect-narrative anchors had drifted (pass 1, #3) | task file `:219-241`, `:20-26`, `:112-114`, `:75-93` | **FIXED (previous partial now complete)** | `:241` cites `builder.ts:18/188/220/302/470` and tests `:59/:102-114/:133-137/:587-595`; `## Background` `:24` and `## Root Cause` `:112-114` carry "`188` after this change; `:183` before" / "`470` after this change; `:443` before"; `## Design` steps 1–6 (`:79-93`) match the shipped regex, the two-glob list at `:470`, the YAML description/include, the shadow header sentence, and the usage header. All re-derived and correct. The Plan's Gate bullet (`:108`) was refreshed to "39 pre-check rules, the full suite passing, 3 post-check rules" — no stale count remains there. |
| Verify-evidence block quoted a superseded revision (pass 2 P4, repeated as pass 3 (a)) | task file `:149-167` (`## Testing`) | **STILL OPEN — accepted residual** | See the P4 row below. Non-behavioural; the classifier of record (receipt + gate log, digest `cdb7fc03…`) is current. |
| Module comment's class 1 still said "in a SKILL.md" after agent documents came into scope (pass 3 (b)) | `scripts/builder.ts:154-155` | **FIXED** | `:154-155` now reads "a `path.ts:LINE` or repo-relative source path in a / checked plugin document that no longer exists"; the diff for this revision shows exactly that line changed. |
| `## Solution` AC4 row anchor spanned `:338-341`, under-covering the row's assertions (pass 3 (c)) | task file `:145` | **FIXED** | The row now cites `scripts/tests/builder.test.ts:338-350`, which resolves to the AC4 integration row (`it(` at `:338`, closing `});` at `:350`) and therefore covers its assertions at `:346-349`. |
| `scripts/builder.ts:315` labelled "per-glob scan loop" while the loop is at `:310-311` (pass 2, minor) | task file `:128` | **FIXED** | The row now reads `scripts/builder.ts:310-317`, which is exactly the loop plus both `findings.push(...)` calls (`:310-317`). |

##### Findings (ranked)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P4 (advisory) | documentation | `docs/tasks/0154_enforce-the-vendor-citation-boundary-in-the-gate-for-shipped.md:149-167` (`## Testing`) | The verify-evidence block is two revisions stale. It still quotes the superseded `\b` form (``:191 — `VENDOR_REF_RE = /\bvendors\/[\w./-]*/g` ``), the pre-change anchors `:185` (now `:188`), `:213-221` (now `:224-229`), `:463` (now `:470`), `:296` (now `:303`), `:303-313` (now `:310-317`), `:200-205` (now `:207-213`), `:194` (now `:201`), test spans `:101-114`/`:326-334`/`:575-583` (now `:102-116`/`:338-350`/`:587-595`), `65 pass / 0 fail` for the focused run (the file has 67 `it(` rows and no `.skip`/`.only`/`.todo`), `2583 pass` for the gate (now `2585 pass / 0 fail`, `.spur/run/0154-test-gate.log:136-139`), digest `114c8716…` and `GATE_EXIT` at `:145` (now `cdb7fc03…` at `:143`, `GATE_EXIT=0` at `:144`), and a mutation result `62 pass / 3 fail` measured on the 65-row file with the failure quoted at `:336` (that row's assertion is now `:348`). Its header line `Verdict: PARTIAL` and the residual-sweep fail in `.spur/run/0154-verdict.json:77` (6 unchecked Plan boxes) are likewise from the previous run — all six Plan bullets and R1–R3 are `[x]` in this revision. Non-behavioural: the classifier of record is the receipt/gate log on the current digest. | accepted residual — `## Testing` is written by the pipeline's `record` step, which runs after this review, so at review time it can only quote a previous revision (pipeline order). Smallest fix if the record step does not regenerate it: in `## Testing` rewrite those anchors/regex/counts/digest as listed here, and note the mutation would now stand at 64 pass / 3–4 fail on the 67-row file (rows `:109`, `:121`, `:348` fail). |

No P1, P2, or P3 row exists: nothing in this diff breaks a requirement, an acceptance criterion, the architecture invariants, or the gate.

##### Functional Traceability (R1–R3)

- **R1 — MET (deterministic, no filesystem probe).** `'vendors/'` is gone from `RESOLVABLE_PREFIXES` (`scripts/builder.ts:188`: `packages/ apps/ plugins/ tooling/ scripts/ docs/`); `VENDOR_REF_RE` is at `:198`; the boundary scan at `:224-229` runs *before* the resolvable loop (`:230`) and its body touches only `body`, `match` and `findings` — it cannot reach the injected `FileResolver`, so `fs.exists` is structurally unreachable for a vendor reference; each match pushes one fixed-message finding (`:227`) and any finding reaches `fail()` (`:329`). Because `vendors/…` also matches `CITATION_RE` (`:201`) but no longer sits under a resolvable prefix, a vendor citation now yields exactly one finding (`vendor boundary:`) instead of one `dead citation:` — no double-report, no silent drop. Environment corroboration: this execution tree has **no** `vendors/` directory (repo-root listing), and the certified gate ran this exact exit-code evaluator with no glob argument and passed (`.spur/run/0154-test-gate.log:9`, `:141`, `:144`).
- **R2 — MET (scope widened to agent documents, and only those).** Default scope is the two-glob list at `scripts/builder.ts:470` (`['plugins/*/skills/*/SKILL.md', 'plugins/*/agents/*.md']`); the parameter is normalized at `:303`, so one explicit glob keeps byte-identical behaviour (the pre-existing exact-OK-line assertion at `scripts/tests/builder.test.ts:316-322` still holds); the per-glob loop at `:310-317` computes `skillName` as `rel.split('/').at(-2)`, which is `agents` for an agent document — absent from `SKILL_TO_RUBRIC` (`:207-213`), so agent documents get citations + boundary and no rubric-drift check (documented at `:314`). The default scope really enumerates the shipped documents: 8 `plugins/cc/skills/*/SKILL.md` + 5 `plugins/cc/agents/*.md`, no `README.md`. The rule surface matches and cannot be skipped: `.spur/rules/quality/skill-citations.yaml:12-14` (description) and `:25-26` (`plugins/**/SKILL.md` + `plugins/*/agents/*.md`), and `recommended-post-check.yaml` extends the `quality` category that owns this rule.
- **R3 — MET (coverage + content + rule surface in one change).** Regression rows: `scripts/tests/builder.test.ts:102-116` (AC2 present/absent resolver pair, `recordingFs` at `:59-71`), `:118-124` (AC3 directory-style), `:126-131` (AC1 content shape), `:133-138` (residual-proof negative), `:140-143` (mid-path positive), `:338-350` (AC4 integration: finding keyed to the agent file, `process.exit(1)`, `1 citation/drift finding(s).`), `:587-595` (AC4 wiring: no-arg default names both globs). The cc-hooks / expert-hook content fix is **already in the base commit, not in this diff**: those files are absent from the 5-file diffstat, `plugins` contains zero `vendors` occurrences (search: no matches), and the shipped anchors are present (`plugins/cc/skills/cc-hooks/SKILL.md:37,67,84,276`, `plugins/cc/agents/expert-hook.md:45`). Rule-surface wording in the same change: `scripts/builder.ts:8` (usage header), `.spur/rules/quality/skill-citations.yaml:3-8,12-14,25-26`, `.spur/rules/boundary/sp-no-vendor-refs.yaml:5-8` with `enabled: false` preserved (`:38`). No other enabled rule enforced the boundary: every other `vendors` occurrence in `.spur/rules/**/*.yaml` is an exclude list, so the "lived only in prose" root cause holds.
- **Single owner, as designed.** The boundary is one mechanism (`checkCitations`) reused for both document classes; the widened scope is an argument to the existing function rather than a second code path; the resolver seam is untouched, so AC2's "tree present vs absent" reduces to two resolver objects; the disabled shadow rule was not repurposed, which keeps its shadow semantics intact (Q&A `:69-71`).

##### Acceptance Criteria (AC1–AC5)

- **AC1 — MET.** The gate command runs this exit-code evaluator with its default scope (`.spur/rules/quality/skill-citations.yaml:17-23`) and this tree has no `vendors/`, so the certified green run (`.spur/run/0154-test-gate.log:9,141,144`) *is* a clean-tree run: `OK: skill citations resolve and dimension claims match rubrics (plugins/*/skills/*/SKILL.md, plugins/*/agents/*.md)` (`scripts/builder.ts:323`), exit 0. Unit proxy for the same content shape: `scripts/tests/builder.test.ts:126-131`. The literal detached-worktree probe recorded by the verify hop (`.spur/run/0154-verify-answer.txt`, AC1 row) is quoted, not re-run here — but its pre-condition is independently confirmed (no `vendors/` in this tree), so the claim is not environment-dependent.
- **AC2 — MET.** `scripts/tests/builder.test.ts:102-116` runs one body against a resolver where `vendors/rulesync/src/types/hooks.ts` exists (400 lines) and one where it does not: both yield exactly 1 finding, `toStartWith('vendor boundary:')`, containing the path, not containing `dead citation`, and the `recordingFs` probe list never contains that path (`:114`). Both halves of the scenario, including "neither run calls the resolver", are asserted.
- **AC3 — MET.** `scripts/tests/builder.test.ts:118-124`: the extension-less `vendors/rulesync/src/features/skills/` yields exactly one `vendor boundary:` finding; `CITATION_RE` (`scripts/builder.ts:201`) cannot see that shape (no extension/line), so the boundary scan is the only mechanism that can produce it.
- **AC4 — MET.** `scripts/tests/builder.test.ts:338-350` reports the finding keyed to the agent document and calls `process.exit(1)`. The no-glob-argument half is covered by `:587-595`, which dispatches `runBuilderCommand(['check-skill-citations'])` in the real tree and asserts the OK line names *both* default globs — so dropping `plugins/*/agents/*.md` from `scripts/builder.ts:470` fails that row.
- **AC5 — MET.** Certified on this revision: pre-check `All 39 rules passed — no violations found.` (`.spur/run/0154-test-gate.log:9`), `2585 pass / 0 fail / 7650 expect() calls` across 123 files (`:136-139`, which includes all 67 rows of `scripts/tests/builder.test.ts`; coverage table lists `scripts/builder.ts`), `All 3 rules passed` (`:141`), `gate runtime: 38038ms` (`:142`), `GATE_EXIT=0` (`:144`); receipt `.spur/run/0154-check-receipt.json` records `status: "PASS"`, `inputDigest` `cdb7fc03…`, `cmd: bun run spur-check`, and `run-0154-b21f/vars.json` pins the run to the same digest. No test row is skipped, focused, or todo. The mutation half (restore `vendors/` to `RESOLVABLE_PREFIXES` + delete the boundary scan) is *reasoned here, not re-executed*: AC2's first iteration would yield 0 findings and its second a `dead citation:`, AC3 would yield 0, and the AC4 integration row would not fire — consistent with the verify hop's recorded `62 pass / 3 fail` on the then-65-row file.

##### SECUA

- **Security:** content-only and deterministic — no new I/O, no filesystem traversal, nothing executed, no secret material. A gitignored reference checkout can no longer make a shipped plugin document's verdict machine-dependent, and the check cannot be satisfied by materializing anything locally.
- **Efficiency:** one extra `matchAll` per scanned body with zero I/O; the widened scope adds five `plugins/cc/agents/*.md` reads to a 38 s gate. `matchAll` requires a global regex and iterates an internal clone, so the module-level `VENDOR_REF_RE` carries no cross-call `lastIndex` state; the AC2 row's loop over two fixtures would catch it if it did.
- **Correctness:** the two halves are coupled and both present — removing `vendors/` from the resolvable roots alone would silently drop the class (invisible path, no finding), and the boundary scan alone would leave a machine-dependent `dead citation` on trees that carry the checkout. Boundary-before-resolvable ordering and per-occurrence reporting preserve the existing dead-citation behaviour for shipped roots; the lookbehind class `[\w.-]` yields the intended semantics (string start, `/`, backtick and whitespace hit; `-`, `.`, word characters do not).
- **Usability:** the message names the offending reference, states the rule (reference-only / gitignored / not shipped) and the remedy; the OK line joins the scanned globs, so a green gate is self-documenting; the failure summary keeps its `N citation/drift finding(s).` form.
- **Architecture:** no new module, dependency, or process; the checker stays a subcommand of `scripts/builder.ts` (ADR-017 in `docs/00_ADR.md:243`, subcommand list unchanged — the new behaviour is a third class inside `checkCitations`, not a new entry point), `packages/core` stays a pure content evaluator, and the boundary keeps exactly one owner, with the disabled shadow's header updated to point at it instead of the stale task-0070 grep. ADR-004 (`docs/00_ADR.md:58`) is the cited authority and says what the comment claims.

##### Architecture Depth

The change adds a third defect class to an existing mechanism instead of standing up a second one: `checkCitations` gains a preamble and `checkSkillCitations` gains a glob list — same function, same resolver seam, same exit-code rule. That preserves the invariant that "checked plugin documents" is the unit of enforcement and keeps the new behaviour unit-testable without fixtures, which is why AC2's "tree present vs absent" reduces to two resolver objects rather than two filesystems. Scope stays deliberately bounded (SKILL.md + agent documents; README/commands/references/magents out by documented design), and the boundary's ownership is now stated in the rule that actually runs it, so the next reader finds the owner from either the YAML or the code. Two pre-existing observations, neither introduced nor worsened by this diff: the rule's `include:` lists `plugins/**/SKILL.md`, which is broader than the evaluator's `plugins/*/skills/*/SKILL.md` default (unchanged), and the scanned-file filter `rel.includes('/vendors/')` (`scripts/builder.ts:312`) would not match a root-level `vendors/…` glob — unreachable with the default globs but a latent trap for an explicit glob argument.

##### Verification Evidence

Read, not executed (read-only dispatch): `scripts/builder.ts` (1–60, 145–345, 455–475), `scripts/tests/builder.test.ts` (45–155, 294–351, 565–600 plus a full `it(`-row census = 67), both rule YAMLs, `.spur/rules/recommended-post-check.yaml`, the task file in full, `.spur/run/0154-test-gate.log`, `.spur/run/0154-check-receipt.json`, `.spur/run/0154-diffstat.json`, `.spur/run/0154-base.sha`, `.spur/run/run-0154-b21f/vars.json`, `.spur/run/0154-verdict.json`, `.spur/run/0154-verify-answer.txt`, the three prior review artifacts, `docs/00_ADR.md:52-64,238-246`, `.gitignore`, and `plugins/cc/agents/*.md` + `plugins/cc/README.md`. Cross-searches: `vendors` under `plugins/` (zero), `vendors` under `.spur/rules/**` (all excludes except the two files in this diff), `check-skill-citations|skill-citations` under `docs/0*.md` (only `docs/00_ADR.md:243,245` — confirming the Q&A claim that `docs/04_DESIGN.md` needs no update), `.skip|.only|.todo` in the test file (none), `checkSkillCitations` call sites (only `:470` dispatch + test rows, all type-correct against `string | string[]`).

Commands a supervisor may run if independent execution is wanted: `bun test scripts/tests/builder.test.ts` (expect 67 pass / 0 fail), `bun run lint`, `bun scripts/builder.ts check-skill-citations` (expect OK / exit 0 in this vendor-free tree), `bun run spur-check`, `spur task check 0154`.

##### Residual Risk

- The `## Testing` block is two revisions stale (the single P4 above). It cannot change the gate outcome — the classifier of record is the receipt/gate log on digest `cdb7fc03…` — but it would mislead a future reader about which regex, which anchors, and which digest this revision carries.
- The boundary is closed per-scope, not repo-wide: a future `vendors/` citation in `plugins/**/README.md`, `commands/*.md`, `skills/**/references/*.md` or `magents/**` stays invisible (neither a resolvable dead path nor in scope). This matches R2 and the Q&A's explicit scope decision.
- Latent regex edges are bounded and deliberate: a hyphen-adjacent lookalike (`x-vendors/…`) is no longer flagged, a mid-path segment (`plugins/foo/vendors/x.ts`) is flagged by design, and a plugin document that *documents* the ban by writing a literal `vendors/…` example would now fail the gate (no such text exists under `plugins/` today). No tracked path under a scanned root contains `vendors` today.
- The change is uncommitted, so the certified digest is bound to the working tree, not to an immutable revision; the wrap commit is what makes the evidence reproducible. The content fix's commit identity (`3b255be`, claimed ancestor of base `e5625c1`) is outside what the working-tree diff can show — verified indirectly instead: both content files are absent from the 5-file diffstat and `plugins/` has zero `vendors` occurrences, so the base already carries the fix.
- AC1/AC4's real-filesystem probes, the AC5 mutation run, and the per-rule evaluator output were not re-executed here (no execution surface); the environment fact that makes AC1 non-vacuous *was* verified (no `vendors/` in this tree), and the post-check 3-rules-passed line plus `recommended-post-check.yaml` extending `quality` are the inference supporting that the citation rule ran and exited 0.

### References

- `.spur/run/worktree-runall-0152-0153-c898-batch-report.md` § Driver findings **D1** — the batch-level reproduction and mitigation.
- `scripts/builder.ts:18` — repository-root anchor; `scripts/builder.ts:188` — `RESOLVABLE_PREFIXES` after this task; `scripts/builder.ts:220` — `checkCitations`; `scripts/builder.ts:302` — `checkSkillCitations`; `scripts/builder.ts:470` — the two-glob default scope.
- `scripts/tests/builder.test.ts:59` — the `recordingFs` seam; `:102-114` — the AC2 present/absent-resolver pair; `:133-137` — the hyphen-adjacent negative; `:587-595` — the default-scope assertion.
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

