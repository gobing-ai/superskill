# Quick Reference for cc Skills

This reference provides quick lookup patterns for skill creation and structure.

## cc Operations

| Operation | Purpose | CLI Command |
|-----------|---------|-------------|
| **add** | Scaffold a new skill | `superskill skill scaffold` |
| **evaluate** | Validate and score skill quality | `superskill skill evaluate` |
| **refine** | Fix issues and improve quality | `superskill skill refine` |
| **package** | Package for distribution | _Phase 4_ |

---

## Skill Structure Patterns

### Minimal Skill

```
skill-name/
└── SKILL.md
```

**When to use:** Simple knowledge, no complex resources needed

### Standard Skill (Recommended)

```
skill-name/
├── SKILL.md
├── references/
│   └── detailed-guide.md
└── extensions/
    └── utility.ts
```

**When to use:** Most skills with detailed documentation

### Complete Skill

```
skill-name/
├── SKILL.md
├── references/
│   ├── patterns.md
│   ├── best-practices.md
│   └── troubleshooting.md
├── extensions/
│   ├── scaffold.ts
│   └── validate.ts
└── agents/
    └── openai.yaml
```

**When to use:** Complex domains with platform adapters

---

## Frontmatter Templates

### Basic Template

```yaml
---
name: skill-name
description: This skill should be used when the user asks to "specific phrase 1", "specific phrase 2", or mentions domain-specific terms.
---
```

### With Metadata

```yaml
---
name: skill-name
description: This skill should be used when the user asks to "specific phrase 1", "specific phrase 2", or mentions domain-specific terms.
metadata:
  platforms: claude-code,codex,openclaw,opencode,antigravity
  version: 1.0.0
---
```

### Comprehensive Example

```yaml
---
name: oauth-integration
description: This skill should be used when the user asks to "implement OAuth2", "add Google authentication", "configure OAuth providers", "set up SSO", or mentions OAuth flows, authorization codes, or token management.
metadata:
  platforms: claude-code,codex,openclaw,opencode
  version: 2.1.0
---
```

---

## SKILL.md Structure Template

### Essential Sections

```markdown
# [Skill Name]

## Overview
[Brief description of skill's purpose - 100-200 words]

## Quick Start
```bash
# Most common usage example
```

## Workflows
### [Workflow 1 Name]
[Step-by-step procedure]

### [Workflow 2 Name]
[Step-by-step procedure]

## Additional Resources
### Reference Files
- **`references/file1.md`** - Description
- **`references/file2.md`** - Description
```

### Optional Sections

```markdown
## Platform Notes
[Platform-specific guidance]

## Best Practices
[Recommendations and guidelines]

## Troubleshooting
[Common issues and solutions]
```

---

## Progressive Disclosure

### SKILL.md Content (Always Loaded)

**Include:**
- Core concepts (briefly)
- Essential procedures
- Quick start examples
- Reference links
- Common use cases

**Target:** 1,500-2,000 words

### references/ Content (Loaded as Needed)

**Types of content to move:**
- Detailed patterns → `references/patterns.md`
- Advanced techniques → `references/advanced.md`
- Troubleshooting → `references/troubleshooting.md`
- Security considerations → `references/security.md`

---

## Quality Dimensions

| Dimension | What It Checks |
|-----------|---------------|
| Frontmatter | Valid YAML, name, description quality |
| Content | Length, sections, examples |
| Structure | Progressive disclosure, organization |
| Security | No dangerous patterns |
| Best Practices | Naming, conventions |

---

## CLI Commands

### Scaffold (Create New Skill)

```bash
superskill skill scaffold my-skill --output ./skills
```

### Evaluate (Validate)

```bash
# Basic validation
superskill skill evaluate ./skills/my-skill --save

# Full evaluation with scoring
superskill skill evaluate ./skills/my-skill --save

# JSON output
superskill skill evaluate ./skills/my-skill --save --json
```

### Refine (Improve)

```bash
# Apply best practices fixes
superskill skill refine ./skills/my-skill --auto --save

# Generate platform companions
superskill skill refine ./skills/my-skill --target all

# Dry run
superskill skill refine ./skills/my-skill
```

### Package (Distribute)


---

## Skill Types

| Type | Description | Structure Focus |
|------|-------------|----------------|
| **Technique** | Concrete steps to follow | Steps, code, common mistakes |
| **Pattern** | Way of thinking | Principles, when/when-not |
| **Reference** | API/syntax docs | Tables, searchable, lookup |

---

## Platform Adapters

| Platform | Extension | Purpose |
|----------|-----------|---------|
| Claude Code | Native | Direct skill usage |
| Codex | `agents/openai.yaml` | UI metadata |
| OpenClaw | `metadata.openclaw` | Emoji, requirements |
| OpenCode | Config hints | Permission hints |
| Antigravity | Native | Gemini CLI compatible |

---

## Grading Scale

| Grade | Score | Status | Action |
|-------|-------|--------|--------|
| **A** | 90-100 | Production ready | Deploy |
| **B** | 70-89 | Minor polish | Fix minor issues |
| **C** | 50-69 | Needs improvement | Address major issues |
| **D** | 30-49 | Major revision | Rewrite significant portions |
| **F** | <30 | Complete rewrite | Start over |

---

## Writing Style Quick Reference

### Description Format

| Aspect | Correct | Incorrect |
|--------|---------|-----------|
| **Person** | Third person ("This skill should be used...") | Second person ("Use this skill...") |
| **Triggers** | Specific phrases ("create X", "configure Y") | Generic ("working with X") |
| **Scope** | Clear about what skill does | Vague or ambiguous |

### Body Format

| Aspect | Correct | Incorrect |
|--------|---------|-----------|
| **Form** | Imperative ("Create X") | Second person ("You should create X") |
| **Tone** | Objective, instructional | Conversational |
| **Structure** | Clear headings, numbered steps | Unstructured paragraphs |

---

## Checklist Summary

### Before Finalizing

**Structure:**
- [ ] SKILL.md exists with valid frontmatter
- [ ] name and description fields present
- [ ] Referenced files exist
- [ ] Examples are complete

**Description:**
- [ ] Third person format
- [ ] Specific trigger phrases
- [ ] Concrete scenarios

**Content:**
- [ ] Imperative/infinitive form
- [ ] 1,500-2,000 words (ideal)
- [ ] Detailed content in references/

**Progressive Disclosure:**
- [ ] SKILL.md is lean
- [ ] references/ linked
- [ ] No duplication

---

## Common Error Messages

| Error | Solution |
|-------|----------|
| SKILL.md not found | Check file path |
| YAML parse error | Validate frontmatter syntax |
| name: is required | Add name field to frontmatter |
| Invalid platform | Use: claude, codex, openclaw, opencode, antigravity |

---

## See Also

- [workflows.md](workflows.md) - Detailed operation workflows
- [best-practices.md](best-practices.md) - Comprehensive best practices
- [security.md](security.md) - Security considerations
- [skill-patterns.md](skill-patterns.md) - Pattern selection guide
- [troubleshooting.md](troubleshooting.md) - Common issues and fixes
