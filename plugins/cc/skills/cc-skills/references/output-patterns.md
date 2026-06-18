# Output Patterns

Use these patterns when skills need to produce consistent, high-quality output.

## Overview

cc skills can output various formats. These patterns help ensure consistent, actionable output across different skill types and platforms.

---

## Template Pattern

Provide templates for output format. Match the level of strictness to your needs.

### Strict Templates (Required Format)

```markdown
## Report structure

ALWAYS use this exact template structure:

# [Analysis Title]

## Executive summary
[One-paragraph overview of key findings]

## Key findings
- Finding 1 with supporting data
- Finding 2 with supporting data
- Finding 3 with supporting data

## Recommendations
1. Specific actionable recommendation
2. Specific actionable recommendation
```

### Flexible Templates (Adaptable)

```markdown
## Report structure

Here is a sensible default format, but use your best judgment:

# [Analysis Title]

## Executive summary
[Overview]

## Key findings
[Adapt sections based on what you discover]

## Recommendations
[Tailor to the specific context]

Adjust sections as needed for the specific analysis type.
```

---

## Examples Pattern

For skills where output quality depends on seeing examples, provide input/output pairs:

```markdown
## Commit message format

Generate commit messages following these examples:

**Example 1:**
Input: Added user authentication with JWT tokens
Output:
```
feat(auth): implement JWT-based authentication

Add login endpoint and token validation middleware
```

**Example 2:**
Input: Fixed bug where dates displayed incorrectly in reports
Output:
```
fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently across report generation
```

Follow this style: type(scope): brief description, then detailed explanation.
```

Examples help the skill understand the desired style and level of detail more clearly than descriptions alone.

---

## Checklist Pattern

For workflow validation with recovery actions:

```markdown
## [Phase Name] Checklist

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

If any fail:
1. [Recovery action]
2. Return to [previous step]
```

---

## Anti-Pattern Format

Show what NOT to do alongside correct approach:

```markdown
## Anti-Pattern: [Name]

**Bad:**
```
[Wrong approach]
```

**Problem:** [Why it's wrong]

**Good:**
```
[Correct approach]
```
```

---

## Decision Tree Pattern

For conditional workflows:

```markdown
## Determine Approach

1. Is [condition A]?
   - Yes → Follow [Workflow A]
   - No → Continue

2. Is [condition B]?
   - Yes → Follow [Workflow B]
   - No → Follow [Default Workflow]
```

---

## Reference Table Pattern

For configuration or option documentation:

```markdown
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| opt1   | str  | "x"     | [Purpose] |
| opt2   | int  | 10      | [Purpose] |
| opt3   | bool | false   | [Purpose] |
```

---

## Analysis Report Pattern

For investigation/review skills:

```markdown
# [Subject] Analysis

**Date:** [Date]
**Scope:** [What was analyzed]

## Summary
[1-2 paragraphs]

## Findings

### Critical
- [Issue with file/line reference]

### High Priority
- [Issue]

### Low Priority
- [Suggestion]

## Recommendations
1. **Immediate:** [Action]
2. **Short-term:** [Action]
3. **Long-term:** [Action]
```

---

## Code Output Pattern

For skills that generate code:

```markdown
## Code Output

**Requirements:**
- Use [language/framework]
- Follow project conventions
- Include error handling

**Output format:**
```[language]
// Code here
```

**Validation:**
- Syntax must be valid
- All imports must exist
- Follows naming conventions
```

---

## Error Response Pattern

For skills that need to report errors:

```markdown
## Error Responses

**Error format:**
```
[ERROR] [Error Type]
Message: [What happened]
Cause: [Why it happened]
Solution: [How to fix]
```

**Example:**
```
[ERROR] Invalid Frontmatter
Message: Missing required field 'name'
Cause: Frontmatter does not include name field
Solution: Add 'name: skill-name' to YAML frontmatter
```
```

---

## Progress Indicator Pattern

For long-running operations:

```markdown
## Progress Tracking

**Format:**
```
[PROGRESS] Step X/Y: [Description]
```

**Example:**
```
[PROGRESS] Step 1/4: Analyzing files
[PROGRESS] Step 2/4: Generating output
[PROGRESS] Step 3/4: Validating results
[PROGRESS] Step 4/4: Complete
```
```

---

## Platform Output Pattern

For multi-platform skills:

```markdown
## Platform-Specific Output

### Claude Code
- Use markdown formatting
- Include code blocks with language

### Codex/OpenClaw
- Use standard markdown
- Plain text output acceptable

### Antigravity
- Simple, concise output
- Avoid complex formatting
```

---

## See Also

- [workflows.md](workflows.md) - Detailed operation workflows
- [best-practices.md](best-practices.md) - Comprehensive guidance
- [skill-patterns.md](skill-patterns.md) - Skill structure patterns
