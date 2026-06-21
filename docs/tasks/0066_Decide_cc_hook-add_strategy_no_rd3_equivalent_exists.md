---
name: Decide cc hook-add strategy (no rd3 equivalent exists)
description: Decide cc hook-add strategy (no rd3 equivalent exists)
status: Backlog
created_at: 2026-06-21T21:15:15.292Z
updated_at: 2026-06-21T21:15:15.292Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
tags: ["cc-hooks","add","scaffold","dogfood","design-decision","missing-command"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
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



### Plan

GATED on the A/B/C decision. Phase 0: operator confirms. If A/C: scaffold a valid hooks.json skeleton
(safe command + timeout + ${CLAUDE_PLUGIN_ROOT}) that passes task-0051 hook evaluate + wrapper + tests. If
B: de-scope, decide on removing/cleaning the misleading 'hook' .md scaffold path, no false claims. Lower
priority than 0062-0065; no user-facing command to break. Gates if code ships: lint/test/build/git clean.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


