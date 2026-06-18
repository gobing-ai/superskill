---
name: cc-agents
description: "Use this skill when the user asks to 'create a new agent', 'scaffold an agent', 'evaluate agent quality', 'validate agent file', 'refine agent definition', or 'plan agent evolution'. Creates, validates, evaluates, refines, and supports longitudinal evolution workflows for subagent definitions across 6 platforms."
license: Apache-2.0
metadata:
  author: cc-agents
  version: "3.0.0"
  platforms: "claude-code,gemini-cli,opencode,codex,openclaw,antigravity"
  interactions:
    - generator
    - reviewer
    - pipeline
  severity_levels:
    - error
    - warning
    - info
  pipeline_steps:
    - create
    - validate
    - evaluate
    - refine
    - evolve
---

# cc-agents: Universal Subagent Creator

Create subagents that work across ALL platforms from a single source of truth.

## When to Use

- Creating a new subagent -> use **scaffold**
- Checking agent structure -> use **validate**
- Scoring quality -> use **evaluate**
- Fixing quality issues -> use **refine**
- Planning longitudinal improvement -> use **evolve**

## Quick Start

```bash
# Create a new agent
superskill agent scaffold my-agent --output ./agents

# Check structure
superskill agent validate agents/my-agent.md

# Score quality
superskill agent evaluate agents/my-agent.md --save

# Fix issues
superskill agent refine agents/my-agent.md --auto --save

# Analyze and propose longitudinal improvements
superskill agent evolve agents/my-agent --propose-only
```

## Workflows

- **New agent**: scaffold → validate → evaluate → refine
- **Improve existing agent**: evaluate → refine → evaluate (verify improvement)
- **Longitudinal improvement planning**: evaluate → refine → collect feedback → evolve

## Operations

This skill accepts **5 operations**:

| Operation | Purpose | Script |
|-----------|---------|--------|
| **scaffold** | Create a new agent from template | `superskill agent scaffold` |
| **validate** | Check agent structure | `superskill agent validate` |
| **evaluate** | Score agent quality (10 dimensions) | `superskill agent evaluate` |
| **refine** | Fix issues and improve quality | `superskill agent refine` |
| **evolve** | Analyze, propose, apply, and rollback deterministic improvements | `superskill agent evolve` |

## Pipeline Architecture

```
scaffold → validate → evaluate → refine

`evolve` is a separate longitudinal loop for proposal-driven maintenance and rollback.
```

## Operation Workflows

### Scaffold Workflow

Create a new agent from a tiered template:

1. Choose template tier based on agent complexity (minimal/standard/specialist)
2. Run `superskill agent scaffold <name> --output <dir>`
3. Edit generated file to complete all placeholder markers
4. Fill in the description with trigger phrases and `<example>` blocks
5. For specialist tier: enumerate competencies (20+ items), define verification protocol
6. Run validate to check structure

### Validate Workflow

Check agent structure and frontmatter:

1. Run `superskill agent validate <agent.md>` for Claude Code validation
2. Use `--target` to validate a specific platform, or `--strict` to enforce all rules
3. Fix any reported errors (missing fields, invalid frontmatter, structural issues)
4. Re-validate until 0 errors

### Evaluate Workflow

Score agent quality across 10 dimensions:

1. Run `superskill agent evaluate <agent.md> --save`
2. Review per-dimension scores and findings
3. Profile auto-detection selects thin-wrapper or specialist weights
4. Use `--json` to get machine-readable scores
5. Target grade: A (90-100) or B (80-89) for production agents
6. Grade C or below: proceed to refine

### Refine Workflow

Fix quality issues and apply improvements:

1. Run `superskill agent refine <agent.md> --auto --save` for full cycle
2. Re-evaluate after refinement to verify score improvement
3. Fuzzy quality improvements are handled by the invoking agent via checklist (see [references/workflows.md](references/workflows.md))

### Evolve Workflow

Use the longitudinal maintenance loop when quality drifts over time:

1. Run `superskill agent evolve <name> --propose-only` to analyze and propose improvements
2. Apply a saved proposal with `superskill agent evolve <name> --accept <id>`
3. Reject a proposal with `superskill agent evolve <name> --reject <id>`
4. Use `--from` to analyze changes since a specific version

## Core Principles

### Fat Skills, Thin Wrappers

All coding agents support agent skills now, but slash commands and subagents are not universally supported. So we **MUST** follow these principles:

- **Skills** = core logic, workflows, domain knowledge (source of truth)
- **Commands** = ~50-150 line wrappers invoking skills for humans
- **Subagents** = ~100 line wrappers invoking skills for AI workflows

**Circular Reference Rule**: Commands MUST NOT reference their associated agents or skills by name. This includes:

- ❌ Bad: `Use the super-coder agent` or `See also: my-skill`
- ❌ Bad: Commands Reference section listing `/cc:command-*` commands
- ✅ Good: `Delegate to a coding agent` or `Use Skill() for domain workflows`

Reference generic patterns without specific command names (e.g., "Use Task() to delegate to specialist agents" instead of "/cc:skill-add").

### Strict Frontmatter

Subagent frontmatter MUST follow strict schema rules. The frontmatter IS the contract — it defines how the main agent routes to this subagent and what capabilities it has.

#### Required Fields (All Platforms)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Agent identifier (lowercase hyphen-case, 3-50 chars) |
| `description` | string | Trigger description with "Use PROACTIVELY for..." + trigger phrases |
| `body` | string | System prompt content (Markdown body after `---`) |

#### Claude Code Fields (Primary Format)

**Valid fields** (from `types.ts:VALID_CLAUDE_AGENT_FIELDS`):

| Field | Type | Required | Description |
|-------|------|---------|-------------|
| `name` | string | Yes | Agent identifier |
| `description` | string | Yes | Trigger description |
| `tools` | string[] | No | Allowed tools whitelist |
| `disallowedTools` | string[] | No | Blocked tools blacklist |
| `model` | string | No | Model override (`inherit` = use parent model) |
| `maxTurns` | number | No | Max conversation turns |
| `permissionMode` | string | No | Permission level (`default`, `bypassPermissions`) |
| `skills` | string[] | No | Delegate to other skills |
| `mcpServers` | string[] | No | MCP server connections |
| `hooks` | object | No | Pre/post hook configuration |
| `memory` | string | No | Memory file path |
| `background` | boolean | No | Run in background |
| `isolation` | string | No | Isolation mode (`worktree`) |
| `color` | string | No | UI display color (semantic palette only) |

#### Field Rules

**name**:
- ✅ `super-coder`, `frontend-designer`, `api-architect`
- ❌ `SuperCoder`, `super_coder`, `super coder`, `a`
- Pattern: `^[a-z][a-z0-9-]{1,48}[a-z0-9]$`

**description**:
- MUST start with "Use PROACTIVELY for" for specialist agents
- MUST include 2-4 trigger phrases in quotes
- MUST include 1-2 `<example>` blocks with `<commentary>`
- Recommended length: 200-1000 chars
- Hard Codex limit: 1024 chars
- Keep at least one compact `<example>` block when tightening long descriptions
- The description IS the trigger — it determines routing

**tools**:
- Use explicit whitelist: `tools: [Read, Write, Edit, Glob]`
- Avoid overly broad tool lists
- Claude Code specific tools: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Task`, `Slot`, `TodoWrite`, `AskUserQuestion`, `WebFetch`, `WebSearch`

**model**:
- Default: `inherit` (use parent agent's model)
- Specialist agents may specify: `sonnet`, `opus`, `haiku`, `haiku-4-2025-01-01`

**color** (semantic palette):
- Category-appropriate: see [references/colors.md](references/colors.md)
- ❌ Avoid: `red`, `blue`, `green` (generic)
- ✅ Use: `🟩 teal`, `🟪 purple`, `🟥 crimson`, `🟦 blue`, `🩷 pink`

**skills**:
- List delegated skills in frontmatter, NOT in body
- Format: `skills: [skill-name-1, skill-name-2]`
- Only for Claude Code; other platforms drop this field

#### Platform-Specific Field Mapping

| Claude Code | Gemini CLI | OpenCode | Codex | OpenClaw |
|-------------|------------|----------|-------|----------|
| `maxTurns` | `max_turns` | `steps` | N/A | N/A |
| `disallowedTools` | N/A | `tools: {X: false}` | N/A | `tools.deny` |
| `timeout` | `timeout_mins` | N/A | `job_max_runtime_seconds` | `runTimeoutSeconds` |
| `skills` | N/A | N/A | N/A | N/A |

#### Common Frontmatter Errors

- ❌ Missing required `name` or `description`
- ❌ Invalid name pattern (uppercase, underscores, spaces)
- ❌ Description without trigger phrases
- ❌ No `<example>` blocks in specialist descriptions
- ❌ Unknown fields (e.g., typos like `tool:` instead of `tools:`)
- ❌ Skills listed in body instead of frontmatter
- ❌ Non-standard color values

## Best Practices

### Frontmatter

| Field | Best Practice |
|-------|---------------|
| `name` | Lowercase hyphen-case, 3-50 chars, alphanumeric start/end |
| `description` | Start with "Use PROACTIVELY for" + trigger phrases + compact `<example>` blocks, but stay <= 1024 chars |
| `tools` | Explicit list of allowed tools (whitelist) |
| `model` | Use `inherit` unless agent requires specific model |
| `color` | Category-appropriate color (see [references/colors.md](references/colors.md)) |
| `skills` | List delegated skills in frontmatter, NOT in body |

### Description Field

The description IS the trigger. It determines when the main agent routes to this subagent.

- Start with "Use PROACTIVELY for" for specialist agents
- Include 3+ trigger phrases in quotes
- Add 2-3 `<example>` blocks with `<commentary>`
- End with a summary of capabilities
- Keep under 500 chars for minimal, up to 1000 chars for specialist

### Body Structure

- Use canonical section headers: Role, Philosophy, Verification, Competencies, Process, Rules, Output Format
- H1 (`#`) reserved for agent title only
- All sections use H2 (`##`) headers
- See [references/agent-anatomy.md](references/agent-anatomy.md) for per-tier guidance

### DO

- Use lowercase-hyphens for agent names
- Include "Use PROACTIVELY for" in specialist descriptions
- Add `<example>` blocks with `<commentary>` in description
- Create 20+ competency items for specialist agents
- Define verification protocol with red flags and confidence scoring
- Add 8+ DO and 8+ DON'T rules for specialist agents
- Include output format templates with confidence levels
- Use specific colors from the semantic palette
- Document trigger phrases that match real user queries
- Keep total lines within tier budget (minimal: 20-50, standard: 80-200, specialist: 200-500)

### DON'T

- Use generic persona ("You are a helpful assistant")
- Skip verification protocol in specialist agents
- Create fewer than 20 competency items for specialist tier
- Use fewer than 4 rules per list in standard tier
- Exceed line budget for the tier
- Use vague descriptions without trigger phrases
- Skip error handling in output format
- Omit fallback plans in verification
- Put skills list in body instead of frontmatter
- Use deprecated or non-standard color names

### Red Flags

- Missing or empty description field
- No trigger phrases or `<example>` blocks in description
- Generic persona with no domain specificity
- Verification protocol without confidence scoring
- Fewer than 20 competency items in specialist agent
- Rules section with fewer than 4 items per list
- No output format template defined
- Agent body exceeds 500 lines (too complex, consider splitting)

## Core Concepts

### Universal Agent Model (UAM)

The **UAM** is an internal superset representation that captures ALL fields from all 6 platform formats. It's used as the common interchange format:

```typescript
interface UniversalAgent {
  name: string;           // Required
  description: string;    // Required (trigger)
  body: string;           // System prompt
  tools?: string[];       // Allowed tools
  model?: string;         // Model override
  maxTurns?: number;      // Max turns
  // ... 22 fields total
}
```

### 3 Tiered Templates

| Tier | Lines | Use Case |
|------|-------|----------|
| **minimal** | 20-50 | Simple focused agents |
| **standard** | 80-200 | Most production agents |
| **specialist** | 200-500 | Complex domain experts |

### Evaluation Dimensions

Agents are scored across **4 categories, 10 dimensions, 100 points total** (source: quality configuration):

| Category | Dimension | Thin | Spec | What It Checks |
|----------|-----------|:---:|:---:|----------------|
| **Core Quality** (30/35) | Frontmatter Quality | 10 | 10 | YAML validity, required fields |
| | Body Quality | 10 | 15 | Persona/process/rules sections |
| | Naming Convention | 5 | 5 | Lowercase hyphen-case, length |
| | Instruction Clarity | 5 | 5 | Unambiguous, specific instructions |
| **Discovery & Trigger** (15/15) | Description Effectiveness | 15 | 15 | Trigger phrases, routing accuracy |
| **Safety & Compliance** (30/20) | Tool Restriction | 10 | 10 | Tools whitelist/blacklist |
| | Thin-Wrapper Compliance | 15 | 5 | Skill delegation vs implementation |
| | Security Posture | 5 | 5 | No dangerous patterns |
| **Operational** (25/30) | Platform Compatibility | 10 | 10 | UAM cross-platform support |
| | Operational Readiness | 15 | 20 | Output format, examples, verification |

**Thin** = thin-wrapper profile (delegates to skills). **Spec** = specialist profile (domain experts).

Grade: A (90+) / B (80-89) / C (70-79) / D (60-69) / F (<60). Pass threshold: **75%**.

### 2 Weight Profiles

| Profile | Emphasis | Best For |
|---------|----------|----------|
| **thin-wrapper** | Delegation, trigger, tools | Agents that delegate to skills |
| **specialist** | Body quality, completeness | Domain expert agents |

See [references/evaluation-framework.md](references/evaluation-framework.md) for detailed scoring criteria.

## Platform Support

| Platform | Parse | Generate | Notes |
|----------|-------|----------|-------|
| Claude Code | Yes | Yes | Primary format (Markdown+YAML) |
| Gemini CLI | Yes | Yes | `.gemini/agents/` |
| OpenCode | Yes | Yes | JSON or Markdown |
| Codex | Yes | Yes | TOML config |
| OpenClaw | Yes | Yes | JSON config |
| Antigravity | No | Yes | Advisory docs only |

## Key Differences from cc-skills

| Aspect | cc-skills | cc-agents |
|--------|-----------|-----------|
| Target | Skills | Subagents |
| Format | Directory + SKILL.md | Single .md file |
| Templates | 3 types | 3 tiers |
| Adapters | Export only | Bidirectional |
| Evaluation | 10 dimensions | 10 dimensions |

## Additional Resources

- [Claude Code Agent Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sub-agents)
- [Gemini CLI Agent Configuration](https://github.com/google-gemini/gemini-cli)
- [OpenCode Agent Format](https://github.com/opencode-ai/opencode)

## See Also

- [references/agent-anatomy.md](references/agent-anatomy.md) - Body structure guidance (tiered)
- [references/architecture.md](references/architecture.md) - System architecture (UAM, adapters, pipeline)
- [references/colors.md](references/colors.md) - Semantic color palette for agent UI
- [references/evaluation-framework.md](references/evaluation-framework.md) - 10-dimension scoring details
- [references/frontmatter-reference.md](references/frontmatter-reference.md) - Per-platform frontmatter fields
- [references/hybrid-architecture.md](references/hybrid-architecture.md) - Command + agent orchestration patterns
- [references/platform-compatibility.md](references/platform-compatibility.md) - Cross-platform feature matrix
- [references/troubleshooting.md](references/troubleshooting.md) - Common issues and fixes
- [references/workflows.md](references/workflows.md) - Detailed workflow definitions (scaffold/validate/evaluate/refine/evolve)
