# Specification Matrix: Workspace Manifests, System Prompts, and Native Tooling Systems for Frontier Coding Agents

Designing a universal integration harness for coordinate-native programming agents requires mapping the boundaries where developer-specified instructions end and model execution engines begin. This analysis details the exact file-discovery pathways, system instruction-injection vectors, and native toolsets of nine frontier coding agents: Claude Code, OpenAI Codex CLI, Pi, Omp (Oh My Pi), OpenCode, Google Antigravity CLI, OpenClaw, Hermes Agent, and Grok Build.

---

## The Dual-Prompting Hierarchy: Architecture & Context Precedence

A terminal-native software agent operates on a clear separation of concerns between its workspace instructions (the **Main Agent Prompt**) and its cognitive orchestration rules (the **System Prompt**).

1. **The Workspace Manifest (Main Agent Prompt)**: Typically represented by `CLAUDE.md` or `AGENTS.md`, this file acts as a local manual checked into Git. It defines repository-specific build targets, linter triggers, style requirements, and architectural conventions. By checking this manifest into version control, teams ensure that all developers and any executing agents share the same codebase context.

2. **The Cognitive Baseline (System Prompt)**: Often configured via global files like `SYSTEM.md` or settings JSON profiles, this layer resides outside the repository git tree. It dictates the agent's core capabilities, tool-calling loop logic, fallback strategies, and permission thresholds. The system prompt controls how the model interprets terminal errors, when it must pause for human intervention, and how it handles files.

---

## Comprehensive Agent Prompt & Tooling Matrix

The following specification matrix displays the default configurations, ingestion rules, native tool namespaces, and security sandboxes of each agent runtime as of 2026:

| Agent           | Main Workspace Manifest | System Prompt Config                                         | Ingestion order                                  | Native Tools Namespace | Sandbox Boundary |
| --------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------ | ---------------------- | ---------------- |
| **Claude Code** | `CLAUDE.md`<br>         | `--append-system-prompt` / `--append-system-prompt-file`<br> | Global `~/.claude/` → Repo root → Subdirectories |

| `Bash`, `Read`, `Edit`, `Grep`, `Glob`, `LSP`, `Agent`, `Artifact`, `Monitor`, `NotebookEdit`, `EnterWorktree`, `AskUserQuestion`, `CronCreate`<br> | Post-facto Transcript Classifier

|
| **Codex** | `AGENTS.md` / `AGENTS.override.md`<br> | `model_instructions_file` path in `~/.codex/config.toml`<br> | Global `~/.codex/` → Project root down to CWD

| `shell`, `update_plan`, `web_search`, `mcp__*`<br> | Kernel-level (macOS Seatbelt, Linux Landlock + seccomp)

|
| **Pi** | `AGENTS.md` / `CLAUDE.md`<br> | `~/.pi/agent/SYSTEM.md` or local `.pi/SYSTEM.md`<br> | Global `~/.pi/` → parent folders walking up to root

| `Read`, `Write`, `Edit`, `Bash`<br> | None (Runs directly on host process)

|
| **Omp** | Unified Cursor, Cline, Codex, and Claude files

| Inherited Pi overrides + dynamic stream-rules

| Scans and merges multiple formats from disk

| `read`, `write`, `edit`, `ast_edit`, `ast_grep`, `bash`, `eval`, `lsp`, `debug`, `task`, `browser`, `web_search`, `irc`, `checkpoint`, `search_tool_bm25`<br> | Copy-on-Write (CoW) Workspace Isolation

|
| **OpenCode** | `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md`<br> | `instructions` list in `.opencode/config.json`<br> | Upward lookup from local folder to root

| `bash`, `edit`, `write`, `read`, `grep`, `glob`, `lsp`, `apply_patch`, `skill`, `todowrite`, `webfetch`, `websearch`, `question`<br> | Manual JSON Permission Blocks

|
| **Antigravity** | Workspace Skills / Central projects database

| `~/.gemini/antigravity-cli/settings.json`<br> | Shared bidirectional synchronization with GUI

| `read_file`, `write_file`, `read_url`, `execute_url`, `command`, `unsandboxed`, `mcp`<br> | Native OS Virtualization (`nsjail`, `sandbox-exec`, `AppContainer`)

|
| **OpenClaw** | `AGENTS.md` / `IDENTITY.md`<br> | Managed globally via custom Skill prompts

| Handled via parent routing logic or ACP adapters

| `message`, `search_tools` / `PI Tool Search`, `cron`, `sessions`, `media`, `browser`, `gateway`<br> | Docker Container Isolation

|
| **Hermes Agent** | Repo context files

| `SOUL.md` / `config.yaml` system blocks

| Session context files / preloaded skills

| `terminal`, `web_search`, `web_extract`, `execute_code`, `background`, `busy`, `skills`, `mcp`<br> | Multi-backend sandboxing (local, Docker, SSH, Singularity, Daytona, Modal)

|
| **Grok Build** | `AGENTS.md` / `CLAUDE.md`<br> | Internal (influenced by dynamic system-reminders)

| Auto-discovery at project root

| `read_file`, `search_replace`, `run_terminal_command`, `spawn_subagent`, `update_plan`<br> | Plan Mode Approval / Local Bubblewrap Container

|

---

## Native Tool Subsystems & Architectural Signatures

### 1. Claude Code

#### Workspace Manifest Handling

Claude Code relies strictly on `./CLAUDE.md`. At session initialization, it searches for a manifest in three places: the user's global configuration (`~/.claude/CLAUDE.md`), the workspace root, and nested subdirectories (e.g., `./packages/api/CLAUDE.md` inside monorepos).

The agent merges these files dynamically, resolving ties in favor of the most granular project file. If the manifest becomes too long, Claude Code leverages progress disclosure, requiring developers to offload lengthy implementation details to a designated `./docs/` directory and keep the primary manifest under 30 lines.

#### System Prompt & Cognitive Baselining

The default system prompt is embedded inside the CLI binary. To append custom developer instructions globally or on a per-session basis, users invoke:

```bash
claude --append-system-prompt "Always use strict TypeScript types"

```

Or load raw text instructions directly from an external file:

```bash
claude --append-system-prompt-file ./rules.txt

```

For deep multi-agent runs, the `--append-subagent-system-prompt` flag forces these guidelines down to all dynamically spawned child agents.

#### Native Tool-Calling Taxonomy

Claude Code bypasses prompt bloat by exposing a rich set of native tools defined directly in its TypeScript execution loop:

- `Read` / `Edit` / `NotebookEdit`: Tools for reading and modifying files without rewriting unchanged code.

- `Glob` / `Grep` / `LSP`: Low-overhead utilities that find files and search content using language server definitions, type warnings, and references without spawning sub-processes.

- `Bash` / `PowerShell`: Executes terminal commands. On macOS, `Bash` maps directly to an active `/bin/zsh` subprocess.

- `Agent`: Spawns a dedicated subagent with an isolated context window to investigate or build sub-components.

- `Monitor`: Runs terminal tasks in the background, feeding logs and status changes back to Claude mid-conversation.

- `CronCreate` / `CronDelete` / `CronList`: Handles recurring or scheduled prompts.

#### Execution Security & Permissions Gating

Claude Code implements a three-tiered security architecture:

- **Tier 1 (Safe Allowlist)**: Built-in safe tools (e.g., `Read`, `Grep`, `Glob`, `LSP`, `EnterPlanMode`) are automatically allowed within approved working directories without prompting.

- **Tier 2 (In-Project Operations)**: File edits and writes targeting paths inside the project tree are executed silently.

- **Tier 3 (Transcript Classifier)**: Shell commands (`Bash`), web fetches (`WebFetch`), and external system tasks are routed to an internal transcript classifier.

This classifier runs a two-stage filter: Stage 1 is a fast, single-token check designed to fail-closed, while Stage 2 uses chain-of-thought analysis to evaluate command intent in context, blocking malicious behavior. Users bypass prompts in safe environments via `--permission-mode bypassPermissions`.

---

### 2. OpenAI Codex CLI

#### Workspace Manifest Handling

Codex CLI reads repository guidelines from `./AGENTS.md` and `./AGENTS.override.md`. Discovery begins at the Git repository root and traverses down to the current working directory, concatenating at most one instruction file per folder.

The files are combined sequentially separated by blank lines; rules located closer to the active directory appear later in the prompt, taking precedence over root guidelines. The combined manifest is capped at a default limit of $32\text{ KiB}$ to prevent token exhaustion. Fallback names are customized in `~/.codex/config.toml`:

```toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
project_doc_max_bytes = 65536

```

#### System Prompt & Cognitive Baselining

System instructions are managed through the Responses API. Codex reads its system-role prompt from the path specified by the `model_instructions_file` key in `~/.codex/config.toml`.

If undefined, it falls back to a model-specific configuration file bundled directly in the local binary (e.g., `gpt-5.2-codex_prompt.md`).

#### Native Tool-Calling Taxonomy

To minimize context overhead, Codex maps its capabilities to a small set of highly optimized, standard API schemas:

- `shell`: The core execution tool used to run local commands. It accepts structured parameters including `command` (parsed as a JSON array), `workdir` (current execution directory), and `timeout_ms`.

- `update_plan`: A native planning tool that keeps the model grounded by tracking execution state changes through explicit `plan` and `explanation` properties.

- `web_search`: A dedicated, first-party tool for searching the web and retrieving clean text content.

#### Execution Security & Permissions Gating

Codex enforces strict process boundaries at the operating system kernel level, bypassing the need for heavy container isolation. On macOS, the `shell` tool is contained using native `Seatbelt` profiles; on Linux, it combines `Landlock` with `seccomp` system call filtering.

These sandbox profiles restrict file write operations and network requests only to directories and domains defined in the configuration. The agent loops in a `role=developer` system message explaining the active sandbox limits to ensure the model understands why specific terminal actions may fail.

Permissions are selected via the `/permissions` command or set directly in config (e.g., `--sandbox workspace-write` combined with `--ask-for-approval on-request`).

---

### 3. Pi

#### Workspace Manifest Handling

Pi reads instructions from `./AGENTS.md` or `./CLAUDE.md`. On startup, the CLI crawls upward from the current working directory, loading any active manifests along the path.

It also checks a global manifest located at `~/.pi/agent/AGENTS.md` to establish persistent rules across different repositories.

#### System Prompt & Cognitive Baselining

Pi features a highly configurable, minimalist prompt stack:

- `~/.pi/agent/SYSTEM.md`: Replaces the default system prompt.

- `~/.pi/agent/APPEND_SYSTEM.md`: Appends custom rules to the global system prompt.

- `.pi/SYSTEM.md`: Checked in locally inside a project's subfolder, this file overrides the global system prompt completely for scoped subdirectory runs.

#### Native Tool-Calling Taxonomy

Pi operates with a tiny core consisting of exactly four tools:

- `Read` / `Write` / `Edit`: Core tools for handling filesystem operations.

- `Bash`: Executes terminal shell commands.

To expand capabilities, Pi provides an extension system where custom TypeScript or Bun scripts can register new tools on the fly. Because Pi sessions are modeled as nested trees, agents can branch a conversation, launch a "side-quest" thread to write a custom tool extension, hot-reload the runtime, and resume the primary task without cluttering the main context window.

#### Execution Security & Permissions Gating

Pi does not provide native sandboxing or process containment out of the box; the `Bash` tool runs with direct, unsandboxed host permissions.

To run Pi safely, developers must run the CLI process inside an isolated container (such as Docker) or wrap the execution using system-level container layers like Bubblewrap.

---

### 4. Omp (Oh My Pi)

#### Workspace Manifest Handling

Omp merges codebase instruction formats automatically. It natively parses, extracts, and combines guidelines written in Cursor (`.cursorrules`), Cline (`.clinerules`), Codex (`AGENTS.md`), GitHub Copilot (`applyTo`), and Claude Code (`CLAUDE.md`).

This allow Omp to align with a project's existing configuration files without requiring manual translation.

#### System Prompt & Cognitive Baselining

Omp inherits Pi's file-based system prompt overrides but introduces **Time-Traveling Stream Rules**. When the agent is active, regex-based stream checkers monitor the model's output token-by-token.

If the model goes off-script or generates a banned pattern, Omp immediately aborts the token stream, injects the rule as an urgent system-prompt reminder, and rewinds execution to regenerate from the point of failure. This provides dynamic corrective loops without bloating the system prompt on every turn.

Omp also supports an `advisor` role: a separate model that reviews every turn, injecting critical notes or blockers inline.

#### Native Tool-Calling Taxonomy

Omp packs 32 native tools directly into its Rust binary, avoiding the latency overhead of sub-process fork-exec calls:

- `read` / `write` / `edit` / `ast_edit` / `ast_grep`: Advanced code reading tools. The `read` tool supports custom schemes to fetch remote content natively (e.g., `pr://` or `issue://` for Git integration, `conflict://` to load merge boundaries, and `agent://` to read child task outputs).

- `bash`: An embedded shell runner built on a custom `brush-shell` engine.

- `eval`: Runs persistent, isolated Python and JavaScript (Bun) worker kernels.

- `lsp`: Communicates directly with language servers to execute diagnostics, navigations (definitions, references), and symbol renames using `workspace/willRenameFiles`.

- `debug`: Implements the Debug Adapter Protocol (DAP). Omp attaches to debuggers like `lldb-dap`, `dlv`, or `debugpy` to set breakpoints, step through stack frames, and evaluate expressions inside running processes.

- `task`: Spawns parallel, concurrent subagents.

- `web_search` / `browser`: Runs headless Chrome via Puppeteer to search and extract site-aware markdown.

#### Execution Security & Permissions Gating

Omp isolates subagent operations using copy-on-write (CoW) filesystem clones. Depending on the host operating system, Omp clones the repository workspace instantly using APFS clones (macOS), btrfs reflinks or overlayfs (Linux), or projfs (Windows) to run tasks in isolated branches.

Tools that are not explicitly loaded can be dynamically searched for and registered mid-session using BM25 tool searching.

---

### 5. OpenCode

#### Workspace Manifest Handling

OpenCode automatically discovers context guidelines by looking up the directory tree.

It scans for `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md`, stopping at the first match to allow local, subdirectory configurations to override root-level expectations.

#### System Prompt & Cognitive Baselining

System prompt settings are configured inside `.opencode/config.json` under the `"instructions"` array:

```json
{
  "instructions": [
    "docs/coding-standards.md",
    "docs/architecture.md",
    "~/my-coding-style.md"
  ]
}
```

Alternatively, developers can configure custom commands as Markdown files under `.opencode/commands/`. The frontmatter of these markdown files governs specific system prompt options, such as switching the agent persona between `build` (full read/write access) and `plan` (read-only architecture mode).

#### Native Tool-Calling Taxonomy

OpenCode ships with a standard, configurable namespace of built-in tools:

- `read` / `write` / `edit`: Reading and editing tools. `read` supports reading specific line ranges for large files.

- `bash`: Runs shell commands natively.

- `grep` / `glob`: Internal pattern matching utilities.

- `lsp` (Experimental): Connects to configured language servers to run code actions, definition jumping, and type hovers.

- `apply_patch`: Performs code modifications by applying unified diff patches.

- `todowrite`: Manages a persistent task checklist to keep the agent oriented.

- `webfetch` / `websearch`: Fetches raw web content or searches queries.

- `question`: Prompts the user with interactive multiple-choice questions.

#### Execution Security & Permissions Gating

Permissions are explicitly controlled via the `permission` configuration block in `opencode.jsonc`. Each built-in tool can be mapped to `"allow"`, `"deny"`, or `"ask"`:

```json
"permission": {
  "edit": "allow",
  "bash": "ask",
  "webfetch": "deny"
}

```

OpenCode does not feature a built-in sandbox container. Secure operations require developers to run OpenCode inside separate container backends like Podman or isolated virtual environments.

---

### 6. Google Antigravity CLI (agy)

#### Workspace Manifest Handling

The Antigravity CLI (`agy`) decouples workspace discovery from in-repository configuration folders.

Instead of writing state files directly to target codebases, `agy` logs workspace mappings in a centralized registry file at `~/.gemini/antigravity-cli/cache/projects.json`, keeping repositories clean and speeding up workspace discovery to a single database lookup.

#### System Prompt & Cognitive Baselining

Cognitive configurations and system prompt defaults are managed through `~/.gemini/antigravity-cli/settings.json` or modified interactively using the `/config` and `/settings` commands.

The system prompt stack also supports structured lifecycle hooks (`PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, and `Stop`). These hooks inject custom system prompts or execute verification scripts (like linters) automatically in response to tool execution events.

#### Native Tool-Calling Taxonomy

To protect workstations, `agy` structures every action as a permission resource formatted as `action(target)`:

- `read_file` / `write_file`: Grants recursive file access. `write_file` implicitly grants `read_file` on the same path.

- `read_url` / `execute_url`: Web browsing and automation tools. `execute_url` allows the agent to actuate web elements (clicking, typing).

- `command`: Spawns terminal processes. Commands are matched against allowed prefixes or anchored regular expressions.

- `unsandboxed`: Runs trusted commands outside container isolation boundaries.

- `mcp`: Exposes tools registered over custom, dedicated MCP servers configured in `mcp_config.json`.

#### Execution Security & Permissions Gating

Antigravity CLI leverages native, zero-overhead operating system virtualization to isolate shell commands: `nsjail` on Linux, `sandbox-exec` on macOS, and `AppContainer` on Windows.

When the sandbox is active, paths granted under `read_file` and `write_file` dynamically populate the sandbox's read-only and read-write filesystem mount lists. Conflicting permission rules are strictly evaluated in priority order (`Deny > Ask > Allow`).

For fully autonomous local scripting, developers can launch with Extreme YOLO mode via `agy --dangerously-skip-permissions`.

---

### 7. OpenClaw

#### Workspace Manifest Handling

OpenClaw organizes repository contexts by parsing standard `AGENTS.md` manifests alongside local `./IDENTITY.md` files.

Because it operates primarily as a multi-channel gateway (Telegram, Discord, Slack, WhatsApp), OpenClaw standardizes these formats to support various backing models and engines.

#### System Prompt & Cognitive Baselining

When OpenClaw routes a conversation to an external agent over the Agent Client Protocol (ACP), it delegates system prompts to the underlying agent adapter.

For local routing turns, OpenClaw configures its system-role behaviors using custom Markdown files located inside installed skill directories under `~/.openclaw/skills/`. These skills can define custom system-prompt behaviors and trigger subagent handoffs.

#### Native Tool-Calling Taxonomy

For OpenAI models, OpenClaw routes turns through a native Codex app-server path, allowing the model to use optimized Codex-native tools (like read, edit, patch, and exec) directly. For other models, OpenClaw exposes an experimental `PI Tool Search` tool-calling namespace to reduce prompt bloat:

- `message`: A specialized tool used by the model to send intentional, visible replies back to the target chat channel.

- `search_tools` / `PI Tool Search`: Exposes a compact search, describe, and load schema that lets the model look up and mount tools dynamically only when needed.

- Gateway Tools: Built-in integration tools including `browser` (for web automation), `media` (capturing screenshots/logs), `cron` (handling schedules), and `sessions` (managing conversation threads).

#### Execution Security & Permissions Gating

OpenClaw gates tools using configurable auto-approve policies. To secure host environments, OpenClaw executes tools inside isolated Docker containers or virtual machines, protecting servers against malicious third-party skills.

---

### 8. Hermes Agent

#### Workspace Prompt Handling

Hermes Agent ingests project context files and skill schemas dynamically during startup or dynamically searches them mid-session.

Preloaded skills can be bound to the session during launch via the CLI using the `-s` flag (e.g., `hermes -s git-workflow`).

#### System Prompt & Cognitive Baselining

System-level instructions and core agent personalities are managed via `~/.hermes/config.yaml` or defined globally using a custom `SOUL.md` markdown file.

The agent can switch its voice on the fly using the `/personality` slash command to select from built-in profiles (such as `helpful`, `concise`, or `technical`).

#### Native Tool-Calling Taxonomy

Hermes Agent provides over 60 built-in tools:

- `terminal`: Executes shell commands. The configuration setting `display.tool_preview_length` in `config.yaml` controls how long terminal commands display in quiet-running mode to minimize terminal clutter.

- `web_search` / `web_extract`: Searches queries and extracts clean text content from target URLs.

- `execute_code`: Executes code programmatically, collapsing complex multi-step execution trajectories into a single model turn.

- `background`: Spawns independent agent sessions asynchronously in a separate daemon thread.

- `busy`: A specialized tool that controls how Hermes handles user keystrokes while the model is executing a task. Users can set this to `interrupt` (cancel immediately), `queue` (run next), or `steer` (inject text as a redirection tip after the next tool call).

#### Execution Security & Permissions Gating

Hermes Agent supports multiple sandboxing environments. Users select the execution backend directly inside `~/.hermes/config.yaml`, routing code execution through local processes, secure Docker containers with dropped capabilities, SSH remote servers, or serverless execution platforms (Daytona, Modal).

---

### 9. Grok Build

#### Workspace Manifest Handling

Grok Build automatically discovers and processes `./AGENTS.md` and `./CLAUDE.md` files in active workspaces.

If a developer is migrating from Claude Code, existing manifests work out of the box without requiring format modifications.

#### System Prompt & Cognitive Baselining

The core system prompt is tuned specifically for the specialized `grok-build-0.1` model to facilitate codebase exploration.

The system prompt is appended to dynamically using `<system-reminder>` XML tags injected into the model's conversation history to correct behaviors and enforce conventions without wasting context tokens.

#### Native Tool-Calling Taxonomy

Grok Build uses specialized native tools instead of generic shell commands to minimize bash escapes and improve efficiency:

- `read_file`: Reads file content, preferred over shell commands like `cat`, `head`, or `tail`.

- `search_replace`: Performs precise file edits and modifications, preferred over scripting tools like `sed` or `awk`.

- `run_terminal_command`: Spawns terminal subprocesses. Its usage is reserved strictly for actual system operations that require shell execution.

- `spawn_subagent`: Delegates tasks to parallel child agents. Available subagent types include `general-purpose` (full access), `explore` (read-only codebase exploration), `plan` (read-only software architect), and `codex-rescue` (root-cause investigation).

- `update_plan`: Generates a structured graph of sub-tasks (`plan.md`) displayed in the TUI.

#### Execution Security & Permissions Gating

Grok Build prioritizes a plan-first workflow. In Plan Mode, the agent is allowed to explore and search files freely but cannot modify files or run terminal commands.

Execution begins only after the user approves the structured execution graph, displaying modifications as clean diffs. Because Grok Build executes commands directly on the host machine, developers must configure container frameworks like Bubblewrap separately to isolate process executions.

---

## Universal Harness Design Synthesis

Standardizing across these nine coding agent prompting structures and tool calling conventions requires building a unified abstraction adapter layer. When designing the harness, consider the following integration patterns:

### 1. Unified Config Layer

Map the workspace files to a single, prioritized file-discovery chain. For instance, a harness-level adapter can automatically write project rules to a localized `./AGENTS.md` or `./CLAUDE.md` depending on the detected backend. If the backend is model-agnostic (like Omp or OpenCode), configure a parent merging script that feeds these codebase files directly to the model's system prompt.

### 2. Standardized Tool Gating

Implement an unified tool interface. Translate agent-specific tool executions (e.g., Claude's `Bash`, Grok's `run_terminal_command`, or agy's `command`) into a standardized execution schema within the harness. The harness can enforce consistent permissions (Allow, Ask, Deny) and apply a single container wrapper (such as a shared Docker image or Bubblewrap profile) across all executing agent processes.

### 3. Compact Dynamic Tool Loading

Implement a dynamic tool-discovery tool (similar to OpenClaw's `PI Tool Search` or Grok's `search_tool_bm25`).

Rather than sending the JSON-schema of all available integration utilities in the initial system prompt, expose a compact `search_tools` schema.

Let the model search the tool directory dynamically on demand, loading the full JSON schema of a target tool only when it is actually needed, saving context tokens and increasing task accuracy.
