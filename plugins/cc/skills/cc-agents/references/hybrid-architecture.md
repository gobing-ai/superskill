# Hybrid Architecture: Commands and Subagents

Patterns for complex slash commands and subagents that orchestrate workflows.

## Overview

For complex slash commands and subagents that orchestrate workflows, use a **hybrid approach** that separates concerns:

- **Command Layer (.md files)** -- Thin wrappers with pseudocode for orchestration
- **Agent Layer (.md agents)** -- Adaptive coordinators with flexible logic

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Command Layer (.md files) - THIN WRAPPERS                   │
│  - Pseudocode for tool invocation sequence                    │
│  - Explicit "When to use" and "Examples" sections            │
│  - Built-in tools: Task, SlashCommand, AskUserQuestion      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Agent Layer (.md agents) - FAT SKILLS                       │
│  - Flexible logic, conditionals, error handling             │
│  - Adapts based on task state, user responses               │
│  - Delegates to skills, doesn't implement directly          │
└─────────────────────────────────────────────────────────────┘
```

## Command Layer

Use **pseudocode with built-in tools** for workflow orchestration:

- **Built-in tools**: Task, SlashCommand, AskUserQuestion
- **Explicit workflow sequences**: "Step 1 -> Step 2 -> Step 3"
- **Self-documenting**: The pseudocode IS the specification
- **Focus on**: "what to call" and "when to call it"

### Command Template

```markdown
---
description: Task refinement via quality check
argument-hint: "<task-file.md>" [--force-refine]
---

# Tasks Refine

Refine task files by detecting gaps and suggesting improvements.

## When to Use

- Task file has empty/missing sections
- Requirements are unclear or incomplete

## Workflow

This command delegates to the planner agent:

Task(
  subagent_type="super-planner",
  prompt="""Refine task: {task_file}

Steps:
1. Check task file quality
2. If issues found: generate refinement draft
3. Ask user for approval via AskUserQuestion
4. Update task file with approved changes
  """
)
```

## Agent Layer

Use **flexible natural language** with conditional logic:

- **Adaptive behavior** based on task state, user responses, context
- **Error handling**, retries, fallback strategies
- **Decision-making** based on conditions
- **Focus on**: "how to adapt" and "decision-making"

### Agent Process Pattern

```markdown
## Process

### Phase 1: Understand

When receiving a request:
1. Assess task complexity and requirements
2. Identify available resources and constraints
3. Determine if user input is needed

### Phase 2: Execute

Execute with adaptive behavior:
1. If analysis reveals gaps -> Ask user for clarification
2. If multiple approaches exist -> Present options
3. If errors occur -> Retry with alternative strategy

### Phase 3: Verify

Confirm successful completion:
1. Validate output meets requirements
2. Check for errors or warnings
3. Document any assumptions made
```

## Built-in Tools for Commands

| Tool | Purpose | Example |
|------|---------|---------|
| `Task` | Delegate to subagent | `Task(subagent_type="super-planner", prompt="...")` |
| `SlashCommand` | Call another command | `SlashCommand(skill="plugin:command", args="...")` |
| `AskUserQuestion` | Interactive user input | Ask clarifying questions with options |

## Key Rules

- **Commands are thin wrappers** -- Use pseudocode for orchestration
- **Agents are adaptive coordinators** -- Use flexible language for decision-making
- **Always document the workflow** -- Include "When to Use" and "Examples"
- **Use full namespace for resources** -- e.g., `plugin:skill-name`
- **Keep agents skills-based** -- Agents delegate to skills, don't implement directly

## Why This Works

1. **Explicit workflows** -- Claude knows exactly when to use tools
2. **Self-documenting** -- Pseudocode in commands doubles as spec
3. **Flexible execution** -- Agents can adapt to real-world complexity
4. **Separation of concerns** -- Commands = orchestration, Agents = adaptation
5. **Easier debugging** -- Can trace which step failed
6. **Testable components** -- Commands and agents can be tested independently

## Common Patterns

### Sequential Orchestration

```markdown
## Workflow

1. Validate inputs
2. Process with agent A
3. Review with agent B
4. Confirm with user
5. Execute final action
```

### Conditional Branching

```markdown
## Workflow

1. Assess request type
2. IF type A:
   - Call agent X
   - Apply transformation Y
3. IF type B:
   - Call agent Y
   - Apply transformation Z
4. Present result
```

### Retry Logic

```markdown
## Error Handling

IF operation fails:
1. Identify error type
2. IF transient error:
   - Retry with exponential backoff
3. IF configuration error:
   - Suggest fix to user
   - Ask for permission to apply
4. IF unknown error:
   - Log error details
   - Ask user for guidance
```

## Testing

### Test Commands

1. Verify command documentation is complete
2. Test pseudocode executes correctly
3. Verify tool calls use correct syntax
4. Check error handling is documented

### Test Agents

1. Give agent typical task in its domain
2. Verify it follows process steps
3. Test edge cases mentioned in prompt
4. Confirm quality standards are met
5. Test adaptive behavior with different scenarios
