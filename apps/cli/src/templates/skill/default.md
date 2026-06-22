---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
---

# <!-- NAME -->

<!-- DESCRIPTION -->

## When to use

Use this skill when you need to:

- Execute a defined workflow that must produce a consistent, verifiable output
- Apply project-specific conventions that should not be re-derived from scratch
- Validate work against acceptance criteria before reporting completion
- Cross-check results against authoritative sources or documentation
- Ensure reproducible steps across sessions and agents

## Workflow

Follow these steps to complete the workflow. Each step must be verified before proceeding.

### Step 1: Gather context

Read the relevant files and configuration. Never assume structure — verify paths exist before acting.

```bash
# Example: inspect the target before modifying
ls -la <target>
```

### Step 2: Execute the change

Apply the change with surgical precision. Touch only what the task requires.

### Step 3: Verify the result

Validate the output against the acceptance criteria. Cite the evidence (test output, command result, or document reference) before reporting done.

## Behavior

This skill acts as a technique: a step-by-step workflow with concrete instructions. When invoked, it should execute the workflow end-to-end, verifying each step before proceeding.

**Key invariants:**

- Always verify before claiming completion — never report done without evidence
- Cite sources for any external claim or API behavior
- Validate inputs at system boundaries; trust internal code

## Gotchas

1. **Don't skip verification**: Reporting done without running the verification step is the most common failure mode. Always cite the test or command output.
2. **Don't assume file structure**: Verify paths exist before reading or writing. A missing file is a blocking error, not a silent skip.
3. **Don't drift from conventions**: Match existing project patterns. If a convention seems wrong, surface it — do not silently fork the style.

## Platform Notes

### Claude Code

Use `$ARGUMENTS` for parameter references. Use `Skill()` for skill delegation.

### Codex / OpenClaw / OpenCode / Antigravity

Run commands via Bash tool. Arguments provided in chat.

---

**Template type**: technique (default)
**Purpose**: Step-by-step workflows with concrete instructions and verification gates
