---
name: Confirm and close adapt gap in install
description: Confirm and close adapt gap in install
status: Backlog
created_at: 2026-06-17T22:44:31.761Z
updated_at: 2026-06-17T22:44:31.761Z
folder: docs/tasks
type: task
feature-id: F032
priority: medium
estimated_hours: 3
tags: ["phase5","adapt","install","pipeline","audit"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0039. Confirm and close adapt gap in install

### Background

Confirm that the cross-platform adapt capability deleted in Phase 3 §2.1 (cc-{agents,commands,skills}/scripts/adapt.ts + scripts/adapters/) is already covered by the superskill install conversion pipeline (pipeline/convert.ts), and add ONLY what's missing. There is NO separate adapt verb — the pipeline is its documented home (Phase 3 §2 note, ADR). adapt was deleted with disposition 'fold into install conversion pipeline' (design §2.1, P5-D4). The forward path already does slash-dialect, colon->hyphen, frontmatter normalization, Pi subagent conversion. This is a GAP-CLOSING AUDIT, not a rebuild: confirm parity vs deleted adapters, add the missing transform if any, close the Phase 3 deletion debt (§6 exit #5). Design: design-doc-phase5.md §3 (adapt row). Owning feature: F032.


### Requirements

- [ ] **R1** — Read the deleted `adapt.ts` + `adapters/` intent (git history); enumerate the transforms they performed per target.
- [ ] **R2** — Diff against the current `pipeline/` stages: `rewriteColonRefs` (`plugin:command`→`plugin-command`), `translateSlashCommand` (`/plugin:cmd`→per-agent dialect), `normalizeFrontmatter` (inject `name:`, normalize `allowed-tools:`), `convertToPiSubagent` (Skills 2.0 → Pi YAML).
- [ ] **R3** — Produce a **parity table**: deleted-adapter transform × covered-by-pipeline? × gap. Recorded in the design/plans doc.
- [ ] **R4** — For each genuine gap, add a **pure pipeline stage** (`(content, target, opts?) => string`, no FS, no side effects — 03 invariant #5) wired into `convert.ts`.
- [ ] **R5** — If the audit finds **no gap**: deliverable is the parity table + a confirming test (in this task — see `### Testing`) + an explicit "gap closed, nothing to add" note.
- [ ] **R6** — **No `adapt` verb** — the capability stays inside `install`'s pipeline (ADR; design §3 table).
- [ ] **R7** — rulesync owns format knowledge (invariant #1) — the pipeline adds only cc-agents-specific transforms; per-target file format stays with rulesync.
- [ ] **R8** — This task also owns the **Phase 5 closing gate** (full suite across 0034–0038 green, ≥90% coverage, lint/build green) — see `### Testing`.

**Acceptance:**
```bash
rg -i "adapt|parity|deleted adapter" docs/design/design-doc-phase5.md   # → audit note present
superskill install <plugin> --targets all --dry-run                    # → all transforms applied per target, no missing adapter
```

**Out of scope:** any new top-level verb; hook work (F027–F029).


### Q&A



### Design



### Solution

Audit: recover deleted adapt.ts/adapters/ behavior from git history; build parity table. For real gaps add pure pipeline stages wired into convert.ts. Most likely outcome: no gap (forward path already covers it) -> record the parity table + 'closed' note + a regression test. Verify: superskill install <plugin> --targets all --dry-run applies slash/colon/frontmatter/Pi per target with no missing adapter transform.


### Plan



### Review



### Testing

Tests ship **in this task** (design rule: each task owns its tests — no separate pure-test task).

- [ ] `adapt` parity test: forward conversion for all targets still applies the expected slash/colon/frontmatter/Pi transforms — no missing adapter transform (design §6 exit #5).
- [ ] If the audit added a pipeline stage, test it as a pure function (`(content, target, opts?) => string`, no FS); if no gap, the test asserts the existing pipeline covers the deleted-adapter behavior (parity).
- [ ] **Phase-5 closing gate** (this is a good home for the whole-phase check since 0039 is independent and lands late; or move to 0040's successor — but 0040 is canceled, so it lives here):
  - `bun run test` — all Phase 5 tests (across 0034–0039) pass; **none** skipped / `.skip`'d / commented out.
  - Aggregate coverage **line ≥ 90% / function ≥ 90%** (`bunfig.toml`).
  - `bun run lint && bun run build` green; `git status` shows only intentional changes.
- [ ] No test skipped / `.skip`'d (R12).

This task carries the cross-feature Phase-5 gate the dissolved pure-test feature (former F033) used to hold; per-feature tests live in 0034–0038.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §3 (adapt row), §6 exit #5
- Feature: [F032](../features/F032-adapt-gap.md)
- Code: apps/cli/src/pipeline/{convert,slash-command,rewrite-colons,frontmatter,pi-subagent}.ts; git history of deleted adapt.ts/adapters/
- Owns: Phase 5 closing gate; carries the gate formerly held by canceled task 0040

