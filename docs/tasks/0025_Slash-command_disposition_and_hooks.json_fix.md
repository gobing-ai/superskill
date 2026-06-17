---
name: Slash-command disposition and hooks.json fix
description: Slash-command disposition and hooks.json fix
status: Backlog
created_at: 2026-06-17T22:28:49.200Z
updated_at: 2026-06-17T22:28:49.200Z
folder: docs/tasks
type: task
feature-id: F018
priority: high
estimated_hours: 4
dependencies: ["0023"]
tags: ["phase3","commands","hooks","plugin","cleanup"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0025. Slash-command disposition and hooks.json fix

### Background

Two things: (1) Disposition of all 25 slash commands (design §3) — rewrite the 17 that map to a CLI verb so their body delegates to bare 'superskill <type> <op>'; delete the 8 orphans that map to no CLI verb. (2) Fix plugins/cc/hooks/hooks.json (design §4.4): it wires SessionStart/PreToolUse/Stop hooks to skills/{indexed-context,tasks,anti-hallucination} — none of which exist in plugins/cc/, so a fresh session start fails a hook. Strip the dangling entries. There is NO add/adapt/emit/package/migrate CLI verb (verified: rg over apps/cli/src/commands/*.ts -> no hits), so *-add rewrites to scaffold and the orphans are deleted. The broken hooks.json is a critical install defect. Depends on F016. Design: design-doc-phase3.md §3, §4.4. Owning feature: F018.


### Requirements

- [ ] **R1** — 17 commands rewritten to delegate (keep filename, body calls bare `superskill`):
  - `agent-add`, `command-add`, `magent-add`, `skill-add` → `<type> scaffold`.
  - `agent-evaluate`, `command-evaluate`, `magent-evaluate`, `skill-evaluate` → `<type> evaluate`.
  - `agent-refine`, `command-refine`, `magent-refine`, `skill-refine` → `<type> refine`.
  - `agent-evolve`, `command-evolve`, `magent-evolve`, `skill-evolve` → `<type> evolve`.
  - `hook-validate` → `hook validate`.
- [ ] **R2** — 8 orphans **deleted**: `agent-adapt`, `command-adapt`, `magent-adapt`, `hook-emit`, `hook-list`, `hook-setup`, `skill-migrate`, `skill-package`.
- [ ] **R3** — `hook-validate` rewritten but flagged **transitional** (Phase 4 P4-D3 deletes it). Do **not** add the four missing `*-validate` commands (superseded by P4-D3).
- [ ] **R4** — `<type>` from file prefix: `agent-*`→`agent`, `skill-*`→`skill`, `command-*`→`command`, `hook-*`→`hook`, `magent-*`→`magent`.
- [ ] **R5** — Command bodies match the existing convention (frontmatter + `argument-hint`/`allowed-tools` + body). Read `agent-evaluate.md` first to match structure.
- [ ] **R6** — No invented flags. Only registered flags: `evolve(--from/--propose-only/--accept/--reject/--target)`, `evaluate(--json/--save/--target)`, `scaffold(--description/--target/--output/--force)`, `refine(--auto/--save/--target)`, `validate(--strict/--json/--target)`.
- [ ] **R7** — `hooks.json` stripped to empty/minimal **valid** JSON (`{}` or `{ "hooks": {} }` matching the current schema); no dangling refs to `indexed-context`/`tasks`/`anti-hallucination`. A fresh session start / schema validator does not fail on it.
- [ ] **R8** — No embedded-script invocations remain in any command body.

**Acceptance commands:**
```bash
ls plugins/cc/commands/ | wc -l                                  # → 17
rg "bun .*scripts/.*\.ts" plugins/cc/commands/                   # → none
rg "superskill (agent|skill|command|hook|magent) " plugins/cc/commands/ | wc -l  # → ≥17
bun -e 'JSON.parse(require("fs").readFileSync("plugins/cc/hooks/hooks.json","utf8"))' && echo OK
rg "indexed-context|anti-hallucination" plugins/cc/hooks/hooks.json  # → none
```

**Out of scope:** SKILL.md/agent rewrites (F017), deleting `scripts/`/`tests/` dirs (F019).


### Q&A



### Design



### Solution

Rewrite mapping (§3.1): *-add->'<type> scaffold', *-evaluate->'<type> evaluate', *-refine->'<type> refine', *-evolve->'<type> evolve', hook-validate->'hook validate'. Type from file prefix (agent-*->agent etc). Delete 8 orphans (§3.2). hooks.json (§4.4): ship option (a) STRIP dangling entries -> empty/minimal valid file ({} or {hooks:{}} matching current schema); option (b) re-point only if those 3 skills are vendored (they are not). Read agent-evaluate.md before rewriting to match command-file structure (frontmatter+argument-hint+allowed-tools+body). Only emit registered flags: evolve(--from/--propose-only/--accept/--reject/--target), evaluate(--json/--save/--target), scaffold(--description/--target/--output/--force), refine(--auto/--save/--target), validate(--strict/--json/--target).


### Plan



### Review



### Testing

Verification gate for this task (run all; each maps to a Requirement). Command-disposition + hooks.json fix — verified by the checks below.

- [ ] **R1/R2** — `ls plugins/cc/commands/ | wc -l` → **17** (8 orphans deleted, 17 survivors kept).
- [ ] **R2** — none of the 8 orphans present: `ls plugins/cc/commands/ | rg "agent-adapt|command-adapt|magent-adapt|hook-emit|hook-list|hook-setup|skill-migrate|skill-package"` → no output.
- [ ] **R1/R8** — survivors delegate, no embedded scripts: `rg "bun .*scripts/.*\.ts" plugins/cc/commands/` → none; `rg "superskill (agent|skill|command|hook|magent) " plugins/cc/commands/ | wc -l` → ≥17.
- [ ] **R3** — `hook-validate.md` present + rewritten (transitional; Phase 4 deletes it). No new `*-validate` for the other four types.
- [ ] **R7** — `hooks.json` is valid JSON: `bun -e 'JSON.parse(require("fs").readFileSync("plugins/cc/hooks/hooks.json","utf8"))' && echo OK`.
- [ ] **R7** — no dangling skill refs: `rg "indexed-context|anti-hallucination|/tasks/" plugins/cc/hooks/hooks.json` → no output.
- [ ] **R6** — no invented flags: every flag in rewritten bodies exists in `apps/cli/src/commands/*.ts`.
- [ ] Root gate: `bun run lint` clean; `git status -s` shows only intended command + hooks.json edits/deletions.

No new automated tests (plugin markdown + JSON). Record outputs as evidence.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §3, §4.4
- Feature: [F018](../features/F018-command-disposition-hooks.md)
- Depends on: 0023
- Cross-phase: hook-validate removed in Phase 4 (0032 / P4-D3)

