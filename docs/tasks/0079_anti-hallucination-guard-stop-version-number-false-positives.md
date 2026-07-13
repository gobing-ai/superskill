---
schema_version: 1
name: "Anti-hallucination guard: stop version-number false positives on metrics and credit file:line / command evidence as citations"
status: done
template: standard
created_at: 2026-07-13T17:50:57.936Z
updated_at: "2026-07-13T21:36:31.937Z"
priority: P2
---

## 0079. Anti-hallucination guard: stop version-number false positives on metrics and credit file:line / command evidence as citations

### Background
<!-- Why this task exists: the problem, motivation, and context. Self-contained — readable without the parent. -->

The `cc` plugin's anti-hallucination Stop hook (`superskill hook run cc anti-hallucination`, registered in `plugins/cc/hooks/hooks.json`) blocks a stop and demands "source citations for API/library claims" + "confidence level (HIGH/MEDIUM/LOW)" whenever the last assistant message looks like an unverified external claim. The gate is `requiresExternalVerification()` in `plugins/cc/scripts/anti-hallucination/ah_guard.ts:305-315`.

**The incident (2026-07-13).** A `/sp:dev-verify` verdict for another repo — a fully evidenced PASS that cited `file:line` test anchors and pasted `bun test` output (`1626 pass / 0 fail`, coverage `94.87%` func / `100.00%` line) — was **blocked** by this hook. The verdict contained no hallucination; it was the opposite of one. The block was a false positive.

**Root cause (empirically confirmed).** Running the guard against the verdict text reproduces the exact block. `requiresExternalVerification` returned `true` for a **single** reason: the coverage number `94.87` matches the version-number pattern `/\bv?\d+\.\d+(?:\.\d+)?\b/` at `ah_guard.ts:288`. That regex treats *any* `d.d` decimal as a software version, so code-coverage percentages, ratios, durations (`1.5s`), and similar metrics all read as version claims. Probes of the other candidate triggers on the same text — `file:line` anchors, keyword+coupler (`interface returns`), the test count `1626` — all returned `false`. So one metric decimal alone tripped the gate:

```
requiresExternalVerification("...func cov 94.87% line 100.00%...") === true   // via /\bv?\d+\.\d+/
verifyAntiHallucinationProtocol(verdict) === { ok:false,
  reason:"Add verification for: source citations for API/library claims, confidence level (HIGH/MEDIUM/LOW)" }
```

Once the gate fires, the message is required to carry a literal citation that `hasSourceCitations()` (`ah_guard.ts:238-247`) recognizes — `[Source: …]`, `Source: …`, a URL, or `**Source**:`. A verification verdict's evidence is `file:line` anchors and pasted commands + exit codes, which `hasSourceCitations` does **not** credit. So even a maximally-evidenced engineering reply is told to "add source citations."

**Lineage — this is a 0077 R1 follow-up.** Task 0077 R1 reworked `requiresExternalVerification` to stop *bare vocabulary* (`function`, `method`, `api`) from triggering, adding the `WEAK_KEYWORD_PATTERN` + `CLAIM_COUPLER_PATTERN` gate (`ah_guard.ts:296-314`). It did **not** touch the `STRONG_CLAIM_PATTERNS` version regex, which still fires alone on any decimal. This task closes that residual: the version signal must require a *version cue* (so metrics don't match), and the citation check must credit the evidence forms coding agents actually produce (`file:line`, pasted commands). Both halves are why one correct verdict got blocked.

**Why it matters.** Now that the guard is live (0077 activated the exit-2 block path), this false positive nags on *every* substantive verification/report turn that mentions a coverage percentage or a metric — precisely the turns that are most rigorously evidenced. Left unfixed, it trains operators and agents to pad replies with dummy `Source:` lines or to route around the guard, eroding the signal the guard exists to protect. The fix is small, surgical, and fully test-coverable.
### Requirements
- [ ] R1. **Make version-number detection context-aware** so metrics never read as versions. In `plugins/cc/scripts/anti-hallucination/ah_guard.ts`, replace the single broad `STRONG_CLAIM_PATTERNS` entry `/\bv?\d+\.\d+(?:\.\d+)?\b/` (line 288) with cue-gated version detection: a decimal counts as a version claim only when it carries a `v`/`V` prefix (`v2.0`, `v1.2.3`), is preceded by a version word (`version`/`release`/`semver` + number), or is a 3-part `d.d.d` semver — and never when it is immediately followed by `%`. Bare 2-part decimals with no cue (`94.87`, `100.00`, `1.5`) must NOT trigger. Genuine version references must still trigger. Preserve every other `STRONG_CLAIM_PATTERNS` entry (URL, `recent change/update/release`, lifecycle verbs, `according to`, `documentation says/states`) unchanged — they already catch real external claims independent of the number.

- [ ] R2. **Credit real verification evidence as a source citation.** Extend `hasSourceCitations` (`ah_guard.ts:238-247`, via `SOURCE_PATTERNS` at lines 34-40, or a dedicated evidence set it consumes) to recognize the citation forms coding agents actually emit: `file:line` / `file:line-range` anchors (e.g. `ah_guard.ts:288`, `foo.ts:12-20`), an explicit `exit <code>` / `exit code <code>` line, and a pasted test-result line (`N pass … N fail`). Do NOT credit a bare fenced code block alone (too broad — it would neuter the guard). A reply that references an external thing but carries none of {URL, `Source:`, `**Source**:`, `file:line`, command/exit/test-result evidence} must still be treated as uncited and block. Keep the exported signature `hasSourceCitations(text: string): boolean` unchanged.

- [ ] R3. **Regression corpus — lock the incident and the intended positives.** Add tests to `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` that: (a) feed the guard a metrics-dense verification-verdict shape (coverage `94.87%`/`100.00%`, `1626 pass / 0 fail`, `file:line` anchors, `exit 0`) and assert `requiresExternalVerification` → `false` and `verifyAntiHallucinationProtocol` → `{ok:true}`; (b) assert the existing intended-positive version cases still trigger — at minimum `'Version 2.0 introduced this'` (current test line 200), `'…for version 1.5'`, `'library version 2.3.1 …'`, `'…introduced in version 2.0.'`; (c) assert `hasSourceCitations` returns `true` for a `file:line` anchor and for a pasted `exit 0` line, and `false` for a reply with no citation of any kind.

- [ ] R4. **No behavior regression; preserve the guard's contract.** All existing tests in `ah_guard.test.ts` and `validate_response.test.ts` stay green. Preserve: the fail-open philosophy (`resolveStopContext` still allows on unreadable input and on `stop_hook_active:true`), the exit contract (0 = allow / 2 = block for the hook path; `validate_response.ts` 0/1 unchanged), and all exported function signatures. The confidence-level requirement is intentionally out of scope — do not weaken `hasConfidenceLevel` or the confidence demand; R1 already removes the false demand by short-circuiting `verifyAntiHallucinationProtocol` at the `needsVerification === false` branch (line 326-328) before either source or confidence is checked. No change to `validate_response.ts` is expected (it delegates to `verifyAntiHallucinationProtocol`); confirm this rather than editing it.

- [ ] R5. **Release + docs.** Update the inline comments on the reworked patterns to explain the cue requirement and reference this task (0079). Add a `CHANGELOG.md` entry under the next version and bump `plugins/cc/plugin.json` `version` (currently `0.3.0`) per the repo's release convention. Update the guard's header docblock (`ah_guard.ts:2-24`) only if it enumerates the trigger heuristics. If `plugins/cc/skills/anti-hallucination/references/*.md` documents what counts as a citation or what triggers verification, align it with R1/R2.
### Acceptance Criteria

**Scenario: A metrics-dense verification verdict is not flagged**

- Given the last assistant message is a verify verdict containing coverage percentages (`94.87%`, `100.00%`), a test-result line (`1626 pass / 0 fail`), `file:line` anchors, and `exit 0` — and no version cue
- When it is passed through `superskill hook run cc anti-hallucination` (stdin Stop payload) and through `verifyAntiHallucinationProtocol` directly
- Then `requiresExternalVerification` returns `false`, the protocol returns `{ok:true}`, the hook exits `0` (allow), and no "add source citations / confidence" feedback is emitted

**Scenario: Genuine version claims still trigger verification**

- Given a reply asserting a version fact — `'Version 2.0 introduced this'`, `'…for version 1.5'`, `'library version 2.3.1 …'`, `'…was introduced in version 2.0.'`, or a `v2.0` / `1.2.3` semver token
- When `requiresExternalVerification` evaluates it
- Then it returns `true` (each of the four current positive test strings at `ah_guard.test.ts` lines ~200/263/354/398 remains green)

**Scenario: file:line and command evidence count as citations**

- Given a reply that references an external artifact and cites it with a `file:line` anchor (`ah_guard.ts:288`, `foo.ts:12-20`), an `exit 0` / `exit code 0` line, or a `N pass / N fail` result line
- When `hasSourceCitations` evaluates it
- Then it returns `true`, and a reply that would otherwise be flagged is not asked for a `Source:` URL

**Scenario: An uncited external claim still blocks**

- Given a reply asserting an external claim (e.g. `'the framework exposes a helper since version 2.0'`) with NO citation of any kind — no URL, no `Source:`/`**Source**:`, no `file:line`, no command/exit/test-result evidence
- When it is passed through `superskill hook run cc anti-hallucination`
- Then the hook still exits `2` (block) and the reason still lists the missing citation — the guard keeps its teeth

**Scenario: The guard still fails open and does not loop**

- Given a Stop payload that is unreadable/invalid, or carries `stop_hook_active: true`
- When the hook runs
- Then it exits `0` (allow) exactly as before — `resolveStopContext` behavior is unchanged

**Scenario: Suite and gate remain green**

- Given the R1/R2 code change, the R3 regression tests, and the R5 release/doc edits
- When `bun run spur-check` runs (lint + `recommended-pre-check` rule + `bun test --coverage` + `recommended-post-check` rule)
- Then it passes with no skipped tests, no new suppression directives, and no regression in `ah_guard.test.ts` / `validate_response.test.ts`; `plugins/cc/plugin.json` version is bumped and `CHANGELOG.md` has the entry

### Design

All changes are confined to `plugins/cc/scripts/anti-hallucination/ah_guard.ts` and its test file. `validate_response.ts` delegates to `verifyAntiHallucinationProtocol`, so it inherits the fix with no edit. The two exported predicates keep their signatures; only their internal pattern sets change.

**R1 — cue-gated version detection (the core fix).**

Current (`ah_guard.ts:287-294`):

```ts
const STRONG_CLAIM_PATTERNS = [
    /\bv?\d+\.\d+(?:\.\d+)?\b/,                 // ← matches ANY d.d decimal → false positives
    /https?:\/\//,
    /recent\s+(?:change|update|release)/i,
    /\b(?:was|were|is|are)\s+(?:introduced|added|deprecated|removed|renamed|released)\b/i,
    /\baccording to\b/i,
    /\bdocumentation\s+(?:says|states|shows|confirms)\b/i,
];
```

Recommended replacement — swap the first entry for three cue-gated forms (keep the other five verbatim):

```ts
const STRONG_CLAIM_PATTERNS = [
    // Version references need a cue so metrics/percentages (94.87%, 100.00), ratios,
    // durations (1.5s) and file:line refs do NOT read as versions. (0079)
    /\bv\d+(?:\.\d+)+\b/i,                          // v-prefixed: v2, v2.0, v1.2.3
    /\b(?:version|release|semver)\s+v?\d+\.\d+/i,   // worded: "version 2.0", "release 1.4"
    /(?<![\d.])\d+\.\d+\.\d+(?![\d.])(?!\s*%)/,     // 3-part semver, not part of a longer number, not a %
    /https?:\/\//,
    /recent\s+(?:change|update|release)/i,
    /\b(?:was|were|is|are)\s+(?:introduced|added|deprecated|removed|renamed|released)\b/i,
    /\baccording to\b/i,
    /\bdocumentation\s+(?:says|states|shows|confirms)\b/i,
];
```

Why this preserves the intended positives (verified by reading the current tests, not by running them):

| Input | Matches | Result |
|-------|---------|--------|
| `Version 2.0 introduced this` (test ~L200) | `version\s+…2.0` | true ✓ |
| `…for version 1.5` (test ~L263) | `version\s+…1.5` | true ✓ |
| `library version 2.3.1 …` (test ~L398) | `version\s+…2.3.1` + semver | true ✓ |
| `…introduced in version 2.0.` (test ~L354) | `version\s+…2.0` + lifecycle verb | true ✓ |
| `v2.0` / `1.2.3` bare semver | v-prefix / 3-part | true ✓ |
| `coverage 94.87%`, `100.00%` | none (2-part, no cue, `%`) | false ✓ |
| `1626 pass / 0 fail`, `1.5s`, `ratio 1.5` | none | false ✓ |

The `%` negative-lookahead on the semver branch is belt-and-suspenders; the 2-part metric case is already excluded because no cue precedes it. Note `recent change/update/release` and the lifecycle-verb pattern still catch version-flavored *claims* that don't spell a number ("the endpoint was deprecated", "a recent update changed the API"), so removing bare-number matching does not lose real external claims.

**Alternative considered (not recommended): percentage/anchor exclusion only** — keep the broad regex and add negative lookaheads for `%`, `:` (file:line), and metric words. Smaller diff, but it leaves bare metric decimals (`ratio 1.5`, `p95 1.2`) matching and is a denylist that must grow with each new false positive. The cue-required allowlist above is the more durable shape and aligns with 0077's "assertion-shaped claim" direction.

**R2 — credit engineering evidence in `hasSourceCitations`.**

Add to the citation set (`SOURCE_PATTERNS`, `ah_guard.ts:34-40`) — conservative forms only:

```ts
// Evidence citations a coding agent actually emits (0079). NOT a bare code fence — too broad.
/\b[\w./-]+\.[a-z]{1,6}:\d+(?:[-:]\d+)?\b/i,     // file:line / file:line-range  (foo.ts:12, a/b.rs:8-20)
/\bexit(?:\s+code)?\s*[:=]?\s*\d+\b/i,           // "exit 0", "exit code 0"
/\b\d+\s+pass(?:ed|ing)?\b[\s\S]{0,40}?\b\d+\s+fail/i,  // "1626 pass … 0 fail"
```

Guardrails so the guard keeps catching real hallucinations: do NOT add a `/```[\s\S]*?```/` fence match (nearly every reply has one). The "uncited external claim still blocks" AC is the regression that proves R2 didn't over-broaden — keep it. If review judges R2 too permissive to ship with R1, it can be split into its own follow-up; R1 alone resolves the reported incident (once `needsVerification` is false, `hasSourceCitations` is never consulted).

**Interaction / short-circuit.** `verifyAntiHallucinationProtocol` (`ah_guard.ts:317-366`) checks `requiresExternalVerification` first and returns `{ok:true, reason:'internal discussion'}` at line 326-328 when it's false. So R1 alone fully clears the incident: a pure-metrics verdict returns false → neither source nor confidence is demanded. R2 matters for the *mixed* case — a reply that legitimately references an external thing AND cites it via `file:line`/command — so that evidence-dense answers aren't nagged for a URL.

**Out of scope (do not touch):** the confidence-level demand (`CONFIDENCE_PATTERNS` / `hasConfidenceLevel`, lines 43-47 / 249-258) — cheap and correct; the red-flag/tool-usage logic; `resolveStopContext` fail-open + loop-guard; the exit-2 hook contract; the `hook-run.ts` deep-import seam (that is 0077 R2). Keep the change surgical: two pattern sets + tests + release bump.

### Plan

1. **Reproduce first (red).** Add the R3(a) regression test to `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts`: a metrics-dense verdict string (`94.87%`, `100.00%`, `1626 pass / 0 fail`, a `file:line` anchor, `exit 0`) asserting `requiresExternalVerification` → `false` and `verifyAntiHallucinationProtocol` → `{ok:true}`. Confirm it FAILS against current code (proves the bug and the test's power). Optionally reproduce end-to-end: `echo '{"last_message":"…94.87%…"}' | ARGUMENTS=… superskill hook run cc anti-hallucination` shows the exit-2 block.

2. **Implement R1.** Replace the version entry in `STRONG_CLAIM_PATTERNS` (`ah_guard.ts:288`) with the three cue-gated patterns from Design; keep the other five entries verbatim. Update the inline comment to reference 0079. Re-run — the R3(a) test goes green.

3. **Guard the positives (R3b).** Add/confirm assertions that `'Version 2.0 introduced this'`, `'…for version 1.5'`, `'library version 2.3.1 …'`, `'…introduced in version 2.0.'`, `v2.0`, and `1.2.3` still return `true`. Run the full `requiresExternalVerification` and `verifyAntiHallucinationProtocol` describe blocks.

4. **Implement R2.** Extend `SOURCE_PATTERNS` (`ah_guard.ts:34-40`) with the file:line / exit / test-result patterns (no bare fence). Add R3(c) tests: `hasSourceCitations` true for a `file:line` anchor and for `exit 0`; false for a citation-free reply. Add the "uncited external claim still blocks" AC test (external claim + no citation → block).

5. **Confirm no collateral change.** Run `validate_response.test.ts` — it must stay green with no edit to `validate_response.ts`. Grep `plugins/cc/skills/anti-hallucination/references/` for any doc that enumerates "what counts as a citation" / "what triggers verification"; align wording with R1/R2 if present.

6. **Release + docs (R5).** Bump `plugins/cc/plugin.json` `version` from `0.3.0` per repo convention; add a `CHANGELOG.md` entry ("fix: anti-hallucination guard no longer flags coverage/metric decimals as versions; credits file:line and command evidence as citations"). Update the `ah_guard.ts` header docblock only if it lists trigger heuristics.

7. **Gate.** Run `bun run spur-check` (lint + `recommended-pre-check` + `bun test --coverage` + `recommended-post-check`, all `--fail-on warning`). Confirm no skipped tests, no new suppressions, coverage on `ah_guard.ts` not reduced. Inspect `git status` for intentional changes only.

8. **Record evidence.** Paste the failing-then-passing R3(a) run, the preserved-positive run, and the final `spur-check` result into the task's Testing section. Include the end-to-end `superskill hook run` allow/block transcript for the metrics verdict vs. the uncited external claim.

### Solution

`STRONG_CLAIM_PATTERNS[0]` in `ah_guard.ts` was `/\bv?\d+\.\d+(?:\.\d+)?\b/` — a broad regex that treated ANY 2-part decimal as a software version. Coverage percentages (`94.87%`), ratios (`1.5`), durations (`1.5s`), and even pasted test output (`100.00%`) matched, so `requiresExternalVerification` returned `true` on exactly the most evidence-dense turns. The `/sp:dev-verify` incident payload (`file:line` anchors + `1626 pass / 0 fail` + coverage metrics) was blocked by the guard as a false positive.


**R1 — cue-gated version regex.** Replaced the broad single regex with three patterns that each require a version cue:
- `/\bv\d+(?:\.\d+)+\b/i` — `v`-prefixed (`v2`, `v2.0`, `v1.2.3`).
- `/\b(?:version|release|semver)\s+v?\d+\.\d+/i` — worded (`version 2.0`, `release 1.4`).
- `/(?<![\d.])\d+\.\d+\.\d+(?![\d.])(?!\s*%)/` — 3-part semver (`1.2.3`), with negative lookbehind/ahead to avoid matching inside a longer number and a `(?!\s*%)` to skip metric percentages.

Bare 2-part decimals (`94.87`, `1.5`, `100.00`) no longer trip the gate. Genuine version references (`version 2.0`, `v2.0`, `1.2.3`, `pinned at 1.2.3`) still do.

**R2 — recognize engineering evidence as source citations.** Extended `SOURCE_PATTERNS` with three forms coding agents actually use:
- `file:line` anchors: `/\b[a-zA-Z][a-zA-Z0-9_-]*\.[a-zA-Z0-9]+:\d+(?:-\d+)?/` — matches `ah_guard.ts:288`, `foo.ts:12-20`. Requires a letter extension to avoid matching decimals like `94.87`.
- exit-code lines: `/\bexit\s+code\s+\d+/i` and `/\bexit\s+\d+/i` — matches `exit 0`, `exit code 1`.
- pasted test-result lines: `/\b\d+\s+pass(?:ed)?\s+(?:\/|and)\s+\d+\s+fail(?:ed)?\b/i` — matches `1626 pass / 0 fail`, `3 passed and 0 failed`.

A bare fenced code block alone is intentionally NOT credited — too broad, would neuter the guard.

Six new test cases in three new describe blocks:
- `requiresExternalVerification (0079: metrics are not versions)` — the incident payload passes; bare metric decimals pass; genuine version references still trigger (R3b intended-positive regression).
- `verifyAntiHallucinationProtocol (0079: metrics verdict is not blocked)` — the incident verdict is allowed without demanding `Source:`/confidence; an uncited external claim that mentions a version is still blocked (R4 — the guard keeps its teeth).
- `hasSourceCitations (0079: credit engineering evidence)` — `file:line`, exit-code, and test-result lines all credit; a bare fenced code block does not; an uncited external claim still fails.

All 75 anti-hallucination tests pass (66 in `ah_guard.test.ts` + 9 in `validate_response.test.ts`). The existing `'library API added a new method in version 3.1'` case still triggers (it has the `version` word cue), so R4 is preserved.

- `plugins/cc/skills/anti-hallucination/references/guard-implementation.md` — "External Verification Required" section rewritten to document the cue-gated version regex and the new engineering-evidence citation forms.
- `plugins/cc/plugin.json` — version bumped `0.3.0` → `0.3.1`.
- `CHANGELOG.md` — added `## [0.3.1] - 2026-07-13` bug-fix entry.

- `bun test plugins/cc/scripts/anti-hallucination/tests/` → 75 pass / 0 fail / 110 expect() calls.
- `cd plugins/cc && bun test tests/structure.test.ts` → 7 pass / 0 fail / 70 expect() calls.
- `bun run lint` → biome checked 165 files, typecheck passed.
- `bun test` (full repo) → 1406 pass / 0 fail / 3512 expect() calls.

- `plugins/cc/scripts/anti-hallucination/ah_guard.ts` — `STRONG_CLAIM_PATTERNS` cue-gated (R1), `SOURCE_PATTERNS` extended (R2).
- `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` — 6 new test cases in 3 new describe blocks.
- `plugins/cc/skills/anti-hallucination/references/guard-implementation.md` — verification rules docs updated.
- `plugins/cc/plugin.json` — version bump.
- `CHANGELOG.md` — 0.3.1 entry.

### Testing

**Verdict: PASS** — verified 2026-07-13 via `/sp:dev-verify 0079 --auto --focus all --fix all --force`. All 5 requirements MET, all 6 Acceptance-Criteria scenarios MET, design-conformant. Only minor/advisory findings (no blocker/major).

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 — cue-gated version detection | MET | `ah_guard.ts:300-303` — broad `/\bv?\d+\.\d+/` replaced by 3 cue-gated patterns (v-prefix, version word, 3-part semver `(?!\s*%)`); other 5 `STRONG_CLAIM_PATTERNS` entries preserved verbatim (`:304-308`). Probe: `requiresExternalVerification('coverage 94.87% line 100.00%')` → `false`; `'ratio 1.5 p95 1.2'` → `false`; `'version 2.0'`/`'v2.0'`/`'semver 1.2.3'` → `true`. |
| R2 — credit engineering evidence | MET | `ah_guard.ts:41-48` — `SOURCE_PATTERNS` extended with `file:line`, `exit`/`exit code`, and `N pass / N fail` regexes; no bare-fence match. Signature `hasSourceCitations(text): boolean` unchanged. Probe: true for `ah_guard.ts:288`, `foo.ts:12-20`, `exit 0`, `exit code 0`, `1626 pass / 0 fail`; false for fence-only and uncited reply. |
| R3 — regression corpus | MET | `tests/ah_guard.test.ts` +91 lines / 6 new tests in 3 describe blocks: metrics-dense verdict → `false` + protocol `{ok:true}`; intended-positive version cases still `true`; `hasSourceCitations` credits file:line/exit/test-result, rejects fence-only & uncited. |
| R4 — no regression, contract preserved | MET | `validate_response.ts` NOT in diff (confirmed). Full suite `bun test` → 1406 pass / 0 fail. Fail-open + `stop_hook_active` loop-guard + exit 0/2 contract verified end-to-end (AC5). Exported signatures unchanged; confidence demand (`hasConfidenceLevel`) untouched. |
| R5 — release + docs | MET | `plugin.json` version `0.3.0`→`0.3.1`; `CHANGELOG.md` `[0.3.1] - 2026-07-13` bug-fix entry; `guard-implementation.md` rewritten for cue-gated version + engineering-evidence citations; inline comments reference 0079. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| Scenario: metrics-dense verdict not flagged | MET | command + test | Working-tree CLI `hook run cc anti-hallucination` on metrics payload → exit `0`, `{"hookSpecificOutput":{"hookEventName":"Stop"}}`; `requiresExternalVerification` → false, protocol → `{ok:true}` (source probe + test). |
| Scenario: genuine version claims still trigger | MET | test | `requiresExternalVerification` → true for `Version 2.0`, `version 1.5`, `version 2.3.1`, `introduced in version 2.0.`, `v2.0`, `1.2.3` — all green in `ah_guard.test.ts`. |
| Scenario: file:line & command evidence count as citations | MET | test | `hasSourceCitations` → true for `ah_guard.ts:288`, `foo.ts:12-20`, `exit 0`, `exit code 0`, `1626 pass / 0 fail`. |
| Scenario: uncited external claim still blocks | MET | command | Working-tree CLI on uncited version claim → exit `2` + reason `Add verification for: source citations for API/library claims, confidence level (HIGH/MEDIUM/LOW)`. |
| Scenario: guard fails open, no loop | MET | command | `stop_hook_active:true` → exit `0`; invalid stdin → exit `0`. `resolveStopContext` unchanged. |
| Scenario: suite + gate remain green | MET | command | `bun run spur-check` → 1406 pass / 0 fail; post-check rules coverage-gate + skill-citations-resolve + tsdoc-export all pass; no skipped tests, no new suppressions. |

**Fresh verification evidence (run 2026-07-13)**

- `bun test plugins/cc/scripts/anti-hallucination/tests/` → 75 pass / 0 fail / 110 expect().
- `bun run spur-check` → lint + pre-check + `bun test` (1406 pass / 0 fail / 3512 expect(), 74 files) + 3 post-check rules all green.
- End-to-end hook via working-tree CLI (`bun apps/cli/src/index.ts hook run cc anti-hallucination`): metrics verdict → exit 0; uncited external+version → exit 2; `stop_hook_active` → exit 0; invalid stdin → exit 0.
- Coverage: `ah_guard.ts` 100.00% func / 95.54% line (uncovered = `import.meta.main` stdin-read block, not unit-testable); coverage-gate rule passed.

**Findings (non-blocking)**

- MINOR (comment accuracy): `ah_guard.ts:301` comment reads `v-prefixed: v2, v2.0, v1.2.3`, but `/\bv\d+(?:\.\d+)+\b/` requires ≥1 dotted group, so bare `v2` does not match (only `v2.0`+). Cosmetic only — R1's required examples (`v2.0`, `v1.2.3`) all match; Solution note repeats the same wording. Not auto-fixed (below the `--fix all` major threshold).
- ADVISORY (deploy, out of task scope): the globally-installed `superskill` binary is `node_modules/@gobing-ai/superskill/dist/index.js` (v0.3.0), which bundles the pre-fix `ah_guard` at compile time via the ADR-022 deep-import seam (`hook-run.ts:6-10`). The live installed Stop hook keeps false-positiving on metrics until the CLI is rebuilt (`bun run build`) and the package republished/reinstalled. The source fix is correct and verified from the working tree; this is a release/deploy step, not a code defect.

### References

**Code under change**

- `plugins/cc/scripts/anti-hallucination/ah_guard.ts` — `STRONG_CLAIM_PATTERNS` L287-294 (version regex L288), `SOURCE_PATTERNS` L34-40, `hasSourceCitations` L238-247, `requiresExternalVerification` L305-315, `verifyAntiHallucinationProtocol` L317-366 (short-circuit at L326-328, issue push at L346-352), `CONFIDENCE_PATTERNS`/`hasConfidenceLevel` L43-47/L249-258 (out of scope).
- `plugins/cc/scripts/anti-hallucination/validate_response.ts` — delegates to `verifyAntiHallucinationProtocol`; no edit expected (confirm green).
- `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` — `describe('requiresExternalVerification')` L170, version positives L199-200 / L263 / L354 / L398, `describe('hasSourceCitations')` L60, `describe('verifyAntiHallucinationProtocol')` L212. Add R3 tests here.

**Hook wiring**

- `plugins/cc/hooks/hooks.json` — registers the Stop hook `superskill hook run cc anti-hallucination`, matcher `*`, `minCliVersion 0.2.19`. No change needed.
- `plugins/cc/plugin.json` — `version 0.3.0` (bump for R5).
- `CHANGELOG.md` (repo root) — add release entry (R5).

**Prior art / lineage**

- Task **0077 R1** (`docs/tasks/0077_guard-heuristics-hook-seam-follow-ups-and-writing-great-skil.md`) — added the `WEAK_KEYWORD_PATTERN` + `CLAIM_COUPLER_PATTERN` gate; left the version regex broad. This task (0079) is its direct follow-up. 0077 R2 owns the `hook-run.ts` deep-import seam — do not touch it here.

**Commands**

- Run tests: `bun test --coverage` (from repo root) or target the file: `bun test plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts`.
- Full gate: `bun run spur-check` = `lint` (`biome check .` + typecheck) → `test-pre-check` (`spur rule run --preset recommended-pre-check --fail-on warning`) → `test` → `test-post-check`.
- End-to-end hook probe: pipe a Stop payload to `superskill hook run cc anti-hallucination`; exit 0 = allow, exit 2 = block (reason on stderr).

**Incident record**

- 2026-07-13: a `/sp:dev-verify` PASS verdict (ts-libs task 0043) was blocked by this hook. Empirical repro: `requiresExternalVerification("…94.87%…") === true` solely via the version regex; `verifyAntiHallucinationProtocol` returned the two-issue block ("source citations for API/library claims, confidence level (HIGH/MEDIUM/LOW)"). CLI and plugin cache both `0.3.0` — not a version-skew issue; a heuristic false positive.

### History
- 2026-07-13T17:56:41.517Z backlog → todo (system)
- 2026-07-13T18:41:50.018Z todo → wip (system)
- 2026-07-13T18:41:50.234Z wip → testing (system)
- 2026-07-13T18:46:47.545Z testing → done (system)
