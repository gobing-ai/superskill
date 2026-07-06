---
name: <!-- NAME -->
# Description rules: front-load the leading identity phrase; one trigger per genuine
# branch (collapse synonym triggers into one); never restate the body's identity line.
description: <!-- DESCRIPTION -->
license: Apache-2.0
metadata:
  author: "[author]"
  version: "1.0"
  platforms: "claude-code,codex,openclaw,opencode,antigravity"
---

# <!-- NAME -->

<!-- DESCRIPTION -->

## Overview

This skill provides a reference lookup for API details, configuration keys, command flags, and technical specifications. Use it to verify facts before generating code or making claims.

## When to use

Use this skill when you need to:

- Look up an API signature, flag, or configuration key before using it
- Verify version-specific behavior of a library or tool
- Cross-check a claim against authoritative documentation
- Find the correct syntax for a command or configuration
- Validate that a field, option, or path exists before referencing it

## Quick reference

| Category | Item | Description |
|----------|------|-------------|
| Commands | `scaffold <name>` | Create new content from a template |
| Commands | `evaluate <name>` | Score content quality (0.0–1.0) |
| Commands | `validate <name>` | Structural + schema validation |
| Flags | `--template <tier>` | Select a template tier |
| Flags | `--target <agent>` | Target agent platform |
| Flags | `--force` | Overwrite existing files |
| Flags | `--json` | Machine-readable output |

## Detailed reference

### Commands

#### scaffold

Creates a new content file from a resolved template. For the skill type, writes `<name>/SKILL.md` inside a directory; all other types write flat `<name>.md`.

```bash
superskill skill scaffold my-skill --description "A test skill"
```

#### evaluate

Scores content quality across 5 dimensions: completeness, clarity, trigger-accuracy, anti-hallucination, and conciseness. Returns an aggregate score (0.0–1.0) with per-dimension findings.

```bash
superskill skill evaluate my-skill
```

#### validate

Structural and schema validation. Checks frontmatter fields, body structure, link integrity, and format compliance. Use `--strict` for all optional checks.

```bash
superskill skill validate my-skill --strict
```

### Template tiers

| Tier | Purpose | Body shape |
|------|---------|------------|
| `technique` | Step-by-step workflows | Workflow + steps + verification |
| `pattern` | Decision frameworks | Trade-offs + principles + when-to-use |
| `reference` | Lookup tables | Quick-reference + detailed docs |

A freshly scaffolded skill PASSes the project's own evaluator out of the box.

## Behavior

This skill acts as a **reference**: a lookup table and documentation source. When invoked, it provides authoritative information — it does not execute workflows or make decisions. Always cite this reference when answering factual questions about the system.

## Gotchas

1. **Don't guess API behavior**: Always verify against this reference before claiming how a command or flag behaves. Version-specific behavior must be cited with the version.
2. **Don't confuse template tiers**: Each tier produces a different body structure. Choose the tier that matches the skill's purpose — technique for workflows, pattern for decisions, reference for lookups.
3. **Don't skip the quick-reference table**: The table is the fastest path to an answer. If the item isn't in the table, check the detailed reference section before concluding it doesn't exist.

## Platform Notes

### Claude Code

Use `$ARGUMENTS` for parameter references. Use `Skill()` for skill delegation.

### Codex / OpenClaw / OpenCode / Antigravity

Run commands via Bash tool. Arguments provided in chat.

---

**Template type**: reference
**Purpose**: Lookup tables and documentation for quick factual reference
