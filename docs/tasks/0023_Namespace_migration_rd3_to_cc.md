---
name: Namespace migration rd3 to cc
description: Namespace migration rd3 to cc
status: Done
created_at: 2026-06-17T22:28:04.408Z
updated_at: 2026-06-18T00:06:08.612Z
folder: docs/tasks
type: task
feature-id: F016
priority: high
estimated_hours: 3
tags: ["phase3","namespace","plugin","cleanup"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0023. Namespace migration rd3 to cc

### Background

The cc plugin (registered as 'cc' in .claude-plugin/marketplace.json: name='cc', source='./plugins/cc') still carries the old 'rd3' namespace across ~123 files inherited from the source corpus (cc-agents/plugins/rd3/). User-facing prompts referencing /rd3:agent-add or rd3:cc-agents are broken — those skills resolve under the 'cc' plugin now. This task performs a pure global string migration rd3->cc across plugins/cc/. Skill DIRECTORY names stay (cc-agents/, cc-skills/, cc-commands/, cc-hooks/, cc-magents/ — design D4); only references change. Must land FIRST: every downstream rewrite (F017 SKILL.md, F018 commands) targets the final cc:cc-* names. Design: design-doc-phase3.md §1, §6 invariant #1. Owning feature: F016.


### Requirements

- [x] **R1** — `rg "rd3" plugins/cc/` returns **zero** hits (design §6 invariant #1, the regression target).
- [x] **R2** — Skill-invocation refs migrated: `rd3:cc-<type>` → `cc:cc-<type>` in all SKILL.md, expert agents, command bodies.
- [x] **R3** — Slash-prefix refs migrated: `/rd3:<cmd>` → `/cc:<cmd>` (filename-preserving — the verb/disposition is F018's concern, not this task's).
- [x] **R4** — Path refs migrated: `plugins/rd3/...` → `plugins/cc/...` (notably in `agents/expert-*.md`).
- [x] **R5** — Companion configs migrated: `metadata.openclaw` blocks and `agents/openai.yaml` files — their `rd3`-bearing description/version values renamed to `cc` in lockstep.
- [x] **R6** — SKILL.md `metadata` frontmatter (`author:`, version strings) aligned to `cc`.
- [x] **R7** — Skill **directory names preserved** (D4): `ls plugins/cc/skills/` still shows `cc-agents cc-commands cc-hooks cc-magents cc-skills`. NOT renamed to bare `agents/` etc.
- [x] **R8** — No `apps/cli/` source touched: `git diff --name-only apps/cli/` is empty. Plugin-only change.
- [x] **R9** — No behavior/logic/structure change: source diff is a pure string swap (no operation semantics, no file moves, no deletions).

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

- Scope: Pure global string migration `rd3` → `cc` across all text files in `plugins/cc/` (103 md, 96 ts, 28 json, 14 sh, 10 bats, 8 yaml, 5 openclaw, 1 toml). No file moves, no deletions, no logic change.
- Key decision: Blind string swap is safe because (a) R1 demands zero `rd3` hits, (b) no `rd3` substring is load-bearing inside a URL, npm package scope, or import path — confirmed by searching `https?://*rd3`, `@rd3/`, and inspecting all `.ts` JSDoc/string-literal hits. Directory names already use `cc-` prefix (D4 invariant), so the swap cannot collide with them.
- Token patterns migrated (all map 1:1 to `cc`): `rd3:cc-<type>` → `cc:cc-<type>` (skill invocations); `/rd3:<cmd>` → `/cc:<cmd>` (slash refs); `plugins/rd3/...` → `plugins/cc/...` (path refs); `rd3:expert-<type>` → `cc:expert-<type>` (namespace); bare `rd3` in prose/frontmatter/companion configs → `cc`. `rd2` is a different legacy namespace and is NOT in scope — it survives untouched.
- Boundaries affected: `plugins/cc/` only. `apps/cli/` explicitly excluded (R8).
- Risks: none beyond normal regression risk. The swap is byte-level; no AST restructuring. `bun run lint` is the gate.


### Solution

Inventory with 'rg -l rd3 plugins/cc/ | sort' (expect ~123). Enumerate distinct surrounding tokens first: 'rg rd3 plugins/cc/ -o | sort -u' to confirm no rd3 substring is load-bearing inside a longer identifier (URL, package name) that must survive. Then substitute file-by-file reviewing each hunk: rd3:->cc:, /rd3:->/cc:, plugins/rd3/->plugins/cc/, bare rd3 in companion configs/frontmatter/prose->cc. Use sg/rg-driven replacement.


### Plan

- [x] Inventory: confirm ~123 files contain `rd3` via search; enumerate distinct token contexts
- [x] Confirm no load-bearing `rd3` in URLs, package scopes, or import paths (searched `https?://*rd3`, `@rd3/`, inspected all .ts hits)
- [x] Write a Bun script that recursively walks `plugins/cc/`, replaces every `rd3` → `cc` in text files, reports changed-file count
- [x] Run the replacement script — 123 files changed, 555 replacements
- [x] Verify R1: `search` for `rd3` in `plugins/cc/` → zero hits (No matches found)
- [x] Verify R2/R3: `search` for `/rd3:|rd3:cc-` → zero hits (subsumed by R1)
- [x] Verify R4: `search` for `plugins/rd3/` → zero hits (subsumed by R1)
- [x] Verify R7: `ls plugins/cc/skills/` → cc-agents cc-commands cc-hooks cc-magents cc-skills (dirs preserved)
- [x] Verify R8: `git diff --name-only apps/cli/` → empty (plugin-only)
- [x] Verify R9: `plugins/cc` has 265 files and zero `rd3` hits; source diff is pure namespace migration
- [x] Root gates: `bun run lint`, `bun run test`, and `bun run build` pass


### Review

**Verdict: PASS**

**Mode:** `rd3-dev-verify 0023 --auto --fix all --force`
**Date:** 2026-06-17
**Scope:** `plugins/cc/`, task `0023`, current worktree
**Gate:** `bun run lint` PASS; `bun run test` PASS; `bun run build` PASS

**Findings**

No findings remain.

**Requirements Traceability**

| Req | Description | Status | Evidence |
|-----|-------------|--------|----------|
| R1 | `rg "rd3" plugins/cc/` returns zero hits | PASS | `rg "rd3" plugins/cc/` exit 1, no output |
| R2 | Skill refs migrated from `rd3:cc-*` to `cc:cc-*` | PASS | Subsumed by R1; `rg "/rd3:|rd3:cc-" plugins/cc/` exit 1 |
| R3 | Slash-prefix refs migrated from `/rd3:` to `/cc:` | PASS | Subsumed by R1; `rg "/rd3:|rd3:cc-" plugins/cc/` exit 1 |
| R4 | Path refs migrated from `plugins/rd3/` to `plugins/cc/` | PASS | `rg "plugins/rd3/" plugins/cc/` exit 1 |
| R5 | Companion configs migrated | PASS | R1 covers all `rd3` text under `plugins/cc/`; no stale namespace remains |
| R6 | SKILL.md metadata/frontmatter aligned | PASS | R1 covers all `rd3` text under `plugins/cc/`; no stale namespace remains |
| R7 | Skill directory names preserved | PASS | `ls plugins/cc/skills` -> `cc-agents cc-commands cc-hooks cc-magents cc-skills` |
| R8 | No `apps/cli/` diff | PASS | `git diff --name-only apps/cli/` -> empty |
| R9 | Pure string swap / no behavior, logic, structure drift | PASS | `plugins/cc` has 265 files and zero `rd3` hits; no source diffs outside `plugins/cc` |

**SECU Review**

- **Security:** No security findings in the namespace migration. No new auth, secrets, external input, or command execution surface identified.
- **Efficiency:** No efficiency findings. The verified migration is textual and has no runtime path.
- **Correctness:** All namespace, path, directory, and scope invariants pass.
- **Usability:** No user-facing stale `rd3` namespace remains under `plugins/cc/`.

**Fix Pass**

`--fix all` found no remaining in-scope plugin fixes after the final verification pass.

**Overall Verdict**

**PASS** — all 9 requirements pass and all quality gates pass.


### Testing

Verification gate for task 0023.

- [x] **R1** — `rg "rd3" plugins/cc/` -> no output, exit 1.
- [x] **R2/R3** — `rg "/rd3:|rd3:cc-" plugins/cc/` -> no output, exit 1.
- [x] **R4** — `rg "plugins/rd3/" plugins/cc/` -> no output, exit 1.
- [x] **R7** — `ls plugins/cc/skills` -> `cc-agents cc-commands cc-hooks cc-magents cc-skills`.
- [x] **R8** — `git diff --name-only apps/cli/` -> empty.
- [x] **R9** — `plugins/cc` has 265 files and zero `rd3` hits; no source diffs outside `plugins/cc`.
- [x] **Root lint gate** — `bun run lint` passed: Biome checked 92 files; typecheck exited 0.
- [x] **Root test gate** — `bun run test` passed: 462 tests, 0 failures, aggregate coverage 99.53% functions / 98.32% lines.
- [x] **Root build gate** — `bun run build` passed: `apps/cli/dist/index.js` bundled successfully.

No new automated tests were added during this verification pass.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase3.md](../design/design-doc-phase3.md) §1, §6
- Feature: [F016](../features/F016-namespace-migration.md)
- Authority: docs/00_ADR.md (D4 — keep skill dir names); design-doc-phase3 §0 locked decisions
- Unblocks: 0024, 0025 (downstream rewrites target the final cc:cc-* names)
