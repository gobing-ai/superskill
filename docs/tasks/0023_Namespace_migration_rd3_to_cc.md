---
name: Namespace migration rd3 to cc
description: Namespace migration rd3 to cc
status: Backlog
created_at: 2026-06-17T22:28:04.408Z
updated_at: 2026-06-17T22:28:04.408Z
folder: docs/tasks
type: task
feature-id: F016
priority: high
estimated_hours: 3
tags: ["phase3","namespace","plugin","cleanup"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0023. Namespace migration rd3 to cc

### Background

The cc plugin (registered as 'cc' in .claude-plugin/marketplace.json: name='cc', source='./plugins/cc') still carries the old 'rd3' namespace across ~123 files inherited from the source corpus (cc-agents/plugins/rd3/). User-facing prompts referencing /rd3:agent-add or rd3:cc-agents are broken — those skills resolve under the 'cc' plugin now. This task performs a pure global string migration rd3->cc across plugins/cc/. Skill DIRECTORY names stay (cc-agents/, cc-skills/, cc-commands/, cc-hooks/, cc-magents/ — design D4); only references change. Must land FIRST: every downstream rewrite (F017 SKILL.md, F018 commands) targets the final cc:cc-* names. Design: design-doc-phase3.md §1, §6 invariant #1. Owning feature: F016.


### Requirements

- [ ] **R1** — `rg "rd3" plugins/cc/` returns **zero** hits (design §6 invariant #1, the regression target).
- [ ] **R2** — Skill-invocation refs migrated: `rd3:cc-<type>` → `cc:cc-<type>` in all SKILL.md, expert agents, command bodies.
- [ ] **R3** — Slash-prefix refs migrated: `/rd3:<cmd>` → `/cc:<cmd>` (filename-preserving — the verb/disposition is F018's concern, not this task's).
- [ ] **R4** — Path refs migrated: `plugins/rd3/...` → `plugins/cc/...` (notably in `agents/expert-*.md`).
- [ ] **R5** — Companion configs migrated: `metadata.openclaw` blocks and `agents/openai.yaml` files — their `rd3`-bearing description/version values renamed to `cc` in lockstep.
- [ ] **R6** — SKILL.md `metadata` frontmatter (`author:`, version strings) aligned to `cc`.
- [ ] **R7** — Skill **directory names preserved** (D4): `ls plugins/cc/skills/` still shows `cc-agents cc-commands cc-hooks cc-magents cc-skills`. NOT renamed to bare `agents/` etc.
- [ ] **R8** — No `apps/cli/` source touched: `git diff --name-only apps/cli/` is empty. Plugin-only change.
- [ ] **R9** — No behavior/logic/structure change: diff is a pure string swap (no operation semantics, no file moves, no deletions).

**Acceptance commands:**
```bash
rg "rd3" plugins/cc/                  # → no output (exit 1)
rg "/rd3:|rd3:cc-" plugins/cc/         # → no output
rg "plugins/rd3/" plugins/cc/          # → no output
ls plugins/cc/skills/                  # → cc-agents cc-commands cc-hooks cc-magents cc-skills
git diff --name-only apps/cli/         # → empty
```

**Out of scope (do NOT do here):**
- Slash-command verb mapping / body delegation → F018.
- SKILL.md operation-table rewrites to call `superskill` → F017.
- Any file deletion → F019.


### Q&A



### Design



### Solution

Inventory with 'rg -l rd3 plugins/cc/ | sort' (expect ~123). Enumerate distinct surrounding tokens first: 'rg rd3 plugins/cc/ -o | sort -u' to confirm no rd3 substring is load-bearing inside a longer identifier (URL, package name) that must survive. Then substitute file-by-file reviewing each hunk: rd3:->cc:, /rd3:->/cc:, plugins/rd3/->plugins/cc/, bare rd3 in companion configs/frontmatter/prose->cc. Use sg/rg-driven replacement.


### Plan



### Review



### Testing

Verification gate for this task (run all; each maps to a Requirement). This is a pure cleanup task — its "tests" are the invariant checks below, recorded here as the executing agent runs them.

- [ ] **R1** — `rg "rd3" plugins/cc/` → no output (exit 1). The regression target (design §6 #1).
- [ ] **R2/R3** — `rg "/rd3:|rd3:cc-" plugins/cc/` → no output.
- [ ] **R4** — `rg "plugins/rd3/" plugins/cc/` → no output.
- [ ] **R7** — `ls plugins/cc/skills/` → `cc-agents cc-commands cc-hooks cc-magents cc-skills` (dirs preserved).
- [ ] **R8** — `git diff --name-only apps/cli/` → empty (plugin-only).
- [ ] **R9** — `git diff --stat plugins/cc/` shows only string-swap hunks (no file moves/deletions).
- [ ] Root gate: `bun run lint` clean (no plugin change should break the CLI gate); `git status -s` shows only intended `plugins/cc/` edits.

No new automated tests (no code changed). Record the command outputs above as evidence.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §1, §6
- Feature: [F016](../features/F016-namespace-migration.md)
- Authority: docs/00_ADR.md (D4 — keep skill dir names); design-doc-phase3 §0 locked decisions
- Unblocks: 0024, 0025 (downstream rewrites target the final cc:cc-* names)

