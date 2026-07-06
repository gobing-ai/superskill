---
description: Evaluate and fix magent config issues in one step
argument-hint: "<config-path> [--auto] [--save] [--dry-run] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Refine

Wraps **cc:cc-magents** skill.

Run evaluation, apply deterministic structural fixes (missing fields, type coercion, whitespace), then re-evaluate — all in one step. Magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md/GEMINI.md), and required-fields is empty for magents, so structural auto-apply is a clean no-op on frontmatter-less configs — body/section suggestions still surface. Delegates to **cc:cc-magents** skill.

## When to Use

- Improve magent config quality after scaffolding
- Fix config issues without running evaluate separately
- Preview fixes without writing with `--dry-run`

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `config-path` | Path to the config .md file | (required) |
| `--auto` | Skip interactive prompts (auto-apply fixes) | false |
| `--save` | Persist the evaluation to the evaluation store | false |
| `--dry-run` | Preview classified fixes and projected delta without writing | false |
| `--target` | Target platform | claude |

## Examples

```bash
# Refine a config (evaluate + structural fixes + re-evaluate)
/cc:magent-refine ./CLAUDE.md
# Auto-refine without prompts
/cc:magent-refine ./CLAUDE.md --auto --save
# Preview fixes without writing
/cc:magent-refine ./CLAUDE.md --dry-run
```

## Content Fix Types

Beyond deterministic structural fixes, refine applies two named content fix types: **description
prune** (three description rules: front-loaded identity, one trigger per branch, no body
restatement) and the **pruning pass** (no-op hunt — delete don't trim; duplication collapse;
sediment removal; disclosure moves). Single copy: **cc:cc-skills** workflows reference § "Content
fix types".

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="refine $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent refine $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
