---
schema_version: 1
name: Skill and expert-subagent rewrite to superskill
status: done
type: task
priority: P1
tags: [phase3,skills,subagents,plugin,cleanup]
dependencies: ["0023"]
created_at: 2026-06-17T22:28:36.077Z
updated_at: "2026-08-01T02:23:51.751Z"
feature_id: H4
---

## 0024. Skill and expert-subagent rewrite to superskill

### Background
Rewrite the 5 SKILL.md files and 5 expert-*.md subagent definitions in plugins/cc/ so every lifecycle operation invokes the global 'superskill <type> <op>' binary (design D2) instead of 'bun scripts/*.ts'. Remove the 'Hybrid Workflow Architecture / scripts' framing and the adapt/package/migrate operation rows (deleted in Phase 3 per D3; restored in Phase 5). The plugin is being converted from a self-contained bundle of embedded scripts into a thin plugin that delegates to the CLI built in Phases 1-2. Until these instructions call superskill instead of bun scripts/scaffold.ts, the plugin still depends on embedded code that H6 deletes. Invocation is BARE superskill (no path, no bun run; D2 locked: dev resolves via 'bun link', consumers via 'npm i -g @gobing-ai/superskill'). Depends on H3 (final cc:cc-* names). Design: design-doc-phase3.md §2, §4.1, §4.2. Owning feature: H4.
### Requirements
- [x] **R1** — All 5 `SKILL.md` (`cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents`) rewrite Quick Start / Operations / Operation Workflow to invoke bare `superskill <type> <op>`.
- [x] **R2** — Invocation mapping applied exactly (design §2):
  - `scaffold.ts … --path … --template` → `superskill <type> scaffold <name> --output <dir>` (drop `--template` — no CLI flag).
  - `validate.ts <path>` → `superskill <type> validate <nameOrPath>`.
  - `evaluate.ts … --scope` → `superskill <type> evaluate <nameOrPath> --save` (⚠ `--scope` dropped — behavior change).
  - `refine.ts … --eval` → `superskill <type> refine <nameOrPath> --auto --save`.
  - `evolve … --propose` → `… evolve <name> --propose-only`; `evolve … --apply <id>` → `… evolve <name> --accept <id>`.
- [x] **R3** — "Hybrid Workflow Architecture / scripts" framing and all `scripts/*.ts` references removed from SKILL.md.
- [x] **R4** — `adapt`/`package`/`migrate` operation rows removed **entirely** (no "coming soon" stub). `cc-hooks` `emit`/schema/lint operation rows removed.
- [x] **R5** — `references/` link lines pointing at H6-deleted files (e.g. `scripts-usage.md`) removed.
- [x] **R6** — `<type>` correctly mapped per skill: `cc-agents`→`agent`, `cc-skills`→`skill`, `cc-commands`→`command`, `cc-hooks`→`hook`, `cc-magents`→`magent`.
- [x] **R7** — All 5 `expert-*.md`: Skill Invocation table + routing tables reference `cc:cc-<type>` and `superskill <type> <op>`.
- [x] **R8** — `expert-*.md` `skills:` frontmatter references `cc:cc-<type>`; routing rows for deleted ops removed.
- [x] **R9** — Hardcoded `plugins/rd3/skills/...` paths fixed → `plugins/cc/...` (`rg "plugins/rd3" plugins/cc/agents/` → empty).
- [x] **R10** — No invented flags: every flag in the rewritten bodies exists in `apps/cli/src/commands/*.ts`. No script-runner invocations remain (`rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/` → empty).
- [x] **R11** — Surgical: only invocation/routing/deleted-op lines changed; accurate prose, section order, and wording untouched (R3/R7).

**Acceptance commands:**
```bash
rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/   # → none
rg "superskill (agent|skill|command|hook|magent) (scaffold|validate|evaluate|refine|evolve)" \
   plugins/cc/skills/ plugins/cc/agents/                          # → hits in each
rg "plugins/rd3/" plugins/cc/agents/                              # → none
rg "cc:cc-(agents|skills|commands|hooks|magents)" plugins/cc/agents/  # → hits
```

**Out of scope:** command-file rewrites (H5), file deletion (H6), namespace swap (H3 — already done).
### Q&A



### Design

**CLI flag surface (verified from `apps/cli/src/commands/helpers.ts` + `agent.ts:154-194`):**

| Operation | CLI flags available |
|-----------|-------------------|
| `scaffold <name>` | `--description`, `--target`, `--output`, `--force` |
| `validate <nameOrPath>` | `--target`, `--strict`, `--json` |
| `evaluate <nameOrPath>` | `--target`, `--json`, `--save` |
| `refine <nameOrPath>` | `--target`, `--auto`, `--save` |
| `evolve <name>` | `--target`, `--from`, `--propose-only`, `--accept <id>`, `--reject <id>` |

**Invocation mapping (design §2, R2):**

| Obsolete | Replaced by |
|----------|-------------|
| `bun scripts/scaffold.ts <name> --path <dir> --template <tier>` | `superskill <type> scaffold <name> --output <dir>` |
| `bun scripts/validate.ts <path>` | `superskill <type> validate <nameOrPath>` |
| `bun scripts/evaluate.ts <path> --scope <scope>` | `superskill <type> evaluate <nameOrPath> --save` |
| `bun scripts/refine.ts <path> --eval` | `superskill <type> refine <nameOrPath> --auto --save` |
| `bun scripts/evolve.ts <path> --propose` | `superskill <type> evolve <name> --propose-only` |
| `bun scripts/evolve.ts <path> --apply <id>` | `superskill <type> evolve <name> --accept <id>` |

**Type mapping (R6):** cc-agents→`agent`, cc-skills→`skill`, cc-commands→`command`, cc-hooks→`hook`, cc-magents→`magent`.

**Deleted operations (R4, D3):** `adapt`, `package`, `migrate` removed entirely from all SKILL.md operation tables. cc-hooks `emit`/schema/lint sections removed (no CLI verb).

**Flags that must NOT appear (R10):** `--template`, `--scope`, `--eval`, `--best-practices`, `--migrate`, `--dry-run`, `--platform`, `--profile`, `--path`, `--analyze`, `--apply`, `--confirm`, `--history`, `--rollback`.

**Per-file scope (10 files):**

SKILL.md × 5 — rewrite: Quick Start code blocks, Workflows section (remove Hybrid Workflow Architecture note + adapt refs), Operations table (remove adapt/package/migrate rows, update Script→superskill), Operation Workflows (rewrite all invocations, remove Adapt/Package/Migrate Workflow subsections), references/ link lines pointing at deleted files.

expert-*.md × 5 — rewrite: skills frontmatter (→ `cc:cc-<type>`), Skill Invocation table examples (→ `superskill <type> <op>`), Operation Routing table (remove adapt/package/migrate rows), Operation Arguments tables (remove deleted ops, update flags to CLI surface), hardcoded `plugins/rd3/` paths (R9), Output Format operation lists.


### Solution

Per skill, rewrite Quick Start/Operations/Operation Workflow sections per the §2 mapping: scaffold.ts->'superskill <type> scaffold <name> --output <dir>' (no --template tier flag), validate.ts->'<type> validate <nameOrPath>', evaluate.ts --scope->'<type> evaluate <nameOrPath> --save' (behavior change: --scope dropped), refine.ts --eval->'<type> refine <nameOrPath> --auto --save', evolve --propose->'<type> evolve <name> --propose-only', evolve --apply <id>->'<type> evolve <name> --accept <id>'. cc-hooks special case: only hook validate+scaffold survive; remove emit/schema/lint sections. Read one current SKILL.md + one expert file before editing to match structure (R5/R7). Surgical: change only invocation/routing/deleted-op lines.


### Plan

**Execution strategy:** Parallel delegation — 5 independent subagents, one per skill type (agent/skill/command/hook/magent). Each subagent rewrites its SKILL.md + expert-*.md pair.

**Per-type subagent assignment:**

| Subagent | SKILL.md | expert-*.md | CLI type |
|----------|----------|-------------|----------|
| AgentRewriter | cc-agents/SKILL.md | expert-agent.md | `agent` |
| SkillRewriter | cc-skills/SKILL.md | expert-skill.md | `skill` |
| CommandRewriter | cc-commands/SKILL.md | expert-command.md | `command` |
| HookRewriter | cc-hooks/SKILL.md | expert-hook.md | `hook` |
| MagentRewriter | cc-magents/SKILL.md | expert-magent.md | `magent` |

**Each subagent's contract:**

1. Read the assigned SKILL.md and expert-*.md
2. SKILL.md changes:
   - Quick Start: replace all `bun scripts/*.ts` → `superskill <type> <op>` per mapping
   - Workflows section: remove "Hybrid Workflow Architecture" note; remove `adapt` from workflow chains
   - Operations table: remove `adapt`/`package`/`migrate` rows; update Script column → `superskill <type> <op>`
   - Operation Workflows: rewrite all `bun scripts/*.ts` invocations; remove Adapt/Package/Migrate Workflow subsections; update Evolve flags (`--propose`→`--propose-only`, `--apply <id>`→`--accept <id>`)
   - references/ link lines: remove lines pointing at deleted files (scripts-usage.md, workflows.md if script-coupled)
   - pipeline_steps frontmatter: remove `adapt` if present
3. expert-*.md changes:
   - `skills:` frontmatter → `cc:cc-<type>`
   - Skill Invocation table examples → `superskill <type> <op>`
   - Operation Routing table: remove `adapt`/`package`/`migrate` rows
   - Operation Arguments tables: remove deleted op subsections; update remaining flags to CLI surface
   - Hardcoded `plugins/rd3/` paths → `plugins/cc/` (R9)
   - Output Format operation lists: remove deleted ops
4. cc-hooks special case: only `validate` + `scaffold` survive; remove `emit`/schema/lint sections entirely
5. Verify: no `bun scripts/*.ts` invocations remain; no `--template`/`--scope`/`--eval`/`--best-practices`/`--migrate`/`--dry-run` flags; no `adapt`/`package`/`migrate` operation rows

**Surgical constraint (R11):** Only change invocation/routing/deleted-op lines. Preserve prose, section order, and wording in untouched sections.

**Post-implementation verification (acceptance commands):**
```bash
rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/   # → none
rg "superskill (agent|skill|command|hook|magent) (scaffold|validate|evaluate|refine|evolve)" plugins/cc/skills/ plugins/cc/agents/
rg "plugins/rd3/" plugins/cc/agents/                                # → none
rg "cc:cc-(agents|skills|commands|hooks|magents)" plugins/cc/agents/  # → hits
bun run lint                                                        # clean
```


### Review
**Verdict: PASS**

**Requirements Traceability**

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| R1 | All 5 SKILL.md rewrite Quick Start/Operations/Operation Workflow to invoke bare `superskill <type> <op>` | PASS | `rg "superskill (agent\|skill\|command\|hook\|magent) (scaffold\|validate\|evaluate\|refine\|evolve)"` → hits in all 5 SKILL.md |
| R2 | Invocation mapping applied exactly (design §2) | PASS | scaffold→`--output`, validate→`--target`, evaluate→`--save` (no `--scope`), refine→`--auto --save` (no `--eval`), evolve→`--propose-only`/`--accept` |
| R3 | "Hybrid Workflow Architecture / scripts" framing and all `scripts/*.ts` references removed from SKILL.md | PASS | Direct scan confirms removal; `rg "bun .*scripts/.*\.ts" plugins/cc/skills/` → exit 1 |
| R4 | `adapt`/`package`/`migrate` operation rows removed entirely; cc-hooks `emit`/schema/lint sections removed | PASS | SKILL.md operation tables cleaned; reference docs cleaned. Remaining R4 hits only in cc-hooks emitters/tests/scripts (H6 scope) |
| R5 | `references/` link lines pointing at H6-deleted files removed | PASS | scripts-usage.md link lines removed from SKILL.md |
| R6 | `<type>` correctly mapped per skill | PASS | cc-agents→agent, cc-skills→skill, cc-commands→command, cc-hooks→hook, cc-magents→magent |
| R7 | All 5 expert-*.md: Skill Invocation table + routing tables reference `cc:cc-<type>` and `superskill <type> <op>` | PASS | `rg "cc:cc-(agents\|skills\|commands\|hooks\|magents)" plugins/cc/agents/` → hits in all 5; `rg "superskill"` → hits in all 5 |
| R8 | expert-*.md `skills:` frontmatter references `cc:cc-<type>`; routing rows for deleted ops removed | PASS | All 5 expert files have `skills: [cc:cc-<type>]`; adapt/package/migrate routing rows removed |
| R9 | Hardcoded `plugins/rd3/skills/...` paths fixed → `plugins/cc/...` | PASS | `rg "plugins/rd3/" plugins/cc/agents/` → exit 1 (no matches) |
| R10 | No invented flags; no script-runner invocations remain | PASS | `rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/` → exit 1; all flags verified against `apps/cli/src/commands/*.ts` |
| R11 | Surgical: only invocation/routing/deleted-op lines changed | PASS | Final diff review preserved prose, section order, and wording outside invocation/routing/deleted-op cleanup |

**Fix-pass update — 2026-06-18:** Re-verified with `--fix all`; fixed remaining lifecycle rewrite drift in `plugins/cc/agents/expert-agent.md`, removed the stale `scripts/evaluation.config.ts` reference in `plugins/cc/skills/cc-agents/SKILL.md`, and replaced residual lifecycle "Script" framing in `cc-skills` / `cc-commands` SKILL files with CLI wording. No findings remain.

**SECU Review**

Scope: Content rewrite of 5 SKILL.md files and 5 expert-*.md subagent definitions in `plugins/cc/` to invoke `superskill <type> <op>` instead of `bun scripts/*.ts`. Plus reference docs and templates cleanup. No CLI code changed.

- **Security:** No security-relevant change. No new inputs, outputs, or auth/secret handling. The rewrite touches documentation and invocation patterns only.
- **Architecture:** No boundary changes. Plugin structure unchanged. No new dependencies. `apps/cli/` explicitly excluded (no CLI source touched).
- **Correctness:** All CLI flags verified against `apps/cli/src/commands/helpers.ts` and `agent.ts:154-194`. Obsolete flags (`--template`, `--scope`, `--eval`, `--best-practices`, `--migrate`, `--dry-run`, `--platform`, `--profile`, `--path`, `--analyze`, `--apply`, `--confirm`, `--history`, `--rollback`) removed. No invented flags.
- **Regression risk:** Low. `bun run lint`, `bun run test`, and `bun run build` pass clean. No test assertions depend on the rewritten plugin content.

**Out-of-Scope Compliance**

- Command-file rewrites (H5) → not touched
- File deletion (H6) → not touched; emitters/tests/scripts dirs still exist (R4 hits limited to these)
- Namespace swap (H3) → already done in 0023

**Overall Verdict: PASS** — All 11 requirements verified with evidence. SECU review clean. Root gates pass.
### Testing
Verification gate for this task (run all; each maps to a Requirement). Plugin-content rewrite — verified by the invariant checks below, recorded as the executing agent runs them.

- [x] **R10** — `rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/` → no output (no script-runner invocations). **PASS** — exit 1 (no matches)
- [x] **R1/R2** — `rg "superskill (agent|skill|command|hook|magent) (scaffold|validate|evaluate|refine|evolve)" plugins/cc/skills/ plugins/cc/agents/` → hits in each of the 5 SKILL.md + 5 expert files. **PASS** — exit 0, hits in all 10 files + references
- [x] **R9** — `rg "plugins/rd3/" plugins/cc/agents/` → no output (stale paths fixed). **PASS** — exit 1 (no matches)
- [x] **R7/R8** — `rg "cc:cc-(agents|skills|commands|hooks|magents)" plugins/cc/agents/` → hits. **PASS** — exit 0, hits in all 5 expert files
- [x] **R4** — `rg -i "\b(adapt|package|migrate)\b.*operation|emit-.*\.sh|hook-linter" plugins/cc/skills/` → none in SKILL.md or reference docs. **PASS** for user-facing content. Embedded cc-hooks code/test files are H6 deletion scope and are not lifecycle operation rows in this task.
- [x] **R10 (flag check)** — every flag in the rewritten bodies exists in `apps/cli/src/commands/*.ts`. Verified CLI surface: scaffold (--description, --target, --output, --force), validate (--target, --strict, --json), evaluate (--target, --json, --save), refine (--target, --auto, --save), evolve (--target, --from, --propose-only, --accept, --reject). No --template, --scope, --eval, --best-practices, --migrate flags remain.
- [x] Root gates: `bun run lint`, `bun run test`, and `bun run build` clean.

No new automated tests (plugin markdown, no CLI code). Command outputs recorded as evidence above.

**R3** — "Hybrid Workflow Architecture / scripts" framing removed from all 5 SKILL.md (verified by direct scan).
**R5** — references/ link lines pointing at H6-deleted files removed from SKILL.md (scripts-usage.md links removed).
**R6** — Type mapping verified: cc-agents→agent, cc-skills→skill, cc-commands→command, cc-hooks→hook, cc-magents→magent.
**R11** — Surgical: only invocation/routing/deleted-op lines changed; prose, section order, and wording in untouched sections preserved.

**Timestamp:** 2026-06-18T01:26:36Z
### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References
- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §2, §4.1, §4.2
- Feature: [H4](../features/H4_skill-expert-subagent-rewrite-superskill.md)
- Depends on: 0023 (final cc:cc-* names)
- CLI surface ref: apps/cli/src/commands/*.ts (verify every flag exists)
### History

- Migrated from legacy format (2026-08-01)
