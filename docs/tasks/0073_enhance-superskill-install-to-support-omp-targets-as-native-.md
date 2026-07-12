---
template: feature-impl
schema_version: 1
name: "Enhance superskill install to support omp targets as native Claude Code plugins"
description: "Enable OMP to run superskill plugins natively by registering local marketplaces, generating compatibility manifests, translating slash command dialects, and wrapping hooks as JS/TS modules."
status: done
type: task
profile: standard
feature_id: F4
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-09T06:01:02.846Z"
updated_at: "2026-07-12T18:37:07.409Z"
---

## 0073. Enhance superskill install to support omp targets as native Claude Code plugins

### Background

Currently, the `omp` target is treated as a secondary rulesync target that shares the `pi` target's rulesync outputs (`~/.agents/skills/`) and runs a shim hook emitter (`emitPiStyleHooks`) to write `@vahor/pi-hooks` compatible config to `.omp/hooks.json`.

However, `omp` has evolved to natively support Claude Code marketplace plugins directly through its `claude-plugins` provider. We want to leverage this capability to install superskill plugins natively in `omp` (similar to how they are installed in the `claude` target). By going with Option A, `omp` will be able to load and execute skills, commands, subagents, and hooks directly from its local plugin cache.

To achieve this, we must bridge several compatibility mismatches:
1. **Manifest Location**: `omp`'s `claude-plugins` provider expects `plugin.json` inside a `.claude-plugin/` subdirectory of the plugin root, whereas the source has `plugin.json` at the root.
2. **Hook System**: `omp` only loads hooks from `hooks/pre/` and `hooks/post/` subdirectories, and only loads JS/TS files (ending in `.ts` or `.js`). It does not support `hooks.json` or `@vahor/pi-hooks` format.
3. **Subagent & Slash Command Dialect**: `omp` needs commands in `commands/` and subagent descriptions under `agents/` adapted to OMP dialect.

### Requirements
R1. Native `omp` install path — exclude `omp` from rulesync targets and run the OMP marketplace install. In `apps/cli/src/commands/install.ts:138`, remove `omp` from the `rulesyncTargets` filter (currently it is already excluded but the surrogate `pi` rulesync push at `install.ts:139-144` must also be dropped for `omp`). Add a new `runOmpInstallImpl` dependency (mirroring `defaultRunClaudeInstall` at `install.ts:339-358`) that runs `omp plugin marketplace add <marketplaceRoot>` then `omp plugin install <plugin>@<marketplaceName>` (with `--scope project` when `!options.global`). Before install, clear the OMP cache directory for the marketplace to keep installs idempotent.

R2. Manifest compatibility — write `.claude-plugin/plugin.json`. After install, read the OMP registry (`~/.omp/plugins/installed_plugins.json` global, or `.omp/plugins/installed_plugins.json` project — resolved via `resolveActiveProjectRegistryPath` / `resolveOrDefaultProjectRegistryPath` in `vendors/oh-my-pi/.../helpers.ts:789-843`) to extract `installPath`. If `<installPath>/.claude-plugin/plugin.json` is missing, copy the root `plugin.json` there so the `claude-plugins` provider (`vendors/oh-my-pi/.../claude-plugins.ts`) validates the manifest.

R3. Hook adaptation — generate JS/TS hook modules under `hooks/pre/` and `hooks/post/`. OMP's `claude-plugins` and `omp-plugins` providers only load `.ts`/`.js` files from `hooks/pre/` and `hooks/post/` (not `hooks.json`). Read the canonical `hooks.json` from the cached install path, then for each hook event emit a generated module that calls `pi.on(<event>, ...)` and spawns `superskill hook run <plugin> <hook-id>` via `child_process.spawnSync`, forwarding stdin and translating exit codes (0 = allow, 2 = deny with `permissionDecisionReason`).

R4. Slash command dialect translation. Post-process every `.md` file under `<installPath>/commands/` through `translateSlashCommands(content, 'omp')` (already imported at `install.ts:25`, used at `install.ts:487`) so OMP receives its dialect.
### Acceptance Criteria

- Running `superskill install cc --targets omp` succeeds.
- Checks that `.omp/plugins/installed_plugins.json` (or global equivalent) lists `cc@superskill`.
- Checks that `.claude-plugin/plugin.json` is generated inside the OMP cache directory under `~/.omp/plugins/cache/superskill___cc___*`.
- Checks that JS/TS hook files are generated under `hooks/pre/` / `hooks/post/` / etc. in the OMP cache directory.
- Running `omp` loads the `cc` plugin, exposes `cc` commands, and successfully executes the stop hook (anti-hallucination check) when agent run completes.

### Q&A

*No clarifications needed.*

### Design

1. **OMP Marketplace & Install Commands**:
   - Just like `runClaudeInstallImpl`, we will add `runOmpInstallImpl` (and a default `defaultRunOmpInstall` using `Bun.spawn`) to call:
     - `omp plugin marketplace add <marketplaceRoot>`
     - `omp plugin install <plugin>@<marketplaceName>` (with `--scope project` if `!options.global`)
2. **Hook Code Generation**:
   - The generated TS/JS hook files will run the hook command using `node:child_process` `spawnSync`:
     ```javascript
     import { spawnSync } from 'node:child_process';
     export default function(pi) {
         pi.on("session_stop", async (event) => {
             const res = spawnSync("superskill", ["hook", "run", "cc", "anti-hallucination"], {
                 input: JSON.stringify(event),
                 encoding: 'utf-8'
             });
             if (res.status !== 0) {
                 try {
                     const json = JSON.parse(res.stdout);
                     return { decision: "block", reason: json.systemMessage || "Blocked by cc anti-hallucination hook" };
                 } catch {
                     return { decision: "block", reason: "Blocked by cc anti-hallucination hook" };
                 }
             }
         });
     }
     ```
   - For pre-tool hooks:
     ```javascript
     import { spawnSync } from 'node:child_process';
     export default function(pi) {
         pi.on("tool_call", async (event) => {
             if (event.toolName !== "<tool>") return;
             const res = spawnSync("superskill", ["hook", "run", "cc", "<hook-id>"], {
                 input: JSON.stringify(event),
                 encoding: 'utf-8'
             });
             if (res.status !== 0) {
                 try {
                     const json = JSON.parse(res.stdout);
                     return { block: true, reason: json.systemMessage || "Blocked by cc preToolUse hook" };
                 } catch {
                     return { block: true, reason: "Blocked by cc preToolUse hook" };
                 }
             }
         });
     }
     ```

### Plan

1. [ ] Create or update mock helper in `apps/cli/tests/commands/install.test.ts` to mock `omp` installation calls.
2. [ ] Update `apps/cli/src/commands/install.ts` to:
   - Exclude `omp` from the `rulesyncTargets` filter.
   - Implement native OMP registry resolution and plugin directory post-processing.
   - Copy `plugin.json` to `.claude-plugin/plugin.json`.
   - Read the canonical `hooks.json` from the cache directory and translate hooks into TS/JS hook scripts under `hooks/pre/` and `hooks/post/`.
   - Translate slash command markdown files inside the cache directory using `translateSlashCommands(content, 'omp')`.
3. [ ] Run integration and unit tests to verify native OMP installation works correctly.

### Solution
**Shipped (native OMP install — task 0073).** OMP is a first-class native plugin target peer of Claude: marketplace add + install, post-process cache for manifest/hooks/slash dialect. No rulesync / no pi-surrogate path for `omp`.

**Change-map**

| File | What / why |
|------|------------|
| `apps/cli/src/commands/install.ts:83-89,125` | `runOmpInstall` DI on `InstallDependencies` |
| `apps/cli/src/commands/install.ts:178` | `omp` excluded from `rulesyncTargets` (with claude/hermes/grok) |
| `apps/cli/src/commands/install.ts:322-343` | Dispatch: `defaultRunOmpInstall` → `resolveOmpInstallPath` → `postInstallOmp` |
| `apps/cli/src/commands/install.ts:602-635` | `defaultRunOmpInstall`: marketplace remove-then-add, install with `--force` (+ `--scope project` when !global) |
| `apps/cli/src/commands/install.ts:638-662` | `resolveOmpInstallPath` from `installed_plugins.json` (user/project scope) |
| `apps/cli/src/commands/install.ts:665-694` | `postInstallOmp`: `.claude-plugin/plugin.json` copy, OMP hook modules, slash dialect on `commands/` |
| `apps/cli/src/omp-hooks.ts` | `generateOmpHookModules` — Claude hooks.json → `hooks/pre|post` JS modules |
| Tests | `install-omp-helpers.test.ts`, `omp-hooks.test.ts`, `install.test.ts` omp dispatch |

**Deviations (documented, goal-equivalent)**

- Idempotency uses marketplace remove + install `--force` (omp 16.x exits 1 on re-add / already-installed), not only cache wipe.
- Stop hooks are fire-and-forget under omp `agent_end` (cannot block) — tool_call still returns deny on exit 2.

**Gates (re-confirmed 2026-07-12):** focused omp test suite 70 pass; full suite green from prior session.
### Testing
**Verify verdict: PASS** (re-confirmed 2026-07-12 via `/sp:dev-refine 0073 --auto --next` chain; original verify 2026-07-11)

**Per-requirement traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 native omp install path | MET | Dispatch `install.ts:322-343`; rulesync exclusion `install.ts:178`; DI `install.ts:83,125`; `defaultRunOmpInstall` `install.ts:602-635`; tests `install.test.ts` omp native install + `install-omp-helpers.test.ts` |
| R2 `.claude-plugin/plugin.json` | MET | `resolveOmpInstallPath` + `postInstallOmp` manifest copy; helper tests |
| R3 JS hooks under `hooks/pre|post` | MET | `omp-hooks.ts` `generateOmpHookModules`; `omp-hooks.test.ts` |
| R4 slash dialect on commands/ | MET | `postInstallOmp` → `translateSlashCommands(..., 'omp')`; R4 helper test |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| `superskill install … --targets omp` succeeds | MET | test + prior live | DI install + live runs in 2026-07-11 verify |
| Registry lists `plugin@marketplace` | MET | test + static-ref | `resolveOmpInstallPath` reads installed_plugins.json |
| `.claude-plugin/plugin.json` in cache | MET | test | postInstallOmp suite |
| JS hooks under hooks/pre|post | MET | test | generateOmpHookModules + postInstallOmp |
| omp loads plugin / hooks execute | MET | test + prior live | omp-hooks execution tests; prior live stop-hook session |

**Design conformance:** native install DONE; idempotency CHANGED to remove+`--force` (Solution); stop-hook non-blocking documented.

**Focused re-check (2026-07-12):** `bun test` install-omp-helpers + omp-hooks + install.test → 70 pass / 0 fail.

**Coverage:** suite aggregate ≥90/90 (project gate).
### Review

*To be filled during review.*

### References

- [install.ts](file:///Users/robin/xprojects/superskill/apps/cli/src/commands/install.ts)
- [claude-plugins.ts](file:///Users/robin/xprojects/superskill/vendors/oh-my-pi/packages/coding-agent/src/discovery/claude-plugins.ts)
- [omp-plugins.ts](file:///Users/robin/xprojects/superskill/vendors/oh-my-pi/packages/coding-agent/src/discovery/omp-plugins.ts)

### History

- **2026-07-09**: Initial task specification created.
- 2026-07-10T17:30:42.525Z backlog → todo (system)
- 2026-07-12T18:37:02.561Z todo → wip (system)
- 2026-07-12T18:37:02.760Z wip → testing (system)
- 2026-07-12T18:37:03.089Z testing → done (system)
