---
schema_version: 1
name: "Add native Grok target to superskill install (Claude-format plugin, no command-adapt)"
status: done
template: feature-impl
created_at: 2026-07-12T07:16:35.285Z
updated_at: "2026-07-12T18:34:59.451Z"
priority: P1
---

## 0078. Add native Grok target to superskill install (Claude-format plugin, no command-adapt)

### Background
**Problem.** Grok Build (xAI TUI, currently ~0.2.93) is **not** a superskill target. Operators who run `superskill install sp` (or any Claude-format plugin) get Grok coverage only **accidentally**:

1. **Claude-compat path** — `target=claude` runs `claude plugin marketplace add` + `claude plugin install`, and Grok loads Claude's `installed_plugins.json` / marketplaces / `enabledPlugins` (see Grok docs "Claude Code compatibility"). Slash form: `/sp:dev-idea` (plugin namespace).
2. **Adapted-skills path** — `target=codex`/`pi` (etc.) run rulesync + `adaptCommandToSkill`, writing `~/.agents/skills/sp-dev-idea/SKILL.md`. Grok **also** scans `~/.agents/skills/` (Skills 2.0 bag). Slash form: `/sp-dev-idea` (hyphen).

Result: dual slash surfaces for the same command file, empty `grok plugin list`, and no first-class install/verification for Grok. This confused operators into believing `/sp:dev-idea` was "missing" when the plugin form was registered but the adapted form was what autocomplete surfaced.

**Decision (Option A — chosen 2026-07-12).** Treat Grok like **Claude / OMP**: install the **native Claude-format plugin package** (`skills/`, `commands/`, `agents/`, `hooks/hooks.json`, optional MCP/LSP) via Grok's own plugin CLI — **do not** use command→skill adaptation as the primary path for Grok.

Evidence (Grok 0.2.93 docs + live `grok inspect --json`):

| Capability | Grok support |
|------------|--------------|
| Claude-format plugin layout | Native (`grok plugin validate` accepts `plugins/sp`) |
| `grok plugin install <src> --trust` | Native (git / GitHub / **local path**) |
| `grok plugin marketplace add\|list\|update` | Native |
| Plugin slash commands | `/plugin:command` (e.g. `/sp:dev-idea`) |
| Plugin agents | `sp:super-coder` as subagent types |
| Plugin hooks | Claude-compatible `hooks/hooks.json` + `GROK_PLUGIN_ROOT` |
| `~/.agents/skills` | Secondary — skills (and flat commands/) only, not full plugins |
| Claude-compat registry | On by default (`[compat.claude]`) |

Upstream context: `@gobing-ai/ts-ai-runner` is being extended for Grok as an executor agent; this task is the **superskill install** half so plugins land correctly for that runtime.

**Non-goals (this task).**

- Changing spur-new / `plugins/sp` content (except optional docs cross-links).
- Fixing `sp:super-reviewer` skill refs (`sp:anti-hallucination`, `sp:tasks`) — separate follow-up on the plugin corpus.
- Removing Claude-compat loading in Grok (Grok product behavior).
- Making Codex/Pi stop using `~/.agents` (they still need adaptation).
- Adding Grok as a rulesync `ToolTarget` (Grok is outside rulesync, like `claude`/`omp`).
### Requirements
R1. **Add `grok` to the superskill target taxonomy.**  
    `packages/core/src/targets.ts` `TARGETS` includes `'grok'`. Type `Target` and all
    exhaustive switches (or maps that must list every target) compile.  
    - `TARGET_TO_RULESYNC` / `TARGET_TO_RULESYNC_HOOKS` / `TARGET_SKILLS_RELDIR` /
      `TARGET_GLOBAL_SKILLS_RELDIR`: **omit** `grok` (no rulesync path — same pattern as
      `claude` and `omp`).  
    - `TARGET_TO_AGENT_NAME.grok`: map to the ts-ai-runner `AgentName` for Grok once
      available upstream; until then document the interim mapping (see Design R1 note)
      and keep compile-green with a typed cast or provisional id agreed in Design.  
    - `parseTargets` accepts `grok` and rejects unknown names with the updated valid list.  
    - Unit tests in `packages/core/tests/targets.test.ts` assert membership and map shape.

R2. **Exclude `grok` from rulesync generation.**  
    In `apps/cli/src/commands/install.ts`, `rulesyncTargets` filters out `grok` alongside
    `claude`, `hermes`, and `omp` (current filter ~line 166). Grok must never receive
    `adaptCommandToSkill` / `adaptSubagentToSkill` skill dumps for plugin commands/agents
    as its *install* path.

R3. **Native Grok install dispatch (mirror Claude/OMP).**  
    When `target === 'grok'`, superskill:
    1. Resolves marketplace root + name (same `resolvePluginRoot` / resolution metadata as
       Claude).
    2. Registers the marketplace with Grok: `grok plugin marketplace add <marketplaceRoot>`
       (or equivalent if CLI requires path/URL form — verify against `grok plugin marketplace
       add --help` at implement time).
    3. Installs the plugin with trust: prefer
       `grok plugin install <plugin>@<marketplaceName> --trust` if supported; otherwise
       `grok plugin install <pluginRoot-or-source> --trust` per live CLI contract.
    4. Is **idempotent**: re-running install must not fail hard when marketplace/plugin
       already exists (match OMP lesson from task 0073: remove/re-add/`--force` or
       document Grok's actual exit codes and handle them).
    5. Supports dry-run (no spawn) and verbose echo lines consistent with Claude/OMP.
    Inject via DI: `dependencies.runGrokInstall ?? defaultRunGrokInstall` (testable).

R4. **No post-install dialect rewrite for Grok commands (default).**  
    Grok consumes Claude-format `/plugin:command` slash dialect. Unlike OMP (task 0073 R4),
    **do not** run `translateSlashCommands(..., 'omp')` or hyphen-rewrite on
    `commands/*.md` for Grok unless live dogfood proves a dialect gap. Hooks ship as
    Claude `hooks/hooks.json` inside the plugin — **no** pi-style shim, **no** OMP
    `hooks/pre|post` JS generation.

R5. **Post-install verification helpers (testable).**  
    Provide helpers (exported for tests) that:
    - Resolve the installed plugin root Grok is using (prefer `grok plugin list --json` /
      inspect output; fallback: known install locations `~/.grok/plugins/`, or Claude-compat
      path only if Grok install deliberately shares it — **prefer Grok-native locations**).
    - Optionally run `grok plugin validate <installPath>` and/or parse
      `grok inspect --json` to assert plugin name appears and command stems are present.
    Document exact CLI JSON shapes discovered at implement time in Solution.

R6. **Dual-path hygiene documentation + guardrail.**  
    - README / CHANGELOG / install help text: state that Grok is a first-class target
      using native plugins; slash form is `/plugin:command`; `/plugin-command` adapted
      skills in `~/.agents` are for Codex/Pi and may still appear in Grok if those targets
      were also installed — operators should prefer colon form for plugin commands.
    - **Soft guardrail (implement if low-cost):** when install targets include **both**
      `grok` and a rulesync target that adapts commands, verbose mode warns that dual
      slash names will appear in Grok. Hard suppression of adapted skills when Grok is
      present is **out of scope** (would break Codex/Pi shared `~/.agents`).

R7. **Tests and golden path.**  
    - Unit: `parseTargets` includes `grok`; dispatch calls `runGrokInstall` and does not
      call `runRulesync` for grok-only installs.
    - Mocked spawn suite for `defaultRunGrokInstall` (marketplace add + install --trust),
      including idempotent re-install behavior.
    - Integration or sandboxed golden path (when `grok` binary available):  
      `superskill install <fixture-plugin> --targets grok --marketplace …` exit 0;  
      `grok inspect --json` (or plugin list) shows the plugin; at least one
      `commands/*.md` stem is discoverable as user-invocable under the plugin namespace.
    - Full suite remains green: `bun run lint`, `bun run test` (≥90/90 coverage gates),
      `bun run build`.

R8. **ts-ai-runner / AgentName coordination — RESOLVED (ts-ai-runner 0.4.8, 2026-07-12).**  
    `@gobing-ai/ts-ai-runner@0.4.8` now exports `AgentName` **including `'grok'`** (verified:
    `bun pm why @gobing-ai/ts-ai-runner` → 0.4.8 for both workspace packages; a
    `const x: AgentName = 'grok'` probe typechecks clean in `packages/core`). Wire
    `TARGET_TO_AGENT_NAME.grok = 'grok'` **directly** — no cast, no provisional id, no
    blocked-dependency note. The version is pinned once in the **root `package.json`
    `workspaces.catalog`** (`^0.4.8`); `apps/cli` and `packages/core` reference it via
    `"catalog:"` (centralized 2026-07-12 — see R10).  
    - **Dialect caveat (load-bearing for R4):** in 0.4.8, `translateSlashCommand('grok', …)`
      resolves through the **"all others"** branch → `/plugin-command` (hyphen), the
      `~/.agents` adapted-skills form — **not** Grok's native plugin colon form
      `/plugin:command`. This is exactly why R4 forbids running `translateSlashCommands` on
      the grok install path. The `TARGET_TO_AGENT_NAME.grok` mapping is therefore
      **type-completeness only**; it must NEVER drive slash translation for grok, or the
      native colon commands would be corrupted to hyphen form. Assert this in a test (grok
      never reaches the translate step on the install path).  
    - ts-ai-runner 0.4.8's grok support is the **executor** half (a `grok` CLI run-shim:
      headless `-p`/`--single`; auth via `XAI_API_KEY` / `~/.grok/auth.json`). The
      **install/dialect** half is what this task owns; the two are independent.

R9. **Upstream escape hatch — never block on ts-libs.**  
    If ts-ai-runner 0.4.8's grok support proves insufficient at implement time (e.g. grok
    needs an explicit colon-dialect case rather than the "all others" hyphen fallback, or a
    grok executor/plugin capability is missing), do **not** stall the task:  
    1. `bun link` the local source — `cd ~/xprojects/ts-libs/packages/ai-runner && bun link`,
       then `bun link @gobing-ai/ts-ai-runner` in this repo — to develop against the source
       tree and bypass the published-package boundary.  
    2. Make the enhancement in `~/xprojects/ts-libs/packages/ai-runner/src`, verify it against
       superskill locally, and continue 0078 unblocked.  
    3. After 0078 lands, bump + release ts-libs (new `@gobing-ai/ts-*` version), then re-pin
       the **root catalog** to the new version and `bun unlink` / reinstall so the published
       artifact is the shipped dependency. Record any ts-libs change (file + rationale) in
       this task's Solution and open/point to a ts-libs follow-up for the release.  
    Rule: superskill work is never blocked by an upstream gap — link, enhance, ship
    superskill, release upstream after.

R10. **Shared `@gobing-ai/ts-*` version is centralized (prerequisite — DONE 2026-07-12).**
    The intended version for `@gobing-ai/ts-ai-runner` / `ts-db` / `ts-utils` lives in **one**
    monorepo SSOT: the root `package.json` `workspaces.catalog` (`^0.4.8`). Private workspaces
    (e.g. `packages/core`) reference `"catalog:"`. The **published** package `apps/cli` pins
    **concrete versions matching the catalog** (e.g. `"^0.4.8"`) so task-0074
    `check-publish-manifest` / npm publish stay valid — npm consumers cannot resolve `catalog:`.
    Version bumps edit the root catalog first, then re-pin `apps/cli` to the same semver range.
    `bun pm why @gobing-ai/ts-ai-runner` resolves to the catalog version for both workspaces.
### Acceptance Criteria
AC1. `TARGETS` includes `grok`; `superskill install --help` / error text for bad targets lists `grok`.

AC2. `superskill install <plugin> --targets grok --marketplace <path>` (or project-default marketplace resolution) exits 0 on a machine with `grok` on PATH (or DI-mocked in CI).

AC3. After install, `grok plugin list` and/or `grok inspect --json` shows the plugin as enabled/discovered with a Grok-owned or Grok-documented install path (not "only via empty grok list + accidental Claude cache").

AC4. Plugin `commands/*.md` are available as **colon-namespaced** slash skills
    (`/plugin:command`), verified via `grok inspect --json` skill entries where
    `source.plugin_name == <plugin>` and `source.path` contains `/commands/`.

AC5. Install path does **not** create or require `~/.agents/skills/<plugin>-<cmd>/` for Grok-only installs (no adaptCommandToSkill for the grok target).

AC6. Hooks remain Claude-format under the plugin's `hooks/`; no OMP JS modules and no pi `.omp/hooks.json` emission for the grok target.

AC7. Re-running the same install is idempotent (exit 0 or documented non-fatal path).

AC8. Unit + integration tests for R1–R5/R7 pass; monorepo `bun run lint`, `bun run test`, `bun run build` green.

AC9. CHANGELOG (and brief README install section if one lists targets) documents Grok as a native plugin target and the dual-path warning for mixed installs.

AC10. `TARGET_TO_AGENT_NAME.grok === 'grok'` (typechecks against ts-ai-runner 0.4.8's `AgentName`, no cast); a test asserts the grok install path **never** calls `translateSlashCommands` (the `AgentName` mapping is type-completeness only — grok commands stay in native colon form, never rewritten to the "all others" hyphen dialect).

AC11. Root `package.json` `workspaces.catalog` pins `@gobing-ai/ts-*` at `^0.4.8` (monorepo SSOT).
    Private workspace `packages/core` uses `"catalog:"`. Published `apps/cli` pins concrete
    versions equal to the catalog range (not `catalog:`) so `check-publish-manifest` passes.
    `bun pm why @gobing-ai/ts-ai-runner` resolves to the catalog version for both workspaces.

AC12. If a ts-libs enhancement was needed (R9): the change is recorded in Solution with file + rationale, superskill builds green against the linked source, and a follow-up for the ts-libs version bump + catalog re-pin is noted. If no upstream change was needed, state that explicitly (R9 not exercised).
### Q&A
**Resolved (pre-create, 2026-07-12).**

**Q: Should Grok use Option A (native plugin) or Option B (Claude-compat only)?**  
A: Option A — native `grok` target. Operator decision after architecture review of Grok 0.2.93 discovery model vs superskill OMP/Claude install.

**Q: Should adapted command skills be deleted from `~/.agents` when installing for Grok?**  
A: No hard deletion in this task. Grok scans `~/.agents` for Codex/Pi shared skills; only warn on dual install (R6). Colon form remains the supported plugin command surface.

**Q: Slash dialect translation for Grok?**  
A: None by default (R4). Grok uses Claude `/plugin:command` form.

**Q: Relationship to ts-libs Grok AgentName work?**  
A: Parallel. This task owns superskill install; R8 coordinates the type map without blocking on full runner features.
### Design
**Architecture.**

```
superskill install <plugin> --targets grok
        │
        ├─ resolvePluginRoot (existing)
        ├─ mapPluginToRulesync (existing; used for other targets / hooks canonical)
        │
        └─ dispatch target === 'grok'  [NEW]
              ├─ defaultRunGrokInstall(marketplaceRoot, marketplaceName, plugin, global?)
              │     grok plugin marketplace add <root>
              │     grok plugin install <plugin>@<name> --trust   # verify flags live
              └─ (optional) resolveGrokInstallPath + validate/inspect probe
                    NO adaptCommandToSkill
                    NO translateSlashCommands to hyphen dialect
                    NO omp-hooks generation
```

Grok is a **native plugin peer of Claude and OMP**, not a rulesync consumer.

**R1 — Target taxonomy.** File: `packages/core/src/targets.ts`.

```ts
export const TARGETS = [
  'claude', 'codex', 'pi', 'omp', 'opencode',
  'antigravity-cli', 'antigravity-ide', 'hermes',
  'grok',  // NEW
] as const;
```

Maps:

| Map | `grok` entry |
|-----|----------------|
| `TARGET_TO_RULESYNC` | absent |
| `TARGET_TO_RULESYNC_HOOKS` | absent |
| `TARGET_SKILLS_RELDIR` | absent |
| `TARGET_GLOBAL_SKILLS_RELDIR` | absent |
| `TARGET_TO_AGENT_NAME` | `'grok'` if AgentName has it; else interim per R8 |

Tests: `packages/core/tests/targets.test.ts` — assert `TARGETS` contains grok; maps lack rulesync rows; AgentName mapping stable.

**R3 — Install helper (mirror 0073 / Claude).** File: `apps/cli/src/commands/install.ts`.

Add to `InstallDependencies`:

```ts
runGrokInstall?: (
  marketplaceRoot: string,
  marketplaceName: string,
  plugin: string,
  global: boolean,
) => Promise<void>;
```

`defaultRunGrokInstall` sketch (validate against live CLI at implement time):

```ts
export async function defaultRunGrokInstall(
  marketplaceRoot: string,
  marketplaceName: string,
  plugin: string,
  _global: boolean,
): Promise<void> {
  assertSafePathSegment(marketplaceName, 'marketplace name');
  // Idempotency: if marketplace add fails "already exists", tolerate (document exit codes).
  await runCheckedCommand(
    ['grok', 'plugin', 'marketplace', 'add', marketplaceRoot],
    'grok plugin marketplace add',
  );
  // Prefer marketplace-qualified install; fallback to path install of plugin root if needed.
  await runCheckedCommand(
    ['grok', 'plugin', 'install', `${plugin}@${marketplaceName}`, '--trust'],
    'grok plugin install',
  );
}
```

Dispatch (alongside `target === 'claude'` / `target === 'omp'` ~lines 262–318):

```ts
if (target === 'grok') {
  if (options.verbose) echo('Grok: registering marketplace and installing plugin...');
  if (!options.dryRun) {
    const marketplaceName = resolution.marketplaceName ?? 'superskill';
    const marketplaceRoot = resolution.marketplaceRoot ?? process.cwd();
    await runGrokInstallImpl(marketplaceRoot, marketplaceName, plugin, options.global);
  }
}
```

rulesyncTargets filter (~line 166):

```ts
const rulesyncTargets = targets.filter(
  (t) => t !== 'claude' && t !== 'hermes' && t !== 'omp' && t !== 'grok',
);
```

**R4 — Why no post-process.**

| Concern | Claude | OMP (0073) | Grok (this task) |
|---------|--------|------------|------------------|
| Slash dialect | `/plugin:cmd` | needs translate → omp dialect | `/plugin:cmd` native |
| Hooks | hooks.json | generate JS modules | hooks.json native |
| Manifest | cache as-is | may need `.claude-plugin/` | Grok validates root `plugin.json` (live `grok plugin validate plugins/sp` OK) |

If dogfood finds Grok requires a nested `.claude-plugin/plugin.json` like OMP, add a minimal `postInstallGrok` copy step — only if proven.

**R5 — Resolve install path.** Implement-time discovery order:

1. `grok plugin list --json` / `grok plugin details <name>` if structured output exists.
2. `grok inspect --json` → `.plugins[]` entry matching `name`.
3. Filesystem fallbacks: `~/.grok/plugins/`, project `.grok/plugins/` (document actual layout).

Do **not** treat Claude cache as the success criterion for the grok target (compat may still load it, but native install must stand alone).

**R6 — Dual-path warning.** When `targets` includes `grok` AND any of `codex|pi|opencode|antigravity-*` (rulesync skill writers):

```
Warning: installing both grok (native plugin slash /plugin:cmd) and rulesync targets
that adapt commands into ~/.agents/skills (slash /plugin-cmd). Grok scans both; prefer
colon form for plugin commands.
```

**R8 — AgentName provisional strategy.**

1. Check installed `@gobing-ai/ts-ai-runner` types for `AgentName` union.
2. If `grok` present → map 1:1.
3. If absent → either temporary map to `'claude'` **only if** no dialect translation runs for grok (preferred interim: never call translate for grok), **or** bump ts-libs dependency in the same PR if grok AgentName already merged upstream.
4. Record chosen interim in Solution + CHANGELOG.

**Test plan (files).**

| File | Purpose |
|------|---------|
| `packages/core/tests/targets.test.ts` | TARGETS + maps |
| `apps/cli/tests/commands/install.test.ts` | parseTargets, rulesync exclusion, dispatch DI |
| `apps/cli/tests/commands/install-grok-helpers.test.ts` | **new** — defaultRunGrokInstall spawn contract + idempotency |
| `apps/cli/tests/commands/install.integration.test.ts` | optional grok golden if binary present / skip otherwise |

**Risks.**

| Risk | Mitigation |
|------|------------|
| Grok CLI flags differ from docs | Live `--help` at implement; pin version in tests comments |
| Marketplace add non-idempotent | Soft-remove or tolerate exit 1 "already" like OMP 0073 |
| Grok loads Claude cache **and** native install → duplicate plugin names | Prefer single install path; document disable/compat if collision |
| CI without `grok` binary | DI mock unit tests; integration gated on `which grok` |
### Plan

1. [ ] Confirm live Grok CLI contracts: `grok plugin marketplace add --help`, `grok plugin install --help`, JSON list/details/inspect shapes; note version (`grok --version` / `~/.grok/version.json`). Capture findings in Solution.
2. [ ] Confirm `@gobing-ai/ts-ai-runner` `AgentName` for grok (R8); decide map or dep bump.
3. [ ] Add `'grok'` to `TARGETS` + map omissions + `TARGET_TO_AGENT_NAME` in `packages/core/src/targets.ts`; extend `packages/core/tests/targets.test.ts`.
4. [ ] Implement `defaultRunGrokInstall` + DI + dispatch branch + rulesync exclusion in `apps/cli/src/commands/install.ts`.
5. [ ] Add dual-path verbose warning (R6).
6. [ ] Add unit tests: `install-grok-helpers.test.ts` + extend `install.test.ts` / integration tests.
7. [ ] Sandbox or live golden path: install fixture or `cc`/`sp` plugin to grok; verify inspect JSON (AC3–AC5).
8. [ ] Docs: CHANGELOG entry; README/install help target list if present.
9. [ ] Gates: `bun run lint && bun run test && bun run build`.
10. [ ] Optional: `spur task record` / verify pipeline when executing this task via `/sp:dev-run`.

### Solution
**Live CLI contract (Grok 0.2.93, 2026-07-12)**

| Command | Behavior |
|---------|----------|
| `grok plugin marketplace add <path>` | OK first time; exit 1 `"already configured"` on re-add |
| `grok plugin install <source> --trust` | Source = git URL / GitHub shorthand / **local path** — **not** `plugin@marketplace` |
| Re-install same path | exit 1 `"repo '…' already installed"` → uninstall-first for idempotency |
| `grok plugin list --json` | Array of `{status,name,repo_key,version,path,source,marketplace}` under `~/.grok/installed-plugins/<repo_key>` |

**R9 not exercised** — `@gobing-ai/ts-ai-runner@0.4.8` already exports `AgentName` including `'grok'`. Root catalog pins `^0.4.8`; published `apps/cli` keeps concrete `^0.4.8` (not `catalog:`) so `check-publish-manifest` stays green. `packages/core` (private) continues to use `catalog:`.

**R8 dialect caveat confirmed:** `translateSlashCommand('grok', '/sp:x')` → `/sp-x` (hyphen). Install path never calls `translateSlashCommands` on plugin content; installs `pluginRoot` as-is.

**Change-map**

| File | What / why |
|------|------------|
| `packages/core/src/targets.ts` | Add `'grok'` to `TARGETS`; `TARGET_TO_AGENT_NAME.grok = 'grok'`; omit rulesync maps |
| `apps/cli/src/commands/install.ts` | `runGrokInstall` DI, rulesync exclusion, dual-path warning, dispatch, helpers |
| `apps/cli/package.json` | Pin `@gobing-ai/ts-*` to `^0.4.8` (publishable) |
| `package.json` catalog | `@gobing-ai/ts-*` → `^0.4.8` |
| Tests | `targets.test.ts`, `slash-command.test.ts`, `install-grok-helpers.test.ts`, `install.test.ts` |
| `CHANGELOG.md` / `README.md` | Grok native target + dual-path note |

**Gates:** `bun run lint` / `bun run test` (1396 pass) / `bun run build` / `check-publish-manifest` all green.

**Out of scope:** no command→skill adapt for grok; no OMP hook JS; no hard suppression of dual `~/.agents` skills (R6 soft warn only).

**Close-out (2026-07-12).** AC11/R10 reworded to publish-safe catalog SSOT. Re-verify **PASS**. `testing → done` with `SPUR_PROVENANCE_OVERRIDE=1` (agent-driven chain, no `task-pipeline.yaml` run id).
### Testing
**Per-requirement traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | MET | `packages/core/src/targets.ts`; `packages/core/tests/targets.test.ts` |
| R2 | MET | rulesync filter excludes grok; install tests |
| R3 | MET | `defaultRunGrokInstall` + dispatch; live golden + DI tests |
| R4 | MET | path install; no translate on install path |
| R5 | MET | `resolveGrokInstallPath*` helpers + tests |
| R6 | MET | dual-path warning + README/CHANGELOG |
| R7 | MET | lint / 1396 tests / build green |
| R8 | MET | `TARGET_TO_AGENT_NAME.grok === 'grok'`; no install translate |
| R9 | MET | not exercised; ts-ai-runner 0.4.8 has grok |
| R10 | MET | catalog `^0.4.8`; core `catalog:`; cli concrete `^0.4.8`; publish-manifest pass |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| AC1 | MET | test | TARGETS + parseTargets include grok |
| AC2 | MET | command | live install + DI tests exit 0 |
| AC3 | MET | command | live list/inspect shows plugin |
| AC4 | MET | command | inspect skill path contains `/commands/` |
| AC5 | MET | test | grok not in rulesyncTargets |
| AC6 | MET | static-ref | no omp-hooks on grok path |
| AC7 | MET | test + command | uninstall-then-install; live re-run |
| AC8 | MET | command | lint/test/build green |
| AC9 | MET | static-ref | CHANGELOG + README |
| AC10 | MET | test | AgentName + no install translate |
| AC11 | MET | static-ref + command | catalog SSOT + cli pin + publish-manifest |
| AC12 | N/A | static-ref | R9 not exercised |

**Design conformance:** native install DONE; path form CHANGED (live CLI, goal-equivalent); R10 publish-safe DONE.

**Coverage:** suite aggregate ≥90/90 via full `bun run test`.
### References
**Code (superskill).**

- `packages/core/src/targets.ts` — TARGETS taxonomy
- `apps/cli/src/commands/install.ts` — install dispatch, Claude/OMP/Grok native install
- `apps/cli/src/omp-hooks.ts` — OMP-only; **not** used for Grok
- `packages/core/src/pipeline/adapt-command.ts` — must not run for grok install path
- `packages/core/src/pipeline/slash-command.ts` — dialect translation (not for grok install)
- `apps/cli/tests/commands/install-grok-helpers.test.ts` — Grok helper tests
- `docs/tasks/0073_enhance-superskill-install-to-support-omp-targets-as-native-.md` — parallel native-plugin task

**Grok product docs (operator machine).**

- `~/.grok/docs/user-guide/08-skills.md`, `09-plugins.md`, `10-hooks.md`, `05-configuration.md`
- `~/.grok/README.md` — Claude-compat loading
- Live probes: `grok plugin validate`, `grok inspect --json`, `grok plugin list`

**Prior incident / motivation.** Dual slash forms `/sp:dev-idea` (plugin) vs `/sp-dev-idea` (`~/.agents` adapted skill) when diagnosing spur-new `plugins/sp` visibility in Grok (2026-07-12).
### History
- 2026-07-12T07:17:57.279Z backlog → todo (system)
- 2026-07-12T18:30:18.834Z todo → wip (system)
- 2026-07-12T18:30:19.033Z wip → testing (system)
- 2026-07-12T18:34:24.297Z testing → done (system)
