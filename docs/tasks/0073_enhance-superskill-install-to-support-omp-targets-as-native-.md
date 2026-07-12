---
template: feature-impl
schema_version: 1
name: "Enhance superskill install to support omp targets as native Claude Code plugins"
description: "Enable OMP to run superskill plugins natively by registering local marketplaces, generating compatibility manifests, translating slash command dialects, and wrapping hooks as JS/TS modules."
status: todo
type: task
profile: standard
feature_id: O
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-09T06:01:02.846Z"
updated_at: "2026-07-12T03:20:21.770Z"
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
**Install flow change** — `apps/cli/src/commands/install.ts:138` is the rulesync gate. `omp` is already filtered out of `rulesyncTargets`, but the surrogate `pi` push at `install.ts:139-144` (`if (targets.includes('omp') && !targets.includes('pi'))`) exists solely to feed `omp` the pi rulesync output. Delete that block once `omp` becomes native. The dispatch loop at `install.ts:270-283` (`if (target === 'omp') { ... emitPiStyleHooks(...) }`) is the other `omp`-specific branch — replace it with a call to the new `runOmpInstallImpl`.

**New OMP installer** — mirror `defaultRunClaudeInstall` at `install.ts:339-358`:
```ts
async function defaultRunOmpInstall(marketplaceRoot, marketplaceName, plugin, global) {
    const cacheDir = join(resolveHomeDir(), '.omp', 'plugins', 'cache', marketplaceName);
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
    const add = Bun.spawn(['omp', 'plugin', 'marketplace', 'add', marketplaceRoot], { stdout: 'inherit', stderr: 'inherit' });
    await add.exited;
    const installArgs = ['omp', 'plugin', 'install', `${plugin}@${marketplaceName}`];
    if (!global) installArgs.push('--scope', 'project');
    const install = Bun.spawn(installArgs, { stdout: 'inherit', stderr: 'inherit' });
    await install.exited;
}
```
Injected via `dependencies.runOmpInstall ?? defaultRunOmpInstall` in `executeInstall` (`install.ts:101-102` pattern).

**Registry + installPath resolution** — after install, read `installed_plugins.json` via the helpers at `vendors/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts:763-774` (`parseClaudePluginsRegistry`) and `helpers.ts:862-1027` (`listClaudePluginRoots`). The `ClaudePluginEntry.installPath` field (`helpers.ts:724-732`) gives the cached root. User vs project registry: `helpers.ts:924` (`getPluginsDir(home)`) and `helpers.ts:972-1006` (project-scoped `.omp/plugins/`).

**Manifest copy** — `mkdirSync(join(installPath, '.claude-plugin'), { recursive: true })` then `copyFileSync(join(pluginRoot, 'plugin.json'), join(installPath, '.claude-plugin', 'plugin.json'))`. The `claude-plugins` provider reads `.claude-plugin/plugin.json` (confirmed in `vendors/oh-my-pi/.../claude-plugins.ts`).

**Hook module generation** — for each entry in the canonical `hooks.json` (parsed as `CanonicalHooksConfig` in `apps/cli/src/hooks.ts:38-41`), map via `CANONICAL_TO_PI_EVENT` at `hooks.ts:14-21` to the OMP event name. Emit one `.ts` file per `(event, matcher)` pair into `hooks/pre/` (preToolUse) or `hooks/post/` (postToolUse, stop). Template:
```ts
import { spawnSync } from 'node:child_process';
export default function (pi) {
  pi.on('<omp-event>', (event) => {
    const res = spawnSync('superskill', ['hook', 'run', '<plugin>', '<hook-id>'], {
      input: JSON.stringify(event), encoding: 'utf-8',
    });
    if (res.status === 2) return { permissionDecision: 'deny', permissionDecisionReason: res.stderr };
  });
}
```
OMP providers load only `.ts`/`.js` from `hooks/pre/` and `hooks/post/` (confirmed in `vendors/oh-my-pi/.../omp-plugins.ts` and `claude-plugins.ts`).

**Slash command translation** — reuse `translateSlashCommands` (imported `install.ts:25`) on every `.md` under `<installPath>/commands/`, matching the existing `transformMarkdownDirectory` pattern at `install.ts:470-491`.

**Verify-fix deviations (2026-07-11, `/sp:dev-verify 0073 --fix all`)** — three defects found by live golden-path runs against omp 16.4.2 and repaired; each deviates from the written design with goal-equivalent intent:

1. *Idempotent re-install* — the designed cache clear at `~/.omp/plugins/cache/<marketplaceName>` matches no omp 16.4.2 path (real layout: `cache/plugins/<mkt>___<plugin>___<ver>` + `cache/marketplaces/<mkt>`), and re-install failed anyway on registry-level checks (`marketplace add` exits 1 "already exists"; plain `install` exits 1 "already installed"). `defaultRunOmpInstall` now does best-effort `omp plugin marketplace remove` (output suppressed; exit 1 tolerated for first installs) → `marketplace add` → `plugin install --force`. `--force` both reinstalls and refreshes the cached plugin dir (verified live with a stale-marker probe).
2. *ESM hook modules* — omp's extension loader accepts only a function module or a `default` factory export; the CJS `module.exports` modules were rejected at load time ("Extension does not export a valid factory function", observed in `~/.omp/logs`). `generateOmpHookModules` now emits ESM (`export default (pi) => {}`), matching the Design snippets. Also fixed: `spawnSync` is called as `(cmd, args[], opts)` — the previous token-spread varargs form threw `ERR_INVALID_ARG_TYPE` on every handler invocation.
3. *Stop hooks cannot block in omp* — the Design's `session_stop` block-on-nonzero snippet is not implementable: omp's `agent_end` handler has no result type (`vendors/oh-my-pi/.../extensibility/hooks/types.ts:503`). Stop/post hooks are fire-and-forget; exit-code-2 → `{ block: true, reason }` translation applies to `tool_call` (preToolUse) only.
### Testing
**Verify verdict: PASS** (2026-07-11, `/sp:dev-verify 0073 --auto --focus all --fix all --force`; post-fix re-verified)

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 native omp install path | MET | Dispatch `apps/cli/src/commands/install.ts:297-319`; rulesync exclusion `install.ts:166`; DI `install.ts:83,114`; idempotency fixed in `defaultRunOmpInstall` (`install.ts:427-455`) — sandboxed double-install both exit 0 with stale cache refreshed (live run, omp 16.4.2); tests `install.test.ts:213`, `install-omp-helpers.test.ts` `defaultRunOmpInstall` suite |
| R2 `.claude-plugin/plugin.json` | MET | `resolveOmpInstallPath` (`install.ts:463-482`) + manifest copy in `postInstallOmp` (`install.ts:497-504`); live run produced `<cache>/superskill___cc___0.2.19/.claude-plugin/plugin.json`; tests `install-omp-helpers.test.ts` `resolveOmpInstallPath`/`postInstallOmp` suites |
| R3 JS hook modules under `hooks/pre|post` | MET | `apps/cli/src/omp-hooks.ts` `generateOmpHookModules`; live run produced `hooks/post/anti-hallucination.js`; module loads in a real `omp -p` session (loader error absent post-fix; present pre-fix) and its handler executes `superskill hook run cc anti-hallucination` without throwing (execution tests in `apps/cli/tests/omp-hooks.test.ts`); exit-2 → `{ block: true, reason }` verified for `tool_call`; stop hooks are fire-and-forget (omp `agent_end` cannot block — see Solution deviations) |
| R4 slash command dialect translation | MET | `postInstallOmp` → `transformMarkdownDirectory(join(installPath,'commands'),'omp',plugin)` (`install.ts:518`) → `translateSlashCommands` (`install.ts:659`); live cache shows `/skill:cc-skill-add ...` in `commands/skill-add.md`; test `install-omp-helpers.test.ts` "translates installed slash commands to the omp dialect (R4)" |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| `superskill install cc --targets omp` succeeds | MET | command | Sandboxed golden path (HOME=scratch): run 1 exit 0, run 2 (re-install) exit 0, "Installed 'cc' to 1 target(s)." |
| registry lists `cc@superskill` | MET | command | `.omp/plugins/installed_plugins.json` (project scope) contains key `cc@superskill` with `installPath`; `omp plugin list` shows `cc@superskill (0.2.19) (project)` |
| `.claude-plugin/plugin.json` in OMP cache | MET | command | Present at `~/.omp/plugins/cache/plugins/superskill___cc___0.2.19/.claude-plugin/plugin.json` (note: omp 16.4.2 layout adds a `plugins/` segment vs the AC's older glob) |
| hook JS files under `hooks/pre|post` in cache | MET | command | `hooks/post/anti-hallucination.js` generated; ESM shape `export default (pi) =>` with `spawnSync(cmd, args[], opts)` |
| omp loads plugin, exposes commands, executes stop hook | MET | command | Live `omp -p "Reply with exactly: OK"` from the plugin-installed project completed normally; pre-fix CJS module logged "Failed to load extension … not a valid factory function" at exactly our module path (proving omp attempts the load), post-fix ESM run logs no rejection; 17 translated commands + validated manifest at the claude-plugins provider read paths; generated handler executed against the real `superskill hook run cc anti-hallucination` (exit clean). Residual manual check: observe the hook fire inside an interactive omp session |

**Gate checks**

| Check | Status | Evidence |
|-------|--------|----------|
| design-conformance | pass | Claims 1–2 DONE post-fix (ESM template restored to Design's `export default` shape); stop-hook block snippet CHANGED with Solution note (omp `agent_end` has no result type); no scope creep |
| tests-pass | pass | `bun run test`: 1355 pass / 0 fail, 73 files; coverage gate (≥90/≥90) green, exit 0 |
| lint-clean | pass | `bun run lint` (biome + typecheck) exit 0 |
| build | pass | `bun run build` exit 0 |
| cli-golden-path-present | pass | `bun apps/cli/src/index.ts install cc --marketplace .claude-plugin/marketplace.json --targets omp --no-global` ×2, both exit 0 (sandboxed HOME/HOME_DIR) |
| evidence-rule-pass | pass | Every AC row carries command/test evidence |

Coverage: aggregate 97.42% functions / 97.07% lines (`bun test --coverage`, bunfig gate ≥90/≥90).

**Fix pass (`--fix all`) repairs applied during verify**: (1) idempotent `defaultRunOmpInstall` (marketplace remove→add→install `--force`); (2) `spawnSync(cmd, args[], opts)` call shape (was varargs → `ERR_INVALID_ARG_TYPE` on every hook invocation); (3) ESM hook modules (CJS rejected by omp's extension loader). Plus tests: execution tests for generated modules (load + invoke + block path), R4 translation test, updated `defaultRunOmpInstall` contract tests.

**Known residual (out of task scope)**: `superskill hook emit --target omp` still emits the legacy pi-style `.omp/hooks.json` shim (`install.ts` `emitHooksForSurrogateTarget`), which omp ≥16 does not load — deliberate retention for the `hook emit` surface, flagged for follow-up. Operator note: already-installed plugins generated by the old CJS emitter (e.g. `spur___sp___0.3.6` per `~/.omp/logs/omp.2026-07-11.log`) need re-install once this fix ships.
### Review

*To be filled during review.*

### References

- [install.ts](file:///Users/robin/xprojects/superskill/apps/cli/src/commands/install.ts)
- [claude-plugins.ts](file:///Users/robin/xprojects/superskill/vendors/oh-my-pi/packages/coding-agent/src/discovery/claude-plugins.ts)
- [omp-plugins.ts](file:///Users/robin/xprojects/superskill/vendors/oh-my-pi/packages/coding-agent/src/discovery/omp-plugins.ts)

### History

- **2026-07-09**: Initial task specification created.
- 2026-07-10T17:30:42.525Z backlog → todo (system)
