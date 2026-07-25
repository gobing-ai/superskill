---
template: feature-impl
schema_version: 1
name: "skills-ecosystem: fetch (GitHub Trees/Blob fast path + hardened git clone) and SKILL.md discovery"
description: ""
status: done
type: task
profile: standard
feature_id: B
parent_wbs: "0097"
priority: P1
tags: ["skills-ecosystem", "fetch", "discovery"]
dependencies: ["0098"]
created_at: "2026-07-24T23:58:50.192Z"
updated_at: "2026-07-25T07:47:20.541Z"
---

## 0100. skills-ecosystem: fetch (GitHub Trees/Blob fast path + hardened git clone) and SKILL.md discovery

### Background

Implements: R1 (discovery part), R2 (fetch + transport hardening), R6 (git transport security). Ordering: after the parser/sanitizer child (consumes ParsedSource); runs parallel with the 'agent registry + locks' child. Rubric: E2 D1 L1 C1 R1 = 6 → decompose (network/git seams need mockable boundaries + own review).

### Requirements
- R1. `fetch.ts`: GitHub Trees/Blob API fast path (clone-free install + tree-SHA folder hash for the global lock) with `git clone --depth 1 [--branch ref]` fallback into mkdtemp; no persistent repo cache. Transport hardening ported: GIT_ALLOW_PROTOCOL=https:http:ssh:git:file, reject `ext::`, GIT_TERMINAL_PROMPT=0, LFS smudge off, 300s timeout, https→gh→ssh auth fallback. GitHub token resolution: GITHUB_TOKEN/GH_TOKEN env first, lazy `gh auth token` only after rate-limit.
- R2. `discovery.ts`: SKILL.md scan — searchPath itself, priority dirs (root, skills/, skills/.curated|/.experimental|/.system/, 26 agent dirs, plugin manifests), container-dir catalog layout one extra level, depth-5 recursive fallback skipping node_modules/.git/dist/build/__pycache__; metadata.internal hidden unless INSTALL_INTERNAL_SKILLS=1; isSubpathSafe enforced.
- R3. HTTP and git seams are dependency-injectable for tests (no live network in unit tests).
- R4. Tests: discovery fixtures mirror vendor skill-matching/root-level-disk-install cases; git-transport negatives are residual-proof.
### Acceptance Criteria

<!-- Copy or derive real scenarios from the linked feature. Do not leave placeholder AC here. -->

### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design

<!-- Chosen implementation approach, key tradeoffs, invariants, and impacted surfaces. -->

### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution
- `packages/core/src/skills-ecosystem/fetch.ts:289` — GitHub Trees/Blob fast path (`tryBlobInstall`, `fetchRepoTree` `:311`, `findSkillMdPaths` `:227`, `getSkillFolderHashFromTree` `:184`): clone-free snapshot install + tree-SHA folder hash for the global lock.
- `fetch.ts:536` — hardened `cloneRepo` fallback: `ext::` rejected `:548`, `GIT_ALLOW_PROTOCOL=https:http:ssh:git:file` `:11`, `GIT_TERMINAL_PROMPT=0` + LFS smudge off `:560-566`, 300 s timeout `:9`, mkdtemp with no persistent cache `:570`, temp-jail `cleanupTempDir` `:657`.
- `fetch.ts:104` — token resolution (R1): env-first `getGitHubToken`, lazy `gh auth token` via `ghAuthTokenFromCli` `:119`, invoked only on a real rate-limit (403/429 + `x-ratelimit-remaining: 0`, `:338-352`) with one authed retry. https→gh→ssh auth fallback `:577-618` (vendor `git.ts:267-284` parity), auth patterns `isGitAuthFailure` `:638`.
- `fetch.ts:513` / `fetch.ts:522` — process seams hoisted to named `spawnGit`/`spawnGh` so the default (non-injected) path is test-coverable; `SKILLS_DOWNLOAD_URL` resolved per call (no module-load env capture). *(Repaired by the 2026-07-25 verify `--fix all` pass: the first draft lacked the lazy token, the rate-limit trigger, and the auth fallback chain.)*
- `packages/core/src/skills-ecosystem/discovery.ts:14` — `discoverSkills`: searchPath + 26 agent priority dirs (`AGENT_PROJECT_SKILL_DIRS`), catalog one-extra-level layout, depth-5 recursive fallback (`findSkillDirs` `:127`) skipping `SKIP_DIRS` `:11`; `metadata.internal` hidden unless `INSTALL_INTERNAL_SKILLS=1` (`:62-66`); `isSubpathSafe` enforced `:158`.
- `packages/core/src/index.ts:53` — re-exports `fetch` and `discovery` modules.
- `packages/core/tests/skills-ecosystem/fetch.test.ts:21` — 26 tests: slug/token/url/tree parsing, blob install paths, residual-proof `ext::` + plain-403 + non-auth negatives, lazy-token and fallback-chain regressions (`:382-601`).
- `packages/core/tests/skills-ecosystem/discovery.test.ts:15` — 18 tests: priority/catalog/depth scan, internal filtering, lock-aware exclusion, subpath traversal, and the vendor `filterSkills` 10-case matrix ported verbatim (`:148`, from `vendors/skills/tests/skill-matching.test.ts:28-119`).
### Testing
**Per-Requirement Traceability** (verify run 2026-07-25; `--fix all` applied — pre-fix verdict PARTIAL with 3 gaps; every `file:line` re-read this run)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 fetch fast path + hardened clone + token resolution | MET (after fix) | `fetch.ts:289-330` `tryBlobInstall`/`fetchRepoTree` (DI `fetchFn`); `getSkillFolderHashFromTree` `:184`; hardened `cloneRepo` `:536`: `ext::` reject `:548`, `GIT_ALLOW_PROTOCOL` `:11`, `GIT_TERMINAL_PROMPT=0` + LFS skip `:560-566`, 300 s timeout `:9`, mkdtemp no-cache `:570`, `cleanupTempDir` temp-jail `:657`. **Fix-pass:** lazy `gh auth token` (`ghAuthTokenFromCli` `:119`, env-first `getGitHubToken` `:104-113`); rate-limit retry only on 403/429 + `x-ratelimit-remaining: 0` (`:338-352`); https→gh→ssh auth fallback (`:577-618`, vendor `git.ts:267-284` parity) |
| R2 discovery scan | MET | `discovery.ts:14-41` 26 agent dirs; priority scan + catalog one-extra-level + depth-5 fallback (`findSkillDirs` `:127`, maxDepth 5); skip list `SKIP_DIRS` `:11`; `INSTALL_INTERNAL_SKILLS` gate `:62-66`; `isSubpathSafe` enforced `:158`; 8 discovery tests |
| R3 DI seams | MET | HTTP: `fetchFn` param (`fetch.ts:295,311`); git: `execGit`/`execGh` (`:549-553`, defaults hoisted to named `spawnGit`/`spawnGh` `:513,:522` — fix-pass, removes untestable anonymous closures); discovery fs tests use tmpdirs only; zero live-network in unit tests |
| R4 vendor-mirror + residual-proof negatives | MET (after fix) | `ext::` residual-proof negative (`fetch.test.ts:298`); **fix-pass:** plain-403 residual-proof negative (`:479`, both halves required: status AND remaining-0); non-auth residual-proof negative (`:557`, fallback must not fire); vendor `filterSkills` case matrix ported verbatim (`discovery.test.ts:148`, 10 cases from `vendors/skills/tests/skill-matching.test.ts:28-119`); root-level SKILL.md mirrored at discovery surface (`:81`) and blob path (`fetch.test.ts:415`) |

**Acceptance Criteria Verification** — the task's AC section is a bare placeholder comment (never filled; same pattern as siblings 0098/0099). The 4 requirements carried the traceability load; flagged in Review.

**Defects found and repaired by this verify run (`--fix all`).** Verdict before fix: PARTIAL.

1. **R1 lazy token missing (major).** `getGitHubToken` was env-only; the vendor's lazy `gh auth token` fallback (required verbatim by R1) was absent, and `fetchRepoTree` had no rate-limit detection to trigger it. Fixed: env-first stays, `ghTokenRunner` DI added, retry once only on true rate-limit (403/429 + remaining-0).
2. **R1 auth fallback missing (major).** `cloneRepo` made a single attempt; the vendor's https→gh→ssh chain (R1 verbatim) was absent. Fixed: full chain ported with injectable runners; auth-failure pattern list aligned to vendor (`isGitAuthFailure` `:638`).
3. **R4 skill-matching matrix missing (major).** One scenario test vs the vendor's 10-case `filterSkills` matrix. Fixed: matrix ported verbatim.
4. Fix-pass touched (disclosure, all tracked files): `packages/core/src/skills-ecosystem/fetch.ts` `:9-11,104-124,289-352,415-449,513-653` (lazy token, rate-limit retry, per-call `SKILLS_DOWNLOAD_URL`, hoisted runners, fallback chain, `rmQuiet`); `packages/core/tests/skills-ecosystem/fetch.test.ts:382-601` (10 new tests); `packages/core/tests/skills-ecosystem/discovery.test.ts:148-218` (vendor matrix).

**Coverage-gate iteration.** Two intermediate gate failures fixed en route: `ghAuthTokenFromCli` spawn seam uncovered (80.49% functions) → smoke test; anonymous default-runner closures untestable (87.80%) → hoisted to named `spawnGit`/`spawnGh` + swallow-catch closures replaced by `rmQuiet`. Final: `fetch.ts` **100% functions / 100% lines**.

**Gate evidence (this run).** `bun run spur-check` EXIT=0: Biome clean, pre-check 31/31, **1817 pass / 0 fail**, post-check 3/3; `bun run build` EXIT=0. Module suites: fetch 26/26, discovery 18/18.

Coverage: `fetch.ts` 100% / 100%; `discovery.ts` 96.00% / 99.48%; `agents.ts` 100% / 100%; `locks.ts` 96.55% / 95.76%; suite aggregate 99.78% functions / 98.99% lines (gate >=90%).
### Review
**Review Findings** (review pass 2026-07-25, SECUA all dimensions, staged-uncommitted 0100 working tree: `fetch.ts`, `discovery.ts`, 2 test files, `index.ts`)

| Priority | Dimension | Location | Finding | Disposition |
| --- | --- | --- | --- | --- |
| P1 | Security | — | None remaining — transport hardening complete post-fix: `ext::` reject, protocol allowlist, no terminal prompt, LFS off, temp-jail cleanup, BatchMode SSH; residual-proof negatives on both fallback gates | Clean |
| P2 | Correctness | `fetch.ts` clone/token paths | Lazy `gh auth token` and https→gh→ssh fallback absent (R1 verbatim items); single-attempt clone | **Fixed this run** (`fetch.ts:104-124,338-352,577-618`; tests `:382-601`) |
| P2 | Correctness | `discovery.test.ts` | Vendor `filterSkills` 10-case matrix not mirrored (R4) | **Fixed this run** (`discovery.test.ts:148-218`) |
| P3 | Efficiency | — | None — parallel blob downloads; single tree fetch; no persistent cache | Clean |
| P4 | Correctness | `fetch.ts:20` (was) | `DOWNLOAD_BASE_URL` captured env at module load | **Fixed this run** (per-call resolution, `DEFAULT_DOWNLOAD_BASE_URL`) |
| P4 | Architecture | `fetch.ts` DI shape (was) | Anonymous default-runner closures untestable → coverage gate failure | **Fixed this run** (named `spawnGit`/`spawnGh`, `:513,:522`) |
| P4 | Usability | `fetch.ts` rate-limit retry | Retry is per-call (no session-level rate-limit memo like vendor `blob.ts:_rateLimitedThisSession`); worst case is one extra `gh` spawn per call | Advisory / Accepted (simpler; memo premature without measured cost) |
| P4 | Process | task file `### Acceptance Criteria` | Bare placeholder, never filled (3rd sibling with this pattern — worth a template-level fix) | Advisory / Escalated as pattern |

No remaining blocker or major findings after the fix pass. Functional traceability: R1–R4 MET
(see `## Testing`, verdict artifact `.spur/run/0100-verdict.json` → PASS). The original `### Review`
table ("None/Pass/Verified" rows) was hollow — replaced with this findings table.
### References

B

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
