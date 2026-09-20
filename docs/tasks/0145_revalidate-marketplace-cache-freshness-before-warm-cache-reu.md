---
schema_version: 1
name: Revalidate marketplace cache freshness before warm-cache reuse
status: done
template: issue
created_at: 2026-09-20T00:43:37.722Z
updated_at: "2026-09-20T04:23:55.660Z"

priority: P1
estimate_hours: "4"
ac_numbering: task-local
ac_altitude: task-local
---

## 0145. Revalidate marketplace cache freshness before warm-cache reuse

### Background

Remote marketplace installs can remain on an old repository snapshot indefinitely: resolveRemoteMarketplace returns on manifest existence before consulting GitHub. Both executeInstall and update's resolveMarketplaceUpstream consume this resolver. A passing structural check did not establish readiness: Requirements and Acceptance Criteria were placeholders, and Design referenced undefined R3/AC4/AC5.

**Refine corrections (2026-09-19)**
- "One round trip per install (~100–300 ms)" → no timing evidence was supplied → retain one normal warm probe, remove the latency promise, and bound the probe.
- "commits endpoint or trees endpoint" with one unspecified sha → these identify different Git objects; current resolvedRef is a tree SHA → freeze commitSha for freshness/pinned acquisition and treeSha for existing receipt compatibility.
- "Reuse staging verbatim; rmSync before rename stays" → deletion can lose a usable warm cache on rename failure → reuse FilesystemTransaction for replacement and rollback.
- "update.ts expected to need zero changes" → its fetchFn currently reaches skills only; marketplace resolution and reinstall omit it → forward that existing seam and test the real resolver.
- "HEAD materializes with undefined" → fetchRepoTree then tries HEAD/main/master and raw downloads use the selected mutable ref → resolve the commit first and materialize its immutable SHA, preserving the fallback order on missing refs.
- "Marker {owner,repo,ref,sha,materializedAt}" → cache path omits the supported subdir → include subdir identity and distinguish commit/tree hashes.
- "Keep the zero-network warm test green" → zero network is the stale-cache cause → replace its assertion with one failed probe plus explicit offline fallback.
- "Manual 0.3.89 → 0.3.90 repro" → no supplied run or fixture supports those versions → use deterministic different-commit, same-version content fixtures instead.

### Requirements

- [x] R1. Every remote marketplace resolution probes the requested ref before reusing a matching warm cache; matching commit SHA returns existing bytes without tree/blob downloads, independent of plugin version strings.
- [x] R2. Cold, stale, absent-marker, corrupt-marker, or mismatched-identity caches materialize the probed immutable commit into sibling staging and publish a validated marker with the completed snapshot; resolvedRef remains the materialized tree SHA on cold and valid-marker warm returns.
- [x] R3. Probe network errors, timeout, non-success HTTP responses (including 403/429), or malformed SHA responses reuse an existing manifest-bearing cache with one stderr warning that freshness could not be verified; cold caches and known identity-mismatched caches fail with locator/cache context. Fallback never rewrites a marker or claims freshness.
- [x] R4. A refresh download, marker write, or promotion failure preserves the prior cache and fails visibly; rollback failures retain recovery data and name the failure. No incomplete staged snapshot becomes a warm hit.
- [x] R5. Install, poisoned-cache recovery, and update check/apply share the resolver. Update detects changed content even at the same declared version; --check may refresh the acquisition cache but does not reinstall or mutate installed outputs/receipts, and --json remains one stdout envelope.
- [x] R6. Preserve local/bundled resolution, locator validation, HEAD fallback, explicit refs/subdirs, authentication, and existing materialization limits/binary fidelity. No new CLI flags, TTL, dependencies, version-based freshness, or native host cache/registration changes.

Out of scope: distributed locking/crash recovery for concurrent processes, changing the locator grammar or cache directory layout, skill-add transport, and a new update-result schema. Offline fallback is best-effort cached content, not a freshness certificate.

### Acceptance Criteria

- [x] AC1 — Matching remote commit reuses warm bytes (req: R1)
  Given a valid matching marker and unchanged commit response, when the resolver runs, then exactly one commit probe occurs, no tree/blob request occurs, bytes and marker timestamp stay unchanged. Layer: apps/cli/tests/commands/install.test.ts.
- [x] AC2 — Cold and stale acquisitions pin the probed commit (req: R2)
  Given different commit and tree SHA values and a branch that advances during acquisition, when resolving a cold or stale cache, then tree/raw requests use the probed commit, the marker records both correct hashes, and returned resolvedRef is the tree SHA. Layer: install.test.ts with URL-asserting fetch fixtures; core fetch.test.ts for the probe helper.
- [x] AC3 — Legacy and invalid markers refresh online (req: R2)
  Given absent, malformed, invalid-field, or mismatched owner/repo/ref/subdir markers, when the probe succeeds, then the requested snapshot replaces the cache and writes a valid identity marker; unknown marker keys are tolerated. Layer: install.test.ts.
- [x] AC4 — Probe failure preserves offline compatibility (req: R3)
  Given a manifest-bearing warm cache, when the probe throws, times out, returns 403/429/404/500, or returns a malformed SHA, then old bytes are returned unchanged and stderr explains unverified freshness; missing/corrupt markers yield no resolvedRef. Given no cache or a known mismatched identity, then resolution rejects instead. Layer: install.test.ts and core fetch.test.ts; fake fetch observes abort without a real 10-second sleep.
- [x] AC5 — Failed refresh cannot destroy the previous snapshot (req: R4)
  Given a prior valid snapshot, when a blob fetch, marker write, or transaction promotion fails, then resolution rejects and the old marker/content remain; inject failure after transaction reservation to exercise rollback. Cold failure publishes no cache. Layer: install.test.ts plus existing transaction tests as applicable.
- [x] AC6 — Update observes remote same-version drift (req: R5)
  Given an installed receipt and a warmed remote cache at commit A, when executeUpdate --check --json resolves commit B with the same version but changed plugin bytes, then it reports stale from the refreshed snapshot, emits one parseable stdout envelope, and leaves installed outputs/receipts unchanged. Apply invokes reinstall with the original locator and forwarded fetchFn. Layer: apps/cli/tests/commands/update.test.ts, real resolver and injected network; do not mock the resolver.
- [x] AC7 — Existing resolver modes remain compatible (req: R6)
  Given shorthand/URL/explicit ref/subdir and HEAD fallback fixtures, when resolving, then identity and pinning are correct; auth is sent only when available; invalid segments fail before IO. Local/bundled paths perform no remote probe. Preserve poisoned-cache recovery, binary downloads, acquisition limits, and cold-error regressions. Layer: install.test.ts and packages/core/tests/skills-ecosystem/fetch.test.ts.

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

#### Q&A entry — 2026-09-20T01:04:33.470Z

Closed under --auto (2026-09-19):
- Use commit SHA for freshness and pin acquisition to it; keep resolvedRef as a tree SHA to preserve receipt semantics.
- Probe failures allow warned warm fallback, including legacy/corrupt-marker caches under the existing manifest-presence compatibility rule. A parseable marker establishing a different identity is never an offline fallback for this request.
- Once a probe succeeds and refresh begins, refresh errors fail rather than silently returning known-stale content.
- Keep the existing cache path. Include normalized subdir (remove trailing slashes; absent is empty string) in marker identity to prevent new marker-aware cross-subdir reuse.
- Reuse FilesystemTransaction; no new transaction abstraction or distributed lock. Process-crash atomicity and simultaneous writers remain deferred.
- --check protects installed files and receipts; acquisition-cache refresh is permitted. Warn on stderr so JSON stdout remains machine-readable.
- No prerequisite WBS or open operator decision; retain task-local AC and do not invent a feature link.

### Design

#### WHAT / WHY / WHERE

Primary files: apps/cli/src/commands/install.ts; apps/cli/src/commands/update.ts; packages/core/src/skills-ecosystem/fetch.ts; packages/core/src/index.ts. Tests: existing install.test.ts, update.test.ts, and skills-ecosystem/fetch.test.ts. Preserve ADR-034's shared GitHub layer and cache layout, ADR-035's same-version hash comparison, and the core-to-app boundary. No new CLI API or dependency.

#### Frozen shapes and algorithm

1. Add exported fetchRepoCommitSha(ownerRepo: string, ref?: string, getToken?: () => string | null, fetchFn: typeof fetch = fetch): Promise<string> to core fetch.ts (already wildcard-exported). GET https://api.github.com/repos/{ownerRepo}/commits/{encodedRef}, Accept application/vnd.github.sha, User-Agent superskill-core, and optional Bearer token from the supplied getter. Explicit ref tries only itself; undefined tries HEAD, main, master in that order only on 404, matching the existing default-ref candidates without retrying rate-limit/outage failures. Bound the whole probe/fallback sequence to 10 seconds via one AbortSignal.timeout(10000), and reuse readBodyBounded with a 1024-byte SHA-response limit. Require trimmed 40-character hexadecimal SHA; reject bad HTTP/body values with contextual errors. No eager gh subprocess, SDK, retry/backoff service, or JSON commit-diff download.
2. In install.ts add private remoteMarketplaceMarkerSchema (existing zod dependency, passthrough) and marker reader. File: .superskill-ref.json under cache root. Required fields: owner, repo, ref, subdir, commitSha, treeSha, materializedAt (ISO timestamp). commitSha/treeSha are 40-character hex; identity strings and timestamp validated. Missing/malformed schema means absent marker; a well-formed marker with different owner/repo/ref/normalized subdir means known identity mismatch. Ignore unknown fields. Neither marker paths nor fields may influence filesystem destinations.
3. Keep current locator parsing and assertSafePathSegment validation before IO. Load cached manifest presence and marker, then getGitHubToken once; call fetchRepoCommitSha with undefined for parsed HEAD, otherwise parsed.ref, through deps.fetchFn. Typical successful warm path is one request, not a guaranteed latency.
4. Probe failure: if existing manifest and no known identity mismatch, echoError one warning naming locator/cache and stating freshness could not be verified, then return root plus matching valid marker.treeSha if present. Never rewrite marker/timestamp. Otherwise throw contextual resolution error. Keep this catch separate from materialization/promotion failures.
5. Probe success: if manifest exists and valid identity marker.commitSha equals result, return root and marker.treeSha without writes. Otherwise create sibling staging and call existing materializeRepoSubdir with ref: commitSha, getToken and fetchFn. Its returned tree.sha is treeSha; its raw downloads then use the pinned commit. Require either existing manifest location to contain readable JSON before publishing; plugin/schema validation remains in the existing downstream resolvePlugin flow. Write the marker only after materialization succeeds.
6. Explicitly export existing FilesystemTransaction from core index.ts's installer export list. After staging is complete, use transaction.replace(cacheRoot, async destination => renameSync(stagingRoot, destination)), then commit. On replacement error, rollback and throw; if rollback also fails report both failures without deleting backup recovery data. On pre-promotion failures leave old root untouched. Clean the owned staging path on success/failure as in the existing implementation; do not introduce broad cleanup of sibling directories. This is rollback-safe replacement for handled errors, not crash-atomic or concurrent-process isolation.
7. executeInstall's two resolver calls keep using fetchFn and returned tree resolvedRef. Keep its poisoned-cache retry behavior. In update.ts extend the private resolveMarketplaceUpstream signature with optional fetchFn, pass dependencies.fetchFn at its :258 caller, and forward to resolveRemoteMarketplace. Pass {fetchFn: dependencies.fetchFn} as executeInstall's fourth argument on apply. Do not mock away the resolver in update regression tests; existing output/exit policies remain.
8. Documentation during implementation: read docs/99_PROJECT_CONSTITUTION.md; put marker/helper schema and observable install/update behavior in docs/04_DESIGN.md, acquisition algorithm in docs/03_ARCHITECTURE.md, and correct the cold-only resolvedRef comment in docs/design/skill-update-notification.md. No ADR reversal is required; a core helper and export extend existing boundaries.

#### Failure/testing constraints

Use fixture commit and tree hashes that differ and are valid 40-hex values (existing "abc" tree fixtures need updating where marker validation now applies). Stub the injected fetchFn by URL; never contact real GitHub or write the user's actual cache. Restore HOME_DIR and spies. Capture stderr separately from stdout. Failed-refresh assertions inspect old bytes/marker, not only a rejection. Pinning tests must advance the symbolic ref while asserting raw requests still use the earlier commit. All core download bounds and binary tests remain in force.

Concurrency audit: git worktree list showed only /Users/robin/xprojects/superskill on main at 2cc9cdb; spur task list returned no wip/backlog tasks, and 0145 was the only todo task. Recheck before implementation; no dependent WBS is assumed. Simultaneous-process cache writers are an explicit existing limitation, not a guarantee this task adds.

Environment: Bun 1.3.14, installed Biome 2.4.16 and app-local zod 3.25.76 match pins/lockfile. Core exports point to src/index.ts, so source tests need no regenerated bundle. Step 0 must recheck workspace state; standalone dist artifact freshness was not used as evidence.

### Plan

1. [x] Recheck git status/worktrees and wip tasks; read task plus ADR-034/035 and relevant docs. Confirm Bun/dependency versions; source imports are authoritative, rebuild before any standalone-binary verification. Preserve the existing untracked task.
2. [x] Add focused failing cases for R1-R3/R6 in core fetch.test.ts and CLI install.test.ts: valid distinct SHA fixtures, same/stale/missing/corrupt/mismatched marker, timeout/offline, HEAD candidates, explicit ref/subdir, auth and immutable URL assertions.
3. [x] Implement fetchRepoCommitSha in shared fetch.ts and marker/probe/pinned-acquisition logic in resolveRemoteMarketplace (R1-R3/R6). Preserve resolvedRef tree semantics and existing materialization bounds.
4. [x] Re-export/reuse FilesystemTransaction for completed staging promotion; add handled promotion/download/marker-failure regressions proving old bytes survive (R4). Preserve cold-cache and poisoned-cache tests; do not claim crash/concurrency atomicity.
5. [x] Thread existing update fetchFn through marketplace lookup and reinstall; exercise real resolver in same-version drift check and apply tests, asserting no installed-output writes during --check and clean JSON stdout (R5).
6. [x] Sync owning docs per Design; run targeted install/update/core-fetch tests together to expose spy/environment leakage. Then run bun run lint, bun run test, bun run build, and recommended bun run spur-check; inspect git status and record actual outcomes in implementation/verification-owned sections.
7. [x] Verify every AC against observed requests, on-disk bytes/markers, stderr/stdout, and installed receipts. No live version-specific manual repro is required; deterministic snapshot fixtures are the regression oracle.

### Root Cause

apps/cli/src/commands/install.ts:320-327 returns {root} whenever either manifest location exists. getGitHubToken and materializeRepoSubdir run only after this return. executeInstall calls the resolver at :418 and :441; update's resolveMarketplaceUpstream calls it at apps/cli/src/commands/update.ts:615. Thus neither repeat installs nor update checks invalidate a warm snapshot. packages/core/src/skills-ecosystem/fetch.ts:452-511 returns a tree SHA and selected ref; :685-744 materializes blobs at that selected ref, not an immutable commit by default.

Baseline executed during refinement: bun test apps/cli/tests/commands/install.test.ts --test-name-pattern 'resolveRemoteMarketplace' — 8 passed, 0 failed (64 filtered). This includes the existing warm-cache offline behavior and partial-download regressions; it is baseline evidence, not proof of the proposed fix.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/doctor.ts:1` |
| `apps/cli/src/commands/doctor.ts:52` |
| `apps/cli/src/commands/hook-run.ts:110` |
| `apps/cli/src/commands/hook-run.ts:4` |
| `apps/cli/src/commands/hook-run.ts:497` |
| `apps/cli/src/commands/install.ts:2560` |
| `apps/cli/src/commands/install.ts:28` |
| `apps/cli/src/commands/install.ts:304` |
| `apps/cli/src/commands/install.ts:31` |
| `apps/cli/src/commands/install.ts:328` |
| `apps/cli/src/commands/install.ts:424` |
| `apps/cli/src/commands/install.ts:426` |
| `apps/cli/src/commands/install.ts:428` |
| `apps/cli/src/commands/install.ts:436` |
| `apps/cli/src/commands/install.ts:475` |
| `apps/cli/src/commands/install.ts:477` |
| `apps/cli/src/commands/install.ts:480` |
| `apps/cli/src/commands/install.ts:482` |
| `apps/cli/src/commands/install.ts:501` |
| `apps/cli/src/commands/install.ts:51` |
| `apps/cli/src/commands/install.ts:568` |
| `apps/cli/src/commands/install.ts:71` |
| `apps/cli/src/commands/script-convert.ts:161` |
| `apps/cli/src/commands/script-convert.ts:19` |
| `apps/cli/src/commands/script-convert.ts:4` |
| `apps/cli/src/commands/script-run.ts:1` |
| `apps/cli/src/commands/script-run.ts:121` |
| `apps/cli/src/commands/update.ts:11` |
| `apps/cli/src/commands/update.ts:187` |
| `apps/cli/src/commands/update.ts:198` |
| `apps/cli/src/commands/update.ts:260` |
| `apps/cli/src/commands/update.ts:321` |
| `apps/cli/src/commands/update.ts:378` |
| `apps/cli/src/commands/update.ts:408` |
| `apps/cli/src/commands/update.ts:532` |
| `apps/cli/src/commands/update.ts:609` |
| `apps/cli/src/commands/update.ts:612` |
| `apps/cli/src/commands/update.ts:630` |
| `apps/cli/src/commands/update.ts:808` |
| `apps/cli/src/stdin.ts:18` |
| `apps/cli/src/stdin.ts:28` |
| `apps/cli/tests/commands/doctor.test.ts:101` |
| `apps/cli/tests/commands/doctor.test.ts:125` |
| `apps/cli/tests/commands/doctor.test.ts:130` |
| `apps/cli/tests/commands/doctor.test.ts:44` |
| `apps/cli/tests/commands/doctor.test.ts:5` |
| `apps/cli/tests/commands/doctor.test.ts:62` |
| `apps/cli/tests/commands/doctor.test.ts:74` |
| `apps/cli/tests/commands/doctor.test.ts:91` |
| `apps/cli/tests/commands/hook-run.test.ts:346` |
| `apps/cli/tests/commands/hook-run.test.ts:351` |
| `apps/cli/tests/commands/hook-run.test.ts:5` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:17` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:21` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:233` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:304` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:35` |
| `apps/cli/tests/commands/install-grok-bot.test.ts:57` |
| `apps/cli/tests/commands/install-magents-rules.test.ts:187` |
| `apps/cli/tests/commands/install-magents-rules.test.ts:190` |
| `apps/cli/tests/commands/install-magents-rules.test.ts:255` |
| `apps/cli/tests/commands/install-magents-rules.test.ts:258` |
| `apps/cli/tests/commands/install-magents-rules.test.ts:5` |
| `apps/cli/tests/commands/install-manifest.test.ts:101` |
| `apps/cli/tests/commands/install-manifest.test.ts:107` |
| `apps/cli/tests/commands/install-manifest.test.ts:16` |
| `apps/cli/tests/commands/install-manifest.test.ts:30` |
| `apps/cli/tests/commands/install-manifest.test.ts:376` |
| `apps/cli/tests/commands/install-manifest.test.ts:396` |
| `apps/cli/tests/commands/install-manifest.test.ts:404` |
| `apps/cli/tests/commands/install-manifest.test.ts:436` |
| `apps/cli/tests/commands/install-manifest.test.ts:481` |
| `apps/cli/tests/commands/install-manifest.test.ts:525` |
| `apps/cli/tests/commands/install-manifest.test.ts:568` |
| `apps/cli/tests/commands/install-manifest.test.ts:620` |
| `apps/cli/tests/commands/install-manifest.test.ts:665` |
| `apps/cli/tests/commands/install-manifest.test.ts:703` |
| `apps/cli/tests/commands/install-manifest.test.ts:734` |
| `apps/cli/tests/commands/install-manifest.test.ts:736` |
| `apps/cli/tests/commands/install-manifest.test.ts:754` |
| `apps/cli/tests/commands/install-manifest.test.ts:763` |
| `apps/cli/tests/commands/install-manifest.test.ts:798` |
| `apps/cli/tests/commands/install-manifest.test.ts:843` |
| `apps/cli/tests/commands/install-manifest.test.ts:877` |
| `apps/cli/tests/commands/install-omp-helpers.test.ts:5` |
| `apps/cli/tests/commands/install-omp-helpers.test.ts:51` |
| `apps/cli/tests/commands/install-omp-helpers.test.ts:62` |
| `apps/cli/tests/commands/install-omp-helpers.test.ts:68` |
| `apps/cli/tests/commands/install-omp-helpers.test.ts:72` |
| `apps/cli/tests/commands/install-omp-helpers.test.ts:75` |
| `apps/cli/tests/commands/install-prune.test.ts:5` |
| `apps/cli/tests/commands/install-prune.test.ts:70` |
| `apps/cli/tests/commands/install-prune.test.ts:76` |
| `apps/cli/tests/commands/install-prune.test.ts:9` |
| `apps/cli/tests/commands/install.integration.test.ts:15` |
| `apps/cli/tests/commands/install.integration.test.ts:417` |
| `apps/cli/tests/commands/install.integration.test.ts:420` |
| `apps/cli/tests/commands/install.integration.test.ts:430` |
| `apps/cli/tests/commands/install.integration.test.ts:446` |
| `apps/cli/tests/commands/install.integration.test.ts:456` |
| `apps/cli/tests/commands/install.integration.test.ts:487` |
| `apps/cli/tests/commands/install.integration.test.ts:497` |
| `apps/cli/tests/commands/install.integration.test.ts:516` |
| `apps/cli/tests/commands/install.integration.test.ts:544` |
| `apps/cli/tests/commands/install.integration.test.ts:584` |
| `apps/cli/tests/commands/install.integration.test.ts:611` |
| `apps/cli/tests/commands/install.integration.test.ts:640` |
| `apps/cli/tests/commands/install.integration.test.ts:667` |
| `apps/cli/tests/commands/install.test.ts:1122` |
| `apps/cli/tests/commands/install.test.ts:1126` |
| `apps/cli/tests/commands/install.test.ts:1130` |
| `apps/cli/tests/commands/install.test.ts:1144` |
| `apps/cli/tests/commands/install.test.ts:1181` |
| `apps/cli/tests/commands/install.test.ts:1234` |
| `apps/cli/tests/commands/install.test.ts:1239` |
| `apps/cli/tests/commands/install.test.ts:1241` |
| `apps/cli/tests/commands/install.test.ts:1278` |
| `apps/cli/tests/commands/install.test.ts:1299` |
| `apps/cli/tests/commands/install.test.ts:1309` |
| `apps/cli/tests/commands/install.test.ts:1315` |
| `apps/cli/tests/commands/install.test.ts:1317` |
| `apps/cli/tests/commands/install.test.ts:1328` |
| `apps/cli/tests/commands/install.test.ts:1336` |
| `apps/cli/tests/commands/install.test.ts:14` |
| `apps/cli/tests/commands/install.test.ts:1629` |
| `apps/cli/tests/commands/install.test.ts:1651` |
| `apps/cli/tests/commands/install.test.ts:1681` |
| `apps/cli/tests/commands/install.test.ts:1688` |
| `apps/cli/tests/commands/install.test.ts:1697` |
| `apps/cli/tests/commands/install.test.ts:33` |
| `apps/cli/tests/commands/install.test.ts:64` |
| `apps/cli/tests/commands/install.test.ts:69` |
| `apps/cli/tests/commands/script-convert.test.ts:135` |
| `apps/cli/tests/commands/script-convert.test.ts:145` |
| `apps/cli/tests/commands/script-convert.test.ts:152` |
| `apps/cli/tests/commands/script-convert.test.ts:162` |
| `apps/cli/tests/commands/script-convert.test.ts:23` |
| `apps/cli/tests/commands/script-convert.test.ts:36` |
| `apps/cli/tests/commands/script-convert.test.ts:6` |
| `apps/cli/tests/commands/script-run.test.ts:2` |
| `apps/cli/tests/commands/script-run.test.ts:212` |
| `apps/cli/tests/commands/script-run.test.ts:229` |
| `apps/cli/tests/commands/script-run.test.ts:53` |
| `apps/cli/tests/commands/skill-verbs.test.ts:40` |
| `apps/cli/tests/commands/skill-verbs.test.ts:44` |
| `apps/cli/tests/commands/skill-verbs.test.ts:52` |
| `apps/cli/tests/commands/skill-verbs.test.ts:54` |
| `apps/cli/tests/commands/skill-verbs.test.ts:6` |
| `apps/cli/tests/commands/update.test.ts:1013` |
| `apps/cli/tests/commands/update.test.ts:12` |
| `apps/cli/tests/commands/update.test.ts:1233` |
| `apps/cli/tests/commands/update.test.ts:1335` |
| `apps/cli/tests/commands/update.test.ts:1493` |
| `apps/cli/tests/commands/update.test.ts:29` |
| `apps/cli/tests/commands/update.test.ts:42` |
| `apps/cli/tests/commands/update.test.ts:64` |
| `apps/cli/tests/commands/update.test.ts:70` |
| `apps/cli/tests/commands/update.test.ts:776` |
| `apps/cli/tests/commands/update.test.ts:782` |
| `apps/cli/tests/commands/update.test.ts:8` |
| `apps/cli/tests/commands/update.test.ts:817` |
| `apps/cli/tests/commands/update.test.ts:840` |
| `apps/cli/tests/commands/update.test.ts:852` |
| `apps/cli/tests/commands/update.test.ts:873` |
| `apps/cli/tests/commands/validate-response-twin.test.ts:25` |
| `apps/cli/tests/commands/validate-response-twin.test.ts:4` |
| `packages/core/src/index.ts:21` |
| `packages/core/src/index.ts:74` |
| `packages/core/src/operations/scaffold.ts:187` |
| `packages/core/src/operations/scaffold.ts:7` |
| `packages/core/src/quality/rubric.ts:106` |
| `packages/core/src/quality/rubric.ts:6` |
| `packages/core/src/skills-ecosystem/agents.ts:4` |
| `packages/core/src/skills-ecosystem/agents.ts:52` |
| `packages/core/src/skills-ecosystem/discovery.ts:3` |
| `packages/core/src/skills-ecosystem/discovery.ts:66` |
| `packages/core/src/skills-ecosystem/fetch.ts:106` |
| `packages/core/src/skills-ecosystem/fetch.ts:110` |
| `packages/core/src/skills-ecosystem/fetch.ts:257` |
| `packages/core/src/skills-ecosystem/fetch.ts:5` |
| `packages/core/src/skills-ecosystem/fetch.ts:517` |
| `packages/core/src/skills-ecosystem/fetch.ts:682` |
| `packages/core/src/skills-ecosystem/fetch.ts:888` |
| `packages/core/src/skills-ecosystem/fetch.ts:935` |
| `packages/core/src/skills-ecosystem/github-host.ts:10` |
| `packages/core/src/skills-ecosystem/github-host.ts:22` |
| `packages/core/src/skills-ecosystem/locks.ts:5` |
| `packages/core/src/skills-ecosystem/locks.ts:88` |
| `packages/core/src/skills-ecosystem/operations.ts:124` |
| `packages/core/src/skills-ecosystem/operations.ts:397` |
| `packages/core/src/skills-ecosystem/operations.ts:4` |
| `packages/core/src/skills-ecosystem/operations.ts:490` |
| `packages/core/src/skills-ecosystem/operations.ts:625` |
| `packages/core/src/skills-ecosystem/operations.ts:768` |
| `packages/core/tests/operations/grok-bot.test.ts:1044` |
| `packages/core/tests/operations/grok-bot.test.ts:15` |
| `packages/core/tests/operations/grok-bot.test.ts:39` |
| `packages/core/tests/operations/grok-bot.test.ts:46` |
| `packages/core/tests/operations/scaffold.test.ts:161` |
| `packages/core/tests/operations/scaffold.test.ts:182` |
| `packages/core/tests/operations/scaffold.test.ts:184` |
| `packages/core/tests/operations/scaffold.test.ts:312` |
| `packages/core/tests/operations/scaffold.test.ts:328` |
| `packages/core/tests/operations/scaffold.test.ts:333` |
| `packages/core/tests/operations/scaffold.test.ts:354` |
| `packages/core/tests/operations/scaffold.test.ts:5` |
| `packages/core/tests/operations/scaffold.test.ts:543` |
| `packages/core/tests/operations/scaffold.test.ts:545` |
| `packages/core/tests/operations/scaffold.test.ts:563` |
| `packages/core/tests/quality/rubric.test.ts:12` |
| `packages/core/tests/quality/rubric.test.ts:142` |
| `packages/core/tests/quality/rubric.test.ts:179` |
| `packages/core/tests/quality/rubric.test.ts:4` |
| `packages/core/tests/quality/rubric.test.ts:84` |
| `packages/core/tests/quality/rubric.test.ts:90` |
| `packages/core/tests/quality/rubric.test.ts:92` |
| `packages/core/tests/skills-ecosystem/fetch.test.ts:10` |
| `packages/core/tests/skills-ecosystem/fetch.test.ts:354` |
| `packages/core/tests/skills-ecosystem/fetch.test.ts:361` |
| `packages/core/tests/skills-ecosystem/fetch.test.ts:623` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:11` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:22` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:24` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:31` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:36` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:43` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:49` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:56` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:63` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:7` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:72` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:85` |
| `packages/core/tests/skills-ecosystem/github-host.test.ts:93` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:28` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:488` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:16` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:410` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:417` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:419` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:425` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:432` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:434` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:440` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:452` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:454` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:464` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:482` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:484` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:490` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:510` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:512` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:102` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:109` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:111` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:117` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:127` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:129` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:135` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:139` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:147` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:149` |
| `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:3` |
| `plugins/cc/scripts/anti-hallucination/validate_response.ts:16` |
| `plugins/cc/scripts/anti-hallucination/validate_response.ts:51` |
| `plugins/cc/tests/hook-examples.test.ts:17` |
| `plugins/cc/tests/hook-examples.test.ts:5` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 — commit probe contract | MET | packages/core/src/skills-ecosystem/fetch.ts:532-576 Accept vnd.github.sha + UA superskill-core + optional Bearer; explicit-ref-tries-only vs HEAD→main→master 404-only walk; single AbortSignal.timeout(10s); 1 KiB bounded read; 40-hex validation; 11 unit tests incl. residual-proof negatives (fetch.test.ts:614-745) |
| R2 — freshness marker schema/IO | MET | apps/cli/src/commands/install.ts:306-412 zod passthrough, 40-hex commitSha/treeSha, ISO materializedAt; missing/malformed = absent marker (legacy R3); identity compared on owner/repo/ref/normalized subdir only, never used as path segments (AC6 assertions install.ts:419-421) |
| R3 — reuse vs refresh resolver branches | MET | install.ts:415-537 warm hit zero writes (AC1 byte-for-byte + marker unchanged); stale/legacy/corrupt → pinned re-materialization at probed commitSha with manifest-presence gate; mismatch → refresh or hard fail, never warned fallback; probe-fail + manifest-bearing cache → one stderr warning, no marker rewrite, no invented resolvedRef (AC3/AC4 tests install.test.ts:1122-1645) |
| R4 — transactional promotion | MET | FilesystemTransaction promotion + rollback (installer.ts:240-316) replaces blind rmSync+renameSync; AC5 mid-download + post-reservation failure preserve previous snapshot, no .tmp-/backup leftovers; cold-cache failure leaves no cache root |
| R5 — update threading | MET | apps/cli/src/commands/update.ts:260,378-393 forwards run fetchFn into marketplace lookup and reinstall 4-arg call; update.test.ts 'does not write during --check' (:397) + 0145 coverage (+255 lines) |
| R6 — docs same-commit sync (T3) | MET | docs/03_ARCHITECTURE.md:366-372 invariant, docs/04_DESIGN.md:103-148 marker contract, docs/design/marketplace-cache-freshness.md, docs/design/skill-update-notification.md all in working tree |
| Gate remediation (in-diff, out of 0145 scope) | MET | env gateway packages/core/src/env.ts + ADR-024 twin lib/env.ts exempted in .spur/rules/boundary/env-var-hygiene.yaml; 267 sites migrated; exhaustive sweep clean; spur-check exit 0 (2414 tests / 115 files); quality gate PASS bound to sha256:ad50e0f6efe56841810d124832a5da5cd0191fccf5f9c039f2de1f7d37893b35 |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | — | — | No P1–P3 findings; verify verdict PASS |

### References

- Source audit: apps/cli/src/commands/install.ts:306 (resolver), :418/:441 (install/recovery callers); apps/cli/src/commands/update.ts:258/:601/:615 and :375 (lookup/apply); packages/core/src/skills-ecosystem/fetch.ts:452/:685 (tree/materializer); packages/core/src/skills-ecosystem/installer.ts:240 (FilesystemTransaction); packages/core/src/index.ts:59/:67 (exports).
- Baseline tests: apps/cli/tests/commands/install.test.ts:1121; update coverage entry: apps/cli/tests/commands/update.test.ts. Refinement run: 8 passed / 0 failed on 2026-09-19; no implementation validation claimed.
- Authority: docs/00_ADR.md ADR-034/035; docs/01_PRD.md Phase 1 distribution; docs/03_ARCHITECTURE.md Plugin resolution; docs/04_DESIGN.md install surface; docs/design/skill-update-notification.md receipt/update behavior.
- Official API verified 2026-09-19, confidence HIGH: [GitHub Get a commit](https://docs.github.com/en/rest/commits/commits#get-a-commit) documents the application/vnd.github.sha response; [GitHub Get a tree](https://docs.github.com/en/rest/git/trees#get-a-tree) identifies the separate tree object. Core source establishes the current resolvedRef/tree behavior.
- Scope/concurrency: one worktree main at 2cc9cdb; zero wip/backlog tasks and only 0145 todo at audit time. No prerequisite WBS. Original task file was untracked before refinement; leave unstaged.

### History

- 2026-09-20T02:13:43.798Z todo → wip (system)
- 2026-09-20T04:19:10.819Z wip → testing (system)
- 2026-09-20T04:23:55.660Z testing → done (system)

