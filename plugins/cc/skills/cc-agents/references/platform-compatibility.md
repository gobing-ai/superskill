# Platform Compatibility

Cross-platform feature matrix and adapter reference for the Universal Agent Model (UAM).

## Feature Matrix

Which features are supported on each platform.

| Feature | Claude Code | Gemini CLI | OpenCode | Codex | OpenClaw | Antigravity |
|---------|:-----------:|:----------:|:--------:|:-----:|:--------:|:-----------:|
| Markdown agents | Yes | Yes | Yes | No | No | No |
| YAML frontmatter | Yes | Yes | Yes | No | No | No |
| TOML config | No | No | No | Yes | No | No |
| JSON config | No | No | Yes | No | Yes | No |
| Tool allowlist | Yes | Yes | Yes | No (sandbox) | Yes | No |
| Tool denylist | Yes | No | Yes | No | Yes | No |
| Model override | Yes | Yes | Yes | Yes | Per-agent | No |
| Max turns/steps | Yes | Yes | Yes | No | No | No |
| Timeout | No | Yes | No | No | Yes | No |
| Temperature | No | Yes | Yes | No | No | No |
| Skills delegation | Yes | No | No | No | No | No |
| MCP servers | Yes | No | No | Yes | No | No |
| Hooks | Yes | No | No | No | No | No |
| Memory | Yes | No | No | No | No | No |
| Background mode | Yes | No | No | No | No | No |
| Isolation/worktree | Yes | No | No | No | No | No |
| UI color | Yes | No | Yes | No | No | No |
| Permission modes | Yes | No | Yes | No | No | No |
| Sandbox mode | No | No | No | Yes | No | No |
| Reasoning effort | No | No | No | Yes | No | No |
| Nickname candidates | No | No | No | Yes | No | No |

## Platform Adapter Interface

```typescript
interface IAgentPlatformAdapter {
  readonly platform: AgentPlatform;
  readonly displayName: string;

  parse(input: string, filePath: string): Promise<AgentParseResult>;
  validate(agent: UniversalAgent): Promise<AgentAdapterResult>;
  generate(agent: UniversalAgent, context: AgentAdapterContext): Promise<AgentAdapterResult>;
  detectFeatures(agent: UniversalAgent): string[];
}
```

## Claude Code Adapter

**Location**: Handled by `superskill install` conversion pipeline

**Format**: Markdown with YAML frontmatter

```markdown
---
name: my-agent
description: Use PROACTIVELY for...
tools: [Bash, Read, Write]
model: claude-sonnet-4-20250514
maxTurns: 10
---

# Agent Name

[System prompt content]
```

**Features**:
- Full UAM support
- skills delegation
- mcpServers
- hooks
- memory
- background
- isolation
- color

## Gemini CLI Adapter

**Location**: Handled by `superskill install` conversion pipeline

**Format**: Markdown with YAML frontmatter in `.gemini/agents/`

```markdown
---
name: my-agent
description: Use PROACTIVELY for...
tools: [bash, read]
model: gemini-2.0-flash
max_turns: 10
timeout_mins: 30
temperature: 0.7
kind: local
---

[System prompt]
```

**Field Mapping**:
| UAM | Gemini |
|-----|--------|
| maxTurns | max_turns |
| timeout | timeout_mins |
| kind | kind |

## OpenCode Adapter

**Location**: Handled by `superskill install` conversion pipeline

**Format**: Markdown or JSON config

**Markdown format**:
```markdown
---
description: Use PROACTIVELY for...
model: claude-sonnet-4-20250514
tools:
  Bash: true
  Read: true
steps: 10
---

[System prompt]
```

**JSON format**:
```json
{
  "description": "...",
  "model": "claude-sonnet-4-20250514",
  "tools": {
    "Bash": true,
    "Read": true
  },
  "steps": 10
}
```

**Field Mapping**:
| UAM | OpenCode |
|-----|----------|
| maxTurns | steps |
| hidden | hidden |
| color | color |

## Codex Adapter

**Location**: Handled by `superskill install` conversion pipeline

**Format**: Standalone `.toml` files in `~/.codex/agents/` or `.codex/agents/`

Per [official Codex subagents documentation](https://developers.openai.com/codex/subagents):

```toml
name = "my-agent"
description = "Read-only codebase explorer."
model = "gpt-5.4"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
nickname_candidates = ["Explorer", "Scout"]

developer_instructions = """
Your system prompt goes here.
"""

[mcp_servers.docs]
url = "https://docs.example.com/mcp"
```

**Required fields**: `name`, `description`, `developer_instructions`

**Optional fields**: `model`, `model_reasoning_effort`, `sandbox_mode`, `nickname_candidates`, `mcp_servers`

**Valid sandbox_mode values**: `read-only`, `workspace-write`, `danger-full-access`

**Valid model_reasoning_effort values**: `low`, `medium`, `high`

**Field Mapping**:
| UAM | Codex |
|-----|-------|
| name | name |
| body | developer_instructions |
| sandboxMode | sandbox_mode |
| reasoningEffort | model_reasoning_effort |
| nicknameCandidates | nickname_candidates |
| mcpServers | mcp_servers (nested TOML tables) |

## OpenClaw Adapter

**Location**: Handled by `superskill install` conversion pipeline

**Format**: JSON in `agents.json`

```json
{
  "agents": {
    "list": [
      {
        "name": "my-agent",
        "description": "...",
        "tools": {
          "allow": ["Bash", "Read"],
          "deny": ["Edit"]
        },
        "runTimeoutSeconds": 600
      }
    ]
  }
}
```

**Field Mapping**:
| UAM | OpenClaw |
|-----|----------|
| tools | tools.allow |
| disallowedTools | tools.deny |
| timeout | runTimeoutSeconds |

## Antigravity Adapter

**Location**: Handled by `superskill install` conversion pipeline

**Format**: Advisory documentation only

No formal agent format exists. The adapter generates an advisory document describing how to configure the agent via natural language dispatch.

## Loss Detection

When adapting between platforms, some features may not be representable:

| Source | Target | Loss |
|--------|--------|------|
| Claude | Gemini | skills, mcpServers, hooks, memory, background, isolation |
| Claude | OpenCode | skills, mcpServers, hooks |
| Claude | Codex | skills, hooks, memory, timeout, nicknameCandidates (new in Codex) |
| Claude | OpenClaw | mcpServers, hooks, memory, background |
| Claude | Antigravity | All - advisory only |

The `superskill install` conversion pipeline reports these as warnings.
