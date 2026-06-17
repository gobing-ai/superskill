---
name: Binary on PATH and Phase 3 verification
description: Binary on PATH and Phase 3 verification
status: Backlog
created_at: 2026-06-17T22:29:14.161Z
updated_at: 2026-06-17T22:29:14.161Z
folder: docs/tasks
type: task
feature-id: F020
priority: high
estimated_hours: 2
dependencies: ["0023","0024","0025","0026"]
tags: ["phase3","verification","binary","gate"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0027. Binary on PATH and Phase 3 verification

### Background

Closing feature: establish and EXERCISE the path by which the global superskill binary resolves on PATH (design D2), so the rewritten plugin commands (F017/F018) actually run, then run the Phase 3 exit gate (design §6). If superskill does not resolve on PATH, every rewritten invocation fails at runtime — the single thing that can silently make the whole phase non-functional. Verified: apps/cli/package.json bin is {superskill: dist/index.js} (name=superskill, target=dist/index.js); package publishes as @gobing-ai/superskill (v0.1.3 live). Gates on F016-F019; run last. Design: design-doc-phase3.md §6, D2. Owning feature: F020.


### Requirements

- [ ] **R1** — Dev binary path exercised: `bun run build` (emits `dist/`) then `cd apps/cli && bun link`. `which superskill` resolves.
- [ ] **R2** — Bare `superskill agent validate <sample-file>` runs (exit 0/1/2 — a real result, **not** "command not found").
- [ ] **R3** — Consumer install documented (`npm i -g @gobing-ai/superskill`) in a runbook/README note (two commands, no new tooling).
- [ ] **R4** — No `package.json` change expected (bin already `{ "superskill": "dist/index.js" }`). If `bun link` doesn't expose the name, the fix is ensuring `bun run build` ran first — **not** repointing `bin` to `src/index.ts`.
- [ ] **R5** — Design §6 exit gate, all blocks pass:
  - `rg "rd3" plugins/cc/` → zero (F016).
  - `rg "bun .*scripts/.*\.ts" plugins/cc/` → zero (F017/F018).
  - `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty (F019).
  - `hooks.json` valid + no dangling skill refs (F018).
  - `ls plugins/cc/commands/ | wc -l` → 17 (F018).
- [ ] **R6** — Root verification gate green: `bun run lint`, `bun run test`, `bun run build`.
- [ ] **R7** — `git status -s` shows only intentional `plugins/cc/` (+ doc/runbook) changes. A CLI **test regression** means an accidental out-of-scope edit (R3) → revert, do not patch.

**Acceptance commands:**
```bash
bun run build && (cd apps/cli && bun link)
which superskill && superskill agent validate <sample-file>
rg "rd3" plugins/cc/ ; rg "bun .*scripts/.*\.ts" plugins/cc/
find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)
ls plugins/cc/commands/ | wc -l
bun run lint && bun run test && bun run build && git status -s
```

**Dependency note:** gates on 0023–0026. Run last.


### Q&A



### Design



### Solution

Mechanism (D2 locked): dev = bun run build (emits dist/) then 'cd apps/cli && bun link'; consumers = npm i -g @gobing-ai/superskill. If bun link does not expose superskill name, fix is to ensure build ran first — NOT to repoint bin to src/index.ts (the .ts entry runs only under Bun; Node consumers need dist/). Add a short runbook note (plugin README or docs/) with the two commands. Then run all 7 §6 gate blocks: (1) rg rd3 plugins/cc/=0, (2) rg bun.*scripts.*.ts plugins/cc/=0, (3) find embedded dirs=empty, (4) hooks.json clean+valid, (5) ls commands=17, (6) which superskill resolves + runs, (7) bun run lint/test/build green + git status clean. If bun run test fails it must be plugin-adjacent only — a CLI test regression means an accidental out-of-scope edit (R3); revert, do not patch.


### Plan



### Review



### Testing

Verification gate for this task — this IS the Phase 3 exit gate (design §6, all blocks must pass). Run last, after 0023–0026.

- [ ] **R1 (binary build+link):** `bun run build` then `cd apps/cli && bun link`; `which superskill` resolves.
- [ ] **R2 (binary runs):** `superskill agent validate <sample-file>` returns a real result (exit 0/1/2), **not** "command not found".
- [ ] **R3 (consumer doc):** runbook/README note records `npm i -g @gobing-ai/superskill`.
- [ ] **R5 — design §6 exit gate (all):**
  - `rg "rd3" plugins/cc/` → zero.
  - `rg "bun .*scripts/.*\.ts" plugins/cc/` → zero.
  - `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty.
  - `rg "indexed-context|anti-hallucination" plugins/cc/hooks/hooks.json` → none; file valid JSON.
  - `ls plugins/cc/commands/ | wc -l` → 17.
- [ ] **R6 (root gate):** `bun run lint && bun run test && bun run build` all green.
- [ ] **R7:** `git status -s` shows only intentional `plugins/cc/` (+ doc/runbook) changes. A CLI test regression = an accidental out-of-scope edit → revert, do not patch.

This task's "test" is the exit gate itself. Record every block's output as evidence; the phase is Done only when all pass.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §6 (exit gate), D2
- Feature: [F020](../features/F020-binary-path-verification.md)
- Depends on: 0023, 0024, 0025, 0026
- Binary: apps/cli/package.json:21 (bin name 'superskill')

