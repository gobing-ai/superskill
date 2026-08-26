# Skill Creation Guide

Step-by-step guide for creating and refining cc skills.

## Overview

This document provides detailed guidance for creating new skills using the cc workflow. cc uses a four-operation approach: add, evaluate, refine, and package.

## Process Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    SKILL CREATION WORKFLOW                  │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────┐
│ Step 1:      │ Gather concrete examples of how the skill
│ Understand    │ will be used. What functionality should it
│ Requirements │ support? What would users say to trigger it?
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Step 2:      │ For each example, identify:
│ Plan Resources│ • Plugin scripts at scripts/<feature>/
│               │ • References: Info re-discovered each time?
│               │ • Assets: Boilerplate needed each time?
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Step 3:       │ Run scaffold command:
│ Scaffold      │ superskill skill scaffold <name> --output <dir>
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Step 4:      │ A. Implement resources (test scripts!)
│ Implement     │ B. Write SKILL.md (frontmatter + body)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Step 5:      │ validate (structure + `_layout`), then
│ Validate +    │ superskill skill evaluate <nameOrPath>
│ Evaluate      │ (quality scoring is content-only)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Step 6:      │ superskill skill refine <nameOrPath>
│ Refine        │ Fix issues, add platform companions
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Package       │ Creates distributable bundle
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ Step 8:      │ Use on real tasks, gather feedback,
│ Iterate       │ refine SKILL.md and resources
└───────────────┘
```

---

## Step 1: Understanding Requirements

### Goal

Gather concrete examples of how the skill will be used to ensure it addresses real needs.

### Questions to Ask

When building a new skill, ask the user:

- "What functionality should this skill support?"
- "Can you give examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"
- "Are there existing examples or reference materials?"

### Example: Image Editor Skill

**Questions to ask:**
- "What functionality should the image-editor skill support? Editing, rotating, anything else?"
- "Can you give some examples of how this skill would be used?"
- "What would a user say that should trigger this skill?"

**Sample responses:**
- "Remove red-eye from this image"
- "Rotate this PDF 90 degrees"
- "Resize this image to 100x100"

**Conclude when:** Clear sense of the functionality the skill should support.

---

## Step 2: Planning Resources

### Goal

Analyze each example to identify what reusable resources would help when executing these workflows repeatedly.

### Analysis Framework

For each concrete example, consider:

1. **How would I execute this from scratch?**
2. **What am I re-discovering or re-writing each time?**
3. **What could be pre-packaged to save time and reduce errors?**

### Resource Types

| Type | When to Include | Example |
|------|----------------|---------|
| **references/** | Info re-discovered each time: schemas, APIs, domain knowledge | `references/schema.md` for table schemas |
| **assets/** | Boilerplate needed each time: templates, sample files | `assets/hello-world/` for template |

> Executable scripts (code rewritten repeatedly, deterministic reliability needed) do **not** live in the skill folder — they centralize at `plugins/<plugin>/scripts/<feature>/`.

### Example: PDF Editor Skill

**Example query:** "Help me rotate this PDF"

**Analysis:**
1. Rotating a PDF requires re-writing the same code each time
2. A plugin-level script (e.g. `plugins/<plugin>/scripts/pdf-editor/rotate_pdf.ts`) would be helpful

**Result:** Ship `rotate_pdf.ts` at the plugin level (`plugins/<plugin>/scripts/pdf-editor/`), not inside the skill folder.

---

## Step 3: Scaffold Skill

### Goal

Create the skill directory structure with proper templates.

### Command

```bash
superskill skill scaffold <skill-name> --output <output-directory>
```

### What It Creates

```
skill-name/
├── SKILL.md          # Template with frontmatter and TODO sections
└── references/
    └── .gitkeep     # Placeholder for references
```

> For superskill plugin skills, executable logic lives at `plugins/<plugin>/scripts/<feature>/` — see [scripts-and-install.md](scripts-and-install.md).

### After Scaffolding

- Customize SKILL.md frontmatter with skill-specific name and description
- Keep or remove placeholder files based on skill needs
- Add references or assets **inside the skill folder**
- Add executables **only** at `plugins/<plugin>/scripts/<feature>/` — never `skills/<name>/scripts/`

---

## Step 4: Implement Skill

### Goal

Create the resources and write SKILL.md content.

### Part A: Create Resources First

Start with the reusable resources identified in Step 2:

1. **Plugin-level scripts** — write and test at `plugins/<plugin>/scripts/<feature>/` (not inside the skill folder). TypeScript sources need a portable twin: `superskill script convert <plugin> <feature>/<file>.ts`. Commit the `.mjs`. Run it under `node`.
2. **references/** — document schemas, APIs, workflows
3. **assets/** — gather templates and sample files

**Important:** Test scripts by running the portable entrypoint (`node` / `sh`), not only the TypeScript source. Teach SKILL.md the standard form:

```bash
node "$(superskill script path <plugin> <feature>/<file>.mjs)" [args]
```

Do not implement a class for `script run` to discover. See [scripts-and-install.md](scripts-and-install.md).

### Part B: Write SKILL.md

#### Frontmatter (YAML)

```yaml
---
name: skill-name
description: Clear description of what the skill does AND when to use it
metadata:
  platforms: claude-code,codex,openclaw,opencode,antigravity
---
```

**Description tips:**
- Include BOTH what the skill does and when to use it
- Use third person: "This skill should be used when..."
- Put "when to use" info here, NOT in the body
- Example: "Comprehensive PDF processing for rotation, merging, and text extraction. Use when working with PDF files: rotating pages, merging multiple PDFs, extracting text content, or modifying PDF structure."

#### Body (Markdown)

Write instructions for using the skill and its bundled resources.

**Writing guidelines:**
- Use imperative/infinitive form ("Create X", not "Creates X")
- Focus on procedural instructions and workflow guidance
- Keep it concise - every line should justify its token cost
- Move detailed reference material to `references/` files

**Key sections to include:**
- Overview
- Quick Start (with examples)
- Workflow or usage patterns
- Links to detailed references

---

## Step 5: Validate, then Evaluate

### Goal

Ensure the skill meets structural requirements, then score quality. Layout (`_layout`) is a
**validate** finding — `evaluate` is content-only and has no filesystem walk.

### Command

```bash
# Structure + plugin-skill layout (scripts/ / extensions/ → field _layout)
superskill skill validate <nameOrPath>

# Quality scoring (content-only)
superskill skill evaluate <nameOrPath> --save
```

### What validate checks

- ✓ SKILL.md exists
- ✓ Valid YAML frontmatter
- ✓ Required fields (name, description)
- ✓ Proper file organization
- ✓ Plugin skills have no `scripts/` or `extensions/` directory (field `_layout`)

### What evaluate checks

- Quality scoring across dimensions
- Recommendations for improvement

### Exit Codes

- `0` - Evaluation passed
- `1` - Evaluation failed

If evaluation fails, fix errors and re-run.

---

## Step 6: Refine

### Goal

Fix issues and improve quality based on evaluation results.

### Command

```bash
# Apply deterministic fixes
superskill skill refine <nameOrPath> --auto --save

# Generate platform companions
superskill skill refine <nameOrPath> --target all

# Dry run
superskill skill refine <nameOrPath>
```

### Refinement Options

| Option | What It Does |
|--------|-------------|
| `--best-practices` | Auto-fix TODOs, Windows paths, circular references |
| `--migrate` | Migrate rd2 skills to cc format |
| `--platform` | Generate platform-specific companions |

### Multiple Options

```bash
# Combined refinement
superskill skill refine <nameOrPath> --auto --save --target all
```

---

## Step 7: Package

### Goal

Create distributable bundle for sharing.

### Command


### What It Does

1. Automatically validates first (fails if validation fails)
2. Creates bundle with skill and all resources
3. Includes platform companions if generated

---

## Step 8: Iterate

### Goal

Refine skill based on real usage.

### Workflow

```
Use on real tasks
    ↓
Notice struggles or inefficiencies
    ↓
Identify what should be updated
    ↓
Implement changes
    ↓
Test and re-evaluate
```

### Common Improvements

- **Missing guidance**: Add workflow steps for edge cases a real run actually hit — not ones you anticipate ([best-practices.md](best-practices.md) § Add Only What Usage Proved Necessary)
- **Token efficiency**: Move details to references/, tighten language
- **New resources**: Add plugin-level scripts for repeated patterns (`plugins/<plugin>/scripts/<feature>/`), references for re-discovered info
- **Clarity**: Improve description triggers, simplify instructions

### Re-Refine

After making improvements, run evaluate/refine cycle again:

```bash
superskill skill evaluate ./my-skill --save
superskill skill refine ./my-skill --auto --save --target all
```

---

## Quick Reference

```bash
# Full workflow from scratch
superskill skill scaffold my-skill --output ./skills
# Edit SKILL.md and add resources
superskill skill validate ./skills/my-skill
superskill skill evaluate ./skills/my-skill --save
superskill skill refine ./skills/my-skill --auto --save --target all

# Refinement workflow
superskill skill evaluate ./skills/my-skill --save
# Make improvements
superskill skill refine ./skills/my-skill --auto --save
```

---

## See Also

- [workflows.md](workflows.md) - Detailed operation workflows
- [best-practices.md](best-practices.md) - Comprehensive guidance
- [quick-reference.md](quick-reference.md) - CLI command reference
- [troubleshooting.md](troubleshooting.md) - Common issues and fixes
- [scripts-and-install.md](scripts-and-install.md) - Plugin-level scripts, dual contract, authoring recipe
