# Evolution Protocol

Self-evolution system for slash commands using evaluation analysis, proposal generation, and safe apply with rollback.

## Overview

The evolution system analyzes command quality over time to generate improvement proposals. It uses evaluation reports, validation findings, and optional workspace feedback as input signals. The system operates on a **confirm-required** safety model by default.

## Lifecycle

The evolve workflow follows the shared cc closed-loop lifecycle:

1. **Observe** — Collect signals from evaluation reports, validation findings, and history
2. **Analyze** — Identify patterns (recurring warnings, score degradation, platform gaps)
3. **Propose** — Generate bounded proposals with evidence, confidence, and risk
4. **Apply** — Apply approved proposals with pre-apply backup
5. **Verify** — Re-evaluate command quality after apply
6. **Snapshot** — Save version snapshot for history tracking
7. **Rollback** — Restore pre-apply backup if verification fails
8. **Learn** — Record proposal outcome for future improvement

## Signal Sources

| Source | What It Provides |
|--------|-----------------|
| Evaluation report | Per-dimension scores, findings, grade |
| Validation findings | Structural errors and warnings |
| Platform adaptation warnings | Cross-platform compatibility issues |
| History snapshots | Quality trends, regression detection |
| Workspace feedback | User preferences and correction patterns |

## Proposal Types

| Type | Risk | Auto-Apply |
|------|------|-----------|
| Metadata normalization | Low | Yes (with backup) |
| Description improvement | Low | Yes (with backup) |
| Second-person voice fix | Low | Yes (with backup) |
| Platform Notes addition | Low | Yes (with backup) |
| Body structure changes | Medium | Confirm required |
| Argument semantics changes | Medium | Confirm required |
| Multi-file adaptation | High | Manual only |

## Storage Convention

Evolution data is stored under the shared cc convention:

```
<git-root>/.cc-evolution/cc-commands/
├── proposals/      # Generated proposal sets (JSON)
├── versions/       # Version snapshots before/after apply
└── backups/        # Pre-apply backups for rollback
```

## CLI Usage

```bash
# Analyze and propose improvements
superskill command evolve my-command --propose-only

# Apply a specific proposal
superskill command evolve my-command --accept p1abc2d
```
