---
name: Decide cc hook-add strategy (no rd3 equivalent exists)
description: Decide cc hook-add strategy (no rd3 equivalent exists)
status: Done
created_at: 2026-06-21T21:15:15.292Z
updated_at: 2026-06-22T05:44:55.398Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
tags: ["cc-hooks","add","scaffold","dogfood","design-decision","missing-command"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0066. Decide cc hook-add strategy (no rd3 equivalent exists)

### Background

Dogfood goal was /cc:hook-add vs /rd3:hook-add, but NEITHER EXISTS. (1) cc has NO hook-add wrapper (plugins/cc/commands/ has agent/command/magent/skill-add only — verified). (2) rd3 has NO hook-add either. (3) The shared scaffold engine (operations/scaffold.ts) DOES list 'hook' as a valid type (validTypes includes 'hook') and templates/hook/default.md ships — but hooks are hooks.json (event->matcher->command config), NOT a single .md artifact, and tasks 0051 established that the real hook artifact is hooks.json. scaffold.ts writes <name>.md (markdown), which does NOT match how hooks are authored (a hooks.json entry, often merged into an existing file). So a hook scaffold would emit the wrong artifact type. Like tasks 0051/0056/0061, this is a DESIGN+DECIDE task, NOT a replacement — there is nothing to replace, and the markdown scaffold model does not fit hooks.json.


### Requirements

DESIGN DECISION REQUIRED (operator-confirmed shape: design+decide, like 0051/0056/0061). Assess whether hook scaffolding is worth a slash command given hooks are hooks.json config (not .md), often merged into an existing hooks.json rather than created standalone. Produce a recommendation: (A) build hook-add that scaffolds a hooks.json (or a hooks.json entry stub: event/matcher/command/timeout with a safe  placeholder) and a /cc:hook-add wrapper; (B) de-scope hook-add, and ALSO decide whether to remove 'hook' from scaffold.ts validTypes / the hook default.md template since it emits a misleading .md; (C) lightweight: keep a documented 'hook init' that writes a minimal valid hooks.json skeleton, no per-event authoring. Whichever: no false capability claims; if (A/C), the scaffolded hooks.json must pass task-0051 hook evaluate (safe command, timeout, portable path). Lower priority than 0062-0065; no user-facing command to break. Gates if code ships: bun run lint, bun run test (no skips), bun run build, git clean.


### Q&A

Design+decide task (mirrors 0051/0056/0061). NOT a replacement — neither cc nor rd3 has hook-add.
Verified: plugins/cc/commands/ has agent/command/magent/skill-add only; rd3 has the same four, no hook.

## Why this is a decision, not a build
operations/scaffold.ts lists 'hook' in validTypes and ships templates/hook/default.md — but it writes a
single `<name>.md` (markdown). Real hooks are hooks.json (event->matcher->command), usually MERGED into an
existing hooks.json, not created as a standalone markdown artifact (task 0051). So a hook scaffold via the
.md model emits the wrong artifact type. There is no rd3 hook-add to mirror.

## Options
- **A** Build hook-add that scaffolds a hooks.json (or a single event->matcher->command->timeout entry stub
  with a safe ${CLAUDE_PLUGIN_ROOT} placeholder) + a /cc:hook-add wrapper; output must PASS task-0051 hook
  evaluate (safe command, timeout present, portable path).
- **B** De-scope hook-add; ALSO decide whether to REMOVE 'hook' from scaffold.ts validTypes + the hook
  default.md, since the .md scaffold is misleading for hooks. Ensure nothing advertises hook-add.
- **C** Lightweight 'hook init' that writes a minimal valid hooks.json skeleton (no per-event authoring).

## DECISION (operator-confirmed 2026-06-21): B — de-scope hook-add + clean up the misleading .md path.
Do NOT build a hook-add command. Document that hooks are authored as hooks.json entries (event/matcher/
command/timeout), typically merged into an existing hooks.json, and validated with `hook validate`.
Clean up the misleading markdown scaffold: the scaffold.ts 'hook' .md path emits the wrong artifact type
for hooks — either REMOVE 'hook' from scaffold.ts validTypes + drop templates/hook/default.md, or, if
removal risks breaking callers/tests, neutralize it (clear doc note that hook scaffold is unsupported)
so nothing advertises or silently produces a misleading hook .md. Ensure no wrapper/help advertises a
hook-add. NOT option A/C (no hooks.json scaffolder).

## Acceptance
No hook-add command or wrapper exists or is advertised. The misleading 'hook' .md scaffold path is
removed or explicitly neutralized/documented (no silent wrong-artifact emission). If scaffold.ts/tests
change, gates pass: bun run lint, bun run test (no skips), bun run build, git clean.


### Design

Design+decide task (mirrors 0051/0056/0061). NOT a replacement — neither cc nor rd3 has hook-add.
Verified: plugins/cc/commands/ has agent/command/magent/skill-add only; rd3 has the same four, no hook.

## Why this is a decision, not a build
operations/scaffold.ts lists 'hook' in validTypes and ships templates/hook/default.md — but it writes a
single `<name>.md` (markdown). Real hooks are hooks.json (event->matcher->command), usually MERGED into an
existing hooks.json, not created as a standalone markdown artifact (task 0051). So a hook scaffold via the
.md model emits the wrong artifact type. There is no rd3 hook-add to mirror.

## Options
- **A** Build hook-add that scaffolds a hooks.json (or a single event->matcher->command->timeout entry stub
  with a safe ${CLAUDE_PLUGIN_ROOT} placeholder) + a /cc:hook-add wrapper; output must PASS task-0051 hook
  evaluate (safe command, timeout present, portable path).
- **B** De-scope hook-add; ALSO decide whether to REMOVE 'hook' from scaffold.ts validTypes + the hook
  default.md, since the .md scaffold is misleading for hooks. Ensure nothing advertises hook-add.
- **C** Lightweight 'hook init' that writes a minimal valid hooks.json skeleton (no per-event authoring).

## Recommendation
Lean A-as-JSON or C: if hooks are scaffoldable at all, the artifact must be hooks.json (not .md) and must
pass the 0051 safety/structure evaluator. If not worth it, B (and clean up the misleading .md path).
Operator to confirm A/B/C.

## Acceptance
Decision recorded with rationale. If A/C: hooks.json scaffold passes 0051 hook evaluate. If B: de-scoped +
the misleading hook .md scaffold path cleaned up or documented; no false claims.


### Solution

## Solution

### Decision: Option B (removal, not neutralization)

Verified the misleading `hook scaffold` path is fully wired up despite the task background claiming otherwise:
- `apps/cli/src/commands/hook.ts:28-39,138-149,222-226` — `scaffoldHook` inner fn, `hookScaffold` handler, `hook scaffold <name>` subcommand registration
- `packages/core/src/operations/scaffold.ts:170` — `validTypes` includes `'hook'`
- `apps/cli/{templates,src/templates}/hook/default.md` — markdown frontmatter template

Confirmed wrong artifact type via live run: `hook scaffold test-hook` writes `test-hook.md` (markdown with `event: PreToolUse` frontmatter), but real hooks are `hooks.json` entries (JSON). The markdown scaffold is misleading and unused in practice (no callers produce hooks this way; hooks are authored by hand in `hooks.json`).

**Removal over neutralize because:** the only caller of `scaffold('hook', ...)` is the `scaffoldHook` function in `hook.ts` (being removed); the only other callers are 2 test files that are easily updated. No production code path depends on `scaffold('hook', ...)`.

### Implementation

1. **`apps/cli/src/commands/hook.ts`** — remove `scaffoldHook`, `hookScaffold`, and the `hook scaffold` subcommand registration.
2. **`packages/core/src/operations/scaffold.ts`** — remove `'hook'` from `validTypes` (line 170). Engine throws `Unknown content type: "hook"` if anyone calls it directly.
3. **`apps/cli/templates/hook/default.md`** + **`apps/cli/src/templates/hook/default.md`** — delete both.
4. **`apps/cli/tests/commands/content-command-modules.test.ts`** — drop `hookScaffold(...)` call and `program.parseAsync(['hook','scaffold',...])` parse.
5. **`packages/core/tests/operations/scaffold.test.ts`** — drop the "creates a hook file" test case.
6. **`docs/help/cmd_hook.md`** — drop `scaffold` from the five standard ops list + the scaffold section/example.
7. **`plugins/cc/agents/expert-hook.md`** — drop `scaffold` from routing table + the scaffold section/example.
8. **`plugins/cc/skills/cc-hooks/SKILL.md`** — drop the `superskill hook scaffold` reference.

### Not changed (intentionally)

- `packages/core/src/content/types.ts` `ContentType` keeps `'hook'` — `validate`/`evaluate`/`refine`/`evolve` all need it.
- `docs/04_DESIGN.md` — describes the *design intent* of all-5-types; it's the design doc, not advertising.
- Completed task files (0014, 0024) — historical record.


### Plan

GATED on the A/B/C decision. Phase 0: operator confirms. If A/C: scaffold a valid hooks.json skeleton
(safe command + timeout + ${CLAUDE_PLUGIN_ROOT}) that passes task-0051 hook evaluate + wrapper + tests. If
B: de-scope, decide on removing/cleaning the misleading 'hook' .md scaffold path, no false claims. Lower
priority than 0062-0065; no user-facing command to break. Gates if code ships: lint/test/build/git clean.


### Review

## Review

### Phase 7 - SECU (diff: hook.ts, scaffold.ts, 2 test files, 3 docs, 1 template deleted)

- **Security:** Removal is purely subtractive — eliminates the `scaffold('hook',...)` write path (wrote `.md` to user-controlled `--output`). No new code paths, no new I/O, no secrets/eval/external input. Attack surface reduced.
- **Correctness:** `ContentType` retains `'hook'` (validate/evaluate/refine/evolve need it). `scaffold('hook',...)` now throws `Unknown content type: "hook"` — defense-in-depth, no silent wrong emission. No orphan imports (verified hook.ts imports clean).
- **Usability:** `hook --help` shows 5 commands (validate/evaluate/refine/evolve/emit); `hook scaffold` returns clean "unknown command". Docs explain hooks are hand-authored in `hooks.json`.

### Phase 8 - Requirements traceability (decision B: de-scope + clean up)

| Item | Verdict | Evidence |
|------|---------|----------|
| No hook-add command or wrapper exists or is advertised | MET | `hook --help` lists 5 commands (no scaffold); `hook scaffold` → "unknown command 'scaffold'"; no /cc:hook-add wrapper exists (verified plugins/cc/commands/) |
| Misleading 'hook' .md scaffold path removed | MET | `scaffold.ts:170` validTypes drops 'hook'; both template files deleted; `scaffold('hook',...)` throws "Unknown content type" |
| Nothing advertises hook-add | MET | expert-hook.md routing table, cmd_hook.md, SKILL.md all cleaned; trigger phrases updated; scaffold sections removed |
| Gates pass | MET | lint clean, 1026 pass / 0 fail / 0 skips, build exit 0, git clean (8 tracked + 1 gitignored deletion) |

**Functional smoke:**
- `hook --help` → 5 commands (validate/evaluate/refine/evolve/emit), no scaffold ?
- `hook scaffold test` → "error: unknown command 'scaffold'" ?
- `hook validate plugins/cc/hooks/hooks.json` → still works (ContentType retains 'hook') ?


### Testing

## Testing

### Gate results (all pass)
- `bun run lint` — clean (Biome + turbo typecheck exit 0)
- `bun run test` — 1026 pass / 0 fail / 0 skipped
- `bun run build` — success (index.js 3.44 MB, 768 modules)

**Test delta:** -2 tests (removed `hookScaffold(...)` assertion from content-command-modules.test.ts, removed "creates a hook file" test from scaffold.test.ts). No new tests needed — this is a removal task. The existing hook command-module test still verifies `hook validate/evaluate/refine/evolve/emit` registration and execution.

**Coverage:** 99.68% functions / 98.76% lines aggregate. All files above 90/90 threshold.

### Functional smoke (live)
```
hook --help                     → 5 commands (validate/evaluate/refine/evolve/emit), no scaffold
hook scaffold test              → "error: unknown command 'scaffold'"
hook validate plugins/cc/hooks/hooks.json → works (reports findings; ContentType retains 'hook')
hook refine plugins/cc/hooks/hooks.json   → works (suggest-only, [SUGGEST] findings)
```

### Template deletion
- `apps/cli/src/templates/hook/default.md` — tracked, deleted (shows as D in git)
- `apps/cli/templates/hook/default.md` — gitignored (build output copy), deleted from filesystem


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


