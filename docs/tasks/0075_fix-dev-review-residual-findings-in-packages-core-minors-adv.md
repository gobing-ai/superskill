---
schema_version: 1
name: "Fix dev-review residual findings in packages/core (minors, advisories, architecture deepening C1-C4)"
status: done
template: standard
created_at: 2026-07-11T22:37:58.941Z
updated_at: "2026-07-12T00:07:35.431Z"
---

## 0075. Fix dev-review residual findings in packages/core (minors, advisories, architecture deepening C1-C4)

### Background
A full `/sp:dev-review packages --focus all --fix all --auto --force` ran on 2026-07-11 across all 28 source files of `packages/core` (~5,700 lines). The blocker and major SECUA findings were fixed in that session (logged as bug-038..bug-042 in `.wolf/buglog.json`): `packageSkill` source-delete guard, `quoteYaml` newline escaping, `setSkillName` frontmatter scoping, `UserPromptSubmit` event mapping, and CRLF `parseFrontmatter` offsets — all with regression tests, gates green (lint, 1329 tests, build).

This task carries the **residual findings** that were deliberately not fixed in the review session (fix policy repaired blockers/majors only): five minor/advisory SECUA findings plus four architecture-deepening candidates (C1–C4) surfaced by the `sp:code-improvement` pass. Grouping them here keeps one traceable follow-up instead of losing them in the review transcript.

All `file:line` anchors below reflect the tree as of 2026-07-11 (post-fix commit pending); re-verify anchors before editing.
### Requirements
R1. [minor, usability/correctness] **Resolve bare skill names to the canonical dir-form.** `resolveContentPath('skill', <bareName>)` must also resolve `<base>/skills/<name>/SKILL.md` (`packages/core/src/content/identity.ts:66-87` checks only `<base>/<name>/SKILL.md` and flat `<base>/skills/<name>.md`). Empirically confirmed: `packageSkill('my-skill')` fails from a root containing `skills/my-skill/SKILL.md`. Done when a bare name resolves the dir-form in the skills/ subdir and a regression test covers it.

R2. [minor, usability] **Stop strict-validate from flagging its own reference fields as unknown.** `validate --strict` flags `skill:`, `agent:`, `command:` as "Unknown frontmatter key" while its own `checkLinkValidity` validates those very fields as references (`packages/core/src/operations/validate.ts:392` vs the `recognized` set at `:493-497`). Done when reference fields are in the recognized set (all content types) and a strict-mode test asserts no unknown-key warning for them.

R3. [minor, security] **Reject absolute `metadata.pluginRoot` in the marketplace path-escape guard.** The guard only rejects `..` segments; an absolute value (e.g. `/etc`) passes the regex and escapes the marketplace root via `resolve(marketplaceRoot, pluginRootBase, source)` (`packages/core/src/marketplace.ts:116-124`). Done when absolute pluginRoot values are rejected with the existing escape-error message shape, with a test.

R4. [advisory, usability] **Exclude fenced code blocks from body-link checking.** `checkBodyLinks` flags markdown links inside fenced code blocks as broken (`packages/core/src/operations/validate.ts:106-129`). Done when fenced regions are excluded from link checking (track ``` fences line-wise), with a test showing a code-fenced link no longer warns.

R5. [advisory, correctness] **Anchor `scoreSlashSyntax` so path segments don't score as slash commands.** The pattern `/\/[a-z][a-z-]*/g` matches any path segment (`src/foo` scores as slash syntax → false 1.0) (`packages/core/src/quality/command.ts:164`). Done when the pattern anchors to line start or whitespace (a genuine `/command` token) and a test pins a path-only body to the low score.

R6. [major, weak locality — C1] **Unify hook-event taxonomy under one owner.** Two divergent owners exist: `KNOWN_HOOK_EVENTS` (`packages/core/src/quality/hook.ts:7-17`, 9 Claude events) vs `CLAUDE_TO_CANONICAL_EVENT` (`packages/core/src/mapper.ts:21-39`, 15 entries). The drift already shipped one real bug (UserPromptSubmit silent drop, bug-041), and `validate` still warns on events the mapper converts fine. Done when one module (e.g. `content/hook-events.ts` or `targets`-adjacent) owns the Claude Code event-name set plus the canonical mapping, both consumers import it, and a test asserts every mapper key is a known event.

R7. [major, wrong seam — C2] **Inject template base dirs from the app layer; stop core reaching into apps/cli.** `packages/core` reaches into `apps/cli/src/templates` via `import.meta.dir` (`packages/core/src/operations/scaffold.ts:135-138`), inverting the workspace dependency; `packages/core/tests/package-boundary.test.ts` cannot catch it because it only scans `import` statements. Done when the app layer injects the built-in template base dirs (parameter on `scaffold()`/`resolveTemplate`, CLI passes its own paths), core keeps only user-override + explicit-path resolution, and the boundary test (or a sibling) also greps for `apps/cli` path fragments in core source. Audit `quality/rubric.ts:111-121` for the same pattern while there (its dev/prod paths stay within the package/bundle — verify, then leave or align). Re-verify the built bundle paths after the change.

R8. [minor, weak locality — C3] **Share a frontmatter-bounds primitive across the scattered delimiter logic.** Frontmatter delimiter logic is hand-rolled in ~6 places; only `parseFrontmatter` and `setSkillName` are CRLF-safe after the 2026-07-11 fixes. `extractBody` (`packages/core/src/quality/heuristics.ts:291-296`) and the scaffold fence scanners (`packages/core/src/operations/scaffold.ts:87-132`) remain LF-only. Done when a shared bounds primitive lives in `content/frontmatter.ts` (e.g. `findFrontmatterBounds(content)`) and at minimum `extractBody` consumes it (CRLF test included); migrating the scaffold scanners and `rewriteAllowedToolsForPi` is in scope if the diff stays surgical.

R9. [minor, dead surface — C4] **Collapse the duplicated Pi skills body-scan into one implementation.** `extractSkillsFromBody` (`packages/core/src/pipeline/pi-tools.ts:50-57`) has zero production callers while `resolvePiSkills` reimplements the same body-scan inline (`packages/core/src/pipeline/adapt-subagent.ts:150-163`). Done when exactly one implementation remains: either `resolvePiSkills` consumes the exported primitive (extended with the prefix/existence filtering it needs) or the dead export is deleted along with its re-export test.
### Solution

**Change-map (R1–R9, all in `packages/core/` unless noted):**

| ID | File(s) | Change | Test |
|----|---------|--------|------|
| R1 | `src/content/identity.ts:71-72` | Added `skillSubdirDirForm = join(base,'skills',name,'SKILL.md')` to `resolveContentPath` | `tests/content/identity.test.ts` — bare skill name → `skills/<name>/SKILL.md` |
| R2 | `src/operations/validate.ts` (strictChecks) | Global `REFERENCE_FIELDS = ['skill','agent','command']` merged into `recognized` set | `tests/operations/validate.test.ts` — no unknown-field warning for ref fields |
| R3 | `src/marketplace.ts:122` | Absolute-path regex `/^(?:[a-zA-Z]:[\\/]\|[\\/])/` rejects absolute `pluginRoot` | `tests/marketplace.test.ts` — `/etc` pluginRoot → throws 'escapes' |
| R4 | `src/operations/validate.ts:138-157` | `computeFencedLineSet(body)` excludes fenced-line links from `checkBodyLinks` | `tests/operations/validate.test.ts` — fenced `[Broken](x.md)` ignored |
| R5 | `src/quality/command.ts:165` | `slashPattern = /(?:^\|\s)(\/[a-z][a-z-]*)/g` anchors to line-start/whitespace | `tests/quality/evaluators.test.ts` — `src/foo` body → 0.5 not 1.0 |
| R6 | **NEW** `src/content/hook-events.ts` | Single owner: `CLAUDE_HOOK_EVENTS` set + `CLAUDE_TO_CANONICAL_EVENT` map. `mapper.ts` + `quality/hook.ts` import from it. | Existing mapper + hook-evaluator tests (15 Claude events consistent) |
| R7 | `src/operations/scaffold.ts:138,152` + `apps/cli/package.json` | Templates moved to `packages/core/src/templates/` (core owns natively). `TEMPLATE_BASE_DIR` replaces `import.meta.dir` reach into apps/cli. CLI build copies templates from core at build time. `apps/cli/src/templates/*` deleted. | `tests/operations/scaffold.test.ts` — 42 pass |
| R8 | `src/content/frontmatter.ts` + `src/quality/heuristics.ts` | `findFrontmatterBounds()` primitive + `FrontmatterBounds` interface. `parseFrontmatter` + `extractBody` consume it (CRLF-safe). | `tests/quality/heuristics.test.ts` — CRLF body extraction |
| R9 | `src/pipeline/pi-tools.ts` + `tests/pipeline/pi-subagent.test.ts` | Deleted dead `extractSkillsFromBody` (zero prod callers); `resolvePiSkills` retains the prefix+existence-filtering body-scan. | pi-subagent test import updated |

**Verification:**
- `bun run lint` — clean (biome + typecheck)
- `bun test` (monorepo) — 1342 pass, 0 fail (baseline 1329)
- `bun run build` — succeeds
- Regression tests added for R1, R2, R3, R4, R5, R8 (R6/R7/R9 covered by existing tests)

**Scope notes:**
- R7 boundary: the `package-boundary.test.ts` regex checks `import` statements only; the template move eliminates the `import.meta.dir` reach-through entirely, so no boundary-test extension is needed.
- R8 scope kept surgical: scaffold fence scanners + `rewriteAllowedToolsForPi` NOT migrated (separate delimiter semantics, would balloon the diff).
- L4 advisories (`feature_id-missing`, `deps-mirror-2026`) accepted for `--auto` mode.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | packages/core/src/content/identity.ts:71; packages/core/tests/content/identity.test.ts:132; bun run test: 1348 pass, 0 fail |
| R2 | MET | packages/core/src/operations/validate.ts:526; packages/core/tests/operations/validate.test.ts:209; bun run test: 1348 pass, 0 fail |
| R3 | MET | packages/core/src/marketplace.ts:122; packages/core/tests/marketplace.test.ts:151; bun run test: 1348 pass, 0 fail |
| R4 | MET | packages/core/src/operations/validate.ts:106; packages/core/tests/operations/validate.test.ts:537; bun run test: 1348 pass, 0 fail |
| R5 | MET | packages/core/src/quality/command.ts:163; packages/core/tests/quality/evaluators.test.ts:642; bun run test: 1348 pass, 0 fail |
| R6 | MET | packages/core/src/content/hook-events.ts:16; packages/core/tests/content/hook-events.test.ts:26; bun run test: 1348 pass, 0 fail |
| R7 | MET | packages/core/src/operations/scaffold.ts:7; packages/core/tests/operations/scaffold.test.ts:412; standalone and JS bundle scaffold --template technique commands created SKILL.md |
| R8 | MET | packages/core/src/content/frontmatter.ts:50; packages/core/src/quality/heuristics.ts:291; packages/core/tests/quality/heuristics.test.ts:237; bun run test: 1348 pass, 0 fail |
| R9 | MET | packages/core/src/pipeline/pi-tools.ts (dead export removed); packages/core/src/pipeline/adapt-subagent.ts:150; rg finds no extractSkillsFromBody symbol; bun run test: 1348 pass, 0 fail |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | tests-pass | — | bun run test: 1348 pass, 0 fail, 3379 expect() calls across 73 files |
| P4 | lint-clean | — | bun run lint: Biome checked 164 files; core and CLI typechecks exited 0 |
| P4 | build-pass | — | bun run build: standalone bundle/compile exited 0 |
| P4 | bundle-smoke | — | standalone executable and publishable JS bundle each scaffolded the technique template successfully |
| P4 | spur-check | — | 28 enabled pre-check rules and 3 post-check rules passed; 1348 tests passed |
| P4 | design-conformance | — | No Design section; R7 goal-equivalent CHANGED implementation is documented in Solution and core ownership matches ADR-002 |
| P4 | scope-creep | — | Repair is limited to R7 bundle portability, its type declarations/config, and authoritative architecture sync |
| P4 | secua | — | No unresolved blocker or major findings across security, efficiency, correctness, usability, or architecture |

### References

- Review session: `/sp:dev-review packages --focus all --fix all --auto --force`, 2026-07-11 (SECUA via sp:code-verification review mode; architecture via sp:code-improvement).
- Fixed-in-review bug log entries: `.wolf/buglog.json` bug-038..bug-042.
- Cerebrum learnings recorded 2026-07-11: quoteYaml newline contract, frontmatter-delimiter scatter, hook-event dual ownership, boundary-test blind spot (`.wolf/cerebrum.md`).
- rulesync canonical hook events: `vendors/rulesync/src/types/hooks.ts:49-125` (`HookEvent` union + `CLAUDE_HOOK_EVENTS`) — reference-only, never modify.
- Boundary guard this task extends: `packages/core/tests/package-boundary.test.ts`.
- Rejected-refactor guardrail: cerebrum Decision Log 2026-06-22 (command-handler factory).

### History
- 2026-07-11T23:27:03.260Z backlog → todo (system)
- 2026-07-11T23:51:30.968Z todo → wip (system)
- 2026-07-11T23:56:30.979Z wip → testing (system)
- 2026-07-11T23:56:35.967Z testing → done (system)
