---
description: Score main agent config across 5 quality dimensions
argument-hint: "<nameOrPath> [--json] [--target <platform>] [--save] [--rubric <file>] [--ingest <file>] [--base-path <dir>]"
allowed-tools: ["Read", "Grep", "Glob", "Bash", "Skill"]
---

# Magent Evaluate

Wraps **cc:cc-magents** skill.

Score main-agent config quality across five dimensions, then conduct the semantic audit the
heuristics cannot prove. **Evaluate only — make NO changes.** Delegates to **cc:cc-magents** skill.

## When to Use

- Check current score without making changes
- Compare scores before and after refinement
- Audit a resolved multi-file or multi-target instruction set for drift and contradictions

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<nameOrPath>` | Configuration name or path to its .md file | (required) |
| `--json` | Output machine-readable JSON; with `--rubric`, emit a scoring work order | false |
| `--target` | Target platform | claude |
| `--save` | Persist the evaluation to the evaluation store (enables evolve trend analysis) | false |
| `--rubric <file>` | Rubric path for envelope-out scoring | built-in |
| `--ingest <file>` | Agent-scored result JSON to validate and persist | - |
| `--base-path <dir>` | Directory relative markdown links resolve against, so a governance area satisfied by a link to an existing file counts toward `completeness`. Override when the config is authored to live elsewhere — e.g. scoring a scaffold template as if already at a project root. | the file's own directory |

## Examples

```bash
# Evaluate a config
/cc:magent-evaluate ./CLAUDE.md
# Save results to the evaluation store
/cc:magent-evaluate ./CLAUDE.md --save
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="evaluate $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent evaluate $ARGUMENTS
```

## Evaluation Contract

Follow **cc:cc-magents** workflows § "Main-Agent Evaluation and Refinement": resolve the actual
load graph, run strict validation, record every baseline dimension, and report heuristic findings
separately from semantic findings. Check authority and scope, stable/non-inferable content, live
links, exact leaf-command help, the reasoned tool ladder, safety boundaries, and runnable gates.
An aggregate score or exit code alone is not a PASS.

For nested CLI paths, require the verb in the parent's `Commands` list and the exact leaf path in
`Usage`; Commander can return parent help with exit 0 for an unknown child.

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
