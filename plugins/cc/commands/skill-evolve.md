---
description: Analyze skill evolution signals, draft/apply proposals, and rollback versions
argument-hint: "<skill-name> [--analyze] [--from <date>] [--propose-only] [--accept <id>] [--reject <id>] [--history] [--rollback <id> --confirm] [--ingest <file>] [--json] [--margin <n>] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Skill Evolve

Wraps **cc:cc-skills** skill.

Analyze skill quality over time, draft heuristic proposals for declining/flat-low dimensions, apply proposals through the double-loop gate, and rollback to prior versions via saved snapshots. Delegates to **cc:cc-skills** skill.

## When to Use

- Analyze trends, data sources, and patterns without writing a proposal (`--analyze`)
- Generate proposals after evaluation drift or repeated review feedback (`--propose-only`)
- Apply proposals through the deterministic double-loop gate with backup and rollback (`--accept`, `--rollback`)
- Track applied versions over time (`--history`)

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `skill-name` | Name of the skill (dir name or path to SKILL.md) | (required) |
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
/cc:skill-evolve ./skills/my-skill/SKILL.md --propose-only
# Analyze trends without writing a proposal
/cc:skill-evolve ./skills/my-skill/SKILL.md --analyze
# Apply a proposal
/cc:skill-evolve ./skills/my-skill/SKILL.md --accept skill-evolve-2026-06-22-001
# List applied versions
/cc:skill-evolve ./skills/my-skill/SKILL.md --history
# Rollback to a prior version
/cc:skill-evolve ./skills/my-skill/SKILL.md --rollback skill-evolve-2026-06-22-001 --confirm
```

## Failure-Mode Tags

Every proposed change authored for `--ingest` carries a `failure_mode` field naming the failure
mode it cures: `sprawl`, `sediment`, `duplication`, `no-op`, or `premature-completion`. The CLI
rejects unknown tags on ingest and persists valid ones in proposal history, so `--history` reads
as a failure-mode ledger. Definitions: **cc:cc-skills** skill-engineering theory reference.

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-skills** skill:

```
Skill(skill="cc:cc-skills", args="evolve $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill skill evolve $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
