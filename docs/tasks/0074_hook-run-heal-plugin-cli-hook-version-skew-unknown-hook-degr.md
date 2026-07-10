---
schema_version: 1
name: "hook-run: heal plugin/CLI hook version skew — unknown-hook degradation policy, compat contract, release 0.2.14"
status: done
template: standard
created_at: 2026-07-10T21:50:04.430Z
updated_at: "2026-07-10T22:46:41.011Z"
---

## 0074. hook-run: heal plugin/CLI hook version skew — unknown-hook degradation policy, compat contract, release 0.2.14

### Background
On 2026-07-10 every Claude Code session on this machine started flooding hook errors — `Error: unknown hook 'sp context-post-tool'` on every Read/Write/Edit (PostToolUse) and, worse, `unknown hook 'sp context-session-stop'` on every Stop, which **blocked session termination and looped the agent** (exit 2 is the universal block signal).

**Confirmed root-cause timeline (all verified in git):**

| Date | Repo | Event |
|------|------|-------|
| 2026-07-08 | superskill | `f9737be` releases **v0.2.13** to npm — `hook run` registry contains only `sp/task-write-guard` + `cc/anti-hallucination`. Global install (`~/.bun/bin/superskill` → `/Users/robin/node_modules/@gobing-ai/superskill/`) comes from this publish. |
| 2026-07-09 | spur-new | `95277e9` "feat(sp): replace OpenWolf with indexed-context skill" ships sp plugin **0.3.6** whose `hooks.json` registers `superskill hook run sp context-post-tool` / `context-session-start` / `context-session-stop` — hooks **no published CLI knows**. Synced into `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json`. |
| 2026-07-10 | superskill | `418894e` "fix(hook-run): use exit-code-based decisions for cross-agent compatibility" adds the `sp/context-*` runners to `HOOK_RUNNERS` (`apps/cli/src/commands/hook-run.ts:346-352`) — **committed but unpublished; version never bumped past 0.2.13**. |

**Two distinct defects:**

1. **Release-coordination gap.** The sp plugin (spur-new repo) and the `superskill` CLI (this repo) evolve independently with no compatibility contract: nothing stops a plugin from shipping `hooks.json` entries that call CLI runners that exist in no published CLI version. The version number itself lied — local main and npm both said 0.2.13 while diverging.
2. **Skew amplifier: unknown hook = block.** `hookRun` returns **2** for an unknown hook (`apps/cli/src/commands/hook-run.ts:357-360`). Exit 2 blocks the agent action. The context hooks are token-ledger hooks documented "all fail-open" (`hook-run.ts:165`) — yet the *dispatcher* fails **closed** when it doesn't recognize them, so a version skew escalated to blocked Stops and an agent loop instead of a degraded ledger.

**Mitigations already applied on 2026-07-10 (temporary, machine-local):**

- Global bundle refreshed from local main (`bun run build`; `cp apps/cli/dist/index.js /Users/robin/node_modules/@gobing-ai/superskill/dist/index.js`; pre-replacement backup at `dist/index.js.bak`). All sp hooks verified exit 0.
- The three `context-*` hook registrations removed from `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json` (backup: `hooks.json.bak` beside it) so sessions stay clean regardless of CLI state. `task-write-guard` (PreToolUse) kept.

Both are stopgaps: the cache edit is lost on the next plugin sync, and the binary overwrite is bypassed by any `bun add -g` reinstall. This task lands the durable fixes.
### Requirements

R1. **Unknown-hook degradation policy.** `hookRun` no longer hard-blocks (exit 2) on an *unrecognized* hook id. Decide and implement the policy split: an unknown hook fails **open** (exit 0 + one-line stderr warning naming the hook and the installed CLI version, so skew is visible without breaking sessions). Rationale: a guard that exists must keep failing closed on violation — but "this CLI is too old to know the hook" is a deployment condition, not a violation. If a fail-closed class of hooks is deemed necessary (e.g. future `*-guard` ids), the policy must be by declared convention (e.g. id suffix or registry metadata), not a blanket exit 2.

R2. **Version bump + publish.** `@gobing-ai/superskill` bumps to 0.2.14 (or next per release convention) and publishes to npm so the context runners exist in a published artifact; the global install is refreshed from npm (replacing the 2026-07-10 hand-copied bundle). Any commit that touches the `HOOK_RUNNERS` registry after this task must not ship without a version bump (see R3).

R3. **Plugin↔CLI compatibility contract.** A mechanism prevents recurrence, minimally one of: (a) sp plugin's `hooks.json` (spur-new side) declares a minimum superskill CLI version and `superskill install`/sync verifies `superskill --version` against it, warning or refusing to emit hooks the CLI cannot run; or (b) the emitted hook command embeds a capability probe (cheap: `superskill hook run` already prints known hooks on failure — combined with R1 fail-open this is self-describing). Choose during design; the chosen contract is documented in the repo (README or docs/) with the cross-repo release-ordering rule: **CLI capability publishes before or with the plugin that calls it.**

R4. **Restore the disabled hooks.** After R1+R2 land and the global CLI is npm-current: restore `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json` from its `.bak` (or trigger a plugin re-sync) and remove `dist/index.js.bak`. Verify a full session (SessionStart → Read/Edit → Stop) emits no hook errors with all four sp hooks live.

R5. **Tests.** Unit tests pin the degradation policy: unknown hook → exit 0 + stderr warning (and, if a fail-closed class is introduced, unknown-guard → exit 2); existing runner tests (`apps/cli/tests/commands/hook-run.test.ts`) stay green. If R3(a) is chosen, the install-time version check gets its own test.

R6. **No regression to hook semantics.** Known hooks keep their current exit-code contracts (task-write-guard blocking behavior unchanged; context hooks fail-open unchanged). Repo gate green (lint/typecheck/tests per this repo's scripts).

### Design

**Current state (verified 2026-07-10, main @ `418894e` + one newer install commit `59195a8`, working tree clean):**

- `apps/cli/src/commands/hook-run.ts:346-352` — `HOOK_RUNNERS` registry: `sp/task-write-guard`, `sp/context-post-tool`, `sp/context-session-start`, `sp/context-session-stop`, `cc/anti-hallucination`.
- `apps/cli/src/commands/hook-run.ts:355-361` — `hookRun()`: unknown id → `echoError(...); return 2`. Exit 2 = universal block signal (file header, ~line 35). This is the skew amplifier.
- `apps/cli/src/commands/hook-run.ts:165` — comment: "sp/context-* hooks (indexed-context token ledger, all fail-open)" — the runners themselves are fail-open; only the dispatcher fails closed.
- `apps/cli/src/commands/install.ts:29-30` — hook emission: `emitHermesHooks`/`emitPiStyleHooks` (`../hooks`) + `generateOmpHookModules` (`../omp-hooks`). All emitted configs shell out to `superskill hook run <plugin> <hook-id>` — the CLI registry is the single runtime dependency of every emitted hook, across every target agent.
- `apps/cli/src/hooks.ts` — rulesync-canonical hook format conversion (vendored rulesync at `vendors/rulesync`); Claude Code consumes the plugin's native `hooks.json` directly from the plugin cache.
- Consumer side (other repo): spur-new `plugins/sp/hooks/hooks.json` (shipped as sp 0.3.6, commit `95277e9`, 2026-07-09) registers the three context hooks + the guard; cached at `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json`.
- Release flow: `chore: release @gobing-ai/superskill vX.Y.Z` commits + `@gobing-ai/superskill-vX.Y.Z` tags; npm latest = 0.2.13 (2026-07-08).

**Decision 1 — degradation policy (R1).** Split "unknown hook" from "hook says block":

```
hookRun(plugin, hookId):
  runner = HOOK_RUNNERS[key]
  if (!runner) {
      echoError(`Warning: unknown hook '<key>' — superskill v<version> does not implement it; treating as no-op. Known: ...`);
      return 0;   // fail open: deployment skew, not a policy violation
  }
  ... unchanged dispatch ...
```

If a fail-closed-when-unknown class is wanted later, encode it in the registry/naming convention (e.g. ids ending `-guard` refuse to no-op) — decide during implementation, but do NOT couple it to this fix if it stalls shipping; the minimal R1 is blanket fail-open-with-warning for unknown ids. Note: a *known* guard keeps its own exit codes — `task-write-guard` behavior is untouched.

**Decision 2 — compat contract (R3).** Preferred: lightweight declarative floor. The plugin's canonical `hooks.json` gains an optional `"minCliVersion": "0.2.14"` field; `superskill install` (and any sync path it owns) compares against its own version and warns + skips emitting hooks it cannot honor. Claude Code's own marketplace sync does NOT go through superskill install — so the floor cannot be enforced there; that is exactly why R1's fail-open is the load-bearing fix and R3 is the early-warning layer. Document the release-ordering rule (CLI first, plugin second) in the repo docs; evaluate a checklist item in the sp plugin release flow (spur-new side, follow-up there if needed).

**Decision 3 — release (R2).** Bump `apps/cli/package.json` to 0.2.14 and publish via the existing release convention (`chore: release` + tag). Operator-run publish. After npm has 0.2.14: `bun add -g @gobing-ai/superskill@latest`, delete `/Users/robin/node_modules/@gobing-ai/superskill/dist/index.js.bak`, restore the plugin-cache `hooks.json` from `hooks.json.bak`.

**Rejected alternatives:**

- Blanket fail-open for ALL hook outcomes — destroys `task-write-guard`'s purpose; only *unknown-id* fails open.
- Hard version pinning (install refuses on mismatch) — too brittle for a single-operator multi-machine setup; warn-and-skip is enough given R1.
- Auto-publish on registry change (CI) — heavier release automation; out of scope, revisit if skew recurs.

**Out of scope:** spur-new plugin changes beyond the optional `minCliVersion` field consumption (any sp-plugin-side emission changes are a spur-new task); rulesync vendor changes.

### Plan
- [x] `apps/cli/src/commands/hook-run.ts:355-361`: unknown-id branch → stderr warning (hook id + installed CLI version + known-hooks list) + `return 0`; keep known-hook dispatch byte-identical (R1, R6).
- [x] `apps/cli/tests/commands/hook-run.test.ts`: unknown id exits 0 + warns; every known runner's existing exit-code contract still pinned (R5, R6).
- [x] Decide fail-closed-unknown class (id convention e.g. `*-guard`) — deferred; decision recorded in ADR-020 (fail-closed class must come via registry metadata/id convention, never blanket exit 2) (R1).
- [x] `superskill install`: read optional `minCliVersion` from the plugin's canonical hooks.json; on floor violation warn and skip hook emission for that plugin; test both paths (R3, R5).
- [x] Docs: release-ordering rule (CLI before/with plugin) + `minCliVersion` field documented (R3).
- [x] Repo gate green (lint/typecheck/tests); working tree only intentional changes.
- [ ] Release: bump `apps/cli/package.json` → 0.2.14 (done), `chore: release` commit + `@gobing-ai/superskill-v0.2.14` tag, publish to npm (operator-run) (R2).
- [ ] Post-publish: `bun add -g @gobing-ai/superskill@latest`; verify `superskill --version` = 0.2.14 and `echo '{}' | superskill hook run sp context-session-stop` exits 0; delete `/Users/robin/node_modules/@gobing-ai/superskill/dist/index.js.bak` if the reinstall replaced the bundle (R2, R4).
- [ ] Restore `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json` from `hooks.json.bak` (or re-sync the sp plugin); run one full Claude Code session (SessionStart → Edit → Stop) and confirm zero hook errors with all four sp hooks live (R4).
- [ ] Follow-up (spur-new repo): add the CLI-version checklist item to the sp plugin release flow; link that task here when created.
### Solution
Fix the amplifier, then the coordination gap, then release: unknown hook ids in `hookRun` (`apps/cli/src/commands/hook-run.ts:357-360`) fail **open** with a version-naming stderr warning instead of returning the block signal 2; `superskill install` learns an optional `minCliVersion` floor from the plugin's canonical hooks.json (warn + skip, early-warning only — the fail-open dispatch is the real safety net); bump to 0.2.14 and publish so the `sp/context-*` runners exist in a published artifact; then restore the two 2026-07-10 stopgaps (hand-copied global bundle at `/Users/robin/node_modules/@gobing-ai/superskill/dist/index.js`, context hooks stripped from `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json`) to their normal state.

**Boundary:** known hooks keep their exact exit-code contracts (`sp/task-write-guard` blocking semantics untouched); only the *unknown-id* dispatch path changes. Plugin-side (spur-new) release-checklist changes are a follow-up in that repo.

**Change map (as shipped, incl. verify fix-pass):**

- `apps/cli/src/commands/hook-run.ts` — unknown-id branch → warn + exit 0 (R1); version lookup via shared helper
- `apps/cli/src/cli-version.ts` — **added by verify fix-pass**: shared `probeCliVersion`/`readCliVersion` probing both layout depths (`dist/` bundle: one up; `src/commands/` source: two up). The original per-file reads hardcoded one depth each, which left the `minCliVersion` install gate silently inert in the published bundle (empirically confirmed, then fixed + re-probed)
- `apps/cli/tests/commands/hook-run.test.ts` — pins the unknown-id contract incl. real-version-in-warning assertion (R5)
- `apps/cli/tests/cli-version.test.ts` — 5 tests: both layout depths, malformed-json fall-through, fail-safe undefined (R5)
- `apps/cli/src/commands/install.ts` + `src/hooks.ts` canonical read — `minCliVersion` floor check, warn + skip all hook emission paths (rulesync/hermes/pi/OMP) (R3)
- `apps/cli/tests/commands/install-min-cli-version.test.ts` (10) + `install-min-cli-version-behavior.test.ts` (4) — floor gate both paths + mapper preservation (R3, R5)
- `packages/core/src/mapper.ts` — preserves non-hooks top-level metadata (incl. `minCliVersion`) through conversion (R3)
- `apps/cli/package.json` — version 0.2.14 (R2; publish operator-pending)
- `docs/00_ADR.md` ADR-020/021 + `docs/04_DESIGN.md` config-shape table — fail-open policy, `minCliVersion`, release-ordering rule (R3)
- `.gitignore` — `/.spur/run/` (verdict artifacts) + `/.spur/context/` (context-hook runtime ledger; was breaking `biome check` via `vcs.useIgnoreFile`)
- post-publish machine cleanup — reinstall from npm, drop `dist/index.js.bak`, restore plugin-cache `hooks.json` from `.bak` (R4; blocked on the R2 publish)
### Results

**R1 — fail-open dispatch (shipped):** `apps/cli/src/commands/hook-run.ts` unknown-id branch now returns 0 with a version-naming stderr warning (lists hook id, installed CLI version, known hooks in the `HOOK_RUNNERS` registry). Known-hook dispatch byte-identical. Tests pinned at `apps/cli/tests/commands/hook-run.test.ts` (registration + dispatcher tests rewritten from exit-2 to exit-0).

**R3 — `minCliVersion` compat contract (shipped):** `CanonicalHooksConfig` gains `minCliVersion?: string` (`apps/cli/src/hooks.ts`); `executeInstall()` computes `hooksBlockedByCliVersion` after `mapResult` and gates all hook emission (rulesync, hermes, pi via `if (!hooksBlockedByCliVersion)`; OMP via `skipHooks` option on `postInstallOmp`). `packages/core/src/mapper.ts` preserves non-hooks top-level metadata (incl. `minCliVersion`) through round-trip conversion. Helpers `compareSemver` + `readInstalledCliVersion` at `install.ts` bottom. 18 tests: `install-min-cli-version.test.ts` (14 unit) + `install-min-cli-version-behavior.test.ts` (4 behavior).

**R3 — docs (shipped):** ADR-020 (fail-open policy) + ADR-021 (`minCliVersion` + release-ordering rule) appended to `docs/00_ADR.md` (v1.6.0→v1.7.0); canonical `hooks.json` config shape table added to `docs/04_DESIGN.md` (v2.2.0→v2.3.0).

**Gate:** `bun run lint` clean (160 files), `bun run typecheck` clean (both packages), `bun run test` — 1307 pass / 0 fail / 0 skip across 71 files.

**R2 — release 0.2.14 (pending operator gate):** version bump + publish not yet executed. The code fix is live only via the 2026-07-10 stopgap (hand-copied global bundle); npm publish + post-publish cleanup (reinstall, restore plugin-cache hooks.json) remain.

### Testing

**Verdict: PARTIAL** — verified 2026-07-10 via `/sp:dev-verify 0074 --force --fix all` (post-fix re-verify). Code-side requirements (R1, R3, R5, R6) MET with fresh evidence; release/ops requirements (R2 publish, R4 restore) remain operator-gated residuals, documented in Results — not silently skipped.

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 unknown-hook fail-open | MET | `apps/cli/src/commands/hook-run.ts` unknown-id branch warns + returns 0. Bundle probe (stdin `{}` to `bun apps/cli/dist/index.js hook run sp does-not-exist`): exit 0, warning names `superskill 0.2.14` + full known-hook list. Pinned in `apps/cli/tests/commands/hook-run.test.ts` (registration + dispatcher, incl. real-version assertion) |
| R2 version bump + publish | PARTIAL | `apps/cli/package.json` = 0.2.14 (working tree). npm latest = 0.2.13 (`npm view`, 2026-07-10); PATH CLI reports 0.2.11. Publish + global reinstall pending — operator-run per Design Decision 3 |
| R3 compat contract | MET | `minCliVersion` field (`apps/cli/src/hooks.ts`), install gate + `compareSemver` (`apps/cli/src/commands/install.ts`), mapper preservation (`packages/core/src/mapper.ts`), ADR-020/021 (`docs/00_ADR.md` v1.7.0), config-shape table (`docs/04_DESIGN.md` v2.3.0). Verify fix-pass repaired a bundle-context break (see Review/SECUA F1): floor-99.0.0 probe against rebuilt `dist/index.js` now prints the compat warning and skips pi hook emission (pre-fix: silently emitted) |
| R4 restore disabled hooks | UNMET (blocked on R2) | `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json` still the stripped stopgap (629 B vs 1478 B `.bak`); `/Users/robin/node_modules/@gobing-ai/superskill/dist/index.js.bak` still present. Restoration sequenced behind the npm publish |
| R5 tests | MET | Fresh run 2026-07-10: 1312 pass, 0 fail, 0 skip, 73 files, exit 0. Unknown-hook policy pinned (exit 0 + warning + version); minCliVersion: 10 unit (`install-min-cli-version.test.ts`) + 4 behavior (`install-min-cli-version-behavior.test.ts`); version resolution: 5 tests (`apps/cli/tests/cli-version.test.ts`) |
| R6 no hook-semantics regression | MET | `task-write-guard` and context-runner exit-code tests unchanged and green. Full gate: `bun run lint` exit 0 (161 files), `bun run test` exit 0, `bun run build` exit 0, `bun run spur-check` 3/3 rules pass |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| (no `## Acceptance Criteria` section in this task) | N/A | static-ref | Task uses R1–R6 + `### Plan` checklist; all covered by the traceability rows above |

**Design conformance:** Decision 1 (fail-open with warning) DONE exactly as written. Decision 2 (`minCliVersion` warn+skip) DONE after the fix pass — pre-fix it was inert in the bundled artifact (hardcoded package.json lookup depth), i.e. implemented-but-non-functional where it ships. Decision 3 (release 0.2.14) PARTIAL — bump done, publish operator-pending, deviation documented in Results (not silent). The deferred fail-closed-unknown class is recorded in ADR-020 as a naming/registry convention for the future.

Coverage: aggregate 99.77% functions / 98.32% lines (90/90 gate); `apps/cli/src/cli-version.ts` 100/100.

Verdict artifact: `.spur/run/0074-verdict.json` (standalone emission; gitignored path).

### References

- `apps/cli/src/commands/hook-run.ts:346-361` — registry + unknown-id exit-2 branch (the amplifier).
- superskill `418894e` (2026-07-10) — added `sp/context-*` runners post-v0.2.13; `f9737be` (2026-07-08) — v0.2.13 release.
- spur-new `95277e9` (2026-07-09) — sp plugin 0.3.6 shipped `hooks.json` calling the then-unpublished runners (`~/xprojects/spur-new/plugins/sp/hooks/hooks.json`).
- Live artifacts of the incident: `~/.claude/plugins/cache/spur/sp/0.3.6/hooks/hooks.json` (+ `.bak` from the 2026-07-10 mitigation), `/Users/robin/node_modules/@gobing-ai/superskill/dist/index.js` (+ `.bak`).
- `apps/cli/src/commands/install.ts:29-30`, `apps/cli/src/hooks.ts` — hook emission via rulesync-canonical format (`vendors/rulesync`); every emitted config calls `superskill hook run`.
- Claude Code hooks reference: exit 2 = block; Stop-hook block loops the agent (observed live 2026-07-10, four consecutive blocked stops in one session).

### History
- 2026-07-10T22:22:40.348Z backlog → todo (system)
- 2026-07-10T22:22:40.463Z todo → wip (system)
- 2026-07-10T22:22:45.087Z wip → testing (system)
- 2026-07-10T22:22:45.337Z testing → done (system)
