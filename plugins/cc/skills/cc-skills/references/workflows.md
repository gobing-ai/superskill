# Skill Workflows

Detailed workflow definitions for cc-skills operations. Each workflow defines:
- **Step-by-step flow**: Ordered steps from start to completion
- **Tool per step**: Which script or checklist handles each step
- **Branching logic**: What to do when steps fail or succeed
- **Retry loops**: When to go back and redo previous steps

LLM content improvement is embedded in the normal workflow for every operation.
It is performed by the invoking agent as checklist-driven review/content improvement, not via a separate `--llm-eval` CLI mode.

## Shared Workflow Framework

This file follows the shared [Meta-Agent Workflow Schema](../../../references/meta-agent-workflow-schema.md).

Shared Phase 1 conventions:

- concept-level operations use `Create`, `Validate`, `Evaluate`, `Refine`, `Evolve`, `Adapt`, and `Package`
- documentation decision states use `BLOCK`, `WARN`, and `PASS`
- deterministic script work and invoking-agent judgment are documented separately
- `Evolve` follows the closed loop: Observe -> Analyze -> Propose -> Apply -> Verify -> Snapshot -> Rollback -> Learn

---

## Table of Contents

1. [Create Workflow](#create-workflow) - Create new skill
2. [Validate Workflow](#validate-workflow) - Check skill structure
3. [Evaluate Workflow](#evaluate-workflow) - Validate and score quality
4. [Refine Workflow](#refine-workflow) - Fix issues and improve
5. [Evolve Workflow](#evolve-workflow) - Analyze and apply longitudinal improvements
6. [Adapt Workflow](#adapt-workflow) - Generate cross-platform companions
7. [Package Workflow](#package-workflow) - Prepare for distribution
8. [Migrate Workflow](#migrate-workflow) - Multi-source skill migration with LLM refinement

---

## Create Workflow

Create a new skill from scratch with proper structure.

### Grill-style discovery (shared scaffold behavior)

Every scaffold operation (`skill-add`, `agent-add`, `command-add`, `magent-add`) runs an interview
discipline BEFORE generating anything. This section is the single copy — the four `*-add` commands
point here rather than restating it.

1. **Explore before asking.** Read the existing artifacts first: sibling skills/agents/commands in
   the target directory, the target repo's conventions, and prior evaluations
   (`superskill <type> evaluate --history`). Never ask the user a question the codebase can answer.
2. **One question at a time.** Ask a single question, wait for the answer, then decide whether the
   next question is still needed. No question batteries.
3. **Every question ships a recommended answer.** Derive the recommendation from what exploration
   found (e.g. "Sibling skills use the `technique` tier — recommend `technique`. OK?"). The user
   confirms or overrides; they never start from a blank.
4. **Stop asking when the remaining unknowns don't change the scaffold.** Description wording can be
   refined later (`*-refine`); invocation mode and template tier cannot — ask about those, skip the
   rest.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ CREATE WORKFLOW                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │   │
│  │ Scaffold │    │ Validate  │    │ LLM      │    │ Generate │   │
│  │ (Script) │    │ (Script)  │    │ Content  │    │ Companions│  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │                                                 │           │
│       ▼                                                 ▼           │
│  [SUCCESS]                                      [FAIL: Back to 1] │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Scaffold | `scaffold.ts` | Creates directory + SKILL.md | Retry step 1 |
| 2 | Validate Structure | `validate.ts` | All required files exist | Back to step 1 |
| 3 | LLM Content Improvement | LLM (invoking agent) | Improves content using LLM | Back to step 1 |
| 4 | Generate Companions | Platform adapters | All companions generated | Retry step 4 |

### Step Details

#### Step 1: Scaffold (Script)
```bash
superskill skill scaffold <skill-name> --output ./skills
```

**What script does:**
- Creates skill directory
- Generates SKILL.md from template
- Creates directories: extensions/, references/, assets/
- Initializes platform adapter files

**Output:** Skill directory with basic structure

#### Step 2: Validate Structure (Script)
```bash
superskill skill validate <skill-path>
```

**What script does:**
- Checks required directories exist
- Validates SKILL.md is valid markdown
- Validates frontmatter has name + description

**Success:** Returns validation pass

#### Step 3: LLM Content Improvement
**Handler:** LLM (invoking agent using its own LLM capability)

**What the invoking agent does:**
1. Reads the newly scaffolded SKILL.md
2. Identifies weak sections: vague descriptions, inconsistent voice, missing examples
3. Uses LLM to rewrite content addressing issues found in Steps 1-2
4. Preserves frontmatter exactly
5. Maintains third-person imperative voice ("This skill..." not "I can...")
6. Adds concrete examples if missing
7. Keeps SKILL.md under 400 lines (extract to references/ if needed)

**Important:**
- Frontmatter MUST NOT be modified (name, description, type, etc.)
- Only the body content is improved
- Preserve all existing reference links
- Add examples where patterns are described

**If FAIL:** Go back to Step 1 (re-scaffold with corrections)

#### Step 4: Generate Companions (Script)

**What script does:**
- Generates platform companions from the current SKILL.md
- Validates companion compatibility with target platforms
- Reports any lossy or advisory transformations

**If FAIL:** Retry step 4 (max 3 times)

---

## Validate Workflow

Validate skill structure, frontmatter, resources, and companion readiness before evaluation or packaging.

### Workflow Steps

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Parse SKILL.md | `validate.ts` | File can be parsed | Abort |
| 2 | Check Required Structure | `validate.ts` | Required fields and resource expectations pass | Retry after fixes |
| 3 | Action Decision | `validate.ts` + invoking agent | Returns BLOCK/WARN/PASS with next step | Continue |

### Step Details

#### Step 1: Parse SKILL.md
```bash
superskill skill validate <skill-path>
```

#### Step 2: Check Required Structure

Deterministic validation checks:

- valid frontmatter
- required name and description fields
- resource discovery and companion readiness
- no critical structure breakage

#### Step 3: Action Decision

The invoking agent reviews the validation output and decides whether to:

- stop on `BLOCK`
- continue with caveats on `WARN`
- proceed directly on `PASS`

---

## Evaluate Workflow

Validate skill structure and score quality using **Two-Tier Architecture**.

### Two-Tier Architecture

| Tier | Purpose | Handler | Continues on BLOCK? |
|------|---------|---------|-------------------|
| **Tier 1** | Structural Validation | Scripts | Yes (for diagnostics) |
| **Tier 2** | Quality Scoring | Scripts + invoking-agent checklist | N/A |

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ EVALUATE WORKFLOW (Two-Tier)                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ TIER 1: STRUCTURAL VALIDATION (Deterministic)              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                    │
│  │ Step 1.1 │───▶│ Step 1.2 │───▶│ Step 1.3 │                    │
│  │ Parse    │    │ Check    │    │ Action   │                    │
│  │ SKILL.md │    │ Frontmatter│   │ BLOCK/WARN│                  │
│  │          │    │            │   │ /PASS     │                  │
│  └──────────┘    └──────────┘    └──────────┘                    │
│       │              │              │                               │
│       ▼              ▼              ▼                               │
│  [Valid?]       [Valid?]    [BLOCK → Continue to Tier 2]         │
│     │              │              │                               │
│     ▼              ▼              ▼                               │
│  [BLOCK: Abort] [BLOCK]                                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ TIER 2: QUALITY SCORING (Script + LLM)                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 2.1 │───▶│ Step 2.2 │───▶│ Step 2.3 │───▶│ Step 2.4 │   │
│  │ Dimension│    │ Score    │    │ Checklist│    │ Generate │   │
│  │ Scoring  │    │ Calculate│    │ Review   │    │ Report   │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │              │              │                │            │
│       ▼              ▼              ▼                ▼            │
│  [Score OK]     [Score OK]    [Optional]        [COMPLETE]       │
│     │              │              │                              │
│     ▼              ▼              ▼                              │
│  [FAIL: Abort] [FAIL: Abort] [Skip if no time]                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Tier 1: Structural Validation

**Purpose:** Verify skill can function (deterministic checks).

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1.1 | Parse SKILL.md | Script | Valid markdown + YAML | Abort |
| 1.2 | Check Frontmatter | Script | name + description exist | BLOCK |
| 1.3 | Action Decision | Script | No BLOCK → Continue | Continue to Tier 2 |

#### Tier 1 Action Types

| Action | Icon | Meaning | Tier 2 Continues? |
|--------|------|---------|-------------------|
| **BLOCK** | ⏹ | Critical failure - skill cannot function | Yes (for diagnostics) |
| **WARN** | ⚠ | Improvement is suggested before shipping | Yes |

**BLOCK criteria:**
- Missing SKILL.md
- Invalid YAML frontmatter
- Missing required `name` field
- Missing required `description` field
- Invalid name format (not kebab-case)

---

### Tier 2: Quality Scoring

**Purpose:** Assess skill quality across 5 dimensions via deterministic heuristic + optional LLM enrichment.

| Step | Name | Handler | Success Criteria |
|------|------|---------|------------------|
| 2.1 | Heuristic Scoring | `superskill skill evaluate` | Weighted aggregate + per-dim scores |
| 2.2 | LLM Enrichment (optional) | LLM via envelope-out → Scorer → ingest-in seam | Rubric-scored dimensions + findings |
| 2.3 | Generate Report | `superskill skill evaluate` (built-in) | Table + verdict + grade + recommendations |

#### Scoring Dimensions

5 dimensions, rubric-weighted (canonical weights in `packages/core/src/rubrics/skill.yaml`):

| Dimension | What It Checks |
|-----------|----------------|
| **completeness** | Required frontmatter fields present? Sections structured? |
| **clarity** | Unambiguous instruction? Penalizes vague verbs. |
| **trigger-accuracy** | Fires on right inputs? Counts trigger phrases. |
| **anti-hallucination** | Prevents fabrication? Checks verification language density. |
| **conciseness** | Short as possible while complete? Penalizes bloat. |

See [evaluation-framework.md](evaluation-framework.md) for scoring modes and rubric resolution tiers.

#### Grading Scale

| Grade | Score (0–1) | Meaning |
|-------|-------------|---------|
| **A** | 0.90–1.00 | Production ready |
| **B** | 0.75–0.89 | Minor fixes needed |
| **C** | 0.60–0.74 | Moderate revision |
| **D** | 0.45–0.59 | Major revision |
| **F** | 0.00–0.44 | Rewrite needed |

---

### Detailed Checklist (from rd2 validation-checklist.md)

Organized by category for comprehensive validation:

#### Frontmatter (Mandatory)

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | YAML frontmatter is valid | Parse check | Script |
| 2 | `name` follows kebab-case | Regex `^[a-z0-9-]+$` | Script |
| 3 | `name` max 64 chars | Length check | Script |
| 4 | `description` 50-1024 chars | Length check | Script |
| 5 | `description` has WHAT + WHEN | Content check | LLM |
| 6 | Uses third-person form | "This skill..." | LLM |

#### Content Quality

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | SKILL.md body uses imperative form | "Use X" not "You should" | LLM |
| 2 | Body under 400 lines | Line count | Script |
| 3 | Detailed content in references/ | Structure check | Script |
| 4 | Examples are concrete | Content check | LLM |

#### Trigger Design

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | Includes specific trigger phrases | Quote detection | Script |
| 2 | Third-person description | Content check | LLM |
| 3 | Concrete "when to use" scenarios | Content check | LLM |
| 4 | No workflow summaries in description | Content check | LLM |

#### Instruction Clarity

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | Imperative form ratio > 70% | Pattern count | Script |
| 2 | No vague language | "might", "could", "maybe" | Script |
| 3 | Specific action verbs | "create", "configure" | LLM |
| 4 | Clear branching criteria | If/then structure | LLM |

#### Value-Add Assessment

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | Domain-specific content | Content check | LLM |
| 2 | Unique workflows | Content check | LLM |
| 3 | No explaining well-known concepts | Content check | LLM |

#### Structure

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | SKILL.md in root | File check | Script |
| 2 | extensions/, references/, assets/ exist | Directory check | Script |
| 3 | Progressive disclosure | Reference links | Script |

#### Circular Reference Prevention

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | No "Commands Reference" section | Section check | Script |
| 2 | No slash command references | Pattern `/\/rd\d+:` | Script |
| 3 | No "See also" with commands | Pattern check | Script |

---

### Embedded LLM Checklist Review

Use the invoking agent's LLM judgment to strengthen the script findings with qualitative review.

#### When to Use

- Need judgment beyond pattern matching
- Want Claude's opinion on quality
- Need structured scoring against criteria

#### How to Use

```bash
# Run the normal deterministic evaluation
superskill skill evaluate <skill-path> --save
```

Then the invoking agent reviews the generated findings and applies the checklist below before deciding whether to proceed, refine, or stop.

#### LLM Checks

| # | Item | Check |
|---|------|-------|
| 1 | Description quality | Clear, specific, has triggers |
| 2 | Trigger effectiveness | Would fire on intended queries |
| 3 | Content helpfulness | Actually useful for tasks |
| 4 | Voice consistency | Imperative throughout |

---

### Evaluation Loop (Best Practice)

For new skill development, use iterative evaluation:

```
┌─────────────────┐
│  1. Baseline    │  Run WITHOUT skill → Document gaps
│     Testing     │  What does Claude miss?
└────────┬────────┘
         ▼
┌─────────────────┐
│  2. Write       │  Address ONLY documented gaps
│     Content     │  Use concrete examples
└────────┬────────┘
         ▼
┌─────────────────┐
│  3. Retest     │  Same scenarios WITH skill
│                 │  Document improvements
└────────┬────────┘
         ▼
    Baseline achieved?
         │
    Yes ─┴─ No → Return to step 2
         ▼
┌─────────────────┐
│  4. Ship        │  Stop adding content
└─────────────────┘
```

---

### Cross-Model Testing

Test with multiple Claude models:

| Model | Expected | Notes |
|-------|---------|-------|
| Haiku | ≥70% | Minimum viable |
| Sonnet | ≥90% | Primary target |
| Opus | ≥90% | No additional benefit |

**Ship if Sonnet ≥ 90%.** Note if Haiku needs more guidance.

---

### Step Details

#### Step 1.1: Parse SKILL.md (Script)
```bash
superskill skill evaluate <skill-path> --save
```

**What script does:**
- Reads SKILL.md
- Parses YAML frontmatter
- Extracts body content

**If FAIL:** Abort - skill has syntax errors

#### Step 1.2: Check Frontmatter (Script)

**What script checks:**
- `name` field exists, kebab-case, max 64 chars
- `description` field exists, 50-1024 chars
- Valid YAML syntax

**If BLOCK:** Stop - critical failure

#### Step 2.1: Dimension Scoring
```bash
superskill skill evaluate <skill-dir> --save
```

**What the CLI scores (5 dimensions, rubric-weighted):**
- completeness, clarity, trigger-accuracy, anti-hallucination, conciseness
- Weights from `packages/core/src/rubrics/skill.yaml`; verified at load time.

**Output:** Per-dimension score + note, weighted aggregate, verdict (PASS/FAIL), grade (A–F).

#### Step 2.3: LLM Enrichment (Optional)

**What the invoking agent evaluates via rubric seam:**
- Each dimension against the rubric criteria (anchor-driven)
- Structured findings and actionable recommendations

**Output:** Detailed analysis, recommendations per dimension.

#### Step 2.4: Generate Report
- Built into `superskill skill evaluate` (no separate script).
- Human output: table + verdict + grade + findings + recommendations.
- JSON output (`--json`): full QualityReport.
- Includes grade and pass/fail status

---

## Refine Workflow

Fix issues and improve quality. Supports multiple refinement modes.

### Content fix types: description prune + pruning pass

Two named fix types complement the deterministic structural fixes. Both are `suggest`-strategy
fixes (a rewrite judgment call, never auto-applied); this section is the single copy the
`*-refine` commands point to. Failure-mode definitions (no-op, duplication, sediment, sprawl)
live in the skill-engineering theory reference.

**Description prune** — rewrite an over-long or synonym-heavy description to budget by applying
the three description rules: front-load the leading identity phrase; keep one trigger per genuine
branch (collapse synonym clusters); delete any restatement of the body's identity line. Applies to
every entity type with a description.

**Pruning pass** (body-level; skills and agents):

1. **No-op hunt** — sentence-level: delete every line the model already obeys by default (the
   test: does this line change behavior vs. no line?). Delete, don't trim — a shortened no-op is
   still a no-op.
2. **Duplication collapse** — one meaning, one home: when a rule is stated in two places, keep the
   authoritative home and replace the other with a bare term or pointer.
3. **Sediment removal** — delete stale layers left by past edits (superseded advice, orphaned
   footers, references to removed sections).
4. **Disclosure move** — content only some branches need moves into `references/` behind a
   pointer; content moves, it is never silently deleted.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ REFINE WORKFLOW                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3a  │───▶│ Step 3b  │   │
│  │ Parse +  │    │ Apply     │    │ Prog     │    │ Content  │   │
│  │ Detect   │    │ BestPrac  │    │ Disc    │    │ Improve  │   │
│  │ Issues   │    │ (Script)  │    │ (LLM)   │    │ (LLM)   │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │              │               │                │            │
│       ▼              ▼               ▼                ▼            │
│  [No issues]    [Apply]         [SKILL.md      [Improve]      │
│     │              │          <=377?]              │            │
│     ▼              ▼               │                  ▼            │
│  [COMPLETE]    [Nothing to fix]  Yes                  ▼            │
│                            [Extract refs]      [COMPLETE]      │
│                                 │                             │
│                            No ▼                               │
│                         [Skip, go to 3b]                      │
│                                                                      │
│  ─────────────────────────────────────────────────────────────     │
│  Branch: Migration Mode (--migrate)                                │
│  ┌──────────┐    ┌──────────┐                                     │
│  │ Step M1  │───▶│ Step M2  │                                     │
│  │ Migrate  │    │ Validate  │                                     │
│  │ (Script) │    │ (Script)  │                                     │
│  └──────────┘    └──────────┘                                     │
│                                                                      │
│  ─────────────────────────────────────────────────────────────     │
│  Post: Step 4 Validation                                            │
│  ┌──────────┐                                                       │
│  │ Step 4   │───────────────────────────────────▶ [COMPLETE]      │
│  │ Validate │   If FAIL: warn but complete (may need manual)     │
│  │ (Script) │                                                       │
│  └──────────┘                                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Standard Refine Flow

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Detect Issues | `refine.ts` | Detects what needs fixing | Continue |
| 2 | Apply BestPrac | `refine.ts --best-practices` | Fixes deterministic issues | Warn only |
| 3a | Progressive Disclosure | LLM (invoking agent) | Extracts refs, SKILL.md <= 377 lines | Warn only |
| 3b | Content Improvement | LLM (invoking agent) | Improves content using LLM | Back to 3a |
| 4 | Validate Result | `validate.ts` | Validation passes | Retry step 3 |

### Step Details

#### Step 1: Detect Issues
```bash
# Pre-check what needs fixing
superskill skill evaluate <skill-path> --save
```

**What happens:**
- Run evaluation to identify issues
- Determine which fixes needed

#### Step 2: Apply Best Practices (Script)
```bash
superskill skill refine <skill-path> --auto --save
```

**What script fixes (deterministic):**
- Remove TODO markers
- Convert Windows paths to forward slashes
- Remove Commands Reference sections
- Remove slash command references
- **Extract long content to references** (SKILL.md >= 400 lines): Moves `## Quick Reference`, `## Additional Resources`, `## Technology Selection`, `## Extended Examples`, `## Detailed Patterns`, `## Architecture Decision Records`, `## Monitoring Stack`, and `## Breakdown Checklist` sections to `references/` with proper frontmatter

**Output:** Modified SKILL.md, report of changes

#### Step 3: LLM Content Improvement (Invoking Agent)
The invoking agent uses the LLM to improve skill content based on evaluation findings from Step 1.

##### 3a. Progressive Disclosure Extraction (if SKILL.md >= 300 lines)

Before rewriting content, address Progressive Disclosure first:

**Step 3a-1: Evaluate Length**
- Count total lines in SKILL.md (excluding frontmatter)
- If **< 400 lines** → Skip extraction, proceed to 3b
- If **>= 400 lines** → Proceed to 3a-2

**Step 3a-2: Identify Extractable Sections**
Review H2 sections and evaluate each for extraction:

| Section Type | Extract if | Why |
|--------------|-----------|-----|
| Tables (10+ rows) | Always | Reference data, not core instruction |
| Checklists | >= 10 items | Detailed guidance belongs in reference |
| Code Examples | >= 5 blocks or >= 100 lines | Patterns belong in reference |
| Diagrams/ASCII art | >= 3 | Visual references belong in reference |
| Step-by-step sequences | >= 8 steps | Detailed procedure belongs in reference |
| Comparison tables | >= 4 rows | Reference material |
| Error handling lists | >= 5 items | Reference belongs in reference |
| Quick Reference tables | Always | By definition reference |
| Additional Resources | Always | External links belong in reference |

**Step 3a-3: Evaluate Extraction Decision**

For each candidate section, answer:
1. **Can we extract?** - Does the section make sense standalone?
2. **Should we extract?** - Is it detail vs. core instruction?
3. **How to extract?** - Create summary + link to reference file

**Decision rules:**
- If section is **core instruction** (must-read for skill to work) → **Keep in SKILL.md**
- If section is **reference detail** (lookup, examples, tables) → **Extract**
- If ambiguous → Ask: "Would Claude need this to decide WHEN to use the skill?"

**Step 3a-4: Execute Extraction**

For each section to extract:
1. **Create reference file** at `references/<slug>.md`:
   ```markdown
   ---
   name: <slug>
   description: "<one-line description ~80 chars>"
   see_also:
     - cc:<skill-name>
   ---

   # <Section Title>

   <extracted content>
   ```

2. **Replace in SKILL.md** with summary block:
   ```markdown
   ## <Section Title>

   <2-3 line summary of what this covers>

   See [references/<slug>.md](references/<slug>.md) for detailed content.
   ```

3. **Update or create references/external-resources.md** if linking to external docs

**Step 3a-5: Verify**
- Recount SKILL.md lines (should be < 400 lines)
- If still >= 400 lines, identify additional sections and repeat 3a-2 to 3a-4
- Target: SKILL.md <= 377 lines (leaves ~23 line margin for future additions)

##### 3b. Content Quality Improvement

After Progressive Disclosure, improve remaining content:

**What the agent does:**

1. **Analyze findings**: Review evaluation findings and recommendations from Step 1
2. **Identify weak sections**: Find content that failed scoring or needs improvement
3. **Use LLM to rewrite**: Use the agent's LLM capability to rewrite weak sections:
   - Preserve frontmatter exactly (YAML at top of SKILL.md)
   - Maintain third-person imperative voice ("This skill helps..." not "I can help you")
   - Address all findings from the evaluation report
4. **Apply improvements**: Write improved content back to SKILL.md

**Key principles:**
- **Frontmatter protection**: Never modify the YAML frontmatter
- **Voice consistency**: Maintain imperative form throughout
- **Concrete over abstract**: Use specific examples and trigger phrases
- **Progressive disclosure**: Extract detailed content to references/ as needed

**If improvements made:** Continue to Step 4
**If no improvements needed:** Continue to Step 4
**If LLM fails or unavailable:** Warn and continue to Step 4 (deterministic fixes already applied in Step 2)

#### Step 4: Validate Result
```bash
superskill skill validate <skill-path>
```

**If FAIL:** Warn but complete (user may need manual fix)

### Migration Mode Flow (--migrate)

| Step | Name | Handler | Success Criteria |
|------|------|---------|------------------|
| M1 | Migrate | `refine.ts --migrate` | Applies rd2→cc transforms |
| M2 | Validate | `validate.ts` | Structure valid |

**M1 script applies:**
- Add name: field if missing
- Add metadata.platforms if missing
- Add metadata.openclaw if missing
- Add Platform Notes section

---

### Alternative: TDD-Based Refinement

For deeper skill improvement, use **TDD for Skills** approach:

#### The Iron Law

> **NO SKILL WITHOUT A FAILING TEST FIRST.**

If you did not watch an agent fail without the skill, you do not know if the skill teaches the right thing.

#### TDD Workflow

| Phase | Action | Description |
|-------|--------|-------------|
| **RED** | Run WITHOUT skill | Document agent failures and rationalizations |
| **GREEN** | Write minimal skill | Address specific failures |
| **REFACTOR** | Iterate | Close loopholes, re-test until bulletproof |

#### When to Use TDD

| Use TDD | Skip TDD |
|---------|----------|
| Skill addresses common violations | Skill is purely informational |
| Behavior change is critical | Behavior already correct |
| Multiple agents need consistent behavior | Time constraints |
| Rationalizations are predictable | |

#### Common Rationalizations

| Rationalization | Counter |
|---------------|---------|
| "This is just a small change" | "Every change, regardless of size, requires..." |
| "The user needs it urgently" | "Time pressure is not a valid reason to skip..." |
| "I'll fix it later" | "Complete the implementation now..." |
| "This is temporary" | "Treat all code as production code..." |

#### Integration with Standard Refine

| Approach | Purpose |
|----------|---------|
| **Standard Refine** | Structural fixes, best practices |
| **TDD Refine** | Behavioral changes, agent compliance |

Use TDD when standard refine doesn't achieve desired agent behavior.

---

## Evolve Workflow

Analyze longitudinal improvements with persisted proposals and embedded LLM review before apply.

### Closed-Loop Phases

This workflow follows the shared evolution loop:

1. Observe signals from evaluation and history
2. Analyze patterns and gaps
3. Propose bounded improvements
4. Apply approved changes
5. Verify the resulting behavior
6. Snapshot version history
7. Roll back if needed
8. Learn from the recorded outcome

### Workflow Steps

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Analyze Signals | `evolve.ts --analyze` | Signal report generated | Abort |
| 2 | Generate Proposals | `evolve.ts --propose` | Proposal set persisted | Retry step 2 |
| 3 | Embedded LLM Content Improvement | LLM (invoking agent) | Proposals are reviewed, tightened, and prioritized | Back to step 2 |
| 4 | Apply or Roll Back | `evolve.ts --apply` / `--rollback` | Approved change applied safely | Abort |

### Step Details

#### Step 1: Analyze Signals
```bash
superskill skill evolve <skill-name> --propose-only
```

#### Step 2: Generate Proposals
```bash
superskill skill evolve <skill-name> --propose-only
```

The script persists deterministic proposals and supporting rationale.

#### Step 3: Embedded LLM Content Improvement

The invoking agent reviews the proposal set before any apply step:

1. Check that each proposal matches the actual findings
2. Remove weak or redundant proposals
3. Tighten descriptions and rationale where they are vague
4. Confirm the proposal order matches risk and expected benefit
5. Decide whether to apply, defer, or request more evidence

This review is part of the normal evolve flow. It does not require a separate CLI flag.

#### Step 4: Apply or Roll Back
```bash
superskill skill evolve <skill-name> --accept <proposal-id>
```


---

## Adapt Workflow

Generate or refresh cross-platform companions for the skill.

### Workflow Steps

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Inspect Source Skill | `adapt.ts` | Source skill is readable | Abort |
| 2 | Generate Companions | `adapt.ts` | Target companions created | Retry step 2 |
| 3 | Validate Output | `validate.ts` / adapter checks | Generated companions are structurally valid | Warn |
| 4 | Embedded LLM Review | LLM (invoking agent) | Platform notes and examples stay aligned with generated companions | Loop back to step 2 |

### Step Details

#### Step 1: Inspect Source Skill

#### Step 2: Generate Companions

The script generates platform-specific outputs such as:

- `agents/openai.yaml`
- `metadata.openclaw`
- other supported platform companions

#### Step 3: Validate Output

Deterministic checks confirm:

- generated files are present
- generated metadata is structurally valid
- no critical companion-generation failure occurred

#### Step 4: Embedded LLM Review

The invoking agent reviews the adapted output to:

1. confirm examples and guidance still match generated companions
2. tighten weak platform notes
3. loop back to regenerate if the source skill needs improvement first

---

## Package Workflow

Prepare skill for distribution.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ PACKAGE WORKFLOW                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │   │
│  │ Pre-     │    │ Copy     │    │ Generate │    │ LLM      │   │
│  │ Validate │    │ Files    │    │ Companions│   │ Content  │   │
│  │ (Script) │    │ (Script) │    │ (Script)  │   │ (Checklist)│ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │                                                    │       │
│       ▼                                                    ▼       │
│  [FAIL: Abort]                                        [COMPLETE]  │
│       │                                                    │       │
│       └────────────────┬───────────────────────────────┘       │
│                        │                                        │
│                        ▼                                        │
│                   ┌──────────┐                                  │
│                   │ Step 5   │                                  │
│                   │ Archive  │                                  │
│                   │ (Script) │                                  │
│                   └──────────┘                                  │
│                        │                                        │
│                        ▼                                        │
│                   [COMPLETE]                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Pre-Validate | `validate.ts` | Validation passes | Abort |
| 2 | Copy Files | `package.ts` | Files copied | Abort |
| 3 | Generate Companions | `package.ts` | Companions exist | Retry step 3 |
| 4 | LLM Content Improvement | LLM (invoking agent) | Improves content using LLM | Warn |
| 5 | Archive | `package.ts` | Archive created | Retry step 5 |

### Step Details

#### Step 1: Pre-Validate
```bash
superskill skill validate <skill-path>
```

**If FAIL:** Abort - cannot package invalid skill

#### Step 2: Copy Files

**What script does:**
- Creates output directory
- Copies SKILL.md
- Copies references/, assets/, extensions/

#### Step 3: Generate Companions

**What script does:**
- Generates platform companions
- Validates companions

#### Step 4: LLM Content Improvement
**Handler:** LLM (invoking agent using its own LLM capability)

**What the invoking agent does:**
1. Reads the packaged SKILL.md and companions
2. Identifies content issues: inconsistent voice, weak descriptions, missing examples
3. Uses LLM to rewrite and strengthen content
4. Preserves frontmatter exactly (name, description, type, metadata)
5. Ensures companions are consistent with improved SKILL.md
6. Adds Examples section if missing or weak
7. Validates "When to Use" section is specific and actionable

**Important:**
- Frontmatter MUST NOT be modified
- Only improve body content and examples
- Ensure all companions reflect SKILL.md updates
- Verify no circular references were introduced

**If FAIL:** Warn but continue

#### Step 5: Archive
- Creates .zip or .tar.gz
- Includes all files
- Ready for distribution

---

## Migrate Workflow

Multi-source skill migration combining deterministic script phases with LLM content refinement and validation.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ MIGRATE WORKFLOW                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │   │
│  │ Inventory│    │ Merge    │    │ Reconcile│    │ Apply +  │   │
│  │ (Script) │    │ Plan     │    │ + Convert│    │ Report   │   │
│  │          │    │ (Script) │    │ (Script) │    │ (Script) │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │              │               │                │            │
│       ▼              ▼               ▼                ▼            │
│  [No sources]  [No conflicts]  [Low quality]    [Apply or       │
│  [Abort]       [Skip to 4]    [Continue]       dry-run]        │
│                                                     │            │
│                                                     ▼            │
│  ┌──────────┐    ┌──────────┐                                   │
│  │ Step 5   │───▶│ Step 6   │──────────────────▶ [COMPLETE]     │
│  │ LLM      │    │ Validate │                                   │
│  │ Content  │    │ Result   │                                   │
│  │ Refine   │    │ (Script) │                                   │
│  │ (LLM)    │    │          │                                   │
│  └──────────┘    └──────────┘                                   │
│       │              │                                            │
│       ▼              ▼                                            │
│  [Skip if       [FAIL: Back                                     │
│   dry-run]      to Step 5]                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Inventory Sources | `skill-migrate.ts --dry-run` | All sources resolved and scanned | Abort |
| 2 | Merge Planning | `skill-migrate.ts` (cont.) | Merge plan created, conflicts identified | Abort |
| 3 | Reconcile + Convert | `skill-migrate.ts` (cont.) | Conflicts reconciled, Python converted to TS | Continue (warnings logged) |
| 4 | Apply + Report | `skill-migrate.ts --apply` | Files written, report generated | Abort |
| 5 | LLM Content Refinement | LLM (invoking agent) | Coherent content, TODO markers resolved | Retry step 5 (max 2) |
| 6 | Validate Result | `superskill skill evaluate <skill-dir>` | Verdict PASS (≥0.70) | Back to step 5 |

### Step Details

#### Step 1: Inventory Sources (Script)

**What script does:**
- Resolves all `--from` paths (supports `rd2:`, `cc:`, bare name, `path:`, relative including `vendors/` paths)
- Resolves `--to` path as a filesystem destination (always absolute/relative, never a skill name lookup)
- Recursively scans each source for SKILL.md, extensions/, tests/, references/
- Reports file counts and capabilities per source

**Output:** Source inventories with file metadata

**If sources cannot be resolved:** Abort with error

#### Step 2: Merge Planning (Script)

**What script does:**
- Compares inventories across sources
- Detects files that already exist at the destination (destination conflicts)
- Categorizes each file: **add** (unique to one source), **merge** (present in multiple sources), **merge-with-dest** (source conflicts with existing destination file), **convert** (Python files needing TypeScript conversion)
- Builds a merge plan with conflict descriptions

**Output:** Merge plan with per-file action and conflict details

**If no conflicts:** Skip reconciliation in Step 3, proceed to Step 4

#### Step 3: Reconcile + Convert (Script)

**What script does:**
- Runs `reconcileMultiSource()` from `cc:knowledge-extraction` for overlapping files (multi-source)
- Runs `reconcileMultiSource()` for source-vs-destination conflicts (2-source: source + existing destination)
- Runs `convertPythonToTypeScript()` for `.py` files
- Produces quality scores per merged file
- Logs TODO markers for unconvertible Python patterns (e.g., `// TODO: Convert import`)

**Output:** Reconciled content with quality scores and conversion warnings

**If quality is low:** Continue — LLM refinement in Step 5 addresses quality gaps

#### Step 4: Apply + Report (Script)

**What script does:**
- Detects destination conflicts (files already at destination with same path)
- With destination conflicts: **blocks apply** unless `--force` is set (prevents silent overwrites)
- Writes all files to `--to` destination (adds, merges, converted files)
- Generates migration report at `docs/.migration/migration-report-<skillName>-<timestamp>.md` (NOT inside the skill directory)
- With `--strict`: blocks apply if average quality score < 70

**Output:** Migrated skill directory + migration report

**If `--dry-run`:** Report only, no files written. Skip Steps 5-6.

#### Step 5: LLM Content Refinement (Invoking Agent)
**Handler:** LLM (invoking agent using its own LLM capability)

This step runs only when `--apply` was used (files exist to refine).

**Inputs:**
- Migration report from Step 4
- `description` argument from the command (free-text guidance for refinement focus)

**What the invoking agent does:**
1. **Read the migration report** from Step 4 to understand what was merged, converted, and flagged
2. **Honor the `description` guidance** if provided (e.g., "absorb emerging patterns", "focus on deduplication and conciseness")
3. **Deduplicate content**: Identify and collapse duplicate or near-duplicate content that survived deterministic reconciliation:
   - Repeated concepts covered in multiple source sections → merge into one concise treatment
   - Duplicate tables, checklists, or reference lists → consolidate, remove copies
   - Overlapping "When to Use" / "When Not to Use" language → unify into non-redundant triggers
   - Token bloat from long merged content → trim to quality bar (concise is key)
4. **Resolve semantic conflicts**:
   - Tone shifts between sections from different sources
   - Contradictory claims (source A says X, source B says not-X)
   - Broken internal references or cross-links
5. **Resolve TODO markers** in converted TypeScript files:
   - `// TODO: Convert import` markers from Python→TS conversion
   - `// CONVERSION WARNINGS` blocks at end of converted files
   - Manual review flags left by the converter
6. **Ensure voice consistency**: Merged SKILL.md reads as one cohesive document in third-person imperative voice
7. **Preserve frontmatter exactly**: Only body content is modified
8. **Write improved content** back to the destination files

**Skip conditions:**
- `--dry-run` mode: Skip entirely (no files to refine)
- avgQualityScore >= 90 AND no TODO markers exist AND no obvious duplicates: Skip, proceed to Step 6

**If LLM fails or is unavailable:** Warn and continue to Step 6 (deterministic merge already applied in Steps 1-4)

#### Step 6: Validate Result (Script)
```bash
superskill skill evaluate <destination-path> --save
```

**What script does:**
- Runs full evaluation on the migrated skill
- Scores across all 10 quality dimensions

**If score >= 70:** Migration complete
**If score < 70:** Back to Step 5 for another refinement pass (max 2 retries)

---

## Workflow Selection Matrix

| Situation | Workflow | Steps |
|-----------|----------|-------|
| New skill | Create | 1 → 2 → 3 → 4 |
| Structure check | Validate | 1 → 2 → 3 |
| Quality check | Evaluate | 1 → 2 → 3 → 4 |
| Fix deterministic only | Refine --best-practices | 1 → 2 → 4 |
| Fix Progressive Disclosure | Refine + PD extraction | 1 → 2 → 3a → 4 |
| Fix fuzzy content | Refine checklist | 1 → 2 → 3a → 3b → 4 |
| Fix all | Refine --best-practices | 1 → 2 → 3a → 3b → 4 |
| Migrate rd2 frontmatter only | Refine --migrate | M1 → M2 |
| Full multi-source migration | Migrate | 1 → 2 → 3 → 4 → 5 → 6 |
| Longitudinal improve | Evolve | 1 → 2 → 3 → 4 |
| Cross-platform companions | Adapt | 1 → 2 → 3 → 4 |
| Pre-publish | Package | 1 → 2 → 3 → 4 → 5 |

---

## Retry Policy

| Failure Point | Retry Action | Max Retries |
|---------------|--------------|-------------|
| Scaffold | Re-run scaffold | 3 |
| Validate structure | Abort | N/A |
| LLM Content Improvement | Back to appropriate step | 2 |
| Generate companions | Re-generate | 3 |
| Package files | Re-package | 3 |
| Migrate script (inventory/plan) | Abort | N/A |
| Migrate LLM refinement | Back to step 5 | 2 |
