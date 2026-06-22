---
name: <!-- NAME -->
description: <!-- DESCRIPTION -->
license: Apache-2.0
metadata:
  author: "[author]"
  version: "1.0"
  platforms: "claude-code,codex,openclaw,opencode,antigravity"
---

# <!-- NAME -->

<!-- DESCRIPTION -->

## When to use

Use this skill when you need to:

- Execute a multi-step workflow that must produce a verified, reproducible output
- Apply a project-specific procedure that should never be re-derived from scratch
- Validate work against acceptance criteria before reporting completion
- Cross-check intermediate results against authoritative documentation
- Ensure deterministic steps across sessions, agents, and CI runs

## Workflow

Follow these steps to complete the workflow. Each step must be verified before proceeding to the next.

### Step 1: Gather context

Read the relevant files, configuration, and reference material. Never assume structure — verify paths exist before acting.

```bash
# Example: inspect the target before modifying
ls -la <target>
```

### Step 2: Plan the change

Identify the files to read and modify, dependencies, and edge cases. State assumptions explicitly.

### Step 3: Execute the change

Apply the change with surgical precision. Touch only what the task requires — no drive-by refactors.

### Step 4: Verify the result

Validate the output against the acceptance criteria. Cite the evidence (test output, command result, or document reference) before reporting done.

## Behavior

This skill acts as a **technique**: a step-by-step workflow with concrete instructions. When invoked, it executes the workflow end-to-end, verifying each step before proceeding.

**Key invariants:**

- Always verify before claiming completion — never report done without evidence
- Cite sources for any external claim or API behavior
- Validate inputs at system boundaries; trust internal code

## Code Examples

### Basic Usage

```bash
# Example command showing basic usage
superskill <!-- NAME --> <target>
```

### Advanced Usage

```bash
# Example command with options
superskill <!-- NAME --> <target> --strict --json
```

## Gotchas

1. **Don't skip verification**: Reporting done without running the verification step is the most common failure mode. Always cite the test or command output.
2. **Don't assume file structure**: Verify paths exist before reading or writing. A missing file is a blocking error, not a silent skip.
3. **Don't drift from conventions**: Match existing project patterns. If a convention seems wrong, surface it — do not silently fork the style.

## Resources (optional)

Create only the resource directories this skill actually needs.

### scripts/

Executable code (TypeScript/Bash) for tasks that require deterministic reliability.

### references/

Documentation intended to be loaded into context as needed.

## Platform Notes

### Claude Code

Use `$ARGUMENTS` for parameter references. Use `Skill()` for skill delegation.

### Codex / OpenClaw / OpenCode / Antigravity

Run commands via Bash tool. Arguments provided in chat.

---

**Template type**: technique
**Purpose**: Step-by-step workflows with concrete instructions and verification gates
