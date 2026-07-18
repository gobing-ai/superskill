# Skill Patterns Guide

This guide documents the proven cc workflow patterns for building skills. Each pattern addresses a specific category of use cases.

## Overview

cc skills follow a small set of workflow patterns that represent best practices. Understanding these patterns helps skill creators choose the right approach.

## Relationship to ADK Patterns

These cc patterns are **workflow heuristics** for authors.

They complement, rather than replace, the ADK interaction patterns documented in [skill-patterns-adk.md](skill-patterns-adk.md):
- cc patterns help you shape overall workflow logic
- ADK patterns help you label runtime behavior such as `pipeline` or `reviewer`

Use both when useful.

| Pattern | Use Case | Key Technique |
| ------- |----------|---------------|
| Sequential Workflow | Multi-step processes | Explicit ordering, dependencies |
| Multi-Platform Coordination | Cross-platform tool handoffs | Phase separation, data passing |
| Iterative Refinement | Quality loops | Validation scripts, stop criteria |
| Context-Aware Tool Selection | Decision trees | Clear criteria, fallbacks |
| Domain-Specific Intelligence | Compliance/audit | Embedded expertise, checks |
| Composable Library | Dynamic code generation | Pre-built helpers, runtime composition |

---

## 1. Sequential Workflow Orchestration

**Best for:** Multi-step processes that must happen in a specific order.

### Characteristics

- Explicit ordering between steps
- Dependencies between stages
- Validation at each checkpoint
- Rollback instructions for failures

### Example Structure

```markdown
## Workflow: Customer Onboarding

### Step 1: Create Account
- Collect required fields
- Validate input format
- Store in database

### Step 2: Setup Payment
- Initialize payment gateway
- Create customer record
- Verify connection

### Step 3: Create Subscription
- Select plan tier
- Apply promotional codes
- Activate subscription
```

### When to Use

- Customer onboarding flows
- Document generation pipelines
- Approval workflows
- Configuration setups
- ADK `pipeline` skills that need stronger gates

### When NOT to Use

- Independent tasks that don't need ordering
- Exploratory analysis (use Iterative Refinement)
- Simple lookups (use Reference type)

### Key Techniques Checklist

- [ ] Explicit step numbering
- [ ] Dependency declaration
- [ ] Validation at each stage
- [ ] Error handling with rollback
- [ ] Progress indicators

---

## 2. Multi-Platform Coordination

**Best for:** Workflows that span multiple platforms or tools (Claude Code, Codex, OpenClaw, etc.).

### Characteristics

- Clear phase separation between platforms
- Data passing between platform operations
- Centralized error handling
- Platform-specific fallback logic

### Example Structure

```markdown
## Design-to-Development Handoff

### Phase 1: Design (Design Tool)
- Fetch component specs
- Extract design tokens
- Generate asset清单

### Phase 2: Documentation (Drive/Storage)
- Create project folder
- Generate spec document
- Share with team

### Phase 3: Tracking (Project Management)
- Create project
- Add milestones
- Assign initial tasks
```

### When to Use

- Cross-platform integrations
- Design-to-development handoffs
- Multi-tool orchestration
- Data aggregation workflows

### When NOT to Use

- Single platform usage
- Simple API calls
- Uncoordinated parallel tasks

### Key Techniques Checklist

- [ ] Phase separation
- [ ] Data passing between phases
- [ ] Centralized error handling
- [ ] Retry logic per service
- [ ] Platform-specific fallbacks

---

## 3. Iterative Refinement

**Best for:** Quality loops that require validation before proceeding.

### Characteristics

- Explicit quality criteria
- Validation scripts at each iteration
- Know when to stop (max iterations)
- Result scoring or grading

### Example Structure

```markdown
## Report Generation Pipeline

### Quality Criteria
- Accuracy: >95% facts verified
- Completeness: All required sections present
- Readability: Grade level <10

### Iteration 1: Draft
- Generate initial content
- Run validation script
- Score accuracy

### Iteration 2: Refine
- Fix accuracy issues
- Add missing sections
- Check completeness

### Iteration 3: Polish
- Simplify language
- Verify readability score
- Final review

### Stop Conditions
- Max 5 iterations
- All criteria met
- Timeout (30 seconds)
```

### When to Use

- Content generation with quality gates
- Code review automation
- Document refinement
- Testing and validation loops
- ADK `reviewer` skills that may need multiple improvement passes

### When NOT to Use

- Single-pass transformations
- Deterministic outputs
- Simple lookups

### Key Techniques Checklist

- [ ] Define quality metrics
- [ ] Implement validation functions
- [ ] Set iteration limits
- [ ] Track improvement scores
- [ ] Know when to stop

---

## 4. Context-Aware Tool Selection

**Best for:** Decision trees that choose the right tool or approach based on context.

### Characteristics

- Clear decision criteria
- Transparent reasoning
- Fallback options
- User can understand the logic

### Example Structure

```markdown
## Smart File Storage

### Decision Criteria
- File type (image, document, code)
- File size (<1MB, 1-10MB, >10MB)
- Access pattern (read-heavy, write-heavy)

### Decision Tree

IF file is image:
  → IF size <1MB: Store in S3, CDN URL
  → IF size 1-10MB: Store in S3, lazy load
  → IF size >10MB: Reject with size limit error

IF file is document:
  → IF team access: Store in Google Drive
  → IF public: Store in S3 with signed URL
```

### When to Use

- Conditional file handling
- Environment detection
- Service selection based on context
- Adaptive behavior
- ADK `tool-wrapper` skills that load the right reference set for the current task

### When NOT to Use

- Always-use-single-tool scenarios
- Simple routing without context
- Deterministic one-path workflows

### Key Techniques Checklist

- [ ] Define decision inputs
- [ ] Document criteria clearly
- [ ] Provide fallbacks
- [ ] Log decision reasoning
- [ ] Make logic transparent

---

## 5. Domain-Specific Intelligence

**Best for:** Skills that embed expertise in a specific domain (compliance, finance, healthcare, etc.).

### Characteristics

- Domain expertise in logic
- Compliance checks before action
- Comprehensive audit trails
- Regulatory awareness

### Example Structure

```markdown
## Payment Processing Skill

### Compliance Checks (Before Any Action)
- [ ] PCI-DSS compliance verified
- [ ] Amount within limits
- [ ] Currency allowed for region
- [ ] Fraud score below threshold

### Domain Logic
- Apply correct fee structure
- Calculate taxes by region
- Handle currency conversion
- Generate compliant receipt

### Audit Trail
- Log all payment attempts
- Record decision rationale
- Timestamp with timezone
- Store for 7 years
```

### When to Use

- Regulated industries
- Financial transactions
- Healthcare data handling
- Legal document processing

### When NOT to Use

- General-purpose tasks
- Creative content generation
- Simple utility functions

### Key Techniques Checklist

- [ ] Embed domain rules in code
- [ ] Compliance checks before action
- [ ] Comprehensive logging
- [ ] Audit trail generation
- [ ] Error handling with domain context

---

## 6. Composable Library

**Best for:** Skills that provide helper functions Claude can compose dynamically at runtime.

### Characteristics

- Pre-built helper functions at the plugin level (`plugins/<plugin>/scripts/<feature>/`)
- Claude generates new scripts that import and compose these helpers
- Claude spends turns on composition, not reconstructing boilerplate
- Helpers handle complexity; Claude handles orchestration

> For superskill plugin skills, executable logic lives at `plugins/<plugin>/scripts/<feature>/` — see [scripts-and-install.md](scripts-and-install.md).

### Example Structure

```markdown
## Data Analysis Toolkit

### Available Helpers

The following functions are in `plugins/<plugin>/scripts/<feature>/helpers/`:

- `fetch_events(source, date_range)` — Pull events from your event source
- `join_users(events, user_table)` — Join events with canonical user_id
- `compute_funnel(steps, events)` — Calculate conversion funnel
- `format_report(data, template)` — Format results using templates

### Usage

Generate a Python script that imports and composes these helpers:

    from helpers import fetch_events, join_users, compute_funnel

    events = fetch_events("signup", last_7_days)
    enriched = join_users(events, "users_canonical")
    funnel = compute_funnel(["signup", "activate", "paid"], enriched)
```

### When to Use

- Complex analysis requiring multiple data transformations
- Workflows where the same building blocks combine in different ways
- Skills where Claude would otherwise rewrite the same code each time
- Domain-specific operations with tricky edge cases

### When NOT to Use

- Simple single-step operations
- Skills where the workflow is always the same (use Sequential instead)
- Operations that don't benefit from code generation

### Key Techniques Checklist

- [ ] Helper functions are tested and reliable
- [ ] Function signatures are well-documented
- [ ] Helpers handle edge cases internally
- [ ] Claude knows what helpers are available (list in SKILL.md)
- [ ] Generated scripts can be run directly
- [ ] Error messages from helpers are clear and actionable

---

## Choosing a Pattern

### Quick Decision Guide

```
Does the skill coordinate multiple platforms?
  YES → Multi-Platform Coordination
  NO ↓

Are steps strictly ordered?
  YES → Sequential Workflow
  NO ↓

Does it validate quality iteratively?
  YES → Iterative Refinement
  NO ↓

Does it make decisions based on context?
  YES → Context-Aware Tool Selection
  NO ↓

Does it embed domain expertise?
  YES → Domain-Specific Intelligence
  NO ↓

Does it provide helper functions Claude composes at runtime?
  YES → Composable Library
  NO → Consider Technique or Reference type
```

### Pattern Combinations

Patterns can combine for more complex skills:

- **Sequential + Iterative**: Multi-step process with quality validation at each step
- **Multi-Platform + Context-Aware**: Service selection based on available tools
- **Domain-Specific + Sequential**: Regulated workflow with ordered compliance checks

---

## See Also

- [workflows.md](workflows.md) - Detailed operation workflows
- [best-practices.md](best-practices.md) - Comprehensive guidance
- [security.md](security.md) - Security considerations
