# cc-commands: Troubleshooting Guide

## Error: "Invalid frontmatter field"
Only 5 fields are allowed. Check [frontmatter-reference.md](frontmatter-reference.md) for valid fields.

## Error: "Description too long"
Descriptions must be under 60 characters. Shorten and start with a verb.

## Evaluation fails with low score
Run with `--scope full --verbose` to see detailed findings. Common issues:
- Second-person voice detected
- Missing argument-hint for commands with arguments
- Platform-specific syntax not documented

## Adapt command fails for other platforms
Not all Claude Code features are portable. Check [platform-compatibility.md](platform-compatibility.md) for supported features.

## Common Issues

### My command doesn't trigger
- Check frontmatter `description` is under 60 chars
- Ensure file is in `commands/` directory
- Verify no syntax errors in YAML frontmatter

### Platform adaptation fails
- Some Claude syntax (`$ARGUMENTS`, `Task()`) doesn't translate
- Use `--dry-run` to preview changes before applying

### Validation errors on allowed-tools
- Only use tool names that exist in the platform
- Check tool names are comma-separated
