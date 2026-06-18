# Frontmatter Reference

Per-platform frontmatter field reference for the Universal Agent Model (UAM).

## UAM Field Table

Complete mapping of all valid frontmatter fields across supported platforms.

| UAM Field | Type | Claude Code | Gemini CLI | OpenCode | Codex | OpenClaw |
|-----------|------|------------|------------|----------|-------|----------|
| name | string (required) | `name:` | `name:` | config key | section name | config key |
| description | string (required) | `description:` | `description:` | `description:` | `description:` | agent purpose |
| tools | string[] | `tools:` (list) | `tools:` (array) | `tools:` (map, boolean) | N/A (sandbox) | `tools.allow` |
| disallowedTools | string[] | `disallowedTools:` | N/A | `tools: {X: false}` | N/A | `tools.deny` |
| model | string | `model:` | `model:` | `model:` | `model:` | per-agent config |
| maxTurns | number | `maxTurns:` | `max_turns:` | `steps:` | N/A | N/A |
| timeout | number | N/A | `timeout_mins:` | N/A | `job_max_runtime_seconds` | `runTimeoutSeconds` |
| temperature | number | N/A | `temperature:` | `temperature:` | N/A | N/A |
| body | string (required) | Markdown body | Markdown body | Markdown body / `prompt:` | `developer_instructions:` | N/A |

## Required Fields

Every agent must define at minimum:

| Field | Type | Description |
|-------|------|-------------|
| name | string | Agent identifier (lowercase hyphen-case) |
| description | string | Trigger description with "Use PROACTIVELY for..." |
| body | string | System prompt content (Markdown body after frontmatter) |

## Platform-Specific Fields

### Claude Code

| Field | Type | Description |
|-------|------|-------------|
| tools | string[] | Allowed tools list |
| disallowedTools | string[] | Blocked tools list |
| model | string | Model override |
| maxTurns | number | Max conversation turns |
| permissionMode | string | Permission level (default, bypassPermissions) |
| skills | string[] | Delegate to skills |
| mcpServers | string[] | MCP server connections |
| background | boolean | Run in background |
| isolation | string | Isolation mode (worktree) |
| color | string | UI display color |
| hooks | object | Pre/post hooks |
| memory | object | Memory configuration |

### Gemini CLI

| Field | Type | Description |
|-------|------|-------------|
| max_turns | number | Max conversation turns (maps from maxTurns) |
| timeout_mins | number | Timeout in minutes (maps from timeout) |
| temperature | number | Model temperature |
| kind | string | Agent kind (local, remote) |

### OpenCode

| Field | Type | Description |
|-------|------|-------------|
| steps | number | Max steps (maps from maxTurns) |
| hidden | boolean | Hide from UI |
| permissions | object | Permission configuration |
| mode | string | Agent mode |
| color | string | UI display color |

### Codex

| Field | Type | Description |
|-------|------|-------------|
| developer_instructions | string | System prompt (maps from body) |
| sandbox_mode | string | Sandbox level (read-only, full) |
| reasoning_effort | string | Reasoning effort (low, medium, high) |
| job_max_runtime_seconds | number | Timeout in seconds (maps from timeout) |

### OpenClaw

| Field | Type | Description |
|-------|------|-------------|
| tools.allow | string[] | Allowed tools (maps from tools) |
| tools.deny | string[] | Denied tools (maps from disallowedTools) |
| runTimeoutSeconds | number | Timeout in seconds (maps from timeout) |

## Tier Overview

| Tier | Lines | Sections | Use Case |
|------|-------|----------|----------|
| minimal | 20-50 | Frontmatter + body | Simple focused agents |
| standard | 80-200 | 5-6 sections | Most production agents |
| specialist | 200-500 | Full 8-section | Complex domain experts |

## Tier Detection

The system auto-detects template tier by:
1. Counting body line count
2. Checking for 8-section anatomy headers
3. Evaluating section completeness
