# Troubleshooting Guide

This guide helps diagnose and fix common issues when building and using cc skills.

## Quick Diagnosis

| Symptom | Likely Cause | See Section |
|---------|--------------|-------------|
| "SKILL.md not found" | File naming/placement | Skill Structure Issues |
| Evaluation fails | Frontmatter validation | Frontmatter Errors |
| Refine errors | Script execution issues | Refine Operation Issues |
| Package fails | Missing files or structure | Package Issues |
| Platform companions missing | Generation errors | Platform Generation |
| Skill quality poor | Missing sections or content | Quality Issues |

---

## 1. Skill Structure Issues

### Symptoms

- "Could not find SKILL.md"
- "Invalid frontmatter"
- "Invalid skill name"

### Causes & Solutions

**Wrong filename:**
```bash
# WRONG
my-skill/Readme.md
my-skill/SKILL.md.txt

# CORRECT
my-skill/SKILL.md
```

**Missing required directories:**
```bash
# CORRECT structure
my-skill/
├── SKILL.md           # Required
├── references/        # Optional
└── assets/            # Optional
```

> For superskill plugin skills, executable logic lives at `plugins/<plugin>/scripts/<feature>/` — see [scripts-and-install.md](scripts-and-install.md).

**Invalid YAML frontmatter:**
```yaml
---
name: my-skill
description: A skill for X
---  # ← Missing closing ---
```

**Invalid skill name:**
```yaml
# WRONG
name: My Skill       # Contains spaces
name: my_skill       # Contains underscores
name: my--skill      # Double hyphen

# CORRECT
name: my-skill       # hyphen-case only
```

### Diagnostic Commands

```bash
# Check file exists
ls -la my-skill/SKILL.md

# Validate YAML
python3 -c "import yaml; yaml.safe_load(open('my-skill/SKILL.md'))"

# Run evaluation
superskill skill evaluate ./my-skill --save
```

---

## 2. Frontmatter Errors

### Symptoms

- Evaluation fails with frontmatter errors
- Required fields missing warnings
- Invalid metadata format

### Causes & Solutions

**Missing required fields:**
```yaml
# WRONG - missing name
---
description: A skill for X
---

# CORRECT
---
name: my-skill
description: A skill for X
---
```

**Missing metadata.platforms:**
```yaml
# RECOMMENDED - include platforms
---
name: my-skill
description: This skill should be used when...
metadata:
  platforms: claude-code,codex,openclaw,opencode
---
```

**Description too generic:**
```yaml
# BAD
description: "A helpful skill"

# GOOD
description: "This skill should be used when the user asks to 'create a database', 'set up PostgreSQL', or mentions 'database migration'."
```

### Diagnostic Commands

```bash
# Run evaluation with verbose output
superskill skill evaluate ./my-skill --save

# Check JSON output
superskill skill evaluate ./my-skill --save --json
```

---

## 3. Refine Operation Issues

### Symptoms

- Refine script fails
- Migration errors
- Platform generation fails

### Causes & Solutions

**Migration failures:**

**Missing API key for LLM refinement:**
```
**Platform generation failures:**
```bash
# Test single platform first
superskill skill refine ./my-skill --target claude

# Check specific adapter errors
superskill skill refine ./my-skill
```

---

## 4. Package Issues

### Symptoms

- Package script fails
- Missing files in output
- Invalid bundle structure

### Causes & Solutions

**Missing required files:**
```bash
# Must have SKILL.md
ls -la my-skill/SKILL.md || echo "MISSING!"

# Check all required files
find my-skill -type f
```

**Invalid directory structure:**
```bash
# Package requires clean structure
# Ensure no nested skill directories
my-skill/
├── SKILL.md           # ← Root level, not in subfolder
└── references/
```

**Bundle too large:**
```bash
# Check size
du -sh my-skill/

# Consider moving large assets to external
# Keep SKILL.md under 5000 tokens
```

### Diagnostic Commands

```bash
# Validate structure first
superskill skill evaluate ./my-skill --save
```

---

## 5. Platform Generation Issues

### Symptoms

- Platform companions not generated
- Invalid adapter output
- Missing openai.yaml or metadata.openclaw

### Causes & Solutions

**Missing platform adapters:**
```bash
# Ensure all platforms requested
superskill skill refine ./my-skill --target all
```

**Adapter errors:**
```bash
# Run with verbose to see adapter errors
superskill skill refine ./my-skill --target codex
```

**Manual generation:**
```bash
# Generate specific platform
superskill skill refine ./my-skill --target codex
superskill skill refine ./my-skill --target openclaw
```

---

## 6. Quality Issues

### Symptoms

- Low evaluation scores
- Missing sections
- Poor trigger design

### Causes & Solutions

**Low content score:**
- Add Overview section
- Include Examples with code blocks
- Add Workflow section with steps

**Poor trigger design:**
```yaml
# BAD - no trigger phrases
description: "A helpful skill"

# GOOD - specific triggers
description: "This skill should be used when the user asks to 'create X', 'build Y', or mentions 'Z'."
```

**Missing progressive disclosure:**
```markdown
# BAD - all content in SKILL.md
[500 lines of content]

# GOOD - split content
# SKILL.md - overview and quick start
# references/ - detailed documentation
```

### Diagnostic Commands

```bash
# Full evaluation with scoring
superskill skill evaluate ./my-skill --save

# Check specific dimensions
superskill skill evaluate ./my-skill --save --json | jq '.scores'
```

---

## Troubleshooting Workflow

```
1. IDENTIFY the symptom
       ↓
2. CHECK the table above for category
       ↓
3. RUN diagnostic commands
       ↓
4. APPLY solution
       ↓
5. TEST the fix
       ↓
6. If still broken → Check best-practices.md
```

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `SKILL.md not found` | Wrong path or filename | Check file exists at skill-path/SKILL.md |
| `YAML parse error` | Invalid frontmatter | Validate YAML syntax |
| `name: is required` | Missing frontmatter field | Add name field |
| `platform not supported` | Invalid platform name | Use: claude, codex, openclaw, opencode, antigravity |
| `No changes needed` | Skill already meets standards | Skip refinement |

---

## Get More Help

- [best-practices.md](best-practices.md) - Comprehensive guidance
- [workflows.md](workflows.md) - Operation workflows
- [security.md](security.md) - Security considerations
- [skill-patterns.md](skill-patterns.md) - Pattern selection guide
