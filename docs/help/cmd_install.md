# `superskill install`

Distribute a Claude Code plugin's skills, commands, subagents, hooks, and MCP config to any supported target coding agent.

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
| `--dry-run` | Preview the install without writing files. | `false` |
| `--verbose` | Print each pipeline step and file copy. | `false` |

### Examples

```bash
# Install a plugin to every supported target (global, user-level)
superskill install rd3 --targets all

# Install to specific targets only
superskill install rd3 --targets codex,pi,antigravity-cli

# Preview what would be written, no filesystem changes
superskill install rd3 --targets all --dry-run --verbose

# Install to the current project instead of user home
superskill install rd3 --targets codex --no-global
```

### Supported targets

| Target | Engine | Output location (global) |
|--------|--------|--------------------------|
| `claude` | `claude plugin install` CLI | Claude Code marketplace |
| `codex` | rulesync | `~/.agents/skills/` |
| `pi` | rulesync + superskill hook shim | Pi native format |
| `omp` | superskill copy (via `pi` surrogate) | `~/.omp/agent/skills/` |
| `opencode` | rulesync | `~/.agents/skills/` |
| `antigravity-cli` | rulesync | `~/.gemini/antigravity-cli/skills/` |
| `antigravity-ide` | rulesync | `~/.gemini/config/skills/` |
| `hermes` | superskill copy (via `opencode` surrogate) | `~/.hermes/skills/` |

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
        TT["pipeline/<br/>frontmatter · slash-command ·<br/>rewrite-colons · pi-subagent"]
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
| `hooks.json` | deep-merged into `.rulesync/hooks.json` |
| `mcp.json` | deep-merged into `.rulesync/mcp.json` |

Missing optional directories are handled gracefully — nothing is created for absent inputs.

### Stage 3 — Target-specific transforms

`prepareTargetRulesyncInput()` copies the canonical `.rulesync/` into a per-target root (`$sourceRoot/.targets/$target/.rulesync`) and applies target-specific markdown transforms via the `pipeline/` modules:

| Pipeline module | Transform | Applies to |
|-----------------|-----------|------------|
| `frontmatter.ts` | Normalize frontmatter keys per target | all targets |
| `slash-command.ts` | Translate `/plugin-command` ↔ `/skill:` dialects | pi, omp, opencode, antigravity, hermes |
| `rewrite-colons.ts` | Rewrite `::` references to target-compatible form | pi, omp |
| `pi-subagent.ts` | Convert subagent frontmatter to Pi native agent format | pi, omp |

Target-to-rulesync and target-to-agent-name mappings live in `targets.ts`:

```mermaid
flowchart LR
    subgraph "TARGETS (superskill)"
        CL[claude] -.->|"no rulesync"| DIRECT[direct CLI]
        CX[codex] --> RCX[codexcli]
        PI[pi] --> RPI[pi]
        OC[opencode] --> ROC[opencode]
        AG[antigravity-cli/ide] --> RAG[antigravity-*]
        OMP[omp] -.->|"surrogate"| RPI
        HE[hermes] -.->|"surrogate"| ROC
    end
    subgraph "rulesync ToolTarget"
        RCX
        RPI
        ROC
        RAG
    end
```

`omp` reuses `pi`'s rulesync output; `hermes` reuses `opencode`'s (ADR-010). Claude, omp, and hermes have no rulesync mapping and are skipped by `runRulesync()`.

### Stage 4 — Generate target outputs

Two generation paths:

1. **rulesync path** (`runRulesync` in `rulesync.ts`) — calls `rulesync.generate()` programmatically (not the CLI) with the mapped `ToolTarget` strings, the per-target input root, and `outputRoots` set to `homedir()` (global) or `process.cwd()` (project). rulesync writes skills, commands, subagents, and MCP configs to each target's native directory.

2. **Claude path** — spawns `claude plugin install <plugin>@local --path <pluginRoot>` directly, inheriting stdio.

### Stage 5 — Dispatch surrogate targets + emit hooks

For targets rulesync does not cover, superskill copies the surrogate's generated output and emits hooks:

- **`hermes`** — copies `opencode` rulesync skills to `~/.hermes/skills/`, then `emitHermesHooks()` copies the canonical `hooks.json` to `~/.hermes/hooks.json`.
- **`omp`** — copies `pi` rulesync skills to `~/.omp/agent/skills/`, then `emitPiStyleHooks()` converts canonical hooks to `@vahor/pi-hooks` format at `~/.omp/agent/hooks.json`.
- **`pi`** — rulesync emits skills but not hooks; `emitPiStyleHooks()` fills the gap with the `@vahor/pi-hooks` shim.

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

    User->>CLI: superskill install rd3 --targets codex,pi
    CLI->>MP: resolvePlugin(marketplace, "rd3")
    MP-->>CLI: pluginRoot
    CLI->>Map: mapPluginToRulesync(pluginRoot, "rd3", ".rulesync")
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

    CLI-->>User: "Installed 'rd3' to 2 target(s)."
```

### Key source files

| File | Role |
|------|------|
| `apps/cli/src/commands/install.ts` | Command registration, `executeInstall()` orchestration, target dispatch |
| `apps/cli/src/marketplace.ts` | Plugin resolution from marketplace manifest (Zod-validated) |
| `apps/cli/src/mapper.ts` | Plugin → `.rulesync/` canonical layout mapping |
| `apps/cli/src/rulesync.ts` | Thin programmatic wrapper over `rulesync.generate()` |
| `apps/cli/src/targets.ts` | Target enum + `TARGET_TO_RULESYNC` / `TARGET_TO_AGENT_NAME` maps |
| `apps/cli/src/pipeline/*.ts` | Per-target markdown transforms (pure functions) |
| `apps/cli/src/hooks.ts` | Canonical → Pi-hooks conversion; `emitPiStyleHooks` / `emitHermesHooks` |

### Design notes

- **ADR-010 (surrogate targets)** — `omp` and `hermes` have no rulesync engine of their own. They reuse `pi` and `opencode` rulesync output respectively, then superskill copies the generated files and emits target-specific hooks.
- **`outputRoots` is mandatory** — `runRulesync()` always passes `outputRoots: [homedir() | cwd()]`. Relying on rulesync's default (`process.cwd()`) would write to the wrong place.
- **Hooks are never silently dropped** — every `EmitHooksResult.message` is echoed, even in non-verbose mode, so the user knows what hook shims were installed.
- **`--dry-run`** propagates through rulesync (`dryRun: true`) and skips all filesystem copies and the `claude plugin install` spawn.
