# `superskill install`

Distribute a Claude Code plugin's skills, commands, subagents, **magents** (main-agent configs), hooks, and MCP config to any supported target coding agent. Hooks are routed through a separate rulesync pass so each target reaches its native hook generator.

## How to use it

### Synopsis

```
superskill install [options] <plugin>
```

### Arguments and options

| Argument / Option | Description | Default |
|-------------------|-------------|---------|
| `<plugin>` | Plugin name to install (required). Resolved via marketplace manifest or `plugins/<name>/`. | — |
| `--marketplace <path>` | Path to `.claude-plugin/marketplace.json` or its containing directory. | CWD's `.claude-plugin/` |
| `--targets <list>` | Comma-separated target agents, or `all`. | all configured |
| `--no-global` | Install to project-level instead of user-level global directories. | `false` (global) |
| `--magent <name>` | Select which main-agent package under `magents/` to emit. Required when the plugin ships more than one; auto-selects when exactly one exists. | auto when unique |
| `--marketplace-source <mode>` | Marketplace registration source for host CLIs (Claude/Grok/OMP): `directory` (local path, default) or `github` (`owner/repo` slug from known remotes; unknown names fall back to path). | `directory` |
| `--dry-run` | Preview the install without writing files. | `false` |
| `--verbose` | Print each pipeline step and file copy. | `false` |

### Examples

```bash
# Install a plugin to every supported target (global, user-level)
superskill install cc --targets all

# Install to specific targets only
superskill install cc --targets codex,pi,antigravity-cli

# Install skills/hooks + emit the team-stark-children main agent
superskill install cc --magent team-stark-children --verbose

# Project-local main-agent files (CLAUDE.md / AGENTS.md at cwd)
superskill install cc --magent team-stark-children --no-global --targets claude,codex

# Preview what would be written, no filesystem changes
superskill install cc --targets all --dry-run --verbose

# GitHub-backed marketplace (recommended for operators):
superskill install cc --marketplace-source github --verbose
```

### Supported targets

| Target | Engine | Output location (global) |
|--------|--------|--------------------------|
| `claude` | `claude plugin install` CLI | Claude Code marketplace |
| `codex` | rulesync | `~/.agents/skills/` |
| `pi` | rulesync + superskill hook shim | `~/.agents/skills/` (+ `~/.pi/agent/agents/` for agents) |
| `omp` | native (reads `~/.agents/skills/`) + hook shim | `~/.agents/skills/` |
| `opencode` | rulesync | `~/.config/opencode/skills/` |
| `antigravity-cli` | rulesync | `~/.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | rulesync | `~/.gemini/config/skills/` |
| `hermes` | superskill copy (via `opencode` surrogate) | `~/.hermes/skills/` |
| `openclaw` | implicit (reads `~/.agents/skills/`) | Shared skills root — no dedicated dispatch |

## How it's implemented

The install command is a five-stage pipeline: **resolve → map → transform → generate → dispatch**. The entry point is `executeInstall()` in `apps/cli/src/commands/install.ts`.

### Architecture

```mermaid
flowchart TD
    subgraph Input
        P["Plugin name + marketplace"]
    end

    subgraph "Stage 1: Resolve"
        R["resolvePlugin<br/>(marketplace.ts)"]
        RF["Fallback: plugins/&lt;name&gt;/"]
    end

    subgraph "Stage 2: Map"
        M["mapPluginToRulesync<br/>(mapper.ts)"]
        RR[".rulesync/ canonical layout"]
    end

    subgraph "Stage 3: Transform"
        T["prepareTargetRulesyncInput<br/>per-target copy + markdown transforms"]
        TT["pipeline/<br/>adapt-command · adapt-subagent ·<br/>slash-command · rewrite-references · pi-subagent"]
    end

    subgraph "Stage 4: Generate"
        G["runRulesync<br/>(rulesync.ts)"]
        CL["claude plugin install<br/>(direct CLI)"]
    end

    subgraph "Stage 5: Dispatch"
        D["copy + hook emit<br/>for surrogate targets"]
        H["emitPiStyleHooks<br/>emitHermesHooks<br/>(hooks.ts)"]
    end

    P --> R
    R -->|found| M
    R -->|not found| RF
    RF --> M
    M --> RR
    RR --> T
    T --> TT
    TT --> G
    G --> D
    CL --> D
    D --> H
```

### Stage 1 — Resolve the plugin

`resolvePlugin()` (in `marketplace.ts`) parses the `.claude-plugin/marketplace.json` manifest with a Zod schema and returns the plugin root directory. If no marketplace is found, the install falls back to scanning `plugins/<name>/plugin.json`. If neither resolves, it throws with the list of available plugin names.

### Stage 2 — Map to the canonical `.rulesync/` layout

`mapPluginToRulesync()` (in `mapper.ts`) translates the Claude Code plugin directory into the `.rulesync/` canonical layout that `rulesync.generate()` expects:

| Plugin source | Canonical target |
|---------------|------------------|
| `skills/*.md` | `.rulesync/skills/<plugin>-<name>/SKILL.md` |
| `commands/*.md` | `.rulesync/commands/<plugin>-<name>.md` |
| `agents/*.md` | `.rulesync/subagents/<plugin>-<name>.md` |
| `magents/<name>/` | `.rulesync/magents/<plugin>-<name>/` (tree preserved; not downgraded to skills) |
| `hooks.json` | deep-merged into `.rulesync/hooks.json` |
| `mcp.json` | deep-merged into `.rulesync/mcp.json` |

Missing optional directories are handled gracefully — nothing is created for absent inputs.

### Magents (main-agent configs)

**Two discovery roots** (staged into `.rulesync/magents/`):

1. `plugins/<plugin>/magents/` — plugin-shipped packages (prefixed `<plugin>-<name>`).
2. Marketplace-root `magents/` — **mutable authoring SSOT** (bare `<name>`), e.g. `magents/team-stark-children/`.

**Selection (must stay correct for plugins with zero magents):**

| Situation | Behavior |
| --- | --- |
| No magents staged | Silent no-op (skills/hooks/rules still install). Verbose: “none staged”. |
| Exactly one **plugin-owned** package (`<plugin>-*`) | Auto-select. |
| Marketplace bare package(s) only | Require `--magent <name>` (never auto-install on `install sp` just because the monorepo has a persona). |
| Multiple packages, no `--magent` | Skip emission; verbose lists staged names. |
| `--magent <name>` | Require a match or fail loudly. |

After selection, emission:

1. **Claude import-style** (`CLAUDE.md` contains `@IDENTITY.md` etc.): copy modular package files + `CLAUDE.md` into dest (`~/.claude` global or project root). Claude expands `@` at session start.
2. **Other targets / non-import packages:** `assembleMagentContent` — multi-file concat `IDENTITY → SOUL → AGENTS → USER` (overrides win) or single-file `AGENTS.<target>.md`. Codex strips bare `@file` lines.
3. **Plugin rules:** copy `plugins/<plugin>/rules/*.md` into each target’s rules directory when one exists (claude → `.claude/rules/`; antigravity → `.agents/rules/`). Independent of `--magent`. Skip with a verbose note when the target has no rules folder.

Examples:

```bash
# Plugin with no magents (e.g. spur's sp): skills/hooks only — never fails on missing magent
superskill install sp --targets all

# Persona from monorepo magents/ (explicit)
superskill install cc --magent team-stark-children --verbose
```

### Stage 3 — Target-specific transforms

`prepareTargetRulesyncInput()` copies the canonical `.rulesync/` into a per-target root (`$sourceRoot/.targets/$target/.rulesync`) and applies target-specific markdown transforms via the `pipeline/` modules:

| Pipeline module | Transform | Applies to |
|-----------------|-----------|------------|
| `frontmatter-walk.ts` | Walk frontmatter blocks for adaptation stages | adapt-command, adapt-subagent |
| `adapt-command.ts` | Adapt command `.md` → Skills 2.0 skill entry (`disable-model-invocation: true`) | all non-Claude targets |
| `adapt-subagent.ts` | Adapt subagent `.md` → Skills 2.0 skill entry (model-invocable) | all non-Claude targets |
| `slash-command.ts` | Translate `/plugin-command` ↔ `/skill:` dialects | pi, omp, opencode, antigravity, hermes |
| `rewrite-references.ts` | Rewrite `<pluginPrefix>:name` → `<pluginPrefix>-name` (plugin-prefix-scoped) | all non-Claude targets |
| `pi-subagent.ts` | Convert subagent frontmatter to Pi native agent format | pi, omp |
Target-to-rulesync and target-to-agent-name mappings live in `targets.ts`. **Skills and hooks use separate maps** (task 0151): skills collapse Antigravity onto `codexcli` so all `~/.agents/skills/` readers share one copy; hooks must NOT share that routing, because rulesync ships native Antigravity hook generators that would emit codex-style files at the wrong path.

```mermaid
flowchart LR
    subgraph "TARGETS (superskill)"
        CL[claude] -.->|"no rulesync"| DIRECT[direct CLI]
        CX[codex] --> RCX[codexcli]
        PI[pi] --> RPI[codexcli]
        OC[opencode] --> ROC[opencode]
        AGCLI[antigravity-cli] --> RAGCLI[antigravity-cli]
        AGIDE[antigravity-ide] --> RAGIDE[antigravity-ide]
        OMP[omp] -.->|"surrogate"| RPI
        HE[hermes] -.->|"surrogate"| ROC
    end
    subgraph "TARGET_TO_RULESYNC (skills)"
        RCX
        RPI
        ROC
        RAGCLI
        RAGIDE
    end
```

```mermaid
flowchart LR
    CX[codex] --> RCX[codexcli]
    OC[opencode] --> ROC[opencode]
    AGCLI[antigravity-cli] --> RAGCLI[antigravity-cli]
    AGIDE[antigravity-ide] --> RAGIDE[antigravity-ide]
    subgraph "TARGET_TO_RULESYNC_HOOKS (hooks-only pass)"
        RCX
        ROC
        RAGCLI
        RAGIDE
    end
```

`omp` reuses `pi`'s rulesync output; `hermes` reuses `opencode`'s (ADR-010). Claude, omp, and hermes have no rulesync mapping and are skipped by `runRulesync()`. The hooks map omits `pi`/`omp`/`hermes` — those targets get hooks via the surrogate shim (pi-hooks format for pi/omp, verbatim copy for hermes).

### Stage 4 — Generate target outputs

Two generation paths:

1. **rulesync path** (`runRulesync` in `rulesync.ts`) — calls `rulesync.generate()` programmatically (not the CLI) with the mapped `ToolTarget` strings, the per-target input root, and `outputRoots` set to `homedir()` (global) or `process.cwd()` (project). rulesync writes skills, commands, subagents, and MCP configs to each target's native directory.

   **Two-pass hook routing (task 0151):** `hooks` is NOT carried in the main pass. The main pass carries `skills` (+ `mcp` when present) through the skills map (`TARGET_TO_RULESYNC`). When the plugin produced a canonical `hooks.json` (`mapResult.hooks`), a **second hooks-only pass** routes through `TARGET_TO_RULESYNC_HOOKS` so each Antigravity target reaches its own native hook generator (`antigravity-cli` → `.agents/hooks.json` project, `antigravity-ide` → `.gemini/config/hooks.json` global) instead of being collapsed onto `codexcli` (which would emit codex-style hook files at the wrong path). `pi`/`omp` have no rulesync hook target and are handled by the surrogate shim below; `hermes` gets `hooks.json` copied verbatim. A hookless plugin makes a single skills-only pass.

2. **Claude path** — spawns `claude plugin install <plugin>@local --path <pluginRoot>` directly, inheriting stdio.

### Stage 5 — Dispatch surrogate targets + emit hooks

For targets rulesync does not cover, superskill copies the surrogate's generated output and emits hooks:

- **`hermes`** — copies `opencode` rulesync skills to `~/.hermes/skills/`, then `emitHermesHooks()` copies the canonical `hooks.json` to `~/.hermes/hooks.json`.
- **`omp`** — reads skills from shared `~/.agents/skills/` natively; `emitPiStyleHooks()` converts canonical hooks to `@vahor/pi-hooks` format at `~/.omp/agent/hooks.json`.
- **`pi`** — rulesync emits skills (to `~/.agents/skills/`) but not hooks; `emitPiStyleHooks()` fills the gap with the `@vahor/pi-hooks` shim.

Hook emission results are always surfaced (no silent drop) — each `EmitHooksResult.message` is printed to stdout.

### Sequence diagram

```mermaid
sequenceDiagram
    participant User
    participant CLI as install.ts
    participant MP as marketplace.ts
    participant Map as mapper.ts
    participant Pipe as pipeline/
    participant RS as rulesync.ts
    participant H as hooks.ts
    participant FS as Filesystem

    User->>CLI: superskill install cc --targets codex,pi
    CLI->>MP: resolvePlugin(marketplace, "cc")
    MP-->>CLI: pluginRoot
    CLI->>Map: mapPluginToRulesync(pluginRoot, "cc", ".rulesync")
    Map->>FS: write .rulesync/{skills,commands,subagents,hooks,mcp}
    Map-->>CLI: MapResult counts

    loop each target
        CLI->>Pipe: prepareTargetRulesyncInput(".rulesync", target)
        Pipe->>FS: copy to .targets/<target>/.rulesync
        Pipe->>Pipe: apply frontmatter + slash + colon + pi-subagent
    end

    CLI->>RS: runRulesync([codex,pi], features, input, opts)
    RS->>RS: map to ToolTarget via TARGET_TO_RULESYNC
    RS->>FS: write skills/commands/subagents to ~/.agents, Pi dirs
    RS-->>CLI: GenerateResult counts

    CLI->>H: emitPiStyleHooks(pi rulesync dir, ~, ".pi", "pi")
    H->>FS: write ~/.pi/hooks.json (pi-hooks format)
    H-->>CLI: EmitHooksResult

    CLI-->>User: "Installed 'cc' to 2 target(s)."
```

### Key source files

| File | Role |
|------|------|
| `apps/cli/src/commands/install.ts` | Command registration, `executeInstall()` orchestration, target dispatch |
| `apps/cli/src/hooks.ts` | Canonical → Pi-hooks conversion; `emitPiStyleHooks` / `emitHermesHooks` |
| `packages/core/src/marketplace.ts` | Plugin resolution from marketplace manifest (Zod-validated) |
| `packages/core/src/mapper.ts` | Plugin → `.rulesync/` canonical layout mapping |
| `packages/core/src/rulesync.ts` | Thin programmatic wrapper over `rulesync.generate()` |
| `packages/core/src/targets.ts` | Target enum + `TARGET_TO_RULESYNC` (skills) / `TARGET_TO_RULESYNC_HOOKS` (hooks) / `TARGET_TO_AGENT_NAME` maps |
| `packages/core/src/pipeline/adapt-command.ts` | Adapt Claude Code command `.md` → Skills 2.0 skill entry |
| `packages/core/src/pipeline/adapt-subagent.ts` | Adapt Claude Code subagent `.md` → Skills 2.0 skill entry |
| `packages/core/src/pipeline/slash-command.ts` | Slash-dialect translation per target |
| `packages/core/src/pipeline/rewrite-references.ts` | Plugin-prefix-scoped `plugin:name` → `plugin-name` rewriting |
| `packages/core/src/pipeline/frontmatter-walk.ts` | Shared frontmatter-block walker for adapt-* stages |
| `packages/core/src/pipeline/pi-subagent.ts` | Subagent → Pi native agent frontmatter conversion |
| `packages/core/src/pipeline/pi-tools.ts` | Claude → Pi tool-name normalization |

### Design notes

- **ADR-010 (surrogate targets)** — `omp` and `hermes` have no rulesync engine of their own. They reuse `pi` and `opencode` rulesync output respectively, then superskill copies the generated files and emits target-specific hooks.
- **`outputRoots` is mandatory** — `runRulesync()` always passes `outputRoots: [homedir() | cwd()]`. Relying on rulesync's default (`process.cwd()`) would write to the wrong place.
- **Hooks are never silently dropped** — every `EmitHooksResult.message` is echoed, even in non-verbose mode, so the user knows what hook shims were installed.
- **`--dry-run`** propagates through rulesync (`dryRun: true`) and skips all filesystem copies and the `claude plugin install` spawn.
- **Two-pass hook routing (task 0151)** — Hooks ride in a separate rulesync pass through `TARGET_TO_RULESYNC_HOOKS`. The skills map collapses Antigravity onto `codexcli` (so all `~/.agents/skills/` readers share one copy), but reusing that routing for hooks would make rulesync emit codex-style hook files at the wrong path instead of the native `.agents/hooks.json` (Antigravity CLI, project) / `.gemini/config/hooks.json` (Antigravity IDE, global). The hooks-only pass runs only when the plugin produced a canonical `hooks.json`; a hookless plugin makes a single skills-only pass.

## Migration runbook: directory → github marketplace

Operators who registered `spur`/`superskill` as directory marketplaces before
`--marketplace-source github` existed can migrate with these steps:

```bash
# 1) Add GitHub-backed marketplaces (Claude)
claude plugin marketplace add gobing-ai/spur
claude plugin marketplace add gobing-ai/superskill

# 2) Verify clones materialized
ls ~/.claude/plugins/marketplaces/spur
ls ~/.claude/plugins/marketplaces/superskill
claude plugin marketplace list

# 3) Reinstall plugins so cache tracks the github checkout
claude plugin install sp@spur
claude plugin install cc@superskill

# 4) Remove directory registration if still present as a separate entry
#    Prefer `claude plugin marketplace remove` over hand-editing JSON.
claude plugin marketplace remove <old-directory-name>
#    If names collided and `add` converted in-place, `list` should show github source.

# 5) Align `~/.claude/settings.json` → `extraKnownMarketplaces` to github form
#    (or delete the directory keys and rely on `known_marketplaces.json`).

# 6) Grok: re-add marketplace per its live CLI contract,
#    then run `superskill install --marketplace-source github --targets grok`.

# 7) Restart agents; spot-check `/` commands and `plugin list`.
```

**Do not** hand-delete `known_marketplaces.json` keys without steps 1–3 above.
Removing directory entries before adding github sources breaks cache resolution
and `plugin@marketplace` IDs (see task 0086 R1).
