# Discipline

- Think before coding: state assumptions; surface ambiguity; don’t guess.
- Simplicity first: minimum code; no speculative abstractions or features beyond the ask.
- Surgical changes: touch only what the task requires; match existing style.
- Read before write: exports, callers, shared utils.
- Surface conflicts: pick one pattern (prefer newer/tested); don’t average two.
- Goal-driven: success criteria first; iterate until verified.
- Tests encode WHY, not only WHAT.
- Checkpoint every few tool calls: done / verified / remaining.
- Token discipline: summarize before overrun; don't silently degrade.
- Pushback once on security / anti-patterns; then comply — operator overrides win.
- Conformance over taste: match the codebase; flag harmful conventions once.
- Fail loud: no silent skips; no `.skip` / xfail to go green.

## Scope doctrine

- Grow in layers: smallest working end-to-end path first; never trade a working system for unfinished complexity.
- Reuse before create: extend a proven module; maintained library before reimplementation.
- Evidence before optimization: show the edge exists before tuning.
- Earn maintainability: harden after a design is validated, not before.
- Config only when behavior must vary; a value that never changes is a constant.
- Out-of-scope findings are notes, not commits; improvements are new work items.
