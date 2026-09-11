# Native Claude Code (`cc`) Marketplace Pilot & Verification

| Field | Value |
|-------|-------|
| Status | Verified Pilot & Canonical Documentation |
| Date | 2026-09-10 |
| Host | Claude Code CLI `2.1.267` (`Darwin arm64`) |
| Plugin | `cc` version `0.3.23` via marketplace `superskill` |
| Primary Landing | [`README.md`](../../README.md) & [`docs/help/installation.md`](./installation.md) |
| Authoritative Specs | [`docs/superskill_discovery_channel_SPEC.md`](../superskill_discovery_channel_SPEC.md), [`docs/00_ADR.md`](../00_ADR.md) |

---

## 1. Executive Summary & Architectural Boundaries

This document records the design, implementation boundaries, and empirical verification of the **native Claude Code (`cc`) marketplace pilot**. It reconciles the operator landing path, proves native discovery and installation on Claude Code, and codifies the architectural distinction between native host marketplace discovery and cross-host CLI placement.

### Core Architectural Invariant

> **Marketplaces discover the installer; writers place skills; host registration and per-Bot enablement remain host responsibilities.**

1. **Superskill CLI is a cross-host conversion and placement engine**: It resolves Claude-style plugin packages (`cc`, `sp`, `kk`) and uses per-target writers to place skills, commands, subagents, magents, hooks, and rules into target agent filesystems.
2. **Marketplace installation and registration are host responsibilities**: Adding a marketplace or installing a plugin via native host mechanisms (`claude plugin marketplace add`, `claude plugin install`) is executed by the host runtime.
3. **Filesystem placement ≠ Bot slash-menu visibility**: Placing skill files into a host directory (e.g. Grok Bot's `<sandRoot>/workflows/`) does not automatically grant slash-menu visibility in chat GUIs. Host registration (consuming registration manifests) and per-Bot enablement (e.g. in Settings > Plugins > Yours) require distinct host-side actions.
4. **MCP Gateway is Deferred**: An MCP gateway wrapper (`@gobing-ai/superskill-mcp`) is **deferred** and is **not a prerequisite** for plugin distribution.

### Deferred MCP Gateway Trigger Conditions

The proposed `@gobing-ai/superskill-mcp` gateway server remains deferred until:
1. A target host marketplace strictly requires an MCP connector catalog format without supporting filesystem or git plugin repositories;
2. A remote multi-host execution environment (e.g. a centralized managed connector hub) is deployed where local CLI execution is disallowed;
3. Concrete operator demand demonstrates that calling an MCP tool (`install_plugin`) inside chat is preferred over native host plugin management or CLI installation.

---

## 2. Reconciled Canonical Landing Path

To prevent fragmentation and conflicting instructions across documentation sites, the landing workflow is unified into two complementary documents:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Universal Landing Entry: README.md                                         │
│ • What superskill is (multi-agent plugin & content distribution CLI)        │
│ • Fast installation: npm i -g @gobing-ai/superskill / bun add -g            │
│ • Zero-clone distribution: superskill install cc --magent team-stark-children│
│ • Supported agents summary table & command reference                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ deep link for details
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ In-Depth Operational Guide: docs/help/installation.md                       │
│ • Prerequisites & toolchain (Bun ≥ 1.3.14, proto)                           │
│ • Global npm/bun package installation vs source builds                      │
│ • Native host marketplace installation (Claude Code, OMP, Grok)             │
│ • Cross-host CLI placement commands (all 10 targets)                        │
│ • Diagnostics & troubleshooting (superskill doctor, PATH issues)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

Both landing paths agree on supported CLI flags, valid target IDs, and avoid duplicating conflicting installation logic.

---

## 3. Complete Operator Path (Claude Code Pilot)

The native marketplace pilot exercises the end-to-end operator journey on Claude Code:

### Step 1: Marketplace Discovery
The operator configures or discovers the marketplace source:
- **Remote repository**:
  ```bash
  claude plugin marketplace add gobing-ai/superskill
  ```
- **Local repository / checkout**:
  ```bash
  claude plugin marketplace add /path/to/superskill
  ```
- **Verify listing**:
  ```bash
  claude plugin marketplace list
  ```
  The host displays `superskill` as an available marketplace.

### Step 2: Native Installation
The operator installs the `cc` plugin from the configured marketplace:
- **Command line**:
  ```bash
  claude plugin install cc@superskill --scope user
  ```
  *(Or `--scope project` for project-level isolation in `.claude/`)*
- **Verify installation & component inventory**:
  ```bash
  claude plugin list
  claude plugin details cc@superskill
  ```
  Claude Code reports:
  - 23 Skills (e.g., `skill-add`, `agent-add`, `anti-hallucination`, `cc-skills`)
  - 5 Agents (`expert-magent`, `expert-hook`, `expert-command`, `expert-agent`, `expert-skill`)
  - 1 Hook (`Stop` hook)
  - Projected token cost (~2,258 tokens always-on)

### Step 3: Invocation of Installed Capabilities
Inside a Claude Code session, the installed skills, slash commands, and subagents are directly invocable:
- `/cc-skill-add` or `/skill-add`: Scaffolds a new skill.
- `/cc-anti-hallucination`: Activates evidence-first verification protocol.
- `/expert-agent`: Dispatches to the expert agent subagent persona.

### Step 4: Update and Idempotent Reinstallation
When upstream changes or new releases occur:
- **Refresh marketplace**:
  ```bash
  claude plugin marketplace update superskill
  ```
- **Update plugin**:
  ```bash
  claude plugin update cc@superskill
  ```
- **Controlled reinstall / idempotency check**:
  Running `claude plugin install cc@superskill --scope user` over an existing installation completes cleanly without corrupting component manifests.

---

## 4. Trust, Source Provenance, and Target Scope

### 4.1 Trust and Source Verification
- **Claude Code Native**: Verified against `.claude-plugin/marketplace.json` in the root repository. Plugin source points to `./plugins/cc`.
- **Superskill CLI**: Writes an install manifest receipt (`.superskill-manifest.json`, schema v1) containing SHA-256 hashes of all installed files and the ADR-031 `canonicalHash`.
- **Sand / Grok Bot**: Writes `.superskill-origin.json` marker files with schemaVersion 1 to establish directory ownership and avoid accidental overwrites of foreign workflows.

### 4.2 Target Selection & Scope
- Supported Targets: `claude`, `codex`, `pi`, `omp`, `grok`, `opencode`, `antigravity-cli`, `antigravity-ide`, `hermes`, and opt-in `grok-bot`.
- Scope:
  - `--scope user` (Claude Code) / global default (Superskill CLI): Writes to `$HOME`.
  - `--scope project` (Claude Code) / `--no-global` (Superskill CLI): Writes to `./` workspace root.
- Dry-Run Support:
  ```bash
  superskill install cc --dry-run --verbose
  ```
  Previews all transformations, rulesync mappings, and target write paths without modifying the filesystem.

### 4.3 Three-Tier Lifecycle Model

| Tier | Lifecycle Stage | Responsibility | Mechanism |
|------|-----------------|----------------|-----------|
| **1. Content Installation** | Placement of skill/command files onto disk | Superskill CLI / Host Package Manager | Per-host writers, `rulesync`, `claude plugin install` |
| **2. Host Registration** | Registration into host slash command catalog | Target Host Platform | Reading manifests, `claude plugin` registry, or Grok Bot register handoff |
| **3. Per-Bot / Session Enablement** | Enabling plugin for specific bot/conversation | Operator / Host GUI | Claude `/plugin enable`, Grok Bot `Settings > Plugins > Yours` |

---

## 5. Host & Surface Matrix + Honest Limitations

| Host Target | Native Marketplace Route | Superskill CLI Route | Entity Surface | Honest Limitations |
|-------------|--------------------------|----------------------|----------------|--------------------|
| **Claude Code** | `claude plugin install cc@superskill` | `superskill install cc --targets claude` | Skills, Commands, Agents, Hooks | Native plugin installer requires local `claude` CLI on PATH. |
| **Codex** | Via configured plugin source | `superskill install cc --targets codex` | Skills (`~/.agents/skills/`), Prompts, Agents | Commands/subagents adapted to Skills 2.0; hooks omitted (unsupported). |
| **Pi** | Via native `extensions.pi` | `superskill install cc --targets pi` | Skills, Prompts, Native Agents, Extensions | Native agents placed in `~/.pi/agent/agents/`; hooks use extension format. |
| **omp** | `omp plugin install` | `superskill install cc --targets omp` | Skills, Commands, Agents, Extensions | Native plugin tree cache; rulesync fallback for shared skills. |
| **Grok** | `grok plugin install` | `superskill install cc --targets grok` | Skills, Native Plugin Tree | Native colon slash `/cc:cmd` vs hyphen `/cc-cmd`; prefer colon form. |
| **OpenCode** | Via config sources | `superskill install cc --targets opencode` | Skills, Commands, Agents | Standard rulesync output to `~/.config/opencode/`. |
| **Antigravity CLI** | Ambient config discovery | `superskill install cc --targets antigravity-cli` | Skills (`~/.gemini/antigravity-cli/skills/`), Hooks | Commands/subagents dropped by rulesync; hooks emitted to `.agents/hooks.json`. |
| **Antigravity IDE** | Workspace plugin | `superskill install cc --targets antigravity-ide` | Skills (`~/.gemini/config/skills/`), Workflows, Hooks | Two-pass rulesync: skills via codexcli, hooks via antigravity-ide. |
| **Hermes** | File discovery | `superskill install cc --targets hermes` | Skills (`~/.hermes/skills/`), Hooks (`HOOK.yaml`) | Surrogate copy from opencode; hooks adapted to HOOK.yaml format. |
| **Grok Bot (Opt-in)**| N/A (VPS Sand host) | `superskill install cc --targets grok-bot` | Workflows (`<sandRoot>/workflows/`) | **Filesystem placement only.** Excluded from `--targets all`. Slash registration requires host handoff; no VPS GUI testing from local runner. |

### Documented Limitations
- **No MCP Magic**: An MCP connector does not install skill files by itself; content must be placed via host plugins or Superskill CLI.
- **Grok Bot GUI Visibility**: Writing files to `<sandRoot>/workflows/` does not automatically register commands in Grok Bot's chat UI. Operators must consume `<sandRoot>/.superskill/grok-bot/register/<plugin>.json` and enable the plugin in Bot Settings.
- **Unavailable VPS Checks**: Testing Grok Bot VPS execution in this local environment is simulated via filesystem verification (`SAND_DATA`); live cloud VPS verification requires deployed host credentials.

---

## 6. Reproducible Verification Evidence (Date: 2026-09-10)

All evidence collected on macOS (`Darwin 25.3.0 arm64`) with Bun `1.3.14` and Claude Code `2.1.267`:

| Step | Host / Target | Command / UI Action | Expected Result | Observed Result | Evidence Link |
|------|---------------|---------------------|-----------------|-----------------|---------------|
| **1. CLI Health** | Superskill CLI | `superskill --version` | Outputs `0.3.23` | `0.3.23` (exit code 0) | Host PATH |
| **2. Host Discovery** | Claude Code | `claude plugin marketplace list` | `superskill` listed with path source | `❯ superskill (Source: Directory /Users/robin/xprojects/superskill)` | `claude plugin marketplace list` |
| **3. Host Install** | Claude Code | `claude plugin list` | `cc@superskill` is enabled | `❯ cc@superskill Version: 0.3.23 Scope: user Status: ✔ enabled` | `claude plugin list` |
| **4. Component Audit** | Claude Code | `claude plugin details cc@superskill` | 23 skills, 5 agents, 1 hook, projected tokens | Exactly 23 skills, 5 agents, 1 hook (Stop), ~2,258 always-on tokens | `claude plugin details cc@superskill` |
| **5. Cross-Host Dry-Run** | Multi-target | `superskill install cc --dry-run --verbose` | Resolves `cc`, maps 10 targets, simulates writes | Clean dry-run exit 0, maps skills, rules, and scripts | `superskill install cc --dry-run` |
| **6. Provenance Check** | Multi-target | `superskill update cc --check` | Reports up to date | `cc: up to date` (exit code 0) | `superskill update cc --check` |
| **7. Bot Isolation** | Grok Bot | `superskill doctor --targets grok-bot` | Fails without Sand root; passes when SAND_DATA set | Exit 1 with actionable error when unset; Exit 0 with valid JSON when SAND_DATA configured | `superskill doctor --targets grok-bot` |

---

## 7. References & Authoritative Documentation

- **Project ADRs**:
  - `ADR-010`: Target installation roots and global vs project derivation.
  - `ADR-031`: Length-framed canonical hashing for plugin content.
  - `ADR-034`: Marketplace locator resolution and GitHub shorthand.
  - `ADR-035`: Pull-model update visibility via install-time provenance manifest.
  - `ADR-036`: Opt-in `grok-bot` target and Sand data root architecture.
  - `ADR-037`: Target customizations and internal post-install action mechanisms.
- **Specifications**:
  - [`docs/superskill_discovery_channel_SPEC.md`](../superskill_discovery_channel_SPEC.md): Discovery channel architecture & deferred MCP gateway.
  - [`docs/superskill_grok_bot_target_SPEC.md`](../superskill_grok_bot_target_SPEC.md): Grok Bot target design.
- **Host Documentation**:
  - [Claude Code Plugin System](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/plugins)
  - [OpenAI Codex Plugin Management](https://developers.openai.com/codex/enterprise/plugin-management)
  - [Grok Build Plugin Guide](https://github.com/xai-org/grok-build)
  - [Grok Bot Skills & Routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)
