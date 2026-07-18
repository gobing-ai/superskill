# Agent Skills Best Practices

Consolidated best practices for creating effective Claude Code Agent Skills.

## Table of Contents

- [Core Principles](#core-principles)
- [Skill Structure](#skill-structure)
- [Writing Effective Descriptions](#writing-effective-descriptions)
- [Progressive Disclosure](#progressive-disclosure)
- [Content Guidelines](#content-guidelines)
- [Workflows and Feedback Loops](#workflows-and-feedback-loops)
- [Scripts and Executable Code](#scripts-and-executable-code)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Quality Checklist](#quality-checklist)

---

## Core Principles

### Concise is Key

The context window is a public good. Your skill shares the context window with everything else Claude needs: system prompt, conversation history, other skills' metadata, and the actual request.

**Default assumption: Claude is already very smart.** Only add context Claude doesn't already have. Challenge each piece of information:

- "Does Claude really need this explanation?"
- "Can I assume Claude knows this?"
- "Does this paragraph justify its token cost?"

**Good example (~50 tokens):**

```markdown
## Extract PDF text

Use pdfplumber for text extraction:

import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

**Bad example (~150 tokens):**

```markdown
## Extract PDF text

PDF (Portable Document Format) files are a common file format that contains
text, images, and other content. To extract text from a PDF, you'll need to
use a library. There are many libraries available for PDF processing, but we
recommend pdfplumber because it's easy to use and handles most cases well.
```

### Set Appropriate Degrees of Freedom

Match specificity to the task's fragility and variability:

| Freedom Level | When to Use | Example |
|---------------|-------------|---------|
| **High** (text-based) | Multiple valid approaches, context-dependent decisions | Code review guidelines |
| **Medium** (extensions/params) | Preferred pattern exists, some variation acceptable | Report generation |
| **Low** (specific scripts) | Fragile operations, consistency critical | Database migrations |

**Analogy:** Think of Claude as exploring a path:

- **Narrow bridge**: One safe way forward → provide specific guardrails (low freedom)
- **Open field**: Many paths lead to success → give general direction (high freedom)

### Avoid Railroading

Claude will try hard to follow your instructions exactly. Because skills are reused across many different contexts, overly specific instructions cause problems. Give Claude the information it needs, but let it adapt.

**Too rigid** (breaks when context differs):
```markdown
## Error Handling
1. Wrap all API calls in try/catch
2. Log the error with console.error
3. Return a 500 status with message "Internal Server Error"
4. Send a Slack notification to #alerts
```

**Appropriately flexible** (works across contexts):
```markdown
## Error Handling
Handle API errors gracefully:
- Catch and log errors with enough context to debug
- Return appropriate HTTP status codes
- Notify the team if the error affects users
```

**Too rigid** (assumes specific setup):
```markdown
## Testing
Run `pytest tests/ -v --cov=src --cov-report=html` after every change.
Open coverage report at htmlcov/index.html and verify >90% coverage.
```

**Appropriately flexible** (adapts to project):
```markdown
## Testing
Run the project's test suite after changes. Check coverage if
the project has coverage tooling configured. Aim for coverage
parity with existing code.
```

**Rule of thumb:** If an instruction would be wrong in 20% of cases, make it flexible. If it must be exact every time (database migrations, compliance checks), make it rigid.

### Build a Gotchas Section

The highest-signal content in any skill is the **Gotchas section**. Build it up from common failure points that Claude runs into when using your skill.

**How to grow your Gotchas section:**

1. Start with 2-3 known failure modes
2. Use the skill on real tasks
3. When Claude fails or produces wrong output, add the failure as a gotcha
4. Each gotcha should name the failure mode AND explain how to avoid it

**Good gotcha:**
```markdown
**Don't use `pdfplumber` for scanned PDFs** — it only extracts embedded text.
For scanned documents, use `pytesseract` with `pdf2image` first.
```

**Bad gotcha:**
```markdown
**Be careful with PDFs** — some things might not work.
```

The Gotchas section is more valuable than most other sections because it captures knowledge Claude doesn't have by default. Prioritize keeping it up to date.

### Test with All Target Models

Skills act as additions to models, so effectiveness depends on the underlying model:

- **Claude Haiku**: Does the skill provide enough guidance?
- **Claude Sonnet**: Is the skill clear and efficient?
- **Claude Opus**: Does the skill avoid over-explaining?

---

## Skill Structure

### YAML Frontmatter Requirements

Every SKILL.md requires these fields:

**`name`:**
- Maximum 64 characters
- Lowercase letters, numbers, and hyphens only
- No reserved words ("anthropic", "claude")

**`description`:**
- Non-empty, maximum 1024 characters
- Must describe what the skill does AND when to use it

### Naming Conventions

Use **gerund form** (verb + -ing) for skill names:

- ✓ `pdf-processing`, `spreadsheet-analysis`, `database-management`
- ✗ Vague: `helper`, `utils`, `tools`

### Token Budgets

- Keep SKILL.md body under **500 lines**
- Split content into separate files when approaching this limit
- Use progressive disclosure patterns for larger content

---

## Writing Effective Descriptions

The `description` field is the primary triggering mechanism. Claude uses it to choose the right skill from potentially 100+ available skills.

### Always Write in Third Person

- ✓ "Processes Excel files and generates reports"
- ✗ "I can help you process Excel files"

### Be Specific and Include Key Terms

Include both what the skill does AND specific triggers/contexts:

```yaml
# Good examples
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

description: Analyze Excel spreadsheets, create pivot tables, generate charts. Use when analyzing Excel files, spreadsheets, tabular data, or .xlsx files.

description: Generate descriptive commit messages by analyzing git diffs. Use when the user asks for help writing commit messages or reviewing staged changes.
```

---

## Progressive Disclosure

Skills use three-level loading:

1. **Metadata** - name + description (~100 tokens, always loaded)
2. **SKILL.md body** - Instructions (<500 lines, loaded on trigger)
3. **References** - Detailed docs (loaded on demand)

### Pattern: High-Level Guide with References

```markdown
# PDF Processing

## Quick start

Extract text with pdfplumber:
[code example]

## Advanced features

- **Form filling**: See [forms.md](reference/forms.md)
- **API reference**: See [reference.md](reference/api.md)
```

### Guidelines

- Keep references one level deep from SKILL.md
- Structure longer files (>100 lines) with a table of contents
- Name files descriptively: `form_validation_rules.md`, not `doc2.md`

---

## Content Guidelines

### Avoid Time-Sensitive Information

Don't include information that will become outdated:

```markdown
## Current method

Use the v2 API endpoint: `api.example.com/v2/messages`

<details>
<summary>Legacy v1 API (deprecated)</summary>
The v1 API used: `api.example.com/v1/messages`
</details>
```

### Use Consistent Terminology

- ✓ "API endpoint", "field", "extract"
- ✗ Mix "API endpoint", "URL", "API route"

### Use Imperative/Infinitive Form

- ✓ "Extract text from the PDF"
- ✗ "You should extract text from the PDF"

---

## Workflows and Feedback Loops

### Sequential Workflows with Checklists

```markdown
## PDF form filling workflow

Copy this checklist and check off items as you complete them:

- [ ] Step 1: Analyze the form
- [ ] Step 2: Create field mapping
- [ ] Step 3: Validate mapping
- [ ] Step 4: Fill the form
- [ ] Step 5: Verify output
```

### Implement Feedback Loops

**Common pattern**: Run validator → fix errors → repeat

```markdown
1. Make your edits
2. Validate immediately: run the plugin-level validator (e.g. `node "$(superskill script path <plugin> <feature>/validate.js)"`)
3. If validation fails, fix and repeat
4. Only proceed when validation passes
```

> Validators are plugin-level scripts, not skill-folder scripts. See [scripts-and-install.md](scripts-and-install.md).

### Conditional Workflows

```markdown
1. Determine the modification type:

   **Creating new content?** → Follow "Creation workflow"
   **Editing existing content?** → Follow "Editing workflow"
```

---

## Scripts and Executable Code

### Solve, Don't Punt

Handle error conditions rather than letting Claude figure it out:

```python
def process_file(path):
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        print(f"File {path} not found, creating default")
        with open(path, 'w') as f:
            f.write('')
        return ''
```

### Document Configuration Values

Avoid "voodoo constants"—justify and document all values:

```python
# HTTP requests typically complete within 30 seconds
REQUEST_TIMEOUT = 30

# Three retries balances reliability vs speed
MAX_RETRIES = 3
```

### Package Dependencies

- List required packages in SKILL.md
- Verify availability in the execution environment

---

## Setup & Configuration

Some skills need user-specific configuration before they can run. Use the **config.json pattern** to handle first-run setup gracefully.

### The Config Pattern

Store setup information in a config file within the skill's stable data directory:

```markdown
## Setup

On first run, check for config at `${CLAUDE_PLUGIN_DATA}/config.json`.

If config does not exist:
1. Ask the user for required settings using AskUserQuestion
2. Save responses to `${CLAUDE_PLUGIN_DATA}/config.json`
3. Proceed with the workflow

If config exists:
1. Load settings from config
2. Proceed with the workflow
```

### Example: Slack Posting Skill

```json
// ${CLAUDE_PLUGIN_DATA}/config.json
{
  "slack_channel": "#team-standup",
  "format": "bullet-points",
  "include_prs": true
}
```

```markdown
## First Run

If `${CLAUDE_PLUGIN_DATA}/config.json` does not exist, ask:
- "Which Slack channel should I post to?"
- "What format do you prefer? (bullet-points, paragraph, table)"

Use AskUserQuestion to present structured choices.
```

### Key Rules

- Always use `${CLAUDE_PLUGIN_DATA}` for config (survives skill upgrades)
- Never store config in the skill directory itself (gets deleted on upgrade)
- Make setup re-runnable (user should be able to reconfigure)
- Provide sensible defaults where possible

---

## Data & Memory

Skills can persist data across sessions using file-based storage. This enables stateful workflows like standups, recurring reports, or operation logs.

### Where to Store Data

| Location | Survives Upgrade? | Use For |
|----------|-------------------|---------|
| `${CLAUDE_PLUGIN_DATA}/` | **Yes** | Config, logs, state, databases |
| Skill directory (`./`) | **No** | Temporary files only |

**Always use `${CLAUDE_PLUGIN_DATA}`** for any data that should persist.

### Common Patterns

**Append-only log** (standup history, operation audit trail):
```markdown
Append each run's output to `${CLAUDE_PLUGIN_DATA}/runs.log`.
Read the log on next run to see what changed since last time.
```

**JSON state** (user preferences, last-run metadata):
```markdown
Save state to `${CLAUDE_PLUGIN_DATA}/state.json` after each run.
Load state at start of next run for continuity.
```

**SQLite database** (complex queries, structured data):
```markdown
Use `${CLAUDE_PLUGIN_DATA}/data.db` for structured storage.
Include schema creation in the skill's setup step.
```

### When to Persist Data

- Skill runs repeatedly and benefits from history (standups, reports)
- Skill needs to track state across sessions (progress, configuration)
- Skill produces audit trails (infrastructure operations, deployments)

### When NOT to Persist

- One-shot transformations (PDF conversion, code generation)
- Results are already stored elsewhere (git, ticket systems)
- Data is sensitive and shouldn't be stored locally

---

## Anti-Patterns to Avoid

### Avoid Windows-Style Paths

Always use forward slashes:

- ✓ `plugins/<plugin>/scripts/<feature>/helper.py`, `references/guide.md`
- ✗ `plugins\<plugin>\scripts\<feature>\helper.py`

### Avoid Offering Too Many Options

- ✗ "You can use pypdf, or pdfplumber, or PyMuPDF..."
- ✓ "Use pdfplumber for text extraction"

### Avoid Assuming Tools Are Installed

- ✗ "Use the pdf library to process the file"
- ✓ "Install required package: `pip install pypdf`"

### Avoid Deeply Nested References

- ✓ SKILL.md → reference.md (with actual information)
- ✗ SKILL.md → advanced.md → details.md → info

---

## Quality Checklist

### Core Quality

- [ ] Description is specific and includes key terms
- [ ] Description includes both what the skill does AND when to use it
- [ ] Description written in third person
- [ ] SKILL.md body is under 500 lines
- [ ] If over 500 lines: `## Quick Reference`, `## Additional Resources`, `## Technology Selection`, `## Extended Examples`, `## Detailed Patterns`, `## Architecture Decision Records`, `## Monitoring Stack`, and `## Breakdown Checklist` sections are extracted to `references/` with proper frontmatter
- [ ] Extracted references have `name:`, `description:`, and `see_also:` frontmatter
- [ ] No time-sensitive information (or in "old patterns" section)
- [ ] Consistent terminology throughout
- [ ] Examples are concrete, not abstract
- [ ] File references are one level deep
- [ ] Progressive disclosure used appropriately
- [ ] Workflows have clear steps
- [ ] Uses imperative/infinitive form

### Code and Scripts

- [ ] Scripts solve problems rather than punt to Claude
- [ ] Error handling is explicit and helpful
- [ ] No "voodoo constants" (all values justified)
- [ ] Required packages listed and verified as available
- [ ] Scripts have clear documentation
- [ ] No Windows-style paths (all forward slashes)
- [ ] Validation/verification steps for critical operations
- [ ] Feedback loops included for quality-critical tasks

### Structure

- [ ] No extraneous documentation files
- [ ] Resources organized by type (references/, assets/)
- [ ] Files named descriptively
- [ ] Longer reference files have table of contents
