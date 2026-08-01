---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: source parser, sanitizer, and frontmatter ports with vendor parity tests"
description: ""
status: done
type: task
profile: standard
feature_id: F2
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "interop", "port"]
dependencies: []
created_at: "2026-07-24T23:58:50.148Z"
updated_at: "2026-08-01T00:24:29.583Z"
---

## 0098. skills-ecosystem: source parser, sanitizer, and frontmatter ports with vendor parity tests

### Background

Implements: R1 (source-parser/sanitize/frontmatter part), R6 (subpath traversal + sanitizeName + terminal-escape guards). Foundation child — every sibling depends on its ParsedSource types and sanitizeName semantics. Ordering: first; 'agent registry + locks' and 'fetch + discovery' both block on this. Port (not depend on) vendors/skills/src/{source-parser,sanitize,frontmatter}.ts (MIT — attribution header + third-party notice); the npm package has no exports map and auto-wipes its global lock on version skew. Rubric: E2 D1 L1 C0 R1 = 5 → decompose (foundation with its own parity-test review gate).

### Requirements
- R1. Port `source-parser.ts` (full grammar: owner/repo[/subpath][@skill][#ref], github:/gitlab: prefixes, /tree/ and /-/tree/ URLs, git@/ssh/http(s), local paths, GHE via GH_HOST, SOURCE_ALIASES, sanitizeSubpath `..` rejection), `sanitize.ts` (sanitizeName + terminal-escape stripping), `frontmatter.ts` (YAML-only parser; name+description required strings) into `packages/core/src/skills-ecosystem/` with MIT attribution headers.
- R2. Parity tests port the vendor fixtures verbatim — `source-parser.test.ts`, `sanitize-name.test.ts`, `subpath-traversal.test.ts`, `sanitize-terminal.test.ts` — asserting identical outputs; security negatives are residual-proof per repo testing rules (every trigger half present).
- R3. No `@clack/prompts`, telemetry, or process.cwd()/homedir() module-load capture in ported code.
- R4. `bun run lint` clean; coverage ≥90% line/function on the new module.
### Acceptance Criteria

<!-- Copy or derive real scenarios from the linked feature. Do not leave placeholder AC here. -->

### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design

<!-- Chosen implementation approach, key tradeoffs, invariants, and impacted surfaces. -->

### Plan
1. Port `types.ts`, `github-host.ts`, `source-parser.ts`, `sanitize.ts`, `frontmatter.ts` from `vendors/skills/src/` into `packages/core/src/skills-ecosystem/` (verbatim, MIT attribution headers, Biome formatting, `node:path` imports).
2. Add barrel exports in `packages/core/src/index.ts`; re-export the skills-ecosystem `parseFrontmatter` as `parseSkillMdFrontmatter` to avoid the ambiguous-`export *` collision with `content/frontmatter`.
3. Port vendor fixtures verbatim into `packages/core/tests/skills-ecosystem/`: `source-parser.test.ts`, `sanitize-name.test.ts`, `subpath-traversal.test.ts`, `sanitize-terminal.test.ts` (vitest→bun:test import swap only).
4. Add net-new suites with no vendor counterpart: `github-host.test.ts` (GHE/`GH_HOST`, `parseOwnerRepo`, `isRepoPrivate` with mocked fetch), `frontmatter.test.ts`, `sanitize.test.ts` (cross-function invariants; anchors the `require-corresponding-test` rule).
5. Handle the `noControlCharactersInRegex` false positive on `sanitize.ts` (its patterns must match control bytes) inside the file itself — build the control bytes with `String.fromCharCode` and interpolate them — so there is no in-source suppression, no `.spur` rule exclusion, and no repo-wide `biome.json` exception.
6. Run `bun test packages/core/tests/skills-ecosystem/`, full `bun run test`, `bun run lint`, `bun run build`, `bun run spur-check`; record results in Testing.
### Solution
**Change map** (all new files; no existing seams touched):

- `packages/core/src/skills-ecosystem/types.ts` — `ParsedSource` (subset of vendor `types.ts` needed by the parser; agent table deferred to 0099).
- `packages/core/src/skills-ecosystem/github-host.ts` — verbatim port of `vendors/skills/src/github-host.ts` (`getGitHubHost`/`isGitHubHost`, GH_HOST read at call time, not module load).
- `packages/core/src/skills-ecosystem/source-parser.ts` — verbatim port of `vendors/skills/src/source-parser.ts` (full grammar: shorthand/`@skill`/`#ref`, `github:`/`gitlab:` prefixes, `/tree/` + `/-/tree/` URLs, git@/ssh/http(s), local paths, GHE via `GH_HOST`, `SOURCE_ALIASES`, `sanitizeSubpath` `..` rejection) plus `isSubpathSafe` ported from `vendors/skills/src/skills.ts:166` (co-located with `sanitizeSubpath` since both guard the subpath seam). `node:path` imports; Biome formatting; no behavior change.
- `packages/core/src/skills-ecosystem/sanitize.ts` — `stripTerminalEscapes`/`sanitizeMetadata` verbatim from `vendors/skills/src/sanitize.ts`; `sanitizeName` verbatim from `vendors/skills/src/installer.ts:50`.
- `packages/core/src/skills-ecosystem/frontmatter.ts` — `parseFrontmatter` verbatim from `vendors/skills/src/frontmatter.ts` (YAML-only, no JS engine) + `parseSkillFrontmatter` validator encoding the vendor's `typeof name/description === 'string'` check applied at every vendor discovery site.
- `packages/core/src/index.ts` — barrel exports; the skills-ecosystem `parseFrontmatter` is re-exported as `parseSkillMdFrontmatter` to avoid the ambiguous-`export *` collision with `content/frontmatter`.
- Tests under `packages/core/tests/skills-ecosystem/`: `source-parser.test.ts`, `sanitize-name.test.ts`, `subpath-traversal.test.ts`, `sanitize-terminal.test.ts` (vendor fixtures verbatim, vitest→bun:test import swap only); `github-host.test.ts` (GHE/`GH_HOST`, `parseOwnerRepo`, `isRepoPrivate` with mocked fetch — vendor suite has no GHE coverage); `frontmatter.test.ts`; `sanitize.test.ts` (cross-function invariants; anchors the test-location rule).
- `packages/core/src/skills-ecosystem/sanitize.ts` — the CWE-150 patterns build their control
  bytes with a local `ch()` = `String.fromCharCode` helper and interpolate them into `new RegExp`,
  so no regex *literal* contains a control byte. Biome flags neither
  `noControlCharactersInRegex` nor `useRegexLiterals` (a dynamic pattern cannot be a literal), so
  the file needs no suppression, no `.spur` rule exclusion, and no `biome.json` exception. Only the
  bytes the rule flags are built this way; printable ranges stay plain escapes and `C1_RE`
  (0x80-0x9f) stays a literal. Behavior parity is now proven by the ported vendor fixtures
  (`tests/skills-ecosystem/sanitize-terminal.test.ts`, 165 pass) rather than by source identity.
  **Correction history (task 0104):** this was first handled by excluding `sanitize.ts` from the
  `.spur` `no-biome-suppressions` rule, justified by a claim that a `biome.json` `overrides` block
  had been tried and made "Biome 2.4 discover the vendored nested root configs
  (`vendors/*/biome.json`) and hard-error". Retesting disproved that claim — `bunx biome check .`
  with an overrides block reports 0 errors and no nested-config discovery (`biome.json` already
  excludes `!**/vendors`). The exclusion and the 6 in-source `biome-ignore` comments were removed,
  and the override itself was then dropped too in favor of the in-file fix above, leaving
  `biome.json` untouched.
**Rationale notes:**

- Parity caveat found by the fixtures themselves: an empty `---\n---` block does NOT parse as frontmatter (vendor regex requires a newline before the closer), and GHE URLs with `..` are neutralized by WHATWG URL normalization before segment extraction — both asserted as vendor-behavior tests, not "fixed".
- R3 satisfied: no `@clack/prompts`, no telemetry, no `process.cwd()`/`homedir()` at module load (`resolve()` runs per-call; `GH_HOST` read per-call).
- 8 remaining Biome warnings are the vendor-verbatim `match[n]!` non-null assertions (warning level, kept for parity).
### Testing
**Per-Requirement Traceability** (re-audit 2026-07-24 via `/sp-dev-verify --force`; every `file:line` re-read this run)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 full-grammar ports with MIT attribution | MET | `packages/core/src/skills-ecosystem/{types,github-host,source-parser,sanitize,frontmatter}.ts` all present with Vercel MIT attribution headers; grammar features re-verified in `source-parser.ts`: git@ SSH `:26`, ssh:// `:39`, `sanitizeSubpath` `:116`, `isSubpathSafe` `:139`, `SOURCE_ALIASES` `:162`, `github:`/`gitlab:` prefixes `:182,:293`, `/tree/` URLs `:327-339`, `/-/tree/` `:362`; `GH_HOST` per-call in `github-host.ts:19-20`; `frontmatter.ts` YAML-only (header: no `---js` engine) + `parseSkillFrontmatter` validator `:47` |
| R2 vendor-verbatim parity fixtures | MET | 4 ported suites carry identical case/assertion counts to `vendors/skills/tests/`: source-parser 71 its/155 expects, sanitize-name 22/45, subpath-traversal 15/31, sanitize-terminal 28/52; `bun test packages/core/tests/skills-ecosystem/` → **165 pass / 0 fail** (7 files); security negatives carry full attack shapes (`..` segments, backslash traversal, basePath escape) |
| R3 no clack/telemetry/cwd-homedir capture | MET | module scan: 0 `@clack/prompts`, 0 `process.cwd()`, 0 `homedir()`; sole `telemetry` hit is a doc comment (`source-parser.ts:17`); `GH_HOST` read per-call, not at module load |
| R4 lint clean + coverage ≥90% | MET | `bun run spur-check` EXIT=0: Biome 195 files clean (0 warnings), pre-check 31/31, 1757 pass / 0 fail, post-check 3/3; module coverage this run: 100% functions all 5 files, lines 100% except source-parser 94.37% (gate ≥90%); `bun run build` EXIT=0 |

**Acceptance Criteria Verification** — the task's AC section is a bare placeholder comment (never filled); the 4 requirements carried the traceability load. No AC rows to evaluate. Flagged as a process observation in Review.

**Drift noted and corrected by this re-audit.** The Solution rationale and Review P4 row below still read "8 remaining Biome warnings … vendor-verbatim `match[n]!` kept for parity". Stale: task 0104's drive-by (fc791fb) resolved all 8 with `?? ''` — verified: 0 non-null assertions remain in the module, 8 `?? ''` sites (source-parser 6, frontmatter 2), and the current gate is warning-free. Behavior unchanged (fallbacks sit inside `if (match)` guards on mandatory capture groups).

**Historical closure record (2026-07-25, preserved).** Original closure: 165 pass module tests; lint clean with 8 vendor-parity warnings; 30/30 pre-check; full suite 1756 pass / 0 fail, aggregate 99.86% functions / 99.00% lines. Post-close correction (task 0104): the `sanitize.ts` `noControlCharactersInRegex` false positive is handled in-file via the `ch()` = `String.fromCharCode` helper (`sanitize.ts:24-37`) — no suppression, no `.spur` rule exclusion, no `biome.json` change; parity is carried by the ported fixtures, not source identity.
### Review
**Review Findings** (re-audit 2026-07-24 via `/sp-dev-verify --force`, SECUA all dimensions, module `packages/core/src/skills-ecosystem/`)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P1 | Security | — | None — `..` rejection + `isSubpathSafe`, CWE-150 escape stripping, YAML-only frontmatter (no eval), per-call `GH_HOST`; negatives carry full attack shapes | Clean |
| P2 | Correctness | — | None — parity fixtures pin vendor behavior including quirks (empty frontmatter block, WHATWG normalization) asserted as vendor-behavior, not "fixed" | Clean |
| P3 | Efficiency | — | None — regexes precompiled at module load | Clean |
| P4 | Usability | task file `### Solution` rationale + prior Review row | Stale text: "8 remaining Biome warnings … kept for parity" — resolved by fc791fb (`?? ''` ×8); code verified clean this run (0 non-null assertions) | Advisory / Corrected in Testing (this re-audit) |
| P4 | Process | task file `### Acceptance Criteria` | AC section is a bare placeholder comment, never filled; requirements carried the traceability load | Advisory / Accepted (verdict evaluated R1–R4 directly) |

No blocker or major SECUA findings. Functional traceability: R1–R4 MET with fresh evidence
(see `## Testing`, verdict artifact `.spur/run/0098-verdict.json` → PASS). The `ch()`
control-byte construction in `sanitize.ts:24-37` keeps the lint gate on the file with no
suppression, no rule exclusion, and no `biome.json` change — the correct resolution of the
original false positive.
### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-07-25T00:57:25.540Z todo → wip (system)
- 2026-07-25T01:24:39.154Z wip → testing (system)
- 2026-07-25T03:52:51.201Z testing → done (system)
