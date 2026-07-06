# cc-commands: Command Examples

## Example 1: Scaffold a Simple Command

```bash
# Basic scaffold (minimal — fill in TODOs manually)
superskill command scaffold review-code --output ./commands

# Scaffold with description and skill delegation pre-filled
superskill command scaffold review-code "Review code quality and suggest fixes" \
  --output ./commands

# Scaffold a plugin command (uses CLAUDE_PLUGIN_ROOT)
superskill command scaffold deploy-app --output ./commands
```

## Example 2: Evaluate and Fix

```bash
# Basic evaluation
superskill command evaluate ./commands/review-code.md --save

# Full evaluation with detailed findings
superskill command evaluate ./commands/review-code.md --save

# Refine based on evaluation findings
superskill command refine ./commands/review-code.md --auto --save
```

## Key Patterns

### Correct Skill() Invocation

Always pass `args` with operation name:

```
Skill(skill="cc:cc-skills", args="add $ARGUMENTS")
```

Not:

```
Skill(skill="cc:cc-skills")  # Missing args — penalized by evaluator
```

### Positional Description

Commands that create or refine accept an optional description as the second positional argument:

```bash
/cc:command-add review-code "Review code quality and suggest fixes"
/cc:command-refine ./commands/review-code.md "Focus on security patterns"
```

The `--description` flag takes priority if both are provided.

## Template Placeholders

When using the scaffold templates (`simple.md`, `workflow.md`, `plugin.md`), replace these
placeholders:

| Placeholder | Description |
|--------------|-------------|
| `{{COMMAND_TITLE}}` | Title of the command (e.g., "Skill Add") |
| `{{DESCRIPTION}}` | Short description (under 60 chars, start with verb) |
| `{{ARGUMENT_HINT}}` | CLI argument hint showing all options |
| `{{TARGET_SKILL}}` | Skill being wrapped (e.g., "cc:cc-skills") |
| `{{PLUGIN_NAME}}` | Plugin name (e.g., "cc") |
| `{{PLUGIN_PATH}}` | Plugin path (e.g., "cc/skills/cc-skills") |
| `{{SKILL_DIR}}` | Skill directory name |
| `{{HANDLER_NAME}}` | Handler filename |
| `{{ARG_NAME}}` | Argument name |
| `{{FLAG_NAME}}` | Flag name |
| `{{RELATED_COMMAND_1}}` | Related command name |
| `{{RELATED_COMMAND_2}}` | Another related command |
