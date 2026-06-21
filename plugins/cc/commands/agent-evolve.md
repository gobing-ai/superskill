---
description: Analyze agent evolution signals, draft/apply proposals, and rollback versions
argument-hint: "<agent-name> [--analyze] [--from <date>] [--propose-only] [--accept <id>] [--reject <id>] [--history] [--rollback <id> --confirm] [--ingest <file>] [--json] [--margin <n>] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Agent Evolve

Wraps **cc:cc-agents** skill.

Analyze agent quality over time, draft heuristic proposals for declining/flat-low dimensions, apply proposals through the double-loop gate, and rollback to prior versions via saved snapshots. Delegates to **cc:cc-agents** skill.

## When to Use

- Analyze trends, data sources, and patterns without writing a proposal (`--analyze`)
- Generate proposals after evaluation drift or repeated review feedback (`--propose-only`)
- Apply proposals through the deterministic double-loop gate with backup and rollback (`--accept`, `--rollback`)
- Track applied versions over time (`--history`)

## Arguments

| `agent-name` | Name of the agent | (required) |
| `--analyze` | Print trend table, score/grade, data-source inventory, and pattern summary | false |
| `--from <date>` | Analyze evaluations since date (ISO 8601) | latest |
| `--propose-only` | Draft proposals without applying | false |
| `--accept <id>` | Apply a saved proposal by ID | - |
| `--reject <id>` | Reject a saved proposal by ID | - |
| `--history` | List applied proposal versions from the store | false |
| `--rollback <id>` | Restore a prior version by proposal_id (requires `--confirm`) | - |
| `--confirm` | Confirm a destructive operation (required for `--rollback`) | false |
| `--ingest <file>` | Agent-authored proposal JSON (ingest-in mode) | - |
| `--json` | Output machine-readable JSON (envelope-out with `--propose-only`) | false |
| `--margin <n>` | Δ-margin gate threshold for accept (default 0.05) | 0.05 |
| `--target` | Target platform | claude |

## Examples

```bash
# Generate persisted proposals
/cc:agent-evolve ./agents/my-agent.md --propose-only
# Analyze trends without writing a proposal
/cc:agent-evolve ./agents/my-agent.md --analyze
# Apply a proposal
/cc:agent-evolve ./agents/my-agent.md --accept agent-evolve-2026-06-21-001
# List applied versions
/cc:agent-evolve ./agents/my-agent.md --history
# Rollback to a prior version
/cc:agent-evolve ./agents/my-agent.md --rollback agent-evolve-2026-06-21-001 --confirm
```

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-agents** skill:

```
Skill(skill="cc:cc-agents", args="evolve $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill agent evolve $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool