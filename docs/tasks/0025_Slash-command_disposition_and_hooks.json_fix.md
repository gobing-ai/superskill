---
name: Slash-command disposition and hooks.json fix
description: Slash-command disposition and hooks.json fix
status: Done
created_at: 2026-06-17T22:28:49.200Z
updated_at: 2026-06-18T01:26:36.000Z
folder: docs/tasks
type: task
feature-id: F018
priority: high
estimated_hours: 4
dependencies: ["0023"]
tags: ["phase3","commands","hooks","plugin","cleanup"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0025. Slash-command disposition and hooks.json fix

### Background

Two things: (1) Disposition of all 25 slash commands (design §3) — rewrite the 17 that map to a CLI verb so their body delegates to bare 'superskill <type> <op>'; delete the 8 orphans that map to no CLI verb. (2) Fix plugins/cc/hooks/hooks.json (design §4.4): it wires SessionStart/PreToolUse/Stop hooks to skills/{indexed-context,tasks,anti-hallucination} — none of which exist in plugins/cc/, so a fresh session start fails a hook. Strip the dangling entries. There is NO add/adapt/emit/package/migrate CLI verb (verified: rg over apps/cli/src/commands/*.ts -> no hits), so *-add rewrites to scaffold and the orphans are deleted. The broken hooks.json is a critical install defect. Depends on F016. Design: design-doc-phase3.md §3, §4.4. Owning feature: F018.


### Requirements

- [x] **R1** — 17 commands rewritten to delegate (keep filename, body calls bare `superskill`):
  - `agent-add`, `command-add`, `magent-add`, `skill-add` → `<type> scaffold`.
  - `agent-evaluate`, `command-evaluate`, `magent-evaluate`, `skill-evaluate` → `<type> evaluate`.
  - `agent-refine`, `command-refine`, `magent-refine`, `skill-refine` → `<type> refine`.
  - `agent-evolve`, `command-evolve`, `magent-evolve`, `skill-evolve` → `<type> evolve`.
  - `hook-validate` → `hook validate`.
- [x] **R2** — 8 orphans **deleted**: `agent-adapt`, `command-adapt`, `magent-adapt`, `hook-emit`, `hook-list`, `hook-setup`, `skill-migrate`, `skill-package`.
- [x] **R3** — `hook-validate` rewritten but flagged **transitional** (Phase 4 P4-D3 deletes it). Do **not** add the four missing `*-validate` commands (superseded by P4-D3).
- [x] **R4** — `<type>` from file prefix: `agent-*`→`agent`, `skill-*`→`skill`, `command-*`→`command`, `hook-*`→`hook`, `magent-*`→`magent`.
- [x] **R5** — Command bodies match the existing convention (frontmatter + `argument-hint`/`allowed-tools` + body). Read `agent-evaluate.md` first to match structure.
- [x] **R6** — No invented flags. Only registered flags: `evolve(--from/--propose-only/--accept/--reject/--target)`, `evaluate(--json/--save/--target)`, `scaffold(--description/--target/--output/--force)`, `refine(--auto/--save/--target)`, `validate(--strict/--json/--target)`.
- [x] **R7** — `hooks.json` stripped to empty/minimal **valid** JSON (`{}` or `{ "hooks": {} }` matching the current schema); no dangling refs to `indexed-context`/`tasks`/`anti-hallucination`. A fresh session start / schema validator does not fail on it.
- [x] **R8** — No embedded-script invocations remain in any command body.

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

**Scope:** 25 slash commands in `plugins/cc/commands/` + `plugins/cc/hooks/hooks.json`. No CLI code changes. No SKILL.md/agent changes (F017 done in 0024). No scripts/tests deletion (F019).

**§3.1 — 17 rewrites (keep filename, rewrite body to delegate to bare `superskill <type> <op>`):**

| Command file | `superskill` verb | `<type>` |
|---|---|---|
| `agent-add` | `agent scaffold` | agent |
| `command-add` | `command scaffold` | command |
| `magent-add` | `magent scaffold` | magent |
| `skill-add` | `skill scaffold` | skill |
| `agent-evaluate` | `agent evaluate` | agent |
| `command-evaluate` | `command evaluate` | command |
| `magent-evaluate` | `magent evaluate` | magent |
| `skill-evaluate` | `skill evaluate` | skill |
| `agent-refine` | `agent refine` | agent |
| `command-refine` | `command refine` | command |
| `magent-refine` | `magent refine` | magent |
| `skill-refine` | `skill refine` | skill |
| `agent-evolve` | `agent evolve` | agent |
| `command-evolve` | `command evolve` | command |
| `magent-evolve` | `magent evolve` | magent |
| `skill-evolve` | `skill evolve` | skill |
| `hook-validate` | `hook validate` | hook (transitional — P4-D3 deletes it) |

**Rewrite pattern (R5 — match `agent-evaluate.md` structure):**
Each rewritten command keeps frontmatter (`description`, `argument-hint`, `allowed-tools`) but updates `argument-hint` to reflect registered CLI flags only. Body: `# <Title>`, one-line summary wrapping `cc:cc-<type>`, "When to Use" list, "Arguments" table (registered flags only), "Examples" with `superskill <type> <op>` invocations, "Implementation" delegating via `Skill(skill="cc:cc-<type>", args="<op> $ARGUMENTS")` + a `superskill <type> <op> $ARGUMENTS` direct-execution line. No `bun scripts/*.ts` (R8). No invented flags (R6).

**Registered flags per op (R6 — verified against `apps/cli/src/commands/helpers.ts` + `agent.ts:154-194`):**
- `scaffold`: `--description`, `--target`, `--output`, `--force`
- `validate`: `--strict`, `--json`, `--target`
- `evaluate`: `--json`, `--save`, `--target`
- `refine`: `--auto`, `--save`, `--target`
- `evolve`: `--from`, `--propose-only`, `--accept`, `--reject`, `--target`

**Obsolete flags that must NOT appear:** `--template`, `--scope`, `--eval`, `--best-practices`, `--migrate`, `--dry-run`, `--platform`, `--profile`, `--path`, `--analyze`, `--apply`, `--confirm`, `--history`, `--rollback`, `--lint`, `--skills`, `--tools`, `--model`, `--color`, `--plugin-name`, `--verbose`, `--output` (for evaluate/refine/evolve/validate — only scaffold has `--output`).

**§3.2 — 8 deletions (orphans mapping to no CLI verb):**
`agent-adapt`, `command-adapt`, `magent-adapt`, `hook-emit`, `hook-list`, `hook-setup`, `skill-migrate`, `skill-package`.

**§4.4 — hooks.json fix (option a: STRIP):**
Replace entire file with `{ "hooks": {} }` — minimal valid JSON, no dangling refs to `indexed-context`/`tasks`/`anti-hallucination`. R7.

**R3 — hook-validate transitional:** Rewritten to delegate to `superskill hook validate`, but flagged as transitional in a note (Phase 4 P4-D3 deletes it). Do NOT add `agent-validate`, `command-validate`, `magent-validate`, `skill-validate`.

**R4 — type from prefix:** `agent-*`→`agent`, `skill-*`→`skill`, `command-*`→`command`, `hook-*`→`hook`, `magent-*`→`magent`.


### Solution

Rewrite mapping (§3.1): *-add->'<type> scaffold', *-evaluate->'<type> evaluate', *-refine->'<type> refine', *-evolve->'<type> evolve', hook-validate->'hook validate'. Type from file prefix (agent-*->agent etc). Delete 8 orphans (§3.2). hooks.json (§4.4): ship option (a) STRIP dangling entries -> empty/minimal valid file ({} or {hooks:{}} matching current schema); option (b) re-point only if those 3 skills are vendored (they are not). Read agent-evaluate.md before rewriting to match command-file structure (frontmatter+argument-hint+allowed-tools+body). Only emit registered flags: evolve(--from/--propose-only/--accept/--reject/--target), evaluate(--json/--save/--target), scaffold(--description/--target/--output/--force), refine(--auto/--save/--target), validate(--strict/--json/--target).


### Plan

**Stage A — Delete 8 orphans (parallel, no dependencies):**
```
rm plugins/cc/commands/agent-adapt.md
rm plugins/cc/commands/command-adapt.md
rm plugins/cc/commands/magent-adapt.md
rm plugins/cc/commands/hook-emit.md
rm plugins/cc/commands/hook-list.md
rm plugins/cc/commands/hook-setup.md
rm plugins/cc/commands/skill-migrate.md
rm plugins/cc/commands/skill-package.md
```

**Stage B — Fix hooks.json (R7):**
Write `plugins/cc/hooks/hooks.json` = `{ "hooks": {} }`.

**Stage C — Rewrite 17 command files (parallel subagents by type, 5 waves):**
Each subagent rewrites its type's command files to the pattern in Design §3.1. Files per subagent:
- AgentRewriter: `agent-add`, `agent-evaluate`, `agent-refine`, `agent-evolve` (4 files)
- CommandRewriter: `command-add`, `command-evaluate`, `command-refine`, `command-evolve` (4 files)
- MagentRewriter: `magent-add`, `magent-evaluate`, `magent-refine`, `magent-evolve` (4 files)
- SkillRewriter: `skill-add`, `skill-evaluate`, `skill-refine`, `skill-evolve` (4 files)
- HookRewriter: `hook-validate` (1 file, transitional)

**Stage D — Acceptance verification (R1-R8):**
Run the 5 acceptance commands from the task file. Verify `bun run lint` clean.

**File touch count:** 8 deletions + 1 hooks.json rewrite + 17 command rewrites = 26 file operations.

**Risk:** Low. Plugin markdown + JSON only. No CLI code. No tests depend on command file content. `plugins/` untracked so no git-tracked changes.


### Review

**Verdict: PASS**

**Requirements Traceability**

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| R1 | 17 commands rewritten to delegate to bare `superskill <type> <op>` | PASS | `rg "superskill (agent\|skill\|command\|hook\|magent) " plugins/cc/commands/ \| wc -l` → 17; each command body has `Skill(skill="cc:cc-<type>", args="<op> $ARGUMENTS")` + `superskill <type> <op> $ARGUMENTS` |
| R2 | 8 orphans deleted | PASS | `ls plugins/cc/commands/ \| wc -l` → 17; `rg "agent-adapt\|command-adapt\|magent-adapt\|hook-emit\|hook-list\|hook-setup\|skill-migrate\|skill-package"` → NONE |
| R3 | hook-validate rewritten + transitional flag; no new *-validate | PASS | `hook-validate.md` has transitional NOTE; `ls \| rg validate` → `hook-validate.md` only |
| R4 | `<type>` from file prefix | PASS | agent-*→agent, skill-*→skill, command-*→command, hook-*→hook, magent-*→magent — verified in all 17 files |
| R5 | Command bodies match convention (frontmatter + argument-hint + allowed-tools + body) | PASS | All 17 files follow the `agent-evaluate.md` structure: frontmatter, `# Title`, summary, When to Use, Arguments table, Examples, Implementation, Platform Notes |
| R6 | No invented flags — only registered flags | PASS | `rg "\-\-template\|\-\-scope\|\-\-eval\|\-\-best-practices\|\-\-migrate\|\-\-dry-run\|\-\-platform\|\-\-profile\|\-\-path\|\-\-analyze\|\-\-apply\|\-\-confirm\|\-\-history\|\-\-rollback\|\-\-lint\|\-\-skills\|\-\-tools\|\-\-model\|\-\-color\|\-\-plugin-name\|\-\-verbose"` → NONE; only scaffold(--description/--target/--output/--force), evaluate(--json/--save/--target), refine(--auto/--save/--target), evolve(--from/--propose-only/--accept/--reject/--target), validate(--strict/--json/--target) |
| R7 | hooks.json stripped to minimal valid JSON; no dangling refs | PASS | `bun -e 'JSON.parse(...)'` → OK; file is `{ "hooks": {} }`; `rg "indexed-context\|anti-hallucination\|/tasks/"` → NONE |
| R8 | No embedded-script invocations in any command body | PASS | `rg "bun .*scripts/.*\.ts" plugins/cc/commands/` → NONE |

**SECU Review**

Scope: Rewrite 17 slash command files + delete 8 orphan command files + fix `plugins/cc/hooks/hooks.json` in `plugins/cc/`. No CLI code changed. No SKILL.md/agent changes (F017 done in 0024). No scripts/tests deletion (F019).

- **Security:** No security-relevant change. No new inputs, outputs, or auth/secret handling. The hooks.json fix *removes* a security-adjacent defect (dangling hook refs that would fail on session start), reducing attack surface by removing non-functional hook execution.
- **Architecture:** No boundary changes. Plugin structure unchanged. No new dependencies. `apps/cli/` explicitly excluded (no CLI source touched).
- **Correctness:** All CLI flags verified against `apps/cli/src/commands/helpers.ts` and `agent.ts:154-194`. Obsolete flags removed. No invented flags. hooks.json is valid JSON matching the current schema (`{ "hooks": {} }`).
- **Regression risk:** Low. `bun run lint`, `bun run test`, and `bun run build` pass clean. No test assertions depend on command file content. The hooks.json fix eliminates a critical install defect (fresh session start would fail on the dangling hook refs).

**Out-of-Scope Compliance**

- SKILL.md/agent rewrites (F017) → done in 0024, not touched
- File deletion (F019) → not touched; scripts/tests dirs still exist
- Namespace swap (F016) → already done in 0023

**Overall Verdict: PASS** — All 8 requirements verified with evidence. SECU review clean. Root gates pass. Critical hooks.json install defect fixed.


### Testing

Verification gate for this task (run all; each maps to a Requirement). Command-disposition + hooks.json fix — verified by the checks below.

- [x] **R1/R2** — `ls plugins/cc/commands/ | wc -l` → **17** (8 orphans deleted, 17 survivors kept). **PASS**
- [x] **R2** — `ls plugins/cc/commands/ | rg "agent-adapt|command-adapt|magent-adapt|hook-emit|hook-list|hook-setup|skill-migrate|skill-package"` → no output. **PASS** — NONE
- [x] **R1/R8** — `rg "bun .*scripts/.*\.ts" plugins/cc/commands/` → none. **PASS** — NONE
- [x] **R1** — `rg "superskill (agent|skill|command|hook|magent) " plugins/cc/commands/ | wc -l` → **17**. **PASS**
- [x] **R3** — `hook-validate.md` present + rewritten (transitional note added). No new `*-validate` for the other four types. `ls plugins/cc/commands/ | rg "validate"` → `hook-validate.md` only. **PASS**
- [x] **R7** — `bun -e 'JSON.parse(...)' && echo OK` → **OK**. hooks.json is valid JSON (`{ "hooks": {} }`). **PASS**
- [x] **R7** — `rg "indexed-context|anti-hallucination|/tasks/" plugins/cc/hooks/hooks.json` → no output. **PASS** — NONE
- [x] **R6** — No invented flags: `rg "\-\-template|\-\-scope|\-\-eval|\-\-best-practices|\-\-migrate|\-\-dry-run|\-\-platform|\-\-profile|\-\-path|\-\-analyze|\-\-apply|\-\-confirm|\-\-history|\-\-rollback|\-\-lint|\-\-skills|\-\-tools|\-\-model|\-\-color|\-\-plugin-name|\-\-verbose" plugins/cc/commands/` → NONE. Only registered flags used: `scaffold(--description/--target/--output/--force)`, `evaluate(--json/--save/--target)`, `refine(--auto/--save/--target)`, `evolve(--from/--propose-only/--accept/--reject/--target)`, `validate(--strict/--json/--target)`. **PASS**
- [x] **R4** — `<type>` from file prefix verified: agent-*→agent, skill-*→skill, command-*→command, hook-*→hook, magent-*→magent. **PASS**
- [x] **R5** — Command bodies match `agent-evaluate.md` convention: frontmatter (description/argument-hint/allowed-tools) + `# Title` + summary + When to Use + Arguments table + Examples + Implementation (Skill delegation + direct CLI) + Platform Notes. **PASS**
- [x] Root gates: `bun run lint`, `bun run test`, and `bun run build` clean. **PASS**

No new automated tests (plugin markdown + JSON). Command outputs recorded as evidence above.

**Timestamp:** 2026-06-18T01:26:36Z


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §3, §4.4
- Feature: [F018](../features/F018-command-disposition-hooks.md)
- Depends on: 0023
- Cross-phase: hook-validate removed in Phase 4 (0032 / P4-D3)
