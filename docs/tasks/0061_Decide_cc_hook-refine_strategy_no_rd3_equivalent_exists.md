---
name: Decide cc hook-refine strategy (no rd3 equivalent exists)
description: Decide cc hook-refine strategy (no rd3 equivalent exists)
status: Backlog
created_at: 2026-06-21T21:06:05.280Z
updated_at: 2026-06-21T21:06:05.280Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
tags: ["cc-hooks","refine","dogfood","design-decision","missing-command"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
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



### Plan

GATED on the A/B/C decision. Phase 0: operator confirms. If B (likely): document de-scope, verify no
hook-refine advertised, stop. If C: surface 0051 safety/pattern findings as recommendations (no mutation)
+ tests. If A: build propose-only JSON-aware hook refine behind --dry-run/--confirm + tests. Lower priority
than 0057-0060; no user-facing command to break. Gates if code ships: lint/test/build/git clean.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


