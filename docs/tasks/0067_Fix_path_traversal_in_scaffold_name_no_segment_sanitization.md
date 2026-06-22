---
name: Fix path traversal in scaffold name (no segment sanitization)
description: Fix path traversal in scaffold name (no segment sanitization)
status: Done
created_at: 2026-06-22T06:23:56.983Z
updated_at: 2026-06-22T08:00:00.000Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["scaffold","security","path-traversal","core"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0067. Fix path traversal in scaffold name (no segment sanitization)

### Background

A comprehensive code review of `packages/core` + `apps/cli` after the 0047-0066 rd3-vs-cc enhancement cycle found six latent correctness/consistency defects. Baseline is green (lint clean, 1026 tests pass, 0 skips, build exit 0); none of these are gate regressions — they are bugs the test suite does not cover. This task consolidates all six (originally split as #1-#6) into one fix campaign. Finding #7 (anatomy.md index drift) is intentionally out of scope.

**F1 (High) — path traversal in scaffold.** `core/operations/scaffold.ts:196` joins an unsanitized `name` onto the output dir. Verified live: `agent scaffold "../escape" --output $TMP/sub` wrote `$TMP/escape.md` — one level ABOVE the intended dir. `mapper.ts:142` already guards this exact class via `assertSafePathSegment`, but scaffold has no equivalent.

**F2 (Medium) — `--skills`/`--tools` emit invalid frontmatter.** `addScaffoldOptions` (helpers.ts:11-19) attaches both flags to ALL types, but field names are type-specific. Verified: `skill scaffold x --tools Read --skills foo` emits `tools:` + `skills:` into a SKILL.md whose schema is name/description/allowed-tools (both junk). `command scaffold x --tools Read` emits BOTH `allowed-tools:` (correct) AND `tools:` (wrong) — duplicate tool keys. No template ships a `skills:` field at all. Root cause: `mergeFrontmatterList` (scaffold.ts:188-189) is type-agnostic.

**F3 (Medium) — fragile frontmatter fence detection.** `mergeFrontmatterList` (scaffold.ts:86-103) finds the closing fence via `content.indexOf('---', openIdx+3)` — a substring scan. A user template (the resolver supports `~/.superskill/templates/`) with a `---` HR in its body makes the key insert land in the body. Same fragility class that motivated removing the old hook .md scaffold path; `content/frontmatter.ts` has a robust parser that is not reused.

**F4 (Low) — validate silently accepts unknown frontmatter keys.** `validate.ts:224-231` does `if (!def) continue;` — any key absent from `FIELD_TYPES[type]` is skipped with no finding, which is why F2's bogus keys validate as `Valid`. A `--strict` unknown-key warning would catch the F2 class at author time.

**F5 (Low) — `refine --save` double-evaluates.** `refine.ts:516-562` computes `postReport` at step 8, then on `--save` calls `evaluate(...save:true)` AGAIN (line 554) — re-reading + re-scoring identical content. `evolve.stepVerify` already does this in one pass.

**F6 (Low) — hook portability heuristic over-credits relative paths.** `quality/hook.ts:138`: `… || !/^\//.test(command.trim())` counts ANY command not starting with `/` as portable — so `node ./scripts/hook.js` (cwd-dependent) scores portable while only absolute paths are penalized, contradicting the dimension's own "use CLAUDE_PLUGIN_ROOT" recommendation.


### Requirements

All six fixes ship under this task. Each is independently verifiable; all share the verification gate. **Gates (all fixes): `bun run lint`, `bun run test` (no skips), `bun run build`, `git clean`.**

**R1 (F1 — path traversal):** `scaffold()` rejects a name that is not a single safe path segment BEFORE any filesystem write — empty, `.`, `..`, or containing `/`, `\`, `\0`. Reuse `assertSafePathSegment` (currently private in mapper.ts) by promoting it to a shared core export and calling it from both mapper and scaffold. Error names the offending value and states "must be a single path segment". Plain/dashed names still pass.

**R2 (F2 — flag→field mapping):** Scaffold never emits a frontmatter key the type's schema does not define. Drop `--skills` entirely (no type consumes a `skills:` key). Map `--tools` to the real field: `tools:` for agent, `allowed-tools:` for skill/command. No file ends up with two tool keys.

**R3 (F3 — fence hardening):** `mergeFrontmatterList` inserts/replaces keys only inside the leading YAML block for any well-formed input, including templates whose body contains `---`. Anchor on line boundaries (`/^---$/m`) or reuse `parseFrontmatter`. Built-in templates produce byte-identical output (no formatting churn). Empty-`items` no-op preserved.

**R4 (F4 — strict unknown-key warning):** Under `--strict` only, `validate` emits a `warning` (never `error`, never flips `valid`) for each frontmatter key not in `FIELD_TYPES[type] ∪ REQUIRED_FIELDS[type] ∪ KNOWN_OPTIONAL`. Non-strict behavior unchanged. Legitimate optional keys never warn; deprecated keys are not double-reported. A post-R2 scaffolded file is strict-clean.

**R5 (F5 — single evaluate on save):** `refine --save` evaluates content once (no second file read/score) and writes exactly one row with today's semantics (content_name, target, operation='refine', aggregate, dimensions, file_hash). The monotonic-guard rollback branch and the hook suggest-only save block are both preserved.

**R6 (F6 — portability tightening):** An entry counts as portable ONLY when it references `${CLAUDE_PLUGIN_ROOT}` OR is a bare binary (first token has no `/`, no leading `.`). Relative paths (`./x`, `../x`, `scripts/x`) and absolute paths are non-portable. Test expectations updated to the corrected scores (asserted, not loosened).


### Q&A



### Design

## Design

Six fixes across two workspaces. Three cluster on the scaffold/frontmatter surface (F1/F2/F3) and should land together; F4/F5/F6 are independent.

### F1 — path-segment guard (core)
Promote `assertSafePathSegment(value, label)` from `mapper.ts:142` (private) to a shared home (`content/identity.ts`), re-export from `packages/core/src/index.ts`. `mapper.ts` imports it (deletes local copy); `scaffold()` calls it first, before any `resolveTemplate`/`mkdir`/`write`. Reject (not sanitize) — a hard error matches how mapper already treats `pluginName` and avoids surprising silent rewrites. Invariant added: `scaffold()` never writes outside its `output` dir.

### F2 — flag→field mapping (core + cli)
Field truth table (from `FIELD_TYPES` + shipped templates): agent→`tools:`; skill/command→`allowed-tools:`; no type has `skills:`.
- **`--skills`:** DROP — remove the option in `addScaffoldOptions`, `skills` from `ScaffoldOptions`, the `<!-- SKILLS -->` placeholder, and the `mergeFrontmatterList('skills',…)` call.
- **`--tools`:** in `scaffold()` resolve `toolField = type === 'agent' ? 'tools' : 'allowed-tools'` and call `mergeFrontmatterList(content, toolField, parseList(opts.tools))` once. No double key because the template's existing field is the one being overridden.

### F3 — fence hardening (core)
Replace `indexOf('---')` with a line-anchored `/^---$/m` scan from the start: require ≥2 fence lines; restrict insert/replace to the span between the first two. Preserves the current splice (byte-stable output) without YAML round-trip churn. Reusing `parseFrontmatter` is the cleaner long-term move but risks reformatting — defer unless R2's mapping forces a reparse. Same function as F2; sequence F3 then F2 on top.

### F4 — strict unknown-key warning (core)
Add to `strictChecks` (validate.ts:395) so it never fires in the permissive default path. Recognized = `keys(FIELD_TYPES[type]) ∪ REQUIRED_FIELDS[type] ∪ KNOWN_OPTIONAL`, where `KNOWN_OPTIONAL` (e.g. `target`, `argument-hint`) is derived by auditing shipped templates so post-F2 scaffolds are strict-clean. Exclude deprecated keys (already reported by the deprecated-field check) to avoid double-counting. Always `warning`; never flips `valid`. This is the safety net for the F2 class, not a replacement for F2.

### F5 — single evaluate on save (cli)
Step 8's evaluate must stay a pure score because the monotonic guard can ROLLBACK after it — passing `save:true` there would persist a score about to be reverted. Fix: after the guard, on the no-rollback `--save` branch, persist the already-computed `postReport` via a persist-from-report path (reuse `persistEvaluation` in evaluate.ts, which already takes a report) instead of a second `evaluate(...)`. Rollback branch persists baseline/restored or skips, matching today. Hook suggest-only return (before any save) untouched. Mirrors `evolve.stepVerify`.

### F6 — portability predicate (core)
Replace the predicate in `scorePatternMatchQuality` (hook.ts:138): portable iff command contains `${CLAUDE_PLUGIN_ROOT}` OR its first whitespace-delimited token contains no `/` and no leading `.` (bare binary). Any first token with `/` (absolute or relative) without `${CLAUDE_PLUGIN_ROOT}` is non-portable. Weights unchanged (0.3/0.4/0.3). Re-baseline against `plugins/cc/hooks/hooks.json` and update expected test scores to corrected values deliberately.


### Solution

## Solution

One fix campaign, six changes. Recommended landing order: **F1 → F3 → F2 → F4 → F5/F6** (F3 before F2 since both edit `mergeFrontmatterList`; F2 before F4 since F4's "scaffold is strict-clean" test depends on F2). F5/F6 are independent.

- **F1:** Move `assertSafePathSegment` to `content/identity.ts`, export from core; `mapper.ts` imports it; `scaffold()` calls `assertSafePathSegment(name, 'content name')` first.
- **F3:** Line-anchored fence detection (`/^---$/m`) in `mergeFrontmatterList`; restrict key insert/replace to the first frontmatter span.
- **F2:** Drop `--skills` (option, type, placeholder, merge call). Map `--tools` to per-type field via `toolField`; single `mergeFrontmatterList` call with no double key.
- **F4:** Unknown-key `warning` pass in `strictChecks` against the recognized-key set; strict-only; exclude deprecated keys.
- **F5:** Persist `postReport` once on the no-rollback `--save` branch (reuse `persistEvaluation`); delete the second `evaluate(...save:true)`.
- **F6:** New portability predicate requiring `${CLAUDE_PLUGIN_ROOT}` or bare binary; re-baseline test scores.

Each change carries its own unit tests (see Plan). All share the gate: `bun run lint`, `bun run test` (no skips), `bun run build`, `git clean`.


### Plan

## Plan

Land in order F1 → F3 → F2 → F4 → F5 → F6 (dependencies: F3 before F2; F2 before F4). Each step ends green before the next.

**F1 — path traversal**
1. Move `assertSafePathSegment` to `content/identity.ts`; export from `packages/core/src/index.ts`; `mapper.ts` imports it (delete local copy).
2. `scaffold()` calls it first. Tests: reject `'../escape'`, `'..'`, `'.'`, `'a/b'`, `'a\b'`, `'a\0b'`; accept `'my-agent'`, `'cmdtest'`. Verify live repro no longer escapes.

**F3 — fence hardening**
3. Replace `indexOf('---')` in `mergeFrontmatterList` with line-anchored detection. Test: a template whose body has a `---` HR + `--tools` → key lands in frontmatter, body HR intact; built-in templates byte-stable.

**F2 — flag→field mapping**
4. Remove `--skills` (option/type/placeholder/merge call). Map `--tools` via `toolField` per type; update help text. Tests: skill/command `--tools Read` → `allowed-tools` has Read, NO `tools:`; agent → `tools:`; never both; `--skills` gone.

**F4 — strict unknown-key warning**
5. Audit `src/templates/*/default.md` → `KNOWN_OPTIONAL`. Add unknown-key `warning` pass in `strictChecks`. Tests: orphan key warns under `--strict`, clean without; known optional never warns; deprecated not double-counted; post-F2 scaffold is strict-clean.

**F5 — single evaluate on save**
6. Rewire `refine`: step 8 stays pure-score; after monotonic guard, persist `postReport` once on no-rollback `--save`; delete step-10 `evaluate(...save:true)`. Tests: exactly one row per `--save`; zero without; aggregate matches displayed score; rollback + hook-save-block unchanged.

**F6 — portability predicate**
7. Replace predicate in `scorePatternMatchQuality`. Re-run `hook evaluate plugins/cc/hooks/hooks.json`; update expected scores. Tests: `${CLAUDE_PLUGIN_ROOT}/x.sh`→portable; `node ./scripts/x.js`→not; `/usr/bin/x`→not; `eslint .`→portable.

**Close-out**
8. Full gate: `bun run lint`, `bun run test`, `bun run build`, `git status`.

## Acceptance

- **F1:** scaffold throws (before any write) for unsafe names; valid names still scaffold; mapper uses the shared guard; live traversal repro contained.
- **F2:** `--skills` removed; `--tools` writes correct per-type field; no duplicate tool keys; scaffolds pass `validate --strict` with no unknown-key warning.
- **F3:** key insert/replace stays in frontmatter for body-`---` inputs; built-in templates byte-identical; empty-items no-op preserved.
- **F4:** `--strict` warns on unrecognized keys (warning, not error); non-strict unchanged; deprecated not double-reported.
- **F5:** `refine --save` does one evaluation + one row; rollback + hook guard intact.
- **F6:** relative/absolute paths not portable; `${CLAUDE_PLUGIN_ROOT}`/bare-binary portable; test scores corrected (asserted).
- All four gates pass; `git status` shows only intended changes.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


