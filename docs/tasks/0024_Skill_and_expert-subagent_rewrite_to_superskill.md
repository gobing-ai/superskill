---
name: Skill and expert-subagent rewrite to superskill
description: Skill and expert-subagent rewrite to superskill
status: Backlog
created_at: 2026-06-17T22:28:36.077Z
updated_at: 2026-06-17T22:28:36.077Z
folder: docs/tasks
type: task
feature-id: F017
priority: high
estimated_hours: 5
dependencies: ["0023"]
tags: ["phase3","skills","subagents","plugin","cleanup"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0024. Skill and expert-subagent rewrite to superskill

### Background

Rewrite the 5 SKILL.md files and 5 expert-*.md subagent definitions in plugins/cc/ so every lifecycle operation invokes the global 'superskill <type> <op>' binary (design D2) instead of 'bun scripts/*.ts'. Remove the 'Hybrid Workflow Architecture / scripts' framing and the adapt/package/migrate operation rows (deleted in Phase 3 per D3; restored in Phase 5). The plugin is being converted from a self-contained bundle of embedded scripts into a thin plugin that delegates to the CLI built in Phases 1-2. Until these instructions call superskill instead of bun scripts/scaffold.ts, the plugin still depends on embedded code that F019 deletes. Invocation is BARE superskill (no path, no bun run; D2 locked: dev resolves via 'bun link', consumers via 'npm i -g @gobing-ai/superskill'). Depends on F016 (final cc:cc-* names). Design: design-doc-phase3.md §2, §4.1, §4.2. Owning feature: F017.


### Requirements

- [ ] **R1** — All 5 `SKILL.md` (`cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents`) rewrite Quick Start / Operations / Operation Workflow to invoke bare `superskill <type> <op>`.
- [ ] **R2** — Invocation mapping applied exactly (design §2):
  - `scaffold.ts … --path … --template` → `superskill <type> scaffold <name> --output <dir>` (drop `--template` — no CLI flag).
  - `validate.ts <path>` → `superskill <type> validate <nameOrPath>`.
  - `evaluate.ts … --scope` → `superskill <type> evaluate <nameOrPath> --save` (⚠ `--scope` dropped — behavior change).
  - `refine.ts … --eval` → `superskill <type> refine <nameOrPath> --auto --save`.
  - `evolve … --propose` → `… evolve <name> --propose-only`; `evolve … --apply <id>` → `… evolve <name> --accept <id>`.
- [ ] **R3** — "Hybrid Workflow Architecture / scripts" framing and all `scripts/*.ts` references removed from SKILL.md.
- [ ] **R4** — `adapt`/`package`/`migrate` operation rows removed **entirely** (no "coming soon" stub). `cc-hooks` `emit`/schema/lint sections removed.
- [ ] **R5** — `references/` link lines pointing at F019-deleted files (e.g. `scripts-usage.md`) removed.
- [ ] **R6** — `<type>` correctly mapped per skill: `cc-agents`→`agent`, `cc-skills`→`skill`, `cc-commands`→`command`, `cc-hooks`→`hook`, `cc-magents`→`magent`.
- [ ] **R7** — All 5 `expert-*.md`: Skill Invocation table + routing tables reference `cc:cc-<type>` and `superskill <type> <op>`.
- [ ] **R8** — `expert-*.md` `skills:` frontmatter references `cc:cc-<type>`; routing rows for deleted ops removed.
- [ ] **R9** — Hardcoded `plugins/rd3/skills/...` paths fixed → `plugins/cc/...` (`rg "plugins/rd3" plugins/cc/agents/` → empty).
- [ ] **R10** — No invented flags: every flag in the rewritten bodies exists in `apps/cli/src/commands/*.ts`. No script-runner invocations remain (`rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/` → empty).
- [ ] **R11** — Surgical: only invocation/routing/deleted-op lines changed; accurate prose, section order, and wording untouched (R3/R7).

**Acceptance commands:**
```bash
rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/   # → none
rg "superskill (agent|skill|command|hook|magent) (scaffold|validate|evaluate|refine|evolve)" \
   plugins/cc/skills/ plugins/cc/agents/                          # → hits in each
rg "plugins/rd3/" plugins/cc/agents/                              # → none
rg "cc:cc-(agents|skills|commands|hooks|magents)" plugins/cc/agents/  # → hits
```

**Out of scope:** command-file rewrites (F018), file deletion (F019), namespace swap (F016 — already done).


### Q&A



### Design



### Solution

Per skill, rewrite Quick Start/Operations/Operation Workflow sections per the §2 mapping: scaffold.ts->'superskill <type> scaffold <name> --output <dir>' (no --template tier flag), validate.ts->'<type> validate <nameOrPath>', evaluate.ts --scope->'<type> evaluate <nameOrPath> --save' (behavior change: --scope dropped), refine.ts --eval->'<type> refine <nameOrPath> --auto --save', evolve --propose->'<type> evolve <name> --propose-only', evolve --apply <id>->'<type> evolve <name> --accept <id>'. cc-hooks special case: only hook validate+scaffold survive; remove emit/schema/lint sections. Read one current SKILL.md + one expert file before editing to match structure (R5/R7). Surgical: change only invocation/routing/deleted-op lines.


### Plan



### Review



### Testing

Verification gate for this task (run all; each maps to a Requirement). Plugin-content rewrite — verified by the invariant checks below, recorded as the executing agent runs them.

- [ ] **R10** — `rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/` → no output (no script-runner invocations).
- [ ] **R1/R2** — `rg "superskill (agent|skill|command|hook|magent) (scaffold|validate|evaluate|refine|evolve)" plugins/cc/skills/ plugins/cc/agents/` → hits in each of the 5 SKILL.md + 5 expert files.
- [ ] **R9** — `rg "plugins/rd3/" plugins/cc/agents/` → no output (stale paths fixed).
- [ ] **R7/R8** — `rg "cc:cc-(agents|skills|commands|hooks|magents)" plugins/cc/agents/` → hits.
- [ ] **R4** — `rg -i "\b(adapt|package|migrate)\b.*operation|emit-.*\.sh|hook-linter" plugins/cc/skills/` → none (deleted-op rows gone).
- [ ] **R10 (flag check)** — every flag in the rewritten bodies exists in `apps/cli/src/commands/*.ts` (cross-check `--rubric` is NOT used here — that's Phase 4; only scaffold/validate/evaluate/refine/evolve flags).
- [ ] Root gate: `bun run lint` clean; `git status -s` shows only intended SKILL.md/expert edits.

No new automated tests (plugin markdown, no CLI code). Record the command outputs as evidence.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §2, §4.1, §4.2
- Feature: [F017](../features/F017-skill-subagent-rewrite.md)
- Depends on: 0023 (final cc:cc-* names)
- CLI surface ref: apps/cli/src/commands/*.ts (verify every flag exists)

