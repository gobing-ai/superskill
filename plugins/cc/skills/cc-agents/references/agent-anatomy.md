# Agent Anatomy Reference

Body structure guidance for subagent definitions, organized by template tier.

## 7 Canonical Sections

Every agent body follows this canonical structure. Sections are included or omitted based on template tier.

| # | Section | Purpose | Key Elements |
|---|---------|---------|--------------|
| 1 | **Role** | Identity and expertise | Background, expertise areas, approach, core principle |
| 2 | **Philosophy** | Guiding principles | 3-6 principles with priority tags, design values |
| 3 | **Verification** | Quality gates | Pre-execution checklist, red flags, confidence scoring |
| 4 | **Competencies** | Structured knowledge | 20-50+ items across 4-5 categories |
| 5 | **Process** | Workflow phases | Multi-phase steps, error recovery table |
| 6 | **Rules** | Behavioral guardrails | DO and DON'T checklists |
| 7 | **Output Format** | Response templates | Primary template, error template, confidence |

**Note:** METADATA (name, description, tools, model, color) lives in **frontmatter**, not in the body.

---

## Tier Comparison

| Section | Minimal (20-50 lines) | Standard (80-200 lines) | Specialist (200-500 lines) |
|---------|----------------------|------------------------|---------------------------|
| **Role** | 1-line role statement | Role block + 3 expertise areas | Full persona + approach + core principle |
| **Philosophy** | -- | -- | 3 principles (CRITICAL/STANDARD/EMBEDDED) + design values |
| **Verification** | -- | -- | Pre-execution checklist + red flags + confidence scoring |
| **Competencies** | -- | -- | 4 categories, 5+ items each |
| **Process** | -- | 5-step linear | Multi-phase (3 phases, 10 steps) + error recovery table |
| **Rules** | 2 rules | 4 DO + 4 DON'T | 8 DO + 8 DON'T |
| **Output Format** | -- | Template with summary + next steps | Primary + error templates with confidence |
| **When to Use** | Explicit section | Explicit section | Explicit section |
| **Examples** | 1 `<example>` block | 1 in description | 2+ in description |

### Line Budgets

| Tier | Total Lines | Emphasis |
|------|-------------|----------|
| **Minimal** | 20-50 | Role + Rules + Examples |
| **Standard** | 80-200 | Role + Process + Rules + Output |
| **Specialist** | 200-500 | All 7 sections |

---

## Per-Section Guidance

### Section 1: Role

**Purpose:** Define who the agent is and what it specializes in.

**Minimal version:**
```markdown
## Role

You are a **[role description]** who [what you do].
```

**Standard version:**
```markdown
## Role

You are a **[role description]** who specializes in [specialization].

Your expertise spans:
- **Area 1** -- [Description]
- **Area 2** -- [Description]
- **Area 3** -- [Description]
```

**Specialist version:**
```markdown
## Role

You are a **[Role Title]** with deep expertise in [domain].

Your expertise spans:

- **[Expertise 1]** -- [Detailed description]
- **[Expertise 2]** -- [Detailed description]
- **[Expertise 3]** -- [Detailed description]
- **[Expertise 4]** -- [Detailed description]

Your approach: **[Core approach philosophy in one sentence].**

**Core principle:** [Primary guiding principle.]
```

**Common mistakes:**
- Writing generic descriptions ("You are a helpful assistant")
- Missing the expertise areas list
- Forgetting the core principle in specialist tier

---

### Section 2: Philosophy (Specialist only)

**Purpose:** Define the principles that guide all decisions.

```markdown
## Philosophy

### Core Principles

1. **[Principle Name]** [CRITICAL]
   - [Description]
   - [How it applies]

2. **[Principle Name]** [STANDARD]
   - [Description]
   - [How it applies]

3. **[Principle Name]** [EMBEDDED]
   - [Description]
   - [How it applies]

### Design Values

- **[Value 1]** -- [Description]
- **[Value 2]** -- [Description]
- **[Value 3]** -- [Description]
```

**Priority tags:** `[CRITICAL]` = must always follow, `[STANDARD]` = default behavior, `[EMBEDDED]` = nice-to-have.

**Common mistakes:**
- Too many principles (3-6 is ideal)
- Missing priority tags
- Principles that are too abstract to act on

---

### Section 3: Verification (Specialist only)

**Purpose:** Quality gates to prevent errors before they happen.

```markdown
## Verification

### Pre-Execution Checklist

```
[ ] [Check 1]
[ ] [Check 2]
[ ] [Check 3]
```

### Red Flags -- STOP and Validate

- [Situation that requires stopping]
- [Another critical check]

### Confidence Scoring

| Level  | Threshold | Criteria |
| ------ | --------- | -------- |
| HIGH   | >90%      | [When to assign HIGH] |
| MEDIUM | 70-90%    | [When to assign MEDIUM] |
| LOW    | <70%      | [When to assign LOW -- flag for user review] |
```

**Common mistakes:**
- Checklist items too vague ("check everything")
- Missing confidence scoring table
- No red flags defined

---

### Section 4: Competencies (Specialist only)

**Purpose:** Structured knowledge that serves as the agent's memory.

```markdown
## Competencies

### [Category 1]

- **[Item]** -- [Description]
- **[Item]** -- [Description]
(5+ items per category)

### [Category 2]
(repeat pattern)
```

**Target:** 20+ items across 4-5 categories. For domain experts, aim for 50+.

**Common categories:** Core Concepts, Common Patterns, Best Practices, Anti-Patterns, Edge Cases.

**Common mistakes:**
- Too few items (< 20 total)
- Categories that overlap
- Items without descriptions

---

### Section 5: Process

**Purpose:** Define the step-by-step workflow for handling requests.

**Standard version (5-step linear):**
```markdown
## Process

Follow these steps for each request:

1. **Understand** -- Parse the request and identify the core need
2. **Analyze** -- Assess context, constraints, requirements
3. **Execute** -- Perform the primary task
4. **Verify** -- Check results against requirements
5. **Report** -- Present findings with clear structure
```

**Specialist version (multi-phase with error recovery):**
```markdown
## Process

### Phase 1: Understand
1. **Parse request** -- Identify core task and constraints
2. **Clarify** -- Ask questions if ambiguous
3. **Research** -- Gather relevant context

### Phase 2: Design
4. **Analyze** -- Evaluate options and trade-offs
5. **Plan** -- Create targeted approach
6. **Validate** -- Verify plan against requirements

### Phase 3: Execute
7. **Implement** -- Execute the approach
8. **Verify** -- Check results
9. **Document** -- Record decisions
10. **Report** -- Present findings

### Error Recovery

| Error | Response |
|-------|----------|
| [Type 1] | [Recovery action] |
| [Type 2] | [Recovery action] |
```

**Common mistakes:**
- Steps that are too granular or too vague
- Missing error recovery table in specialist tier
- No verify step

---

### Section 6: Rules

**Purpose:** Clear behavioral boundaries.

**Minimal version:**
```markdown
## Rules

- [Rule 1: Key constraint]
- [Rule 2: Another constraint]
```

**Standard version (4+4):**
```markdown
## Rules

### What I Always Do

- [ ] [Positive behavior 1]
- [ ] [Positive behavior 2]
- [ ] [Positive behavior 3]
- [ ] [Positive behavior 4]

### What I Never Do

- [ ] [Negative behavior 1]
- [ ] [Negative behavior 2]
- [ ] [Negative behavior 3]
- [ ] [Negative behavior 4]
```

**Specialist version (8+8):** Same structure, 8 items per list.

**Common mistakes:**
- Rules that contradict each other
- Too many rules (diminishing returns beyond 10 per list)
- Rules that duplicate process steps

---

### Section 7: Output Format

**Purpose:** Define how the agent structures its responses.

**Standard version:**
```markdown
## Output Format

```markdown
## [Title]

**Summary**: [Brief summary]

### Details
[Structured content]

### Next Steps
- [Recommendation 1]
- [Recommendation 2]
```
```

**Specialist version (adds confidence + error template):**
```markdown
## Output Format

### Primary Template

```markdown
## [Title]

**Context**: [Brief context]
**Confidence**: HIGH / MEDIUM / LOW

### Analysis
[Content]

### Findings
| Finding | Severity | Recommendation |
|---------|----------|----------------|
| [item]  | [level]  | [action]       |

### Next Steps
1. [Step 1]
2. [Step 2]
```

### Error Response

```markdown
## Issue Detected

**Problem**: [Description]
**Impact**: [What this affects]

**Resolution**:
1. [Step 1]
2. [Step 2]

**Alternatives**: [Fallback options]
```
```

**Common mistakes:**
- No structured template (just free-form text)
- Missing confidence level in specialist tier
- No error response template

---

## Quick Checklists

### Minimal Tier

- [ ] Frontmatter: name, description, tools, model, color
- [ ] Role section with 1-line role statement
- [ ] When to Use section with 2+ scenarios
- [ ] 1 `<example>` block with commentary
- [ ] 2+ rules
- [ ] Total: 20-50 lines

### Standard Tier

- [ ] Frontmatter: name, description (with trigger phrases + example), tools, model, color
- [ ] Role section with 3 expertise areas
- [ ] When to Use section with trigger scenarios
- [ ] 5-step Process
- [ ] Rules: 4 DO + 4 DON'T
- [ ] Output Format template
- [ ] Total: 80-200 lines

### Specialist Tier

- [ ] Frontmatter: name, description (with "Use PROACTIVELY" + 2 examples), tools, model, color, skills
- [ ] Role with 4 expertise areas + approach + core principle
- [ ] When to Use section with trigger scenarios
- [ ] Philosophy: 3 principles with tags + design values
- [ ] Verification: checklist + red flags + confidence scoring
- [ ] Competencies: 4 categories, 5+ items each (20+ total)
- [ ] Process: 3 phases, 10 steps + error recovery table
- [ ] Rules: 8 DO + 8 DON'T
- [ ] Output Format: primary + error templates with confidence
- [ ] Total: 200-500 lines
