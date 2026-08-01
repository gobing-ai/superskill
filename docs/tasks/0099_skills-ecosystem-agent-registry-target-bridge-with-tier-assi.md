---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: agent registry, Target bridge with tier assignment, and dual lock read/writers"
description: ""
status: done
type: task
profile: standard
feature_id: F2
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "interop", "locks"]
dependencies: ["0098"]
created_at: "2026-07-24T23:58:50.185Z"
updated_at: "2026-08-01T00:24:29.583Z"
---

## 0099. skills-ecosystem: agent registry, Target bridge with tier assignment, and dual lock read/writers

### Background

Implements: R1 (agents table part), R4 (tier assignment data), R5 (hash invariant — locks hash the canonical untranslated folder only). Ordering: after the parser/sanitizer child (needs sanitizeName for lock keys and dir names); runs parallel with the 'fetch + discovery' child. Locks are the byte-for-byte interop contract with `npx skills` — own review gate. Rubric: E2 D1 L1 C0 R1 = 5 → decompose (distinct review boundary: lock schema parity).

### Requirements
- R1. `agents.ts`: vendor agent-table subset for the 9 superskill Targets + tier assignment (`direct | symlink | translate`) — codex/pi/omp → direct (universal `.agents/skills`), claude/opencode/antigravity-cli/antigravity-ide → symlink, hermes/grok → translate; env overrides (CODEX_HOME, CLAUDE_CONFIG_DIR, …) and detectInstalled probes ported as data.
- R2. `locks.ts`: project `./skills-lock.json` v1 (sorted, timestamp-free, `computedHash` = SHA-256 over sorted relpath+content of the CANONICAL folder) and global `~/.agents/.skill-lock.json` v3 (or $XDG_STATE_HOME/skills; `skillFolderHash` = GitHub tree SHA; installedAt/updatedAt) read/write.
- R3. Never auto-wipe on lock-version mismatch: newer-than-understood global lock → leave untouched + warn (vendor wipe-on-bump explicitly NOT ported).
- R4. Hash invariant enforced at the API level: lock writers accept only the canonical folder path; tests prove translated copies cannot be hashed into locks.
- R5. Fixture tests validate both writers against vendor-shaped lock JSON (round-trip parse of real vendor lock samples).
### Acceptance Criteria

<!-- Copy or derive real scenarios from the linked feature. Do not leave placeholder AC here. -->

### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design

<!-- Chosen implementation approach, key tradeoffs, invariants, and impacted surfaces. -->

### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution
- `packages/core/src/skills-ecosystem/agents.ts:30` — `TARGET_TIERS` bridges the 9 superskill targets (`claude`, `codex`, `pi`, `omp`, `opencode`, `antigravity-cli`, `antigravity-ide`, `hermes`, `grok`) to installation tiers (`direct`, `symlink`, `translate`). Ported env overrides (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `HERMES_HOME`, `GROK_HOME`, `XDG_CONFIG_HOME`, `agents.ts:50-55`) and target detection probes (`detectInstalledTargetAgents`, `agents.ts:191`). Per-agent dir data stays vendor-faithful (interop with `npx skills`; cross-checked `vendors/skills/src/agents.ts:203-209,533-539`).
- `packages/core/src/skills-ecosystem/locks.ts:9` — dual lock read/writers: project `./skills-lock.json` (v1, sorted, timestamp-free) and global `~/.agents/.skill-lock.json` (v3, or `$XDG_STATE_HOME/skills`, `locks.ts:88`). `computedHash` = SHA-256 over sorted relpath+content of the CANONICAL folder (`computeCanonicalSkillFolderHash`, `locks.ts:125`).
- `locks.ts:224` / `locks.ts:325` — version-mismatch preservation (R3): newer AND older locks read back with a `warning` flag, never wiped; the vendor's wipe-on-bump is not ported. Writers refuse warned locks and any mismatched on-disk version (`assertOnDiskVersionMatches`, `locks.ts:183`; called at `locks.ts:251` and `locks.ts:358`). *(Repaired by the 2026-07-24 verify `--fix all` pass: the first draft retained the vendor's older-version wipe and let raw writers clobber mismatched on-disk locks.)*
- `locks.ts:101` — hash invariant (R4): `isCanonicalSkillPath` blocks translated-tier paths; `computeCanonicalSkillFolderHash` and `addSkillToGlobalLock` (`locks.ts:366`) throw on non-canonical input.
- `packages/core/src/index.ts:51` — re-exports `agents.ts` and `locks.ts`.
- `packages/core/tests/skills-ecosystem/agents.test.ts:14` — tier mapping, env overrides, target detection (4 tests).
- `packages/core/tests/skills-ecosystem/locks.test.ts:49` — round-trips for local (v1) and global (v3) locks, version-mismatch preservation in both directions, raw-writer on-disk guard, canonical-hash enforcement, and verbatim vendor-sample round-trips (`locks.test.ts:282` local v1 sample from `vendors/skills/tests/local-lock.test.ts:38-63`; `locks.test.ts:308` global v3 sample from `vendors/skills/tests/update.test.ts:28-52`) (R5).
- `biome.json:43` — `style.useNodejsImportProtocol: error` added alongside (enforces the `node:` import convention the ported files follow; gate green).
### Testing
**Per-Requirement Traceability** (verify run 2026-07-24; `--fix all` applied, verdict re-run after repair; every `file:line` re-read this run)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 agent registry + tiers + env overrides + probes | MET | `packages/core/src/skills-ecosystem/agents.ts:30-41` `TARGET_TIERS` (codex/pi/omp→direct, claude/opencode/antigravity-cli/ide→symlink, hermes/grok→translate); env overrides `CODEX_HOME`/`CLAUDE_CONFIG_DIR`/`HERMES_HOME`/`GROK_HOME`/`XDG_CONFIG_HOME` (`:50-55`); `detectInstalledTargetAgents` (`:191-200`); paths vendor-faithful (cross-read `vendors/skills/src/agents.ts:203-209` codex, `:533-539` pi); 4 tests (`tests/skills-ecosystem/agents.test.ts:14,28,37,64`) |
| R2 dual lock read/writers | MET | `locks.ts:9` local v1 / `:15` global v3; local sorted + timestamp-free (writer `:245-265`, interface `:37-41`); global `$XDG_STATE_HOME/skills` (`:88-95`), `skillFolderHash` + `installedAt`/`updatedAt` (`:46-62`, installedAt preserved on update `:373-378`); `computedHash` = SHA-256 over sorted relpath+content of canonical folder (`:125-147`); field names cross-checked against `vendors/skills/src/local-lock.ts:37` and `skill-lock.ts:31` |
| R3 never auto-wipe on version mismatch | MET (after fix) | newer → preserve + warn (`locks.ts:224-232` local, `:325-333` global); **older → preserve + warn (fix-pass: vendor wipe-on-bump removed, `:226-233`, `:327-335`)**; writers refuse warned locks and any mismatched on-disk version (**fix-pass: `assertOnDiskVersionMatches` `:183-198`, called at `:251` and `:358`**); regression tests `locks.test.ts:194` (older global, all write routes refuse, disk bytes unchanged), `:236` (older local), `:256` (raw writer vs mismatched disk, both directions) |
| R4 hash invariant at API level | MET | `isCanonicalSkillPath` `locks.ts:101-118`; `computeCanonicalSkillFolderHash` throws on translated paths `:124-133`; `addSkillToGlobalLock` pre-check `:366-371`; tests `locks.test.ts:23-47` prove hermes/grok/translated copies cannot be hashed. Advisory: blocklist mechanism (see Review) |
| R5 vendor-shaped round-trips | MET (after fix) | **fix-pass: `locks.test.ts:282`** round-trips the vendor v1 sample verbatim (copied from `vendors/skills/tests/local-lock.test.ts:38-63`); **`:308`** round-trips the vendor v3 sample verbatim (from `vendors/skills/tests/update.test.ts:28-52`) with field-wise assertions documenting the tolerated `sourceUrl`-omitted real-world shape |

**Acceptance Criteria Verification** — the task's AC section is a bare placeholder comment (never filled, same pattern as sibling 0098); the 5 requirements carried the traceability load. No AC rows to evaluate; flagged in Review.

**Defects found and repaired by this verify run (`--fix all`).** Verdict before fix: PARTIAL.

1. **R3 older-version wipe (major).** `readLocalLock`/`readGlobalLock` returned an empty lock for `version < CURRENT` — the exact vendor wipe-on-bump R3 says is "explicitly NOT ported"; the add/remove helpers then silently destroyed older locks. Fixed: older versions now return `{...parsed, warning}`; writers already refuse warned locks.
2. **R3 raw-writer wipe path (major).** `writeLocalLock`/`writeGlobalLock` checked only the in-memory object; a caller-constructed v1/v3 object silently overwrote a mismatched on-disk lock, contradicting their own doc comments. Fixed: `assertOnDiskVersionMatches` guards both writers (newer AND older); doc comments corrected.
3. **R5 missing vendor samples (major).** Tests used hand-rolled JSON only. Fixed: both writers now round-trip vendor-shaped samples copied verbatim from the vendor test suite.
4. Fix-pass touched (disclosure, all tracked files): `packages/core/src/skills-ecosystem/locks.ts:183-198,224-233,251,325-335,358` + writer doc comments; `packages/core/tests/skills-ecosystem/locks.test.ts:194-345` (5 new tests); `packages/core/src/skills-ecosystem/agents.ts:6-15` (tier doc-comment prose).

**Gate evidence (this run).** `bun run spur-check` EXIT=0: Biome 199 files clean, pre-check 31/31, **1773 pass / 0 fail**, post-check 3/3; `bun run build` EXIT=0. Module suites standalone: 181 pass / 0 fail (9 files).

Coverage: `agents.ts` 100% functions / 100% lines; `locks.ts` 96.55% / 95.76%; suite aggregate 99.82% functions / 98.97% lines (gate >=90%).
### Review
**Review Findings** (review pass 2026-07-24, SECUA all dimensions, uncommitted 0099 working tree: `agents.ts`, `locks.ts`, 2 test files, `index.ts`, `biome.json`)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P1 | Security | — | None — canonical-path enforcement throws before any hash; no eval; vendor parity on lock field names | Clean |
| P2 | Correctness | `locks.ts` read/write paths | Older-version wipe retained from vendor (wipe-on-bump) + raw writers clobbered mismatched on-disk locks | **Fixed this run** (`locks.ts:183-198,226-233,327-335`; regression tests `locks.test.ts:194,236,256`) |
| P2 | Correctness | `locks.test.ts` | No vendor-sample round-trips (R5) | **Fixed this run** (`locks.test.ts:282,308` — verbatim vendor v1/v3 samples) |
| P3 | Efficiency | — | None — sorted single-pass serialization; hash streams sorted relpath+content | Clean |
| P4 | Architecture | `locks.ts:101-118` | `isCanonicalSkillPath` is a blocklist of translated segments (hermes/grok/translated); a future translate-tier target or custom path slips past. An allowlist (canonical = `.agents/skills` / project `./skills`) would be stronger | Advisory / Hardening candidate (letter of R4 met; tests prove current translate-tier dirs) |
| P4 | Usability | `agents.ts:6-15` | Tier doc comment conflated superskill's universal-folder tier semantics with vendor-native per-agent dirs | **Fixed this run** (prose) |
| P4 | Process | `biome.json` (+`useNodejsImportProtocol: error`) | Lint-config change absent from the task's change map; direction is consistent (0098 already used `node:` imports) and the gate is green | Advisory / Documented here |
| P4 | Process | task file `### Acceptance Criteria` | Bare placeholder, never filled (same as 0098) | Advisory / Accepted (R1–R5 evaluated directly) |

No remaining blocker or major findings after the fix pass. Functional traceability: R1–R5 MET
(see `## Testing`, verdict artifact `.spur/run/0099-verdict.json` → PASS). Residual risk: the
blocklist canonical check (P4 above) is the one place a future target could weaken the hash
invariant silently — worth an allowlist when the third translate-tier target appears.
### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-07-25T07:08:05.798Z todo → wip (system)
- 2026-07-25T07:08:06.081Z wip → testing (system)
- 2026-07-25T07:08:06.364Z testing → done (system)
