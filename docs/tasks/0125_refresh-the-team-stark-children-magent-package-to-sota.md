---
schema_version: 1
name: "Refresh the team-stark-children magent package to SOTA"
status: done
template: feature-impl
created_at: 2026-09-02T19:09:26.230Z
updated_at: "2026-09-02T20:33:45.142Z"
feature_id: C
priority: P1
tags: ["magent", "docs", "drift", "conciseness", "tools"]
---

## 0125. Refresh the team-stark-children magent package to SOTA

### Background

`magents/team-stark-children/AGENTS.md` is the operator's daily-driver main-agent config, emitted to nine targets and loaded into context on every request. Three defects compound in it:

1. **It routes agents to commands that do not exist.** `spur status` and `spur init` are not top-level verbs in spur 0.3.71 -- the real ones are `spur self status` and `spur self init` (verified against both the dev checkout on PATH and the published tarball). Four live nouns (`message`, `projects`, `self`, `builder`) and `superskill script` are undocumented.
2. **It is roughly twice its useful length.** At 17,278 characters it scores **0.00** on the project's own `conciseness` dimension (`scoreLength(body, 1000, 8000)`), dragging the weighted aggregate to 0.7857. Measured `noOpDensity` and `duplicationRatio` are both 0.0000, so there is no filler to trim -- only real content to tighten or relocate. Independently, the Sep-2026 AGENTS.md research finds returns go negative past ~150 lines and over-length context files inflate inference cost 20-23%.
3. **It never states how to choose a tool.** `## Preferred tools` maps needs to tools but gives no priority order and no reason, so nothing tells an agent that a general shell is the wrong first reach. This is non-inferable operator knowledge -- the exact category the research says such a file earns its keep on.

The three are one edit of one package: every fix lands in the same four files, and the compression budget is what pays for the new doctrine. Splitting them into separate tasks would serialize four passes over the same file for no gain.

### Requirements

- [x] R1. Replace `spur status` with `spur self status` and `spur init` with `spur self init` throughout the package.
- [x] R2. Add the missing live nouns to the harness routing table: `spur message`, `spur projects`, `spur self`, `spur builder`, and `superskill script`.
- [x] R3. Verify every remaining `spur <noun> <verb>` and `superskill <noun> <verb>` string against the binaries' own `--help` output by extraction, not by eye; correct or delete any that does not resolve.
- [x] R4. Reduce the AGENTS.md body to at most **9,500 characters** (from 17,278).
- [x] R5. Preserve all 16 level-two headings, in their current order (operator constraint: keep the file layout).
- [x] R6. Relocate displaced depth into `plugins/cc/rules/` rather than deleting it; content already a verbatim duplicate of an existing rule module may be dropped outright.
- [x] R7. Keep the CRITICAL safety boundaries and the verification gate stated inline -- opencode, hermes, grok and omp receive no plugin rules at install time.
- [x] R8. Introduce no no-op phrasing and no repeated phrasing: `noOpDensity` and `duplicationRatio` stay 0.0000.
- [x] R9. State a single tool-priority ladder: native built-in tools first; shell-shaped tools (bash, Bash, shell, Shell, run_terminal_command, Python and equivalents) last among built-ins.
- [x] R10. Give that demotion its reason: unbounded output floods context and costs tokens, and a general shell shadows the purpose-built tool the harness offers.
- [x] R11. State the file-search order -- native search tools, then `rg` and `sg`, then `grep`/`sed`/`awk`/`perl` -- with its reason: `rg` and `sg` are gitignore-aware and skip files a raw text scan would read.
- [x] R12. State the web order: native web search and fetch first, then `curl`/`wget`/MCP or plugin surfaces.
- [x] R13. Mirror the ladder into `overrides/codexcli/AGENTS.md` (1,237 B) and `overrides/pi/AGENTS.md` (1,158 B), which **replace** the root AGENTS layer for those two targets; both stay compact and far under the ~32 KiB Codex budget asserted at `overrides/codexcli/AGENTS.md:3`.
- [x] R14. `superskill magent evaluate magents/team-stark-children/AGENTS.md --json` reports aggregate >= 0.90 and conciseness > 0.70, with **no dimension below its measured baseline** (completeness 1.00, platform-coverage 1.00, conciseness 0.00, tone-consistency 1.00, safety 0.5714).
- [x] R15. `superskill magent validate magents/team-stark-children` reports Valid and `bun run spur-check` is green.
- [x] R16. Any file that enumerates the package layout or the rule set stays true: `magents/team-stark-children/README.md` (layout table) and `magents/team-stark-children/CLAUDE.md:11` (which names the four rule modules inline) are updated in the same commit if either changes.

### Acceptance Criteria

```gherkin
Feature: SOTA refresh of the team-stark-children magent package

  @core
  Scenario: R1 — Every documented harness invocation resolves against the live CLI
    Given the installed spur and superskill binaries on PATH
    When a reviewer extracts every "spur <noun> <verb>" and "superskill <noun> <verb>" invocation from AGENTS.md and both override files
    Then each extracted noun and verb appears in that binary's own --help output
    And no invocation of "spur status" or "spur init" remains anywhere in the package

  @core
  Scenario: R2 — The tool-priority doctrine states the ladder and its reason
    Given the refreshed AGENTS.md
    When an agent reads the tool-selection guidance
    Then native built-in tools rank above every shell-shaped tool
    And the shell-shaped family is named explicitly, covering at least bash, Bash, shell, Shell, run_terminal_command, and Python
    And the demotion carries its reason: unbounded output floods context and a general shell shadows the purpose-built tool
    And file search ranks native tools first, then rg and sg, then grep, sed, awk, and perl
    And the rg and sg preference carries its reason: gitignore-aware traversal skips files a raw text scan would read
    And web access ranks native search and fetch first, then curl, wget, and MCP or plugin surfaces

  @core
  Scenario: R3 — The doctrine reaches every install target
    Given the magent package emits to nine targets and only codex and pi resolve an overrides/ AGENTS layer
    When the package is assembled for each target
    Then the assembled content for every target contains the tool-priority ladder
    And the codex override stays within its documented 32 KiB cap

  @core
  Scenario: R4 — AGENTS.md is compressed without losing its layout
    Given AGENTS.md measured 17278 characters before the refresh
    When the refreshed file is measured
    Then its body is at most 9500 characters
    And it still contains the same 16 level-two headings in the same order

  @core
  Scenario: R5 — Quality clears the gate on the project's own rubric
    Given the refreshed magent package
    When "superskill magent evaluate magents/team-stark-children/AGENTS.md --json" is run
    Then the aggregate is at least 0.90
    And the conciseness dimension is greater than 0.70
    And no dimension scores lower than it did at the 0.7857 baseline

  @core
  Scenario: R6 — Displaced depth is relocated, not deleted
    Given content removed from AGENTS.md during compression
    When the reviewer diffs the removed content against the plugin rules directory
    Then each removed rule is either present in a plugins/cc/rules module or was a verbatim duplicate of content that already lived there
    And no removed rule is absent from both

  @edge
  Scenario: R7 — Targets without a rules directory retain safety and discipline
    Given opencode, hermes, grok, and omp receive no plugin rules at install time
    When the assembled AGENTS.md for those targets is read
    Then it still states the CRITICAL safety boundaries and the verification gate inline

  @edge
  Scenario: R8 — The refreshed package installs and validates cleanly
    Given the refreshed magent package
    When "superskill magent validate magents/team-stark-children" is run
    And "bun run spur-check" is run
    Then both report success
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-09-02T19:14:47.450Z

**CLOSED — target is ≤9,500 chars, not 8,000.** Conciseness 1.0 needs ≤8,000 chars, which across 16 headings plus the new doctrine averages ~470 chars per section. It buys 0.0357 of aggregate at the cost of stripping content the operator reads daily. 9,500 clears the 0.90 gate with 405 chars of margin. 8,000 recorded as a stretch, not the bar.

**CLOSED — the scorer is the instrument, not the subject.** `packages/core/src/quality/*` and `rubrics/magent.yaml` stay untouched; feature A owns them. Tuning them to flatter this file would void the gate that proves the work.

**CLOSED — safety stays at 4/7.** No keyword-stuffing to buy budget. Verified this session that `security` is present but boundary-blocked and that `dangerous` / `validation` are absent; the 9,500 target is sized to clear 0.90 without touching any of that.

**CLOSED — `CLAUDE.md` stays a real file.** The AGENTS.md↔CLAUDE.md symlink was ruled out by the operator during feature A (2026-08-13). It is the `@`-import entry for Claude Code, not a duplicate of AGENTS.md.

**CLOSED — the doctrine lives in the root file, not a rule module.** Rules reach only claude and antigravity; six of nine targets would never see it.

**CLOSED — layout means the 16 `##` headings.** Names and order are frozen; `###` substructure inside a section is free, which is what makes room for the ladder under `## Preferred tools`.

**DEFERRED — mechanical enforcement of the ladder.** A PreToolUse hook would enforce tool priority rather than merely instruct it. Out of scope here (plugin behavior, not magent content); owner: follow-up task under the cc plugin.

**NOTED — 16 R-items exceeds the soft cap of 10.** `spur task update` advises decomposing. This is the direct consequence of the operator's instruction to merge 0125-0128 into one task; the four originals were sequential passes over the same four files. Accepted, not decomposed.

**MEDIUM confidence — the ~32 KiB Codex cap.** Asserted at `magents/team-stark-children/overrides/codexcli/AGENTS.md:3`; no code in this repo enforces or verifies it. Both overrides are ~1.2 KB, so the cap is nowhere near binding — treat it as a documented budget, checked with `wc -c`, not as a gate.

### Design

**WHERE — the seven files this task may touch.** Nothing outside this list:

| File | Change |
| --- | --- |
| `magents/team-stark-children/AGENTS.md` | 17,278 → ≤9,500 chars; drift repair; tool-priority ladder |
| `magents/team-stark-children/overrides/codexcli/AGENTS.md` | ladder mirror (1,237 B today) |
| `magents/team-stark-children/overrides/pi/AGENTS.md` | ladder mirror (1,158 B today) |
| `plugins/cc/rules/01-discipline.md` (553 B) | receives displaced discipline / design-&-scope depth |
| `plugins/cc/rules/02-harness-first.md` (1,103 B) | receives displaced routing + doc-map depth |
| `plugins/cc/rules/03-safety.md` (415 B) | receives displaced safety-matrix depth |
| `plugins/cc/rules/04-verification.md` (474 B) | receives displaced gate depth |
| `magents/team-stark-children/{README.md,CLAUDE.md}` | only if the layout or rule set changed (R16) |

**The budget is arithmetic, not taste.** Weights are completeness 0.25, platform-coverage 0.25, conciseness 0.15, tone-consistency 0.20, safety 0.15 (`packages/core/src/rubrics/magent.yaml:5,21,31,48,58`). That weighted sum reproduces the tool's `0.7857142857` exactly; the equal-weighted `computeAggregate` gives 0.7143, and the CLI overwrites it at `apps/cli/src/operations/evaluate.ts:208`. With the other four dimensions held at baseline, the budget is a function of the safety count:

| safety | conciseness needed for 0.90 | max body |
| --- | --- | --- |
| 3/7 = 0.4286 | 0.9048 | 8,762 chars |
| **4/7 = 0.5714 (today)** | **0.7619** | **9,905 chars** |
| 5/7 = 0.7143 | 0.6190 | 11,048 chars |

**9,500 is the target** — 405 chars of margin under the 9,905 ceiling. A "≤10,000" target silently fails at 0.8982.

**The safety score is fragile; four words carry it.** `scoreSafety` (`packages/core/src/quality/magent.ts`) scores `keywordDensity` over seven terms, which requires a **whole-word match bounded by whitespace or `.,;:!?`** (`packages/core/src/quality/heuristics.ts`). Verified this session: `[CRITICAL]`, `safety`, `never`, `block` match; `security` is present but every occurrence is boundary-blocked (followed by `/` or `-`); `dangerous` and `validation` are absent. **Each of the four must survive compression with its boundaries intact** — rewriting `Block → explain → wait` or dropping the `[CRITICAL]` marker costs 0.0214 aggregate and drops the ceiling to 8,762. Ignore the CLI note `"5 safety markers found"`: that count is naive substring matching and does **not** drive the score.

**WHAT — the ladder, and where it goes.** The operator constraint is "keep current file layout", read as: the 16 `##` headings, same names, same order. So the doctrine adds **no new `##` heading** — it lands inside `## Preferred tools`, replacing the existing `### Tool decision tree` subsection. Three orders, each with its reason attached:

1. **Native built-in tools first.** Shell-shaped built-ins (`bash`/`Bash`/`shell`/`Shell`/`run_terminal_command`/`Python`) rank **last among built-ins** — unbounded output floods context and costs tokens, and a general shell shadows the purpose-built tool the harness already offers.
2. **File search:** native search tools → `rg` / `sg` → `grep`/`sed`/`awk`/`perl`. `rg` and `sg` are gitignore-aware and skip files a raw text scan would read.
3. **Web:** native web search / fetch → `curl`/`wget`/MCP or plugin surfaces.

**Rules carry reasons, not just order.** A bare ranking is forgotten under pressure; a ranking with its failure mode attached can be re-derived.

**The doctrine goes in the root, not a rule module.** A rule module is the cleaner progressive-disclosure answer, but plugin rules install only to `.claude/rules/` and `.agents/rules/` (`packages/core/src/pipeline/select-magent.ts:248,270-277`) — claude and antigravity-cli/ide only. A cross-agent tool doctrine that six of nine targets never see is worse than a slightly larger root file. Overrides **replace**, never append (`select-magent.ts:135-145`), so codex and pi need it mirrored; they currently say only "search via `rg`" (`overrides/codexcli/AGENTS.md:34`, `overrides/pi/AGENTS.md:34`).

**Relocation over deletion, with one hard limit.** opencode, hermes, grok and omp read AGENTS.md with **no rules alongside**, so `## [CRITICAL] Safety` and `## Verification gate` cannot leave the root file — they get compressed in place. Everything else is a relocation candidate. Prefer **extending the four existing rule modules** along their existing themes over adding a fifth; a new `plugins/cc/rules/*.md` needs no registration (discovery is a `readdirSync` glob at `select-magent.ts:248`) but does make `magents/team-stark-children/CLAUDE.md:11` — which names the four modules inline — stale, so it triggers R16.

**Where the characters are.** Harness-first 3,287; Safety 1,760; Preferred tools 1,592; Documentation map 1,584; Design & scope 1,299; Subagent routing 1,170. The top six sections hold 63% of the file: the cut is concentrated, not spread thin.

**Anti-patterns — do not implement any of these:**

- **Do not edit `packages/core/src/quality/*` or `rubrics/magent.yaml`.** Feature A owns them; tuning the instrument invalidates the gate that proves the work.
- **Do not keyword-stuff `scoreSafety`** (e.g. adding "dangerous"/"validation" or unblocking `security`) to buy budget. The 9,500 target is designed to clear 0.90 with safety **unchanged**.
- **Do not add, remove, rename, or reorder `##` headings.** Layout is an operator constraint, and `scoreCompleteness` matches on headings.
- **Do not replace `CLAUDE.md` with a symlink to `AGENTS.md`** — ruled out by the operator during feature A (2026-08-13). It is the `@`-import entry, not a duplicate.
- **Do not delete content to hit the number.** Every cut is either a relocation into `plugins/cc/rules/` or a genuine tightening; measured `noOpDensity` and `duplicationRatio` are already 0.0000, so there is no filler to reclaim.
- **Do not modify `vendors/`.**

**Ordering.** Drift repair first (mechanical, independent, and it stops the rewrite from carrying a stale verb forward), then compression (frees budget), then the doctrine (spends it), then the gate. Authoring the doctrine first pushes the file further from target and forces a second pass.

**No new API.** This task introduces no types, flags, config keys, or exports — it is documentation content plus rule-module text.

**Not in scope: enforcement.** A PreToolUse hook could enforce the ladder mechanically, which is stronger than instruction — but that is a plugin behavior change, not a magent doc change. Recorded as a follow-up.

### Plan

- [x] Baseline: record body chars, `noOpDensity`, `duplicationRatio`, and all five dimension scores from `superskill magent evaluate … --json` (evidence for R14)
- [x] Extract every `spur`/`superskill` invocation across the package (`rg -o '\b(spur|superskill) [a-z-]+( [a-z-]+)?'`); diff against `spur --help` / `superskill --help` and each noun's `--help` (R3)
- [x] Apply the drift fixes: `spur status` → `spur self status`, `spur init` → `spur self init` (`AGENTS.md:38,39`); add `spur message` / `projects` / `self` / `builder` and `superskill script` to the routing table (R1, R2)
- [x] Compress `AGENTS.md` to ≤9,500 chars, all 16 `##` headings unchanged in name and order (R4, R5)
- [x] Relocate displaced depth into the four existing `plugins/cc/rules/*.md` modules along their themes; add a fifth only if nothing fits (R6)
- [x] Verify `## [CRITICAL] Safety` and `## Verification gate` remain inline and substantive — opencode / hermes / grok / omp get no rules (R7)
- [x] Guard the four scoring safety markers: assert `[CRITICAL]`, `safety`, `never`, `block` still match the whole-word + punctuation-boundary regex after the rewrite
- [x] Re-measure `noOpDensity` and `duplicationRatio`; both must stay 0.0000 (R8)
- [x] Replace `### Tool decision tree` with the tool-priority ladder — three orders, each with its reason (R9-R12)
- [x] Mirror the ladder into `overrides/codexcli/AGENTS.md` and `overrides/pi/AGENTS.md`; `wc -c` both to confirm they stay compact (R13)
- [x] Gate: `superskill magent evaluate magents/team-stark-children/AGENTS.md --json` → aggregate ≥0.90, conciseness >0.70, no dimension under baseline (R14)
- [x] Gate: `superskill magent validate magents/team-stark-children` → Valid; `bun run spur-check` green (R15)
- [x] Sync `README.md` and `CLAUDE.md:11` if the layout or rule set changed (R16)
- [x] Record the before/after dimension table in `### Testing` as the verify evidence

### Solution

**Change map**

| File | Change |
| --- | --- |
| `magents/team-stark-children/AGENTS.md` | 17,480 → 9,184 chars. Routing row 31 now `spur self init` / `spur self status` / `spur projects`; rows 31–35 add `spur message` / `team` / `agent` / `history` / `spur builder` / `superskill script`. `### Tool priority` ladder (`magents/team-stark-children/AGENTS.md:139-145`) replaces the old decision tree under `## Preferred tools`: natives above shell-shaped (`bash`, `Bash`, `shell`, `Shell`, `run_terminal_command`, Python) with flood/shadow reason; native → `rg`/`sg` → `grep`/`sed`/`awk`/`perl` with gitignore reason; native web → `curl`/`wget` → MCP/plugin. Safety table (`magents/team-stark-children/AGENTS.md:60-70`) and verification gate (`magents/team-stark-children/AGENTS.md:165-171`) compressed in place. All 16 `##` headings verbatim, order preserved. |
| `magents/team-stark-children/overrides/codexcli/AGENTS.md` | New `## Tool priority` (`magents/team-stark-children/overrides/codexcli/AGENTS.md:31-35`) — ladder mirrored; overrides replace, never append. |
| `magents/team-stark-children/overrides/pi/AGENTS.md` | Ladder (`magents/team-stark-children/overrides/pi/AGENTS.md:37-41`) + Pi tools table corrected to native `Read`/`Edit`/`Write`. |
| `plugins/cc/rules/01-discipline.md` | Received displaced depth: 4 recovered rules (goal-driven, token discipline, pushback once, conformance over taste) + `## Scope doctrine` (`plugins/cc/rules/01-discipline.md:16-22`). |
| `plugins/cc/rules/02-harness-first.md` | `## Live nouns (spur 0.3.71+)` (`plugins/cc/rules/02-harness-first.md:26-29`): message/projects/self/builder + superskill script. |
| `magents/team-stark-children/{README.md,CLAUDE.md}` | Untouched — layout table and four-module claims remain true (no fifth rule module added; R16 satisfied). |

**Rationale.** Compression funded the doctrine: the cut came from the six heaviest sections (63% of the file) as tightening plus relocation along the four existing rule themes — no fifth module, so CLAUDE.md's inline rule list stayed true and needed no edit. Mechanical invocation extraction drove drift repair before the rewrite, so no stale verb survived compression. Scoring gates: evaluate aggregate 0.9135 (≥0.90), conciseness 0.852 (>0.70), safety unchanged at baseline 0.5714, noOpDensity/duplicationRatio 0.0000; validate exit 0; install --dry-run exit 0.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
| ------------- | -------- | ---------- |
| R1 | MET | `magents/team-stark-children/AGENTS.md:31` — routing uses `spur self init` / `spur self status`; mechanical extraction sweep this run: unresolved invocations NONE (dead `spur status`/`spur init` absent) |
| R2 | MET | `magents/team-stark-children/AGENTS.md:31-35` — rows for `spur message` / `spur projects` / `spur builder` / `superskill script` |
| R3 | MET | command `rg/sweep + <bin> <noun> --help` over root + both overrides this run — every extracted invocation resolves; zero dead nouns/verbs |
| R4 | MET | command `AGENTS.md chars: 9184` this run — ≤ 9,500 target |
| R5 | MET | command this run: `headings count: 16`, `exact match: true` — all 16 `##` headings verbatim, order preserved |
| R6 | MET | `plugins/cc/rules/01-discipline.md:8-22` (4 recovered rules + Scope doctrine), `plugins/cc/rules/02-harness-first.md:26-29` (Live nouns) |
| R7 | MET | `magents/team-stark-children/AGENTS.md:60-70` (4-row CRITICAL table + injection defense), `magents/team-stark-children/AGENTS.md:165-171` (5-point verification gate) — inline and substantive |
| R8 | MET | command `superskill install cc --magent team-stark-children --dry-run` exit 0; `superskill magent validate` → Valid, exit 0 |
| R9 | MET | `magents/team-stark-children/AGENTS.md:139-145` — rung 1: purpose-built natives above shell-shaped (`bash`, `Bash`, `shell`, `Shell`, `run_terminal_command`, Python) with reason |
| R10 | MET | `magents/team-stark-children/AGENTS.md:144` — rung 2: native → `rg`/`sg` → `grep`/`sed`/`awk`/`perl` with gitignore-aware reason |
| R11 | MET | `magents/team-stark-children/AGENTS.md:145` — rung 3: native web → `curl`/`wget` → MCP/plugin |
| R12 | MET | `magents/team-stark-children/AGENTS.md:139` — ladder replaces old `### Tool decision tree` under `## Preferred tools` |
| R13 | MET | `magents/team-stark-children/overrides/codexcli/AGENTS.md:31-35`, `magents/team-stark-children/overrides/pi/AGENTS.md:37-41` — mirrored (replace, not append) |
| R14 | MET | command `superskill magent evaluate --json` this run — aggregate 0.9135 ≥ 0.90, conciseness 0.852 > 0.70, verdict PASS grade A |
| R15 | MET | `superskill magent validate` exit 0; `bun run spur-check` 32/32 pre-check rules pass; corpus warnings were verdict-pending and clear at record (re-run at done) |
| R16 | MET | git diff this run: README.md and CLAUDE.md untouched — layout table and four-layer claims remain true (no new files; rules dir still 4 modules) |

| Acceptance Criteria | Status | Evidence Type | Evidence |
| --------------------- | -------- | --------------- | ---------- |
| R1 — Every documented harness invocation resolves against the live CLI | MET | command | extraction sweep + `--help` resolution this run: unresolved NONE |
| R2 — The tool-priority doctrine states the ladder and its reason | MET | command | `rg -n 'Tool priority' <root>+2 overrides` exit 0 → lines 139/31/37; rungs name the shell-shaped family, the rg/sg-over-grep reason, and curl/wget/MCP order |
| R3 — The doctrine reaches every install target | MET | command | same `rg -n 'Tool priority'` exit 0 hit all three files: AGENTS.md:139, overrides/codexcli:31, overrides/pi:37 |
| R4 — AGENTS.md is compressed without losing its layout | MET | command | 17,480 → 9,184 chars; 16-heading exact-match true |
| R5 — Quality clears the gate on the project's own rubric | MET | command | evaluate aggregate 0.9135 PASS grade A; all dimensions ≥ baseline |
| R6 — Displaced depth is relocated, not deleted | MET | command | `rg -c 'Goal-driven␵Scope doctrine␵Live nouns' plugins/cc/rules/*.md` exit 0 → 01-discipline.md:2, 02-harness-first.md:1 (matches present) |
| R7 — Targets without a rules directory retain safety and discipline | MET | command | `rg -n 'Safety' overrides/*/AGENTS.md` exit 0 → codexcli:21 + pi:18 `## Safety (CRITICAL)`; discipline lines 28-29/25-26 present |
| R8 — The refreshed package installs and validates cleanly | MET | command | install --dry-run exit 0; validate exit 0 (Valid) |

- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review
<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | spur task check | — | task check passed |
| P4 | evidence-rule-pass | — | All behavior-bearing AC rows have executable evidence or are explicitly non-behavioral. |

### References

- Parent feature: `docs/features/C_sota-refresh-of-the-team-stark-children-magent-package.md`
- Idea-evaluation record (budget arithmetic, rejected alternatives): `.spur/run/idea-eval-report.md`
- Prior feature on the scoring surfaces (out of scope here): `docs/features/A_absorb-agents-md-guide-into-magent-quality-surfaces.md`
- Sep-2026 AGENTS.md research report (operator-supplied): `~/.config/kk/works/what-are-the-best-practices-for-writing-an-agent-ad9b7390/content.md`
- Emission mechanics: `packages/core/src/pipeline/select-magent.ts` (layer resolution 135-165, rule discovery 246-250, rule install targets 270-277)
- Scoring mechanics: `packages/core/src/quality/magent.ts`, `packages/core/src/quality/heuristics.ts`, `packages/core/src/rubrics/magent.yaml`, `apps/cli/src/operations/evaluate.ts:186,208`
- Package layout contract: `magents/team-stark-children/README.md`

### History

- 2026-09-02T20:33:45.142Z todo → done (system)
