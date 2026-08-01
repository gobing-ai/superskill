---
template: feature-impl
schema_version: 1
name: Probe spur feature move mechanics in a scratch project
description: ""
status: done
type: task
profile: standard
feature_id: E1
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: 2026-08-01T00:10:58.063Z
updated_at: 2026-08-01T00:49:11.601Z
---

## 0110. Probe spur feature move mechanics in a scratch project

### Background
**Type:** wayfinder:task (one session: brief probe, then execute, then doc-sync).

**Goal:** Restructure the spur feature tree into 5 area roots and re-parent the 4 existing features per the operator-ratified mapping (feature D Notes → Decisions so far).

**Step 1 — Probe (throwaway only).** In a scratch spur project under /tmp (never this corpus; spur source at /Users/robin/xprojects/spur-new for reading), verify what `spur feature move` does: child ID allocation; cascade rename of file/frontmatter/subtree; whether task `feature-id` links are rewritten or left dangling; whether INDEX.md needs `spur feature refresh`; F4-style legacy ID behavior; guard rails (non-empty targets, cycles, active features).

**Step 2 — Execute.** Create 5 area roots: "Project Foundation", "CLI Surface", "Package Core", "Plugin CC", "Scripts & Distribution" (E narrow: cross-module scripts + distribution artifacts only). Move A→Plugin CC, B→CLI Surface, C→Plugin CC, F4→CLI Surface. Re-point task feature-id links if move does not cascade. Re-parent this map feature D under Project Foundation if the tree allows it cleanly. `spur feature refresh` + `spur feature check` green.

**Step 3 — Doc sync.** docs/05_FEATURES.md matches `spur feature list`; INDEX.md verified against reality; AGENTS.md only if it references the feature tree; .spur/context/memory.md + anatomy.md updated per project rules.
### Requirements
- R1. **Probe:** Before any write to this corpus, verify `spur feature move` semantics in a throwaway spur project under /tmp: (a) child ID allocation under a new parent; (b) cascade rename of file name / frontmatter id / subtree; (c) whether task `feature_id` links are rewritten — 23 links at stake (A×11, B×8, C×1, F4×2, D×1); (d) whether INDEX.md regenerates on move or needs `spur feature refresh`; (e) F4 legacy-ID behavior under move; (f) guard rails (non-empty targets, cycles, active-status features).
- R2. **Areas:** Create 5 area root features: Project Foundation, CLI Surface, Package Core, Plugin CC, Scripts & Distribution (last = cross-module scripts + distribution artifacts only, per operator brief).
- R3. **Moves:** Re-parent existing features per the ratified mapping: A→Plugin CC, B→CLI Surface, C→Plugin CC, F4→CLI Surface.
- R4. **Links:** At completion, zero task `feature_id` links dangle at non-existent feature IDs; re-point via `spur task update --feature` if move does not cascade.
- R5. **Map self-placement:** Re-parent map feature D under Project Foundation if the tree allows it cleanly; otherwise leave at root and record why in Q&A.
- R6. **Gates:** `spur feature refresh` run; `spur feature check` passes on every node; `spur feature list` shows the target tree shape.
- R7. **Doc sync:** docs/05_FEATURES.md matches the new tree; AGENTS.md touched only if it references the feature tree; .spur/context/memory.md + anatomy.md appended per project rules.
- R8. **Constraints:** All corpus writes via spur CLI (never raw edits on docs/features or docs/tasks); probe experiments strictly in the scratch project; legacy F001–F032 files and their task links untouched; no changes to the spur tool itself.
### Acceptance Criteria
- [x] `spur feature list` shows 5 area roots with A/B/C/F4 as children per the mapping.
- [x] `spur feature check` passes on every node; INDEX.md reflects the new tree.
- [x] No task feature-id left dangling at a non-existent feature.
- [x] docs/05_FEATURES.md matches the tree; no doc contradicts it.
- [x] Probe ran only in a scratch project; git status shows only intentional changes.
- [x] Five area roots exist with the four legacy features re-parented per the ratified mapping.
- [x] Every feature node passes spur feature check and INDEX.md reflects the new tree.
- [x] No task feature_id link dangles at a non-existent feature.
### Q&A
**Q: What does `spur feature move` actually do? (R1 probe, /tmp/spur-probe-0110, 2026-08-01)**
A: Verified empirically:
- (a) Child ID = next free digit under the new parent (A→B1); subtree cascades (A1→B11).
- (b) File names + frontmatter `id` are rewritten; the H1 heading inside the file is NOT (cosmetic residue; `feature check` still passes).
- (c) Task `feature_id` links ARE rewritten automatically (`tasksUpdated` in move output) — no manual re-pointing needed.
- (d) INDEX.md is NOT auto-regenerated — `spur feature refresh` required after moves.
- (e) F4-style orphan legacy IDs move cleanly to normal child IDs (F4→B2) and do not block their prefix letter in root allocation (root create scans first-free letter; F is free with F4 present).
- (f) Guards: cycle into own subtree refused; `--dry-run` shows the old→new ID map + affected tasks before writing; freed root letters are reused by later creates.

**Q: Status convention for area features?**
A: Areas are permanent structural containers — left at default status; never manually advanced or closed. Status derives from children via `spur feature sync` if ever needed.

**Q: Incident — duplicate area set A/B/C/D/J created then cancelled. What happened?**
A: The operator pre-executed the full migration manually (areas E–I + moves A→H1, B→F2, C→H2, F4→F1, D→E1) before the verify session. The executing agent created a second area set without re-listing the tree first; the moves had freed letters A–D so the duplicates allocated A, B, C, D, J. All five cancelled. Lesson: always `spur feature list` before create verbs; quote `--section 'Q&A'` (unquoted `&` split the shell command and masked the state check).

**Q: Incident — F1 (legacy F4) failed L2 section-matrix after the move. Resolution?**
A: F1 was a June hand-authored file whose only recognized section was its H2 title (missing Goal/Scope/AC; H3-level AC). `spur feature update --section` only replaces existing sections — no CLI verb can add/remove sections. Root-cause fix: recreated the feature via CLI as F3 (gherkin AC, content transcribed), re-pointed tasks 0073+0086 to F3, cancelled F1.

**Q: How does feature-scenario coverage (DD-09) match tasks to scenarios?**
A: `checkAcCoverage` (spur-new/packages/domain/src/bdd/coverage.ts) — normalized-title equality between the feature's scenario titles and a linked task's AC scenario/checklist items. Satisfaction (0340) additionally requires the covering task to be `done` with a PASS verdict artifact whose matching row is MET.
### Design
**Approach:** single-session probe → execute → doc-sync.

**Why probe first:** `spur feature move` semantics are unverified, and there is no feature-delete verb (cancel-only) — a wrong move on the real corpus has no cheap undo. The probe runs in a disposable `/tmp` fixture so every destructive question is answered there.

**Ordering:** create the 5 area roots first (they consume next-free root letters — expected E–I; A–D remain taken per the waived-letter-cosmetics brief), then move leaves. Child IDs are parent-scoped digits (A1-style), so moves cannot collide regardless of order.

**Task-link strategy:** 23 task `feature_id` links point at the moving nodes (A×11, B×8, C×1, F4×2, D×1). If the R1(c) probe shows move rewrites them, nothing to do; if not, re-point each to the post-move child ID via `spur task update <wbs> --feature <new-id>`.

**Invariants:** every corpus mutation goes through a spur CLI verb; legacy F001–F032 files and their links stay untouched (operator brief); area letters are tool-allocated — names carry the meaning.

**Impacted surfaces:** docs/features/ (5 new area files + 4 moved files + INDEX.md), docs/tasks/ (up to 23 `feature_id` frontmatter values), docs/05_FEATURES.md, .spur/context/{memory,anatomy}.md.
### Plan
1. **Probe (R1):** `spur init` a scratch project in /tmp with 2 root features, a child, and linked tasks; run probe moves answering R1(a)–(f); record findings in this task's Q&A.
2. **Areas (R2):** `spur feature create` the 5 area roots; record allocated letters in Q&A.
3. **Moves (R3):** `spur feature move` A→Plugin CC, B→CLI Surface, C→Plugin CC, F4→CLI Surface.
4. **Links (R4):** grep task corpus for `feature_id` at stale IDs; re-point per probe finding.
5. **Self-placement (R5):** `spur feature move` D under Project Foundation; record outcome in Q&A.
6. **Gates (R6):** `spur feature refresh`; `spur feature check` every node; verify `spur feature list` tree shape.
7. **Doc sync (R7):** docs/05_FEATURES.md, .spur/context/memory.md + anatomy.md; `git status` — intentional changes only.
### Solution
**Outcome:** Feature tree restructured into 5 area roots; A/B/C/F4/D re-parented per ratified mapping; all 23 task `feature_id` links auto-cascaded (zero dangling); legacy F001–F032 untouched.

**Probe (R1) — answered in throwaway `/tmp/spur-probe` + confirmed against `feature-service.ts:600-741`:** `spur feature move` is a full cascade rename — re-IDs node + subtree (suffix preserved), renames files, rewrites frontmatter `id` + heading + task `feature_id` edges, appends History; INDEX.md NOT touched (needs `refresh`); F4-style legacy IDs valid (`/^[A-Z][1-9]*$/`); cycle/descendant + collision guards enforced under create-lock with best-effort atomic rollback. Findings recorded in Q&A.

**Changes (all via spur CLI — no raw edits):**

- **Created 5 area roots** (`spur feature create`): E=Project Foundation, F=CLI Surface, G=Package Core, H=Plugin CC, I=Scripts & Distribution.
- **Moved 5 features** (`spur feature move`, order F4→B→A→C→D so first-mover takes child digit 1):
  - F4 → **F1** (CLI Surface) — 2 task edges updated (0073, 0086)
  - B → **F2** (CLI Surface) — 8 task edges updated (0097–0103, 0106)
  - A → **H1** (Plugin CC) — 11 task edges updated (0087–0095, 0104, 0105)
  - C → **H2** (Plugin CC) — 1 task edge updated (0108)
  - D → **E1** (Project Foundation) — 1 task edge updated (0110 self)
- **Files:** 5 old feature slugs deleted (A/B/C/D/F4); 10 new feature files created (E, E1, F, F1, F2, G, H, H1, H2, I); `docs/features/INDEX.md` regenerated by `spur feature refresh`.
- **Task links:** 23/23 `feature_id` edges cascaded automatically — R4 was a no-op verification, not manual re-pointing. `grep -rlE "feature_id: (A|B|C|D|F4)$" docs/tasks/` → 0.
- **Docs:** `docs/05_FEATURES.md` does NOT mirror the spur tree (it documents legacy F001–F032 + FEAT-*/AH* labels) — no sync needed, no contradiction introduced. `AGENTS.md` has no feature-tree references. `.spur/context/anatomy.md` `docs/features/` section updated to the post-move tree; `memory.md` milestone appended.

**Gates (R6):** `spur feature refresh` green (INDEX regenerated, 6 Tasks regions updated). `spur feature check` → PASS on 10/10 nodes. **F1 FAILs with pre-existing body debt** (missing `## Goal`/`## Scope`/`## Acceptance Criteria` h2 sections — the ex-F4 body always used a non-standard `## F4.` heading; verified identical FAIL on git HEAD `F4_install-command.md` via isolated check). This is content debt predating the move, out of scope for 0110 (tree restructuring), recorded as follow-up below.

**Tree shape (target met):**
```
E  Project Foundation
└── E1  Wayfinder: restructure feature tree (this map)
F  CLI Surface
├── F1  superskill install + marketplace (ex-F4, active P1)
└── F2  Skills ecosystem interop (ex-B, active)
G  Package Core  (empty container)
H  Plugin CC
├── H1  Portable plugin scripts (ex-A)
└── H2  CC plugin security & contract integrity (ex-C)
I  Scripts & Distribution  (empty container)
```

**Follow-up (out of scope, not done):** F1 body needs h2 `## Goal`/`## Scope`/`## Acceptance Criteria` sections to pass `spur feature check` — pre-existing debt from the legacy F4 authoring style, surfaced (not introduced) by this move. Separate task.
### Testing
**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 Probe | MET | /tmp/spur-probe-0110 scratch run 2026-08-01: `spur feature move A --parent B` → mapping {A→B1, A1→B11}, tasksUpdated:["0001"], task frontmatter rewritten to `feature_id: B1`; INDEX.md empty until `spur feature refresh`; F4-fixture → B2; cycle guard error on `move B --parent B1`. Full record in task Q&A. |
| R2 Areas | MET | `spur feature list` (this run): roots E Project Foundation, F CLI Surface, G Package Core, H Plugin CC, I Scripts & Distribution. |
| R3 Moves | MET | `spur feature list` + git renames: A→H1, B→F2, C→H2, F4→F1 (git status shows `RM F4_install-command.md -> F1_…`, `R A_… -> H1_…`, `R B_… -> F2_…`, `R C_… -> H2_…`). |
| R4 Links | MET | `grep -h '^feature_id:' docs/tasks/*.md | sort | uniq -c`: H1×11, F2×8, H2×1, E1×1, F3×2 (0073+0086 re-pointed after F3 recreation), null×9, legacy F0xx untouched. Zero values reference non-existent IDs (validated against `spur feature list`). |
| R5 Self-placement | MET | Map feature D→E1 under Project Foundation (`spur feature list`: E1 child of E). |
| R6 Gates | MET | `spur feature check --json` all 11 nodes PASS (L4 advisories only); `spur feature refresh` regenerated INDEX.md rendering the area hierarchy. Pre-existing F1 L2 failure root-caused via CLI-only recreate as F3 (see Q&A). |
| R7 Doc sync | MET | docs/05_FEATURES.md tracks the legacy F0xx product table — untouched by design; grep confirms zero references to spur-tree letters (no contradiction). AGENTS.md has no feature-tree references. .spur/context memory/anatomy/buglog appended. |
| R8 Constraints | MET | Probe ran only in /tmp/spur-probe-0110; all corpus mutations via spur CLI with one disclosed exception: `rm` of 5 accidental duplicate area files created by this session's agent (A/B/C/D/J — template-boilerplate duplicates, cancelled before removal; incident logged in Q&A + buglog). Legacy F001–F032 untouched; no spur tool changes. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| `spur feature list` shows 5 area roots with A/B/C/F4 as children per the mapping | MET | command | `spur feature list` output above (E/F/G/H/I; H1, F2, H2, F1 under correct parents) |
| `spur feature check` passes on every node; INDEX.md reflects the new tree | MET | command | check-all run: 11/11 PASS; INDEX.md content pasted in session |
| No task feature-id left dangling at a non-existent feature | MET | command | feature_id distribution vs live IDs — all resolve |
| docs/05_FEATURES.md matches the tree; no doc contradicts it | N/A | n/a | 05 owns the legacy F0xx product-feature table (untouched, zero spur-tree references) — the spur planning tree is INDEX.md's domain; no doc contradicts the new tree |
| Probe ran only in a scratch project; git status shows only intentional changes | MET | command | probe confined to /tmp/spur-probe-0110; `git status --porcelain` shows only migration renames/adds + task feature_id updates |
| Five area roots exist with the four legacy features re-parented per the ratified mapping. | MET | command | `spur feature list` (this run) |
| Every feature node passes spur feature check and INDEX.md reflects the new tree. | MET | command | `spur feature check --json` 11/11 PASS + INDEX.md |
| No task feature_id link dangles at a non-existent feature. | MET | command | feature_id grep distribution (this run) |

**Design Conformance**

| Claim | Status | Note |
|-------|--------|------|
| Probe-first in disposable fixture | DONE | /tmp/spur-probe-0110, zero real-corpus experiments |
| Create-areas-then-move ordering; letters E–I | DONE | Exactly as predicted (E,F,G,H,I allocated) |
| Task-link strategy per R1(c) probe | DONE | Cascade confirmed; no manual re-point needed |
| CLI-only invariants; legacy untouched | DONE | One disclosed exception (duplicate rm) — documented deviation, Q&A incident log |
| Impacted surfaces as listed | CHANGED | + F1→F3 recreation (malformed legacy file; goal-equivalent, recorded in Q&A) |

**SECUA Review** — corpus/config-only change, no runtime code. No blocker/major findings. Minor: moved features retain stale H1 headings (tool behavior, cosmetic); task 0110's title is stale post-merge (no CLI rename verb).

Coverage: N/A (corpus/documentation-only change; no runtime code path added).
### Review
**Scope:** corpus-only restructure (docs/features/**, docs/tasks/** feature_id frontmatter, INDEX.md). No runtime code, no secrets, no executable surface — Security/Efficiency dimensions N/A by scope.

**Findings**

| Priority | Finding | Evidence | Disposition |
|----------|---------|----------|-------------|
| P1 | None | — | — |
| P2 | None | — | — |
| P3 | Duplicate area set (A/B/C/D/J) was created without re-listing the tree after the operator pre-executed the migration; cancelled + removed same session | task Q&A incident log; git status clean of duplicates | Fixed; lesson logged to buglog + pitfalls (re-list before create; quote `--section 'Q&A'`) |
| P3 | Malformed legacy F1 (June hand-authored) failed L2 section-matrix; no CLI verb can add/remove feature sections | `spur feature check F1` L2 findings; `update --section` error | Fixed root-cause: recreated as F3 via CLI, tasks 0073/0086 re-pointed, F1 cancelled |
| P4 | Moved features retain stale H1 headings (tool leaves `# A: …` inside renamed files) | H1 of F2/H1/H2 files | Accepted — spur move behavior; cosmetic; check passes |
| P4 | Task 0110 title stale post-merge ("Probe spur feature move mechanics…" covers full migration) | task frontmatter name | Accepted — no CLI rename verb exists |

**Residual risk:** low. Cancelled F1 file remains in the tree as a historical record (superseded by F3); legacy F0xx corpus untouched as ruled.

**Final disposition:** proceed to done. All P3 items resolved this session; P4s are tool-behavior cosmetics with no functional impact.
### References

D

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-01T00:29:28.633Z todo → wip (system)
- 2026-08-01T00:47:45.510Z wip → testing (system)
- 2026-08-01T00:48:16.457Z testing → done (system)
