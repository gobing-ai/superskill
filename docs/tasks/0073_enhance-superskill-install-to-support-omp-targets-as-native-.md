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
updated_at: "2026-07-10T17:30:42.525Z"
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
### Testing
Unit tests in `apps/cli/tests/commands/install.test.ts` mock `defaultRunOmpInstall` (via `dependencies.runOmpInstall`, same pattern as the existing `runClaudeInstall` mock) and assert: (1) `omp` is excluded from rulesync targets, (2) the mock is called with the correct marketplace root / name / scope, (3) `.claude-plugin/plugin.json` is written into the mock installPath, (4) hook `.ts` files are generated under `hooks/pre/` / `hooks/post/`, (5) slash command markdown is dialect-translated. Target: ≥90% line coverage on the new `omp` dispatch branch in `install.ts` (project gate is ≥90% line + ≥90% function per `bunfig.toml`). Integration: `superskill install cc --targets omp` against a sandbox `HOME_DIR`, then `ls ~/.omp/plugins/cache/superskill___cc___*` and `cat .claude-plugin/plugin.json`.
### Review

*To be filled during review.*

### References

- [install.ts](file:///Users/robin/xprojects/superskill/apps/cli/src/commands/install.ts)
- [claude-plugins.ts](file:///Users/robin/xprojects/superskill/vendors/oh-my-pi/packages/coding-agent/src/discovery/claude-plugins.ts)
- [omp-plugins.ts](file:///Users/robin/xprojects/superskill/vendors/oh-my-pi/packages/coding-agent/src/discovery/omp-plugins.ts)

### History

- **2026-07-09**: Initial task specification created.
- 2026-07-10T17:30:42.525Z backlog → todo (system)
