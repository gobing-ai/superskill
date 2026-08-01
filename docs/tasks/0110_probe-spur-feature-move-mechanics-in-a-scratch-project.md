---
template: feature-impl
schema_version: 1
name: "Probe spur feature move mechanics in a scratch project"
description: ""
status: todo
type: task
profile: standard
feature_id: E1
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-08-01T00:10:58.063Z"
updated_at: "2026-08-01T00:26:25.065Z"
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
- `spur feature list` shows 5 area roots with A/B/C/F4 as children per the mapping.
- `spur feature check` passes on every node; INDEX.md reflects the new tree.
- No task feature-id left dangling at a non-existent feature.
- docs/05_FEATURES.md matches the tree; no doc contradicts it.
- Probe ran only in a scratch project; git status shows only intentional changes.
### Q&A
**R1 probe findings (scratch project `/tmp/spur-probe`, spur source confirmed at `feature-service.ts:600-741`):**

- **(a) child ID allocation under a new parent** — top-level root = next free letter A–Z; child = `<parent><next-free-digit-1..9>` (≤9 children per parent, `allocateId` L815-858). The 5 area roots will allocate **E, F, G, H, I** (A–D taken; F4 is a separate root, not F1–F3).
- **(b) cascade rename** — move re-IDs the node AND every descendant (subtree suffix preserved: A→B1, A1→B11). File renamed, frontmatter `id` + heading rewritten, History entry appended on every touched feature (`applyMove` L672-741). Verified empirically.
- **(c) task `feature_id` links ARE rewritten** — `tasksWithFeatureIds` (L744) collects affected tasks across ALL registered task folders; `applyMove` step 2 rewrites each `feature_id` to the mapped new ID. Empirically confirmed: task `0001` `feature_id: A1` → `feature_id: B11` after move. **⇒ R4 is a no-op verification, not manual re-pointing.** All 23 links (A×11, B×8, C×1, F4×2, D×1) will cascade automatically.
- **(d) INDEX.md** — NOT touched by `move`. Must run `spur feature refresh` after all moves to regenerate INDEX.md (sorted by ID) and repopulate each feature `## Tasks` region.
- **(e) F4 legacy-ID behavior** — `/^[A-Z][1-9]*$/` accepts `F4`. Moved cleanly: F4→A1 in scratch dry-run. F4 (child of D in real corpus) will move to CLI Surface as `<CLI-Surface-root>X`.
- **(f) guard rails** — cycle/descendant guard: `Cannot move "B" into itself or its own subtree` (L623-625, empirically confirmed). Collision guard: throws `Move collision: target id already exists` if a mapped new ID clashes with a non-subtree feature (L645-651). Create-lock serializes allocation+apply as one critical section (L631). Best-effort atomic rollback on mid-cascade failure (L719-738). No "non-empty target" guard — target parent simply allocates next child digit.

**Execution implications:**
- Create area roots FIRST (E–I), then move leaves — child IDs are parent-scoped, so move order among A/B/C/F4 cannot collide.
- F4 is currently a child of D. Moving F4→CLI Surface and D→Project Foundation are independent (different targets), but run F4 move before D move so D's subtree at move time is just D.
- `spur feature refresh` once at the end; `spur feature check` on every node.
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

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

D

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
