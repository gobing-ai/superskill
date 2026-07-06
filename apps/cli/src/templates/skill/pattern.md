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

This skill teaches a design pattern for solving a recurring class of problems. It provides decision criteria, core principles, and trade-off analysis — not a step-by-step procedure.

## When to use this pattern

Use this pattern when you need to:

- Make an architectural or design decision between competing approaches
- Evaluate trade-offs along multiple dimensions (complexity, scalability, blast radius)
- Apply a proven mental model to a new problem that fits the pattern shape
- Cross-check a proposed solution against known anti-patterns
- Document the reasoning behind a design choice for future reference

## When NOT to use this pattern

Avoid this pattern when:

- A single obvious solution exists — applying a decision framework adds overhead
- The problem is unique enough that no proven pattern applies

## Core principles

### Principle 1: Favor simplicity

Prefer the simplest solution that meets the requirements. Never add abstraction for a single use case — three similar lines beat a premature abstraction.

### Principle 2: Verify before asserting

Every claim about behavior, performance, or compatibility must be grounded in evidence. Cite the source — docs, tests, or command output.

### Principle 3: Match conventions

Conformance beats personal taste inside an existing codebase. If a convention seems actively harmful, surface it as a question — do not silently diverge.

## Implementation guide

### Step 1: Identify the problem shape

Confirm the problem matches this pattern's trigger conditions. If it doesn't, consider an alternative pattern.

### Step 2: Evaluate trade-offs

Assess the approach against the dimensions below. Document the reasoning.

### Step 3: Validate the decision

Cross-check the decision against project conventions, existing patterns, and acceptance criteria. Cite evidence.

## Trade-offs

| Aspect | Pros | Cons |
|--------|------|------|
| Simplicity | Easy to understand and maintain | May not cover edge cases |
| Flexibility | Adapts to varying requirements | Adds complexity when over-applied |
| Consistency | Aligns with proven practice | May not fit novel problems |

## Behavior

This skill acts as a **pattern**: a decision framework and mental model. When invoked, it guides the agent through evaluating trade-offs and selecting an approach — it does not execute code directly.

## Gotchas

1. **Don't apply blindly**: Always verify the problem matches the pattern's trigger conditions before applying it. Forcing a pattern onto a mismatched problem creates unnecessary complexity.
2. **Don't skip trade-off analysis**: The value of a pattern is in the explicit trade-off evaluation. Skipping straight to a solution loses the reasoning that makes the pattern reusable.
3. **Don't ignore conventions**: A pattern that contradicts project conventions must be surfaced, not silently applied. Conformance beats theoretical purity.

## Platform Notes

### Claude Code

Use `$ARGUMENTS` for parameter references. Use `Skill()` for skill delegation.

### Codex / OpenClaw / OpenCode / Antigravity

Run commands via Bash tool. Arguments provided in chat.

---

**Template type**: pattern
**Purpose**: Decision frameworks and mental models for design decisions
