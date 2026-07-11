---
schema_version: 1
name: "Fix dev-review residual findings in packages/core (minors, advisories, architecture deepening C1-C4)"
status: backlog
template: standard
created_at: 2026-07-11T22:37:58.941Z
updated_at: "2026-07-11T22:39:27.494Z"
---

## 0075. Fix dev-review residual findings in packages/core (minors, advisories, architecture deepening C1-C4)

### Background
A full `/sp:dev-review packages --focus all --fix all --auto --force` ran on 2026-07-11 across all 28 source files of `packages/core` (~5,700 lines). The blocker and major SECUA findings were fixed in that session (logged as bug-038..bug-042 in `.wolf/buglog.json`): `packageSkill` source-delete guard, `quoteYaml` newline escaping, `setSkillName` frontmatter scoping, `UserPromptSubmit` event mapping, and CRLF `parseFrontmatter` offsets — all with regression tests, gates green (lint, 1329 tests, build).

This task carries the **residual findings** that were deliberately not fixed in the review session (fix policy repaired blockers/majors only): five minor/advisory SECUA findings plus four architecture-deepening candidates (C1–C4) surfaced by the `sp:code-improvement` pass. Grouping them here keeps one traceable follow-up instead of losing them in the review transcript.

All `file:line` anchors below reflect the tree as of 2026-07-11 (post-fix commit pending); re-verify anchors before editing.
### Requirements
**Residual SECUA findings (minor/advisory)**

- R1. [minor, usability/correctness] `resolveContentPath('skill', <bareName>)` must also resolve the canonical dir-form under the type subdir: `<base>/skills/<name>/SKILL.md` (`packages/core/src/content/identity.ts:66-87` checks only `<base>/<name>/SKILL.md` and flat `<base>/skills/<name>.md`). Empirically confirmed: `packageSkill('my-skill')` fails from a root containing `skills/my-skill/SKILL.md`. Done when a bare name resolves the dir-form in the skills/ subdir and a regression test covers it.
- R2. [minor, usability] `validate --strict` flags the reference fields `skill:`, `agent:`, `command:` as "Unknown frontmatter key" while its own `checkLinkValidity` validates those very fields as references (`packages/core/src/operations/validate.ts:392` vs the `recognized` set at `:493-497`). Done when reference fields are in the recognized set (all content types) and a strict-mode test asserts no unknown-key warning for them.
- R3. [minor, security] The marketplace path-escape guard only rejects `..` segments; an **absolute** `metadata.pluginRoot` (e.g. `/etc`) passes the regex and escapes the marketplace root via `resolve(marketplaceRoot, pluginRootBase, source)` (`packages/core/src/marketplace.ts:116-124`). Done when absolute pluginRoot values are rejected with the existing escape-error message shape, with a test.
- R4. [advisory, usability] `checkBodyLinks` flags markdown links inside fenced code blocks as broken (`packages/core/src/operations/validate.ts:106-129`). Done when fenced regions are excluded from link checking (track ``` fences line-wise), with a test showing a code-fenced link no longer warns.
- R5. [advisory, correctness] `scoreSlashSyntax` uses `/\/[a-z][a-z-]*/g`, which matches any path segment (`src/foo` scores as slash syntax → false 1.0) (`packages/core/src/quality/command.ts:164`). Done when the pattern anchors to line start or whitespace (a genuine `/command` token) and a test pins a path-only body to the low score.

**Architecture deepening candidates (from sp:code-improvement)**

- R6. [major, weak locality — C1] Hook-event taxonomy has two divergent owners: `KNOWN_HOOK_EVENTS` (`packages/core/src/quality/hook.ts:7-17`, 9 Claude events) vs `CLAUDE_TO_CANONICAL_EVENT` (`packages/core/src/mapper.ts:21-39`, 15 entries). The drift already shipped one real bug (UserPromptSubmit silent drop, bug-041), and `validate` still warns on events the mapper converts fine. Done when one module (e.g. `content/hook-events.ts` or `targets`-adjacent) owns the Claude Code event-name set plus the canonical mapping, both consumers import it, and a test asserts every mapper key is a known event.
- R7. [major, wrong seam — C2] `packages/core` reaches into `apps/cli/src/templates` via `import.meta.dir` (`packages/core/src/operations/scaffold.ts:135-138`), inverting the workspace dependency; `packages/core/tests/package-boundary.test.ts` cannot catch it because it only scans `import` statements. Done when the app layer injects the built-in template base dirs (parameter on `scaffold()`/`resolveTemplate`, CLI passes its own paths), core keeps only user-override + explicit-path resolution, and the boundary test (or a sibling) also greps for `apps/cli` path fragments in core source. Audit `quality/rubric.ts:111-121` for the same pattern while there (its dev/prod paths stay within the package/bundle — verify, then leave or align). Re-verify the built bundle after (cerebrum 2026-07-10: import.meta.dir differs bundle-vs-source).
- R8. [minor, weak locality — C3] Frontmatter delimiter logic is hand-rolled in ~6 places; only `parseFrontmatter` and `setSkillName` are CRLF-safe after the 2026-07-11 fixes. `extractBody` (`packages/core/src/quality/heuristics.ts:291-296`) and the scaffold fence scanners (`packages/core/src/operations/scaffold.ts:87-132`) remain LF-only. Done when a shared bounds primitive lives in `content/frontmatter.ts` (e.g. `findFrontmatterBounds(content)`) and at minimum `extractBody` consumes it (CRLF test included); migrating the scaffold scanners and `rewriteAllowedToolsForPi` is in scope if the diff stays surgical.
- R9. [minor, dead surface — C4] `extractSkillsFromBody` (`packages/core/src/pipeline/pi-tools.ts:50-57`) has zero production callers while `resolvePiSkills` reimplements the same body-scan inline (`packages/core/src/pipeline/adapt-subagent.ts:150-163`). Done when exactly one implementation remains: either `resolvePiSkills` consumes the exported primitive (extended with the prefix/existence filtering it needs) or the dead export is deleted along with its re-export test.

**Constraints**

- Surgical changes per requirement; each R lands with its own regression test (per-file coverage gate is 90/90 — check margins before adding branches).
- R6/R7 are structural: read `docs/00_ADR.md` first; neither contradicts an existing ADR, but R7 may deserve a new dated entry if the template-resolution seam is considered cross-cutting.
- Do not re-suggest collapsing the `apps/cli/src/commands/*` handler duplication — explicitly rejected 2026-06-22 (cerebrum Decision Log).
### References

- Review session: `/sp:dev-review packages --focus all --fix all --auto --force`, 2026-07-11 (SECUA via sp:code-verification review mode; architecture via sp:code-improvement).
- Fixed-in-review bug log entries: `.wolf/buglog.json` bug-038..bug-042.
- Cerebrum learnings recorded 2026-07-11: quoteYaml newline contract, frontmatter-delimiter scatter, hook-event dual ownership, boundary-test blind spot (`.wolf/cerebrum.md`).
- rulesync canonical hook events: `vendors/rulesync/src/types/hooks.ts:49-125` (`HookEvent` union + `CLAUDE_HOOK_EVENTS`) — reference-only, never modify.
- Boundary guard this task extends: `packages/core/tests/package-boundary.test.ts`.
- Rejected-refactor guardrail: cerebrum Decision Log 2026-06-22 (command-handler factory).

### History
