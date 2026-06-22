---
name: Decide cc hook-refine strategy (no rd3 equivalent exists)
description: Decide cc hook-refine strategy (no rd3 equivalent exists)
status: Done
created_at: 2026-06-21T21:06:05.280Z
updated_at: 2026-06-22T05:15:26.496Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
tags: ["cc-hooks","refine","dogfood","design-decision","missing-command"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0061. Decide cc hook-refine strategy (no rd3 equivalent exists)

### Background

Dogfood goal was /cc:hook-refine vs /rd3:hook-refine, but NEITHER EXISTS. (1) cc has NO hook-refine wrapper (plugins/cc/commands/ has agent/command/magent/skill-refine only — verified). (2) rd3 has NO hook-refine either (agent/command/magent/skill-refine + dev-refine only). (3) The shared refine engine (operations/refine.ts) classifies VALIDATION + EVALUATION findings into auto-apply/suggest/flag and applies mechanical frontmatter fixes (missing field -> default, type coercion, whitespace trim). Hooks are hooks.json (event->matcher->command), NOT .md-frontmatter — task 0051 made hooks EVALUABLE (correctness/event-coverage/safety/pattern-match) but the refine auto-fix machinery (generateAutoChange) is entirely frontmatter-oriented and does not map to JSON structure. Worse, AUTO-REWRITING a security-critical hooks.json command string (the refine flow mutates files) is high blast radius. Like task 0051/0056, this is a DESIGN+DECIDE task, NOT a replacement.


### Requirements

DESIGN DECISION REQUIRED (operator-confirmed shape: design+decide, like 0051/0056). Assess whether hook-refine is worth building: the refine auto-fix path is frontmatter-oriented and does not fit hooks.json; the highest-value hook fixes (remove rm -rf, add timeout, use CLAUDE_PLUGIN_ROOT) are SAFETY rewrites of shell commands — auto-applying them to a security-critical config is risky. Produce a recommendation: (A) build hook-refine that proposes (NOT auto-applies) safe rewrites for the dangerous patterns task 0051 detects, behind --dry-run/--confirm only; (B) de-scope hook-refine, document that hooks are fixed by hand-editing hooks.json + re-validating (hook validate already exists), ensure nothing advertises a hook-refine; (C) suggest-only — surface 0051 safety/pattern findings as actionable recommendations with no file mutation. Whichever: no false capability claims. Lower priority than 0057-0060; no user-facing command to break. Gates if code ships: bun run lint, bun run test (no skips), bun run build, git clean.


### Q&A

Design+decide task (mirrors 0051 hook-evaluate / 0056 hook-evolve). NOT a replacement — neither cc nor
rd3 has hook-refine. Verified: plugins/cc/commands/ has agent/command/magent/skill-refine only; rd3 has
agent/command/magent/skill-refine + dev-refine, no hook.

## Why this is a decision, not a build
The shared refine engine (operations/refine.ts) classifies validation+evaluation findings and applies
mechanical FRONTMATTER fixes (generateAutoChange: missing field -> default, type coercion, whitespace).
Hooks are hooks.json (event->matcher->command), NOT .md-frontmatter. Frictions:
1. generateAutoChange is entirely frontmatter-oriented; it has no mapping to JSON structure.
2. The high-value hook fixes (remove rm -rf / wget|sh, add timeout, use CLAUDE_PLUGIN_ROOT) detected by
   task 0051's safety scanner are SHELL-COMMAND rewrites of a security-critical file — auto-applying them
   is high blast radius (refine mutates files).
3. hook evaluate only landed in 0051; refine would need a JSON-aware fix generator built from scratch.

## Options
- **A** Build hook-refine that PROPOSES (never auto-applies) safe rewrites for the dangerous patterns 0051
  detects, gated behind --dry-run/--confirm only.
- **B** De-scope; document that hooks are fixed by hand-editing hooks.json + `hook validate` (exists);
  ensure nothing advertises a hook-refine.
- **C** Suggest-only: surface 0051 safety/pattern findings as actionable recommendations, no file mutation.

## DECISION (operator-confirmed 2026-06-21): C — suggest-only, no file mutation.
Surface the task-0051 safety/pattern findings as actionable recommendations (what to change and why);
NO file mutation, NO auto-apply, NO JSON-aware fix generator. Rationale: auto-rewriting a
security-critical hooks.json is hard to justify; suggest-only gives the safety signal without the
rewrite risk and reuses the existing 0051 scanner. NOT option A (no propose/apply machinery). Hand-fix
remains the path; `hook validate` (exists) verifies the result.

## Acceptance
Hook safety/pattern findings are surfaced as recommendations only; nothing mutates hooks.json; no
wrapper or help text claims an apply-capable hook-refine. Gates if code ships: bun run lint,
bun run test (no skips), bun run build, git clean.


### Design

Design+decide task (mirrors 0051 hook-evaluate / 0056 hook-evolve). NOT a replacement — neither cc nor
rd3 has hook-refine. Verified: plugins/cc/commands/ has agent/command/magent/skill-refine only; rd3 has
agent/command/magent/skill-refine + dev-refine, no hook.

## Why this is a decision, not a build
The shared refine engine (operations/refine.ts) classifies validation+evaluation findings and applies
mechanical FRONTMATTER fixes (generateAutoChange: missing field -> default, type coercion, whitespace).
Hooks are hooks.json (event->matcher->command), NOT .md-frontmatter. Frictions:
1. generateAutoChange is entirely frontmatter-oriented; it has no mapping to JSON structure.
2. The high-value hook fixes (remove rm -rf / wget|sh, add timeout, use CLAUDE_PLUGIN_ROOT) detected by
   task 0051's safety scanner are SHELL-COMMAND rewrites of a security-critical file — auto-applying them
   is high blast radius (refine mutates files).
3. hook evaluate only landed in 0051; refine would need a JSON-aware fix generator built from scratch.

## Options
- **A** Build hook-refine that PROPOSES (never auto-applies) safe rewrites for the dangerous patterns 0051
  detects, gated behind --dry-run/--confirm only.
- **B** De-scope; document that hooks are fixed by hand-editing hooks.json + `hook validate` (exists);
  ensure nothing advertises a hook-refine.
- **C** Suggest-only: surface 0051 safety/pattern findings as actionable recommendations, no file mutation.

## Recommendation
Lean B or C. Auto-rewriting security-critical shell config is hard to justify; suggest-only (C) gives the
safety signal without the rewrite risk and reuses the 0051 scanner. Operator to confirm A/B/C.

## Acceptance
Decision recorded with rationale. If C: suggest-only hook surface, no mutation. If B: documented de-scope,
no false claims. If A: gated build, propose-only, --dry-run/--confirm, safety stays strict.


### Solution

**Approach: suggest-only surface for hooks, auto-apply/save blocked (mirrors task 0056 pattern for evolve).**

The shared `refine()` engine classifies validation+evaluation findings and applies mechanical FRONTMATTER fixes (`generateAutoChange`: missing field → default, type coercion, whitespace). Hooks are `hooks.json` (event→matcher→command), not `.md`-frontmatter. The auto-apply path mutates a security-critical file via shell-command rewrites — high blast radius. Decision C: surface findings as suggestions only; NO file mutation.

**Two-layer fix (same architecture as 0056 hook-evolve analyze-only):**

1. **Command layer** (`commands/hook.ts`): Replace `addAutoOption`+`addSaveOption` on `hook refine` with a hook-specific `addHookRefineOptions` that only registers `--target` and `--dry-run`. The `--auto` and `--save` mutation flags are never advertised in help text.

2. **Engine layer** (`operations/refine.ts`): Add a `isHookApplyCapableOpt()` check at the top of `refine()` that refuses `--auto` and `--save` when `type === 'hook'`. Defense-in-depth: even if a user passes the flag via a raw API call, the engine rejects it.

3. **Documentation** (`plugins/cc/agents/expert-hook.md`, `docs/help/cmd_hook.md`): Remove false claims of apply-capable hook-refine; replace with suggest-only guidance pointing at `hook evaluate` for recommendations + `hook validate` for verifying hand-fixes.

**No new files** — all changes are surgical edits to existing files. Tests cover both layers.


### Plan

GATED on the A/B/C decision. Phase 0: operator confirms. If B (likely): document de-scope, verify no
hook-refine advertised, stop. If C: surface 0051 safety/pattern findings as recommendations (no mutation)
+ tests. If A: build propose-only JSON-aware hook refine behind --dry-run/--confirm + tests. Lower priority
than 0057-0060; no user-facing command to break. Gates if code ships: lint/test/build/git clean.


### Review

## Verify — 2026-06-22

**Verdict:** ✅ PASS
**Mode:** verify (Phase 7 SECU + Phase 8 traceability), inline
**Channel:** current (dogfood rule)
**Gate:** `bun run lint` clean · `bun run test` 1026 pass / 0 fail / 0 skips · `bun run build` exit 0 · `git status` clean

### Phase 7 — SECU (diff: helpers.ts, hook.ts, refine.ts, 3 test files, expert-hook.md, cmd_hook.md)

This task RESTRICTS a mutation path — turning off auto-apply for security-critical hooks.json. Net security improvement.

- **Security:** Two-layer defense prevents file mutation. Command layer: `--auto`/`--save` not registered (Commander rejects). Engine layer: `isHookApplyCapableOpt()` guard in `refine.ts:402` rejects auto/save before any file I/O. Force-dry-run path (`refine.ts:454` `type === 'hook'`) ensures no write even without guard flags. ✅
- **Efficiency:** Pure boolean guard, no added I/O. Forced dry-run skips backup/apply/verify. ✅
- **Correctness:** Mirrors task 0056 pattern exactly (`isHookApplyCapableOpt` ↔ `isHookApplyCapableOpt` in evolve.ts). Handler `refineHook` forwards only suggest-safe opts. ✅
- **Usability:** Description "Surface hook quality findings as suggestions (suggest-only, no auto-apply)" — no false capability claims. Error message guides to hand-fix + `hook validate`. ✅

### Phase 8 — Requirements traceability (decision C: suggest-only)

| Item | Verdict | Evidence |
|------|---------|----------|
| Hook findings surfaced as recommendations | MET | `hook refine plugins/cc/hooks/hooks.json` prints findings + "suggest-only" message; no mutation |
| Nothing mutates hooks.json | MET | 3-layer defense: command (no --auto/--save), engine guard, forced dry-run; `git diff hooks.json` empty |
| No wrapper/help claims apply-capable hook-refine | MET | expert-hook.md routing "Suggest-only...no auto-apply"; cmd_hook.md line 5 + 17 note suggest-only; help text matches; dryRunPreview renders `[SUGGEST]` (not `[AUTO-APPLY]`) for hooks after bug-011 fix |
| Gates pass | MET | lint clean, 1027 pass / 0 fail / 0 skips, build exit 0, git clean |

**Functional smoke:**
- `hook refine --help` → only `--target`, `--dry-run`; description "suggest-only" ✅
- `hook refine plugins/cc/hooks/hooks.json` → `[SUGGEST]` findings printed, no `[AUTO-APPLY]` tag, no mutation ✅
- `hook refine ... --auto` → "error: unknown option '--auto'" ✅
- `isHookApplyCapableOpt({auto:true})` → true; `refine('hook',...,{auto:true})` → zero result + stderr guard ✅


### Testing

## Testing — 2026-06-22

**Gate results (all pass):**
- `bun run lint` — clean (Biome + turbo typecheck exit 0)
- `bun run test` — 1027 pass / 0 fail / 0 skipped
- `bun run build` — success (index.js 3.44 MB)

**New tests (8 total):**

Engine-level (`apps/cli/tests/operations/refine.test.ts` — "refine — hook type, suggest-only (0061)"):
1. `isHookApplyCapableOpt detects mutation options` — 6 assertions: auto/save/dryRun/target/undefined
2. `refine — hook type with --auto is rejected (0061 C)` — zero result, stderr contains "suggest-only"
3. `refine — hook type with --save is rejected (0061 C)` — zero result, stderr contains "suggest-only"
4. `refine — hook type without mutation opts surfaces findings without writing (0061 C)` — no fixes applied, file unmodified, stdout contains "suggest-only"
5. `refine — hook findings render as [SUGGEST], never [AUTO-APPLY] or frontmatter proposals (0061 C)` — guards against the dryRunPreview label/proposal leak (bug-011)

Command-level (`apps/cli/tests/commands/hook.test.ts` — "hook refine — suggest-only surface (0061)"):
6. `exposes --dry-run/--target but not --auto/--save` — flag verification
7. `describes hook refine as suggest-only` — description check

Updated test (`apps/cli/tests/commands/content-command-modules.test.ts`):
8. `hookRefine` call updated from `{ auto: true, save: true }` to `{ dryRun: true }`

**Coverage:** 99.69% functions / 98.76% lines aggregate. All files above 90/90 threshold.

**Bug fixed during verify (bug-011):** functional smoke revealed `dryRunPreview` printed `[AUTO-APPLY] frontmatter: ... → would set model = inherit` for hooks.json — `classifyFix` returned `auto-apply` and `generateAutoChange` produced a frontmatter edit, both meaningless for JSON and contradicting the suggest-only message. Fix: for `type === 'hook'`, render every finding as `[SUGGEST]`, suppress the `would set X = Y` proposal, record `strategy: 'suggest'` in fixesSkipped. Verified live.

**Functional smoke (live, re-verified after bug-011 fix):**
```
hook refine --help                           → only --target/--dry-run; "suggest-only"
hook refine plugins/cc/hooks/hooks.json      → [SUGGEST] findings, no mutation, no AUTO-APPLY tag
hook refine ... --auto                       → "error: unknown option '--auto'"
refine('hook', file, {auto:true})            → zero result + stderr guard message
git diff plugins/cc/hooks/hooks.json         → (empty)
```


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


