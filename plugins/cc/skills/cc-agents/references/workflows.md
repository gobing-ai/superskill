# Agent Workflows

Detailed workflow definitions for cc-agents operations. Each workflow defines:
- **Step-by-step flow**: Ordered steps from start to completion
- **Tool per step**: Which script or checklist handles each step
- **Branching logic**: What to do when steps fail or succeed
- **Retry loops**: When to go back and redo previous steps

LLM content improvement is embedded in the normal workflow for every operation.
It is performed by the invoking agent as checklist-driven review/content improvement, not via a separate CLI mode.

## Shared Workflow Framework

This file follows the shared [Meta-Agent Workflow Schema](../../../references/meta-agent-workflow-schema.md).

Shared Phase 1 conventions:

- concept-level operations use `Create`, `Validate`, `Evaluate`, `Refine`, `Evolve`, and `Adapt`
- documentation decision states use `BLOCK`, `WARN`, and `PASS`
- deterministic script work and invoking-agent judgment are documented separately
- `Evolve` follows the closed loop: Observe -> Analyze -> Propose -> Apply -> Verify -> Snapshot -> Rollback -> Learn

---

## Table of Contents

1. [Create Workflow](#create-workflow) - Create new agent
2. [Validate Workflow](#validate-workflow) - Check agent structure
3. [Evaluate Workflow](#evaluate-workflow) - Score agent quality
4. [Refine Workflow](#refine-workflow) - Fix issues and improve
5. [Evolve Workflow](#evolve-workflow) - Governed longitudinal improvement
6. [Adapt Workflow](#adapt-workflow) - Convert to other platforms

---

## Create Workflow

Create a new agent from a tiered template.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ CREATE WORKFLOW                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │   │
│  │ Scaffold │    │ Validate  │    │ LLM      │    │ Platform │   │
│  │ (Script) │    │ (Script)  │    │ Content  │    │ Check    │   │
│  └──────────┘    └──────────┘    │ Improve  │    └──────────┘   │
│                                  └──────────┘                   │
│       │               │              │                │            │
│       ▼               ▼              ▼                ▼            │
│  [SUCCESS]       [FAIL: Back 1] [FAIL: Back 1]  [FAIL: Retry]   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Scaffold | `scaffold.ts` | Creates agent .md file | Retry step 1 |
| 2 | Validate Structure | `validate.ts` | All required fields exist | Back to step 1 |
| 3 | LLM Content Improvement | LLM (invoking agent) | Improves content using LLM | Back to step 1 |
| 4 | Platform Check | `validate.ts --platform all` | Compatible with targets | Retry step 4 |

### Step Details

#### Step 1: Scaffold (Script)
```bash
superskill agent scaffold <agent-name> --output ./agents
```

**What script does:**
- Generates agent .md file from tier-specific template
- Sets up frontmatter with name, description placeholder, tools, model
- Creates body with TODO markers for each section

**Output:** Agent .md file with template structure

#### Step 2: Validate Structure (Script)
```bash
superskill agent validate <agent.md>
```

**What script does:**
- Checks valid YAML frontmatter
- Validates required fields: name, description
- Validates name pattern: `^[a-z][a-z0-9-]{1,48}[a-z0-9]$`

**Success:** Returns validation pass

#### Step 3: LLM Content Improvement
**Handler:** LLM (invoking agent using its own LLM capability)

**What the invoking agent does:**
1. Reads the newly scaffolded agent .md file
2. Identifies weak sections: vague descriptions, inconsistent voice, weak examples
3. Uses LLM to rewrite content addressing issues
4. Preserves frontmatter exactly (name, description, tools, model)
5. Ensures description starts with "Use PROACTIVELY for" for specialist agents
6. Adds concrete trigger phrases (3+ quoted phrases)
7. Adds example blocks with proper `<example>` and `<commentary>`
8. Verifies body matches tier budget (minimal: 20-50, standard: 80-200, specialist: 200-500 lines)

**Important:**
- Frontmatter fields MUST NOT be modified
- Only the body content is improved
- Preserve all existing reference links
- Check agent type matches tier requirements

**If FAIL:** Go back to Step 1 (re-scaffold with corrections)

#### Step 4: Platform Check (Script)
```bash
superskill agent validate <agent.md> --target all
```

**What script does:**
- Validates against all 6 platform constraints
- Reports dropped fields per platform
- Warns about platform-specific limitations

**If FAIL:** Retry step 4 (max 3 times)

---

## Validate Workflow

Check agent structure and frontmatter, then let the invoking agent review any warnings with an embedded checklist.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ VALIDATE WORKFLOW                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                    │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │                    │
│  │ Parse    │    │ Check    │    │ Platform │                    │
│  │ Agent .md│    │Frontmatter│   │ Validate │                    │
│  └──────────┘    └──────────┘    └──────────┘                    │
│       │              │              │                               │
│       ▼              ▼              ▼                               │
│  [FAIL: Abort]  [FAIL: Abort] [COMPLETE]                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Parse Agent .md | Script | Valid markdown + YAML | Abort |
| 2 | Check Frontmatter | Script | name + description exist | Abort |
| 3 | Platform Validation | Script (optional) | Platform-specific rules pass | Warn |

### Step Details

#### Step 1: Parse Agent .md
- Reads file, parses YAML frontmatter
- Extracts body content
- **If FAIL:** Abort — file has syntax errors

#### Step 2: Check Frontmatter
- `name` exists, kebab-case, 3-50 chars
- `description` exists, is a string
- `tools` is array (if present)
- No unknown fields (warning only)
- **If FAIL:** Abort — critical structural failure

#### Step 3: Platform Validation (Optional)
```bash
superskill agent validate <agent.md> --target claude|gemini|opencode|codex|openclaw|all
```
- Platform-specific field validation
- Warns about dropped or incompatible fields

### Embedded LLM Content Improvement

After deterministic validation, the invoking agent reviews WARN output using an LLM checklist:

1. Decide whether warnings are acceptable or should escalate into `refine.ts`
2. Tighten weak trigger phrases, examples, or platform notes without changing the core contract
3. Confirm the file is ready for evaluate/adapt or needs another validation pass

This review is part of the normal validate workflow.

---

## Evaluate Workflow

Score agent quality using **Two-Tier Architecture**.

### Two-Tier Architecture

| Tier | Purpose | Handler | Continues on BLOCK? |
|------|---------|---------|-------------------|
| **Tier 1** | Structural Validation | Scripts | Yes (for diagnostics) |
| **Tier 2** | Quality Scoring | Scripts + invoking-agent checklist | N/A |

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ EVALUATE WORKFLOW (Two-Tier)                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ TIER 1: STRUCTURAL VALIDATION (Deterministic)              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                    │
│  │ Step 1.1 │───▶│ Step 1.2 │───▶│ Step 1.3 │                    │
│  │ Parse    │    │ Check    │    │ Action   │                    │
│  │ Agent .md│    │Frontmatter│   │ BLOCK/   │                    │
│  │          │    │          │    │ WARN/PASS│                    │
│  └──────────┘    └──────────┘    └──────────┘                    │
│       │              │              │                               │
│       ▼              ▼              ▼                               │
│  [BLOCK: Abort] [BLOCK]      [BLOCK → Continue to Tier 2]        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ TIER 2: QUALITY SCORING (Script + LLM)                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 2.1 │───▶│ Step 2.2 │───▶│ Step 2.3 │───▶│ Step 2.4 │   │
│  │ Dimension│    │ Calculate│    │ Embedded │    │ Generate │   │
│  │ Scoring  │    │ Grade    │    │ LLM Review│   │ Report   │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │              │              │                │            │
│       ▼              ▼              ▼                ▼            │
│  [Score OK]     [Grade OK]    [Optional]        [COMPLETE]       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Tier 1: Structural Validation

**Purpose:** Verify agent can function (deterministic checks).

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1.1 | Parse Agent .md | Script | Valid markdown + YAML | Abort |
| 1.2 | Check Frontmatter | Script | name + description exist | BLOCK |
| 1.3 | Action Decision | Script | No BLOCK → Continue | Continue to Tier 2 |

#### Tier 1 Action Types

| Action | Icon | Meaning | Tier 2 Continues? |
|--------|------|---------|-------------------|
| **BLOCK** | ⏹ | Critical failure — agent cannot function | Yes (for diagnostics) |
| **WARN** | ⚠ | Improvement is suggested before shipping | Yes |

**BLOCK criteria:**
- Missing agent file
- Invalid YAML frontmatter
- Missing required `name` field
- Missing required `description` field
- Invalid name format (not kebab-case)
- Security blacklist violation (immediate reject)

---

### Tier 2: Quality Scoring

**Purpose:** Assess agent quality across 10 dimensions (script + LLM).

| Step | Name | Handler | Success Criteria |
|------|------|---------|------------------|
| 2.1 | Dimension Scoring | Script | Returns scores for all 10 dimensions |
| 2.2 | Calculate Grade | Script | Returns A/B/C/D/F |
| 2.3 | Embedded LLM Checklist Review | Checklist (optional) | Returns nuanced quality feedback |
| 2.4 | Generate Report | Script | JSON/text output |

#### Scoring Dimensions

MECE framework: 4 categories, 10 dimensions, 100 points total (source: `superskill agent evaluate` CLI):

| Category | Dimension | Thin | Spec | What It Checks |
|----------|-----------|:---:|:---:|----------------|
| **Core Quality** (30/35) | Frontmatter Quality | 10 | 10 | YAML validity, required fields |
| | Body Quality | 10 | 15 | Persona/process/rules sections |
| | Naming Convention | 5 | 5 | Lowercase hyphen-case, length |
| | Instruction Clarity | 5 | 5 | Unambiguous, specific instructions |
| **Discovery & Trigger** (15/15) | Description Effectiveness | 15 | 15 | Trigger phrases, routing accuracy |
| **Safety & Compliance** (30/20) | Tool Restriction | 10 | 10 | Tools whitelist/blacklist |
| | Thin-Wrapper Compliance | 15 | 5 | Skill delegation vs implementation |
| | Security Posture | 5 | 5 | No dangerous patterns |
| **Operational** (25/30) | Platform Compatibility | 10 | 10 | UAM cross-platform support |
| | Operational Readiness | 15 | 20 | Output format, examples, verification |

**Thin** = thin-wrapper profile (delegates to skills). **Spec** = specialist profile (domain experts).

#### Grading Scale

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | 90-100 | Production ready |
| **B** | 80-89 | Minor fixes needed |
| **C** | 70-79 | Moderate revision |
| **D** | 60-69 | Major revision |
| **F** | <60 | Rewrite needed |

Pass threshold: **75%** (C grade or above).

---

### Embedded LLM Checklist Review (Step 2.3 — Optional)

For human-level nuance beyond pattern matching. The invoking agent performs these checks:

#### When to Use

- Need judgment beyond pattern matching
- Want deeper analysis of description effectiveness
- Need structured scoring against quality criteria

#### LLM Checklist

| # | Category | Item | Check |
|---|----------|------|-------|
| 1 | Discovery | Description quality | Clear, specific, has routing triggers |
| 2 | Discovery | Trigger effectiveness | Would fire on intended user queries |
| 3 | Core | Persona specificity | Domain-specific, not generic |
| 4 | Core | Voice consistency | Imperative/third-person throughout |
| 5 | Operational | Content helpfulness | Actually useful for delegated tasks |
| 6 | Operational | Example quality | Concrete, realistic, with commentary |

---

### Evaluation Loop (Best Practice)

For new agent development, use iterative evaluation:

```
┌─────────────────┐
│  1. Baseline    │  Run WITHOUT agent → Document gaps
│     Testing     │  What does the main agent miss?
└────────┬────────┘
         ▼
┌─────────────────┐
│  2. Write       │  Address ONLY documented gaps
│     Content     │  Use concrete examples
└────────┬────────┘
         ▼
┌─────────────────┐
│  3. Retest     │  Same scenarios WITH agent
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

### Step Details

#### Step 1.1: Parse Agent .md (Script)
```bash
superskill agent evaluate <agent.md> --save
```

**What script does:**
- Reads agent .md file
- Parses YAML frontmatter
- Extracts body content

**If FAIL:** Abort — agent has syntax errors

#### Step 1.2: Check Frontmatter (Script)

**What script checks:**
- `name` field exists, kebab-case, max 50 chars
- `description` field exists, is a string
- Valid YAML syntax

**If BLOCK:** Stop — critical failure

#### Step 2.1: Dimension Scoring (Script)
```bash
superskill agent evaluate <agent.md> --save
```

**What script scores (10 dimensions, see evaluation.config.ts):**
- Core Quality: Frontmatter (10), Body (10/15), Naming (5), Instruction Clarity (5)
- Discovery & Trigger: Description Effectiveness (15)
- Safety & Compliance: Tool Restriction (10), Thin-Wrapper (15/5), Security (5)
- Operational: Platform Compatibility (10), Operational Readiness (15/20)

**Output:** Score per dimension, total (out of 100), grade (A/B/C/D/F)

#### Step 2.4: Generate Report (Script)
- Outputs JSON or text report
- Lists all findings and recommendations
- Includes grade, pass/fail status, weight profile used

---

## Refine Workflow

Fix issues and improve quality. **Key design:** scripts handle deterministic fixes; the invoking LLM agent handles fuzzy quality improvements via LLM content improvement.

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ REFINE WORKFLOW                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │   │
│  │ Evaluate │    │ Script   │    │ LLM      │    │ Re-      │   │
│  │ (Script) │    │ Fixes    │    │ Content  │    │ evaluate │   │
│  │          │    │ (Script) │    │ Improve  │    │ (Script) │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │              │               │                │            │
│       ▼              ▼               ▼                ▼            │
│  [Issues found] [Fixes applied] [Verified]       [COMPLETE]       │
│       │              │               │                │            │
│       ▼              ▼               ▼                ▼            │
│  [No issues →   [Nothing      [FAIL →            [Score drop →   │
│   COMPLETE]      to fix]       Back to 2]         Retry step 3]  │
│                                                                      │
│  ─────────────────────────────────────────────────────────────     │
│  Branch: Migration Mode (--migrate)                                │
│  ┌──────────┐    ┌──────────┐                                     │
│  │ Step M1  │───▶│ Step M2  │                                     │
│  │ Migrate  │    │ Validate  │                                     │
│  │ (Script) │    │ (Script)  │                                     │
│  └──────────┘    └──────────┘                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Standard Refine Flow

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Evaluate | `evaluate.ts` | Identifies issues | Continue |
| 2 | Script Fixes | `refine.ts --best-practices` | Deterministic fixes applied | Warn only |
| 3 | LLM Content Improvement | LLM (invoking agent) | Improves content using LLM | Back to step 2 |
| 4 | Re-evaluate | `evaluate.ts` | Score improved | Retry step 3 |

### Step Details

#### Step 1: Evaluate (Script)
```bash
superskill agent evaluate <agent.md> --save
```

**What happens:**
- Run full 10-dimension evaluation
- Identify issues per dimension
- Determine which fixes are needed

#### Step 2: Script Fixes (Script — Deterministic)
```bash
superskill agent refine <agent.md> --auto --save
```

**What script fixes:**

| Fix | Description |
|-----|-------------|
| Normalize TODO markers | Standardize `TODO:` format, flag for manual replacement |
| Convert second-person → imperative | "you can use" → "Use", "I will help you" → "This agent helps" |
| Convert Windows paths | Backslashes → forward slashes |
| Flag missing structure | Warn if >2000 chars body without `##` headers |

**Output:** Modified agent .md file, report of changes

#### Step 3: LLM Content Improvement
**Handler:** LLM (invoking agent using its own LLM capability)

**What the invoking agent does:**
1. Reads the agent .md file after script fixes
2. Identifies weak sections: vague descriptions, inconsistent voice, weak examples
3. Uses LLM to rewrite content addressing issues
4. Preserves frontmatter exactly (name, description, tools, model)
5. Ensures description starts with "Use PROACTIVELY for" for specialist agents
6. Adds concrete trigger phrases (3+ quoted phrases)
7. Adds example blocks with proper `<example>` and `<commentary>`
8. Verifies voice consistency (third-person imperative throughout)
9. Checks persona specificity for specialist agents (domain-specific)
10. Verifies rules completeness (8+ DO and 8+ DON'T for specialist, 4+ each for standard)
11. Checks verification protocol has confidence scoring and red flags

**Important:**
- Frontmatter fields MUST NOT be modified
- Only the body content is improved
- Preserve all existing reference links
- Check tier-specific requirements match agent type

**If FAIL:** Go back to Step 2 (re-run script fixes after agent edits)

#### Step 4: Re-evaluate (Script)
```bash
superskill agent evaluate <agent.md> --save
```

**What happens:**
- Re-run full evaluation
- Compare score with Step 1 baseline
- If score improved: COMPLETE
- If score dropped: Retry Step 3 (max 2 retries)

### Migration Mode Flow (--migrate)

| Step | Name | Handler | Success Criteria |
|------|------|---------|------------------|
| M1 | Migrate | `refine.ts --migrate` | Applies rd2→cc transforms |
| M2 | Validate | `validate.ts` | Structure valid |

**M1 script applies:**
- Add `name` field if missing (derived from heading)
- Add `tools` field if missing (empty array)
- Best practice fixes (TODO normalization, voice fixes, path fixes)
- LLM fuzzy refinement (same as Step 3)

---

### Alternative: TDD-Based Refinement

For deeper agent improvement, use **TDD for Agents** approach:

#### The Iron Law

> **NO AGENT WITHOUT A FAILING TEST FIRST.**

If you did not watch the main agent fail without the subagent, you do not know if the subagent teaches the right thing.

#### TDD Workflow

| Phase | Action | Description |
|-------|--------|-------------|
| **RED** | Run WITHOUT agent | Document main agent failures and rationalizations |
| **GREEN** | Write minimal agent | Address specific failures |
| **REFACTOR** | Iterate | Close loopholes, re-test until bulletproof |

#### When to Use TDD

| Use TDD | Skip TDD |
|---------|----------|
| Agent addresses common violations | Agent is purely informational |
| Behavior change is critical | Behavior already correct |
| Multiple tasks need consistent behavior | Time constraints |
| Rationalizations are predictable | |

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

### Standard Evolve Flow

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Analyze Signals | `evolve.ts --analyze` | Signal report generated | Abort |
| 2 | Generate Proposals | `evolve.ts --propose` | Proposal set persisted | Retry step 2 |
| 3 | Embedded LLM Proposal Review | LLM (invoking agent) | Proposal set is reviewed, clarified, and prioritized | Back to step 2 |
| 4 | Apply or Roll Back | `evolve.ts --apply` / `--rollback` | Approved change applied safely | Abort |

### Step Details

#### Step 1: Analyze Signals
```bash
superskill agent evolve <agent.md> --propose-only
```

#### Step 2: Generate Proposals
```bash
superskill agent evolve <agent.md> --propose-only
```

The script persists deterministic proposals and supporting rationale.

#### Step 3: Embedded LLM Proposal Review

The invoking agent reviews the proposal set before any apply step:

1. Remove weak or duplicate proposals
2. Tighten rationale and expected behavioral impact
3. Confirm proposal order matches risk and value
4. Decide whether to apply, defer, or collect more evidence

This review is part of the normal evolve workflow.

#### Step 4: Apply or Roll Back
```bash
superskill agent evolve <agent.md> --accept <proposal-id>
```

---

## Adapt Workflow

Convert agent between platform formats using the Universal Agent Model (UAM).

### Workflow Steps

```
┌─────────────────────────────────────────────────────────────────────┐
│ ADAPT WORKFLOW                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Step 1   │───▶│ Step 2   │───▶│ Step 3   │───▶│ Step 4   │   │
│  │ Parse    │    │ Convert  │    │ Generate │    │ Validate │   │
│  │ Source   │    │ to UAM   │    │ Target   │    │ Output   │   │
│  │ (Adapter)│    │ (Internal)│   │ (Adapter)│    │ (Script) │   │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘   │
│       │              │               │                │            │
│       ▼              ▼               ▼                ▼            │
│  [FAIL: Abort]  [FAIL: Abort]   [Warnings]       [COMPLETE]       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Step | Name | Handler | Success Criteria | On Failure |
|------|------|---------|------------------|-------------|
| 1 | Parse Source | Adapter `parse()` | Valid agent parsed | Abort |
| 2 | Convert to UAM | Internal | UAM populated | Abort |
| 3 | Generate Target | Adapter `generate()` | Target files created | Retry step 3 |
| 4 | Validate Output | `validate.ts --platform <target>` | Target passes validation | Warn |

### Step Details

#### Step 1: Parse Source

**What adapter does:**
- Reads source file
- Parses platform-specific format (YAML frontmatter, JSON, TOML)
- Extracts all fields into parse result

**If FAIL:** Abort — source file invalid

#### Step 2: Convert to UAM
- Maps source fields to Universal Agent Model
- Preserves platform extensions
- Notes fields that have no UAM equivalent

#### Step 3: Generate Target
- Maps UAM fields to target platform format
- Generates output files (may produce multiple: .md + .json for OpenCode)
- Warns about dropped fields not supported by target

**Dropped field warnings:** Fields like `skills`, `mcpServers`, `hooks` are Claude Code-only and will be dropped for other platforms.

#### Step 4: Validate Output
```bash
superskill agent validate <generated-file> --target <target>
```

**If FAIL:** Warn but complete (some platform constraints are advisory)

### Embedded LLM Content Improvement

After deterministic generation and validation, the invoking agent reviews the adapted output:

1. Check that target-platform instructions still preserve the source intent
2. Tighten weak examples, trigger wording, or platform notes that became misleading after conversion
3. Loop back to adapt or refine if the source file needs improvement before regeneration

This review is part of the normal adapt workflow.

### Platform Output Formats

| Target | Output File | Format |
|--------|-------------|--------|
| Claude Code | `<name>.md` | Markdown + YAML frontmatter |
| Gemini CLI | `.gemini/agents/<name>.md` | Markdown + YAML frontmatter |
| OpenCode | `<name>.md` + `<name>.opencode.json` | Markdown + JSON (dual) |
| Codex | `<name>.codex.toml` | TOML config |
| OpenClaw | `<name>.openclaw.json` | JSON config |
| Antigravity | `<name>.antigravity.md` | Advisory Markdown |

---

## Workflow Selection Matrix

| Situation | Workflow | Steps |
|-----------|----------|-------|
| New agent | Create | 1 → 2 → 3 → 4 |
| Structure check | Validate | 1 → 2 → 3 |
| Quality score | Evaluate | 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.4 |
| Quality score + checklist review | Evaluate | 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 2.4 |
| Fix deterministic issues | Refine (--best-practices) | 1 → 2 → 4 |
| Fix all issues | Refine (--eval --best-practices) | 1 → 2 → 3 → 4 |
| Migrate from rd2 | Refine (--migrate) | M1 → M2 |
| Longitudinal improve | Evolve | 1 → 2 → 3 → 4 |
| Cross-platform convert | Adapt | 1 → 2 → 3 → 4 |

---

## Retry Policy

| Failure Point | Retry Action | Max Retries |
|---------------|--------------|-------------|
| Scaffold | Re-run scaffold | 3 |
| Validate structure | Abort | N/A |
| LLM Content Improvement | Back to appropriate step | 2 |
| Script fixes | Warn only | N/A |
| Generate platform output | Re-generate | 3 |
| Re-evaluate (score drop) | Retry LLM content improvement | 2 |
