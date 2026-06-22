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

## Operations

This skill accepts **5 operations**:

| Operation | Purpose | Script |
|-----------|---------|--------|
| **scaffold** | Create a new agent from template | `superskill agent scaffold` |
| **validate** | Check agent structure | `superskill agent validate` |
| **evaluate** | Score agent quality (rubric-driven two-call seam) | `superskill agent evaluate` |
| **refine** | Fix issues and improve quality | `superskill agent refine` |
| **evolve** | Propose and apply longitudinal improvements (two-call seam with personas) | `superskill agent evolve` |

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

Score agent quality via the two-call seam (rubric-driven, persona-scored):

1. **Envelope-out:** `superskill agent evaluate <agent.md> --rubric <rubric.yaml> --json` — emits `{ type, content_name, target, content, rubric, baseline }` as JSON. No scoring, no DB write. Pipe to a file (e.g. `envelope.json`).
2. **Scorer persona:** read the envelope, score each dimension against its rubric criterion, produce `{ rubric_version, dimensions: { name: { score, note } } }`. Write to `scores.json`.
3. **Ingest-in:** `superskill agent evaluate <agent.md> --ingest scores.json --save` — validates agent-produced scores against the rubric schema and persists as an evaluation row (tagged `scorer: rubric`).

Target grade: A (90-100) or B (80-89) for production agents. Grade C or below: proceed to refine. Profile auto-detection (thin-wrapper vs specialist) still selects the rubric weighting.

### Refine Workflow

Fix quality issues and apply improvements:

1. Run `superskill agent refine <agent.md> --auto --save` for full cycle
2. Re-evaluate after refinement to verify score improvement
3. Fuzzy quality improvements are handled by the invoking agent via checklist (see [references/workflows.md](references/workflows.md))

### Evolve Workflow

Longitudinal improvement via the two-call seam (persona-driven, gate-checked):

1. **Envelope-out:** `superskill agent evolve <name> --propose-only --json` — emits `{ trends, baseline, rubric, briefs }` as JSON. Each brief carries the immutable goal anchor (frontmatter + rubric criterion + negative constraints) **verbatim**, plus an `anchor_hash`. No DB write, no model call. Pipe to `briefs.json`.
2. **Author persona:** read the briefs, rewrite the content per dimension, produce `ProposedChange[]` with real `proposed` text + `anchor_hash`. Write to `proposal.json`.
3. **Skeptic persona:** receive the proposal + the **verbatim** goal anchor, check for violations/omissions, produce `{ ok, violations[] }`.
4. **Judge persona (if multiple candidates):** pairwise tournament comparison against the verbatim goal anchor, select the winner.
5. **Ingest-in:** `superskill agent evolve <name> --ingest proposal.json --accept <id>` — the CLI double-loop gate decides: deterministic validate-zero-errors + Δ-margin + anchor-hash match + skeptic veto. Failing any gate leaves the proposal in `draft` and restores the file. Reject with `--reject <id>`; analyze changes since a version with `--from`.

**Goal-anchor verbatim discipline:** Pass the original frontmatter and negative constraints verbatim to Skeptic and Judge — do not summarize, compact, or paraphrase. The CLI gate enforces this via `anchor_hash`; stripping the anchor pre-call will cause the gate to reject.

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

**Valid Claude Code agent frontmatter fields:**

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
