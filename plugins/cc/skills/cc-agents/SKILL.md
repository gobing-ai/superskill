---
name: cc-agents
description: "Use this skill when the user asks to 'create a new agent', 'scaffold an agent', 'evaluate agent quality', 'validate agent file', 'refine agent definition', or 'plan agent evolution'. Creates, validates, evaluates, refines, and supports longitudinal evolution workflows for subagent definitions across 6 platforms."
license: Apache-2.0
metadata:
  author: superskill
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

# Score quality (two-call seam: envelope → Scorer → ingest)
superskill agent evaluate agents/my-agent.md --rubric <rubric.yaml> --json > envelope.json
# ... Scorer persona scores envelope.json → scores.json ...
superskill agent evaluate agents/my-agent.md --ingest scores.json --save

# Fix issues
superskill agent refine agents/my-agent.md --auto --save

# Evolve (two-call seam: envelope → Author → Skeptic → Judge → ingest)
superskill agent evolve agents/my-agent --propose-only --json > briefs.json
# ... Author persona rewrites → proposal.json; Skeptic refutes; Judge picks winner ...
superskill agent evolve agents/my-agent --ingest proposal.json --accept <id>
```

## Workflows

- **New agent**: scaffold → validate → evaluate → refine
- **Improve existing agent**: evaluate → refine → evaluate (verify improvement)
- **Longitudinal improvement planning**: evaluate → refine → collect feedback → evolve
  (`evolve` is a separate longitudinal loop for proposal-driven maintenance and rollback)

## Operations

This skill accepts **5 operations**:

| Operation | Purpose | Script |
|-----------|---------|--------|
| **scaffold** | Create a new agent from template (pick tier, fill placeholders, then validate) | `superskill agent scaffold` |
| **validate** | Check agent structure; `--target` per platform, `--strict` for all rules; loop to 0 errors | `superskill agent validate` |
| **evaluate** | Score agent quality (rubric-driven two-call seam) | `superskill agent evaluate` |
| **refine** | Fix issues and improve quality (`--auto --save`, then re-evaluate) | `superskill agent refine` |
| **evolve** | Propose and apply longitudinal improvements (two-call seam with personas) | `superskill agent evolve` |

Step-by-step workflow details for all five operations live in
[references/workflows.md](references/workflows.md). Evaluate and evolve run the **two-call seam**
(envelope-out → Scorer / Author → Skeptic → Judge personas → ingest-in, double-loop gated); the
seam mechanics and vocabulary are owned by **cc:cc-skills**. Two agent-side facts worth pinning:

- Target grade: A or B for production agents; grade C or below → refine. Profile auto-detection
  (thin-wrapper vs specialist) selects the rubric weighting.
- Goal anchors pass to Skeptic/Judge **verbatim** — the `anchor_hash` gate rejects paraphrased
  anchors.

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

The full per-platform field tables (Claude Code's 14 valid fields, Gemini CLI, OpenCode, Codex,
OpenClaw) live in [references/frontmatter-reference.md](references/frontmatter-reference.md) —
read them there; restating them here drifts.

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

#### Common Frontmatter Errors

- ❌ Missing required `name` or `description`
- ❌ Invalid name pattern (uppercase, underscores, spaces)
- ❌ Description without trigger phrases
- ❌ No `<example>` blocks in specialist descriptions
- ❌ Unknown fields (e.g., typos like `tool:` instead of `tools:`)
- ❌ Skills listed in body instead of frontmatter
- ❌ Non-standard color values

## Best Practices

Frontmatter best practices are the Field Rules above — apply them as written; the description
rules there are the trigger contract (the description IS the routing signal).

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

Reject/greylist patterns (empty descriptions, generic personas, missing verification protocols,
under-budget competency lists, oversized bodies) are cataloged with penalties in
[references/red-flags.md](references/red-flags.md).

## Core Concepts

### Cross-Platform Field Model

Agents are authored in the Claude Code Markdown+YAML format and adapted to each target
platform. The adapter (`packages/core/src/pipeline/adapt-subagent.ts`) preserves the core
fields — `name`, `description`, `tools`, `model`, `skills`, `color` — and maps or drops the
rest per the platform-specific field table above. Fields a target does not support are dropped,
not invented.

### 3 Tiered Templates

| Tier | Lines | Use Case |
|------|-------|----------|
| **minimal** | 20-50 | Simple focused agents |
| **standard** | 80-200 | Most production agents |
| **specialist** | 200-500 | Complex domain experts |

### Evaluation Dimensions

Agents are scored across **5 rubric dimensions**. The canonical rubric at
`packages/core/src/rubrics/agent.yaml` owns each dimension's weight and criterion — read it
there; do not restate weights here, they drift.

| Dimension | What It Checks |
|-----------|----------------|
| `completeness` | Workflow covered end-to-end; no skipped phases or unhandled edge cases |
| `role-clarity` | Specific non-generic persona with an explicit expertise boundary |
| `tool-selection` | Each tool matched to a step; no missing or orphaned tool references |
| `skill-linkage` | Skills linked at the delegation point, reachable in the workflow |
| `model-fit` | Model tier matches the agent's cognitive load |

Verdict: **PASS** (≥0.70) / **FAIL** (<0.70). Grade: A (≥0.90) / B (≥0.75) / C (≥0.60) / D (≥0.45) / F (<0.45).

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
| Evaluation | 5 rubric dimensions | 5 rubric dimensions |

## Additional Resources

- [Claude Code Agent Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sub-agents)
- [Gemini CLI Agent Configuration](https://github.com/google-gemini/gemini-cli)
- [OpenCode Agent Format](https://github.com/opencode-ai/opencode)

## See Also

- [references/agent-anatomy.md](references/agent-anatomy.md) - Body structure guidance (tiered)
- [references/architecture.md](references/architecture.md) - System architecture (adapters, pipeline, field model)
- [references/colors.md](references/colors.md) - Semantic color palette for agent UI
- [references/evaluation-framework.md](references/evaluation-framework.md) - rubric scoring details
- [references/frontmatter-reference.md](references/frontmatter-reference.md) - Per-platform frontmatter fields
- [references/hybrid-architecture.md](references/hybrid-architecture.md) - Command + agent orchestration patterns
- [references/platform-compatibility.md](references/platform-compatibility.md) - Cross-platform feature matrix
- [references/troubleshooting.md](references/troubleshooting.md) - Common issues and fixes
- [references/workflows.md](references/workflows.md) - Detailed workflow definitions (scaffold/validate/evaluate/refine/evolve)
