---
description: Analyze magent evolution signals, draft proposals, and rollback applied versions
argument-hint: "<name> [--analyze] [--from <date>] [--propose-only] [--accept <id>] [--reject <id>] [--history] [--rollback <id> --confirm] [--ingest <file>] [--json] [--margin <n>] [--eval-gate] [--target <platform>]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---

# Magent Evolve

Wraps **cc:cc-magents** skill.

Analyze main agent config quality over time, persist refine-backed proposals, apply deterministic proposals, and inspect or rollback applied versions. Magents are frontmatter-OPTIONAL plain markdown (AGENTS.md/CLAUDE.md/GEMINI.md), so proposals on a frontmatter-less config target the body rather than a `frontmatter.description` field. Delegates to **cc:cc-magents** skill.

## When to Use

- Print a longitudinal analysis (trend table, score, data sources) without writing a proposal
- Generate proposals after evaluation drift or repeated review feedback
- Apply low-risk fixes through deterministic refine flow with backup and version snapshot
- List applied versions or rollback to a prior version snapshot

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `<name>` | Name or path of the config | (required) |
| `--analyze` | Print analysis summary (trends, score, data sources) without writing a proposal | false |
| `--from <date>` | Analyze evaluations since date (ISO 8601) | latest |
| `--propose-only` | Draft proposals without applying | false |
| `--accept <id>` | Apply a saved proposal by id (e.g. `magent-evolve-2026-06-22-001`) | - |
| `--reject <id>` | Reject a saved proposal | - |
| `--history` | List applied proposal versions from the store | false |
| `--rollback <id>` | Rollback to a prior version by proposal_id (requires `--confirm`) | - |
| `--confirm` | Confirm a destructive operation (required for `--rollback`) | false |
| `--json` | Output machine-readable JSON (envelope-out with `--propose-only`) | false |
| `--ingest <file>` | Consume agent-authored proposal JSON (ingest-in mode) | - |
| `--margin <n>` | Δ-margin gate threshold for accept | 0.05 |
| `--eval-gate` | Enable the empirical behavior gate when eval cases exist | false |
| `--target` | Target platform | claude |

## Examples

```bash
# Print longitudinal analysis (no proposal written)
/cc:magent-evolve AGENTS.md --analyze
# Generate persisted proposals
/cc:magent-evolve AGENTS.md --propose-only
# Apply a proposal
/cc:magent-evolve AGENTS.md --accept magent-evolve-2026-06-22-001
# List applied versions
/cc:magent-evolve AGENTS.md --history
# Rollback to a prior version
/cc:magent-evolve AGENTS.md --rollback magent-evolve-2026-06-22-001 --confirm
```

## Failure-Mode Tags

Every proposed change authored for `--ingest` carries a `failure_mode` field naming the failure
mode it cures: `sprawl`, `sediment`, `duplication`, `no-op`, `premature-completion`, `negation`,
or `contradiction`. The CLI
rejects unknown tags on ingest and persists valid ones in proposal history, so `--history` reads
as a failure-mode ledger. Definitions: **cc:cc-skills** skill-engineering theory reference.

## Proposal Discipline

Evolve only from evidence: repeated failures, persisted score drift, a confirmed dead command, or
a platform capability change. In each proposal's `reason`, cite that evidence, justify whether the
change belongs in always-on root context or a disclosed owner, and state the instruction-budget
effect. Preserve the verbatim goal anchor and `anchor_hash`; do not add speculative rules merely
for completeness.

Before acceptance, apply **cc:cc-magents** workflows § "Main-Agent Evaluation and Refinement" to
the assembled targets. Reject proposals that regress any baseline dimension, break a live link or
command, duplicate an authority, or weaken a critical boundary even when aggregate score rises.

## Implementation

Pass `$ARGUMENTS` to the underlying skill for processing.

Delegates to **cc:cc-magents** skill:

```
Skill(skill="cc:cc-magents", args="evolve $ARGUMENTS")
```

**Direct CLI execution (all platforms):**
```bash
superskill magent evolve $ARGUMENTS
```

## Platform Notes

- Claude Code: Invoke via `Skill()` delegation
- Other platforms: Run `superskill` CLI directly via Bash tool
