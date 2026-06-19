---
name: Confirm and close adapt gap in install
description: Confirm and close adapt gap in install
status: WIP
created_at: 2026-06-17T22:44:31.761Z
updated_at: 2026-06-19T21:42:27.758Z
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

**Audit result: No gap. The install conversion pipeline already covers all deleted adapter transforms.**

## Method

The deleted `adapt.ts` + `adapters/` (`cc-{agents,commands,skills}/scripts/adapt.ts`, `scripts/adapters/`) are not in this repo's git history — they were Phase 3 plugin scripts removed with disposition "Fold into `superskill install` conversion pipeline" (design-doc-phase3 §2.1, D3). Their behavior is documented in `03_ARCHITECTURE.md` §Conversion rules ("Carried from cc-agents/scripts") and `design-doc-phase5.md` §3.

## Parity table

| Deleted adapter transform | Pipeline stage | File | Covered? | Gap |
|---------------------------|---------------|------|----------|-----|
| Slash command dialect translation (`/plugin:cmd` → per-agent) | `translateSlashCommands` | `pipeline/slash-command.ts` | ✅ | None |
| Colon reference rewriting (`plugin:command` → `plugin-command`) | `rewriteColonRefs` | `pipeline/rewrite-colons.ts` | ✅ | None |
| Frontmatter `name:` injection | `normalizeFrontmatter` | `pipeline/frontmatter.ts` | ✅ | None |
| Pi subagent format conversion (Skills 2.0 → Pi YAML) | `convertToPiSubagent` | `pipeline/pi-subagent.ts` | ✅ | None |
| `allowed-tools:` normalization | — (rulesync owns) | `vendors/rulesync/src/features/skills/*.ts` | ✅ | None (invariant #1: rulesync owns per-target format) |

## Wiring

The 4 pipeline stages are wired into `install.ts:306-339` (`transformRulesyncMarkdown` → `transformMarkdownDirectory`):
- `rewriteColonRefs(content)` — applied to ALL targets, ALL content types
- `normalizeFrontmatter(content, name)` — commands + subagents (when `normalizeName` option set)
- `translateSlashCommands(content, target)` — commands only (when `translateSlash` option set)
- `convertToPiSubagent(content)` — subagents only when target is `pi` or `omp`

## `allowed-tools` is rulesync's job (invariant #1 / R7)

`normalizeFrontmatter` only injects `name:` — it does NOT normalize `allowed-tools:`. This is correct: rulesync's per-target skill classes (`ClaudecodeSkill`, `CopilotSkill`, `AgentsSkillsSkill`, etc.) each own their `allowed-tools` schema and handle it during `toRulesyncSkill()` / `fromRulesyncSkill()`. The architecture doc's "normalize `allowed-tools:`" refers to rulesync's per-target conversion, not a superskill pipeline stage. Adding `allowed-tools` normalization to superskill's pipeline would violate invariant #1 (rulesync owns format knowledge).

## Conclusion

**Gap closed, nothing to add.** The 4 pipeline stages + rulesync's per-target format handling fully cover the deleted `adapt.ts`/`adapters/` behavior. No new pipeline stage needed. Deliverable: this parity table + a confirming regression test (asserts the pipeline applies all 4 transforms per target) + a "gap closed" note in the design doc.


### Solution

Audit: recover deleted adapt.ts/adapters/ behavior from git history; build parity table. For real gaps add pure pipeline stages wired into convert.ts. Most likely outcome: no gap (forward path already covers it) -> record the parity table + 'closed' note + a regression test. Verify: superskill install <plugin> --targets all --dry-run applies slash/colon/frontmatter/Pi per target with no missing adapter transform.


### Plan

1. **Audit (done)** — Read deleted `adapt.ts`/`adapters/` intent from design docs (design-doc-phase3 §2.1, design-doc-phase5 §3, 03_ARCHITECTURE.md §Conversion rules). Enumerated 5 transforms the deleted adapters performed. Diffed against the 4 current pipeline stages + rulesync's per-target handling. Result: **no gap**.

2. **Write parity test** — Create `apps/cli/tests/pipeline/adapt-parity.test.ts`:
   - Test that `rewriteColonRefs` rewrites `rd3:foo` → `rd3-foo`, `wt:bar` → `wt-bar`
   - Test that `translateSlashCommands` translates `/plugin:cmd` per target (at least claude + codex)
   - Test that `normalizeFrontmatter` injects `name:` when missing, preserves when present
   - Test that `convertToPiSubagent` converts a Skills 2.0 subagent to Pi YAML
   - Test the full pipeline wiring: `transformMarkdownDirectory` applies all 4 stages in the correct order (colon rewrite always, name injection for commands, slash translation for commands, Pi conversion for pi/omp subagents)
   - This is a parity/regression test — asserts existing pipeline covers deleted-adapter behavior

3. **Add "gap closed" note to design-doc-phase5.md** — Append an audit note under §3 confirming the parity table and "gap closed, nothing to add."

4. **Phase 5 closing gate** — Run full suite (`bun run test`), check aggregate coverage ≥90% line/function, `bun run lint`, `bun run build`, `git status` clean. This task owns the cross-feature Phase 5 gate (R8).

5. **Verification** — SECU review + traceability, post-flight audit, transition to Done.


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

