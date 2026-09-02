---
description: Evaluate and fix magent config issues in one step
argument-hint: "<nameOrPath> [--auto] [--save] [--dry-run] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Refine

Wraps **cc:cc-magents** skill.

Run evaluation, apply deterministic structural fixes (missing fields, type coercion, whitespace),
then re-evaluate. Magents are frontmatter-optional plain markdown, so `--auto` is usually a clean
no-op on their body: it surfaces low-scoring dimensions but does not perform semantic rewrites.
The invoking agent owns those edits under the **cc:cc-magents** workflow.

## When to Use

- Improve magent config quality after scaffolding
- Apply low-risk structural fixes and surface semantic work
- Preview fixes without writing with `--dry-run`

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<nameOrPath>` | Configuration name or path to its .md file | (required) |
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

## Refinement Contract

Follow **cc:cc-magents** workflows § "Main-Agent Evaluation and Refinement". Freeze requested
layout and critical boundaries; fix contradictions and dead commands first; delete no-ops and
sediment; collapse duplicate owners; move rarely needed depth to live authoritative links; add
only missing non-inferable guidance. Preserve safety and verification inline on targets that do
not receive rule modules.

After semantic edits, assemble every target and re-run strict validation plus evaluation. Compare
every dimension with baseline, not only the aggregate. Do not claim `--auto` applied a body change
that it only suggested.

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
