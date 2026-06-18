# Skill Categories

Skills cluster into recurring categories by **business purpose**. This taxonomy helps answer "What kind of skill should I build?" and "What skills am I missing?"

> **Note**: Categories describe *what the skill does for the user*. Types (Technique/Pattern/Reference) describe *how the content is structured*. A single category can use any type.

## The 9 Categories

| # | Category | Purpose | Best Type |
|---|----------|---------|-----------|
| 1 | [Library & API Reference](#1-library--api-reference) | Explain how to correctly use a library, CLI, or SDK | Reference |
| 2 | [Product Verification](#2-product-verification) | Test or verify that code is working | Technique |
| 3 | [Data Fetching & Analysis](#3-data-fetching--analysis) | Connect to data and monitoring stacks | Technique |
| 4 | [Business Process Automation](#4-business-process-automation) | Automate repetitive workflows into one command | Technique |
| 5 | [Code Scaffolding & Templates](#5-code-scaffolding--templates) | Generate framework boilerplate for specific functions | Technique |
| 6 | [Code Quality & Review](#6-code-quality--review) | Enforce code quality and review standards | Pattern |
| 7 | [CI/CD & Deployment](#7-cicd--deployment) | Fetch, push, and deploy code | Technique |
| 8 | [Runbooks](#8-runbooks) | Investigate symptoms and produce structured reports | Technique |
| 9 | [Infrastructure Operations](#9-infrastructure-operations) | Routine maintenance and operational procedures | Technique |

---

## 1. Library & API Reference

Skills that explain how to correctly use a library, CLI, or SDK — especially internal ones or common ones where Claude struggles.

**Key content**: Code snippets, edge cases, footguns, gotchas list.

**Examples**:
- `billing-lib` — Internal billing library: edge cases, footguns, correct usage patterns
- `internal-platform-cli` — Every subcommand with examples of when to use each
- `frontend-design` — Make Claude better at your design system (avoid default patterns like Inter font and purple gradients)

**Best type**: Reference (lookup tables, API signatures, gotchas)

**Tips**:
- Focus on what Claude gets wrong without the skill
- Include a folder of reference code snippets
- List gotchas prominently — these are the highest-signal content

---

## 2. Product Verification

Skills that describe how to test or verify that code is working. Often paired with external tools like Playwright, tmux, etc.

**Key content**: Test scripts, assertion patterns, verification steps, recording instructions.

**Examples**:
- `signup-flow-driver` — Runs signup → email verify → onboarding in headless browser with assertions at each step
- `checkout-verifier` — Drives checkout UI with Stripe test cards, verifies invoice state
- `tmux-cli-driver` — For interactive CLI testing that needs a TTY

**Best type**: Technique (step-by-step verification workflow)

**Tips**:
- Have Claude record a video of its output so you can see what it tested
- Enforce programmatic assertions on state at each step
- Include verification scripts in `extensions/` directory
- Worth spending significant engineering time making these excellent

---

## 3. Data Fetching & Analysis

Skills that connect to data and monitoring stacks. Include libraries, credentials patterns, dashboard IDs, and common analysis workflows.

**Key content**: Query templates, table schemas, dashboard references, analysis workflows.

**Examples**:
- `funnel-query` — Which events to join for signup → activation → paid, plus canonical user_id table
- `cohort-compare` — Compare two cohorts' retention/conversion, flag statistically significant deltas
- `grafana` — Datasource UIDs, cluster names, problem → dashboard lookup table

**Best type**: Technique (analysis workflow) or Reference (schema/dashboard lookup)

**Tips**:
- Include helper functions in `extensions/` that Claude can compose for complex analysis
- Store credentials patterns (not actual credentials) and connection configs
- Provide common query patterns as composable building blocks

---

## 4. Business Process Automation

Skills that automate repetitive workflows into one command. Usually simple instructions but may depend on other skills or MCPs.

**Key content**: Workflow steps, output templates, integration points.

**Examples**:
- `standup-post` — Aggregates ticket tracker + GitHub activity + prior Slack → formatted standup
- `create-ticket` — Enforces schema (valid enums, required fields) plus post-creation workflow
- `weekly-recap` — Merged PRs + closed tickets + deploys → formatted recap

**Best type**: Technique (step-by-step automation)

**Tips**:
- Save previous results in log files so Claude stays consistent across runs
- Use `${CLAUDE_PLUGIN_DATA}` for persistent storage across sessions
- Keep instructions simple — complexity comes from composition, not the skill itself

---

## 5. Code Scaffolding & Templates

Skills that generate framework boilerplate for a specific function in your codebase. Especially useful when scaffolding has natural language requirements that pure code templates can't cover.

**Key content**: Template files, scaffold scripts, configuration patterns.

**Examples**:
- `new-workflow` — Scaffolds a new service/workflow/handler with your annotations
- `new-migration` — Migration file template plus common gotchas
- `create-app` — New internal app with auth, logging, and deploy config pre-wired

**Best type**: Technique (scaffold workflow)

**Tips**:
- Include template files in `assets/` directory
- Combine scaffold scripts with natural language guidance for decisions
- Document what gets generated and what the user needs to customize

---

## 6. Code Quality & Review

Skills that enforce code quality standards and help review code. Can include deterministic scripts or tools for maximum robustness. Consider running these automatically via hooks or GitHub Actions.

**Key content**: Review criteria, style rules, testing practices, automation scripts.

**Examples**:
- `adversarial-review` — Spawns a fresh-eyes subagent to critique, implements fixes, iterates until findings degrade to nitpicks
- `code-style` — Enforces code style that Claude doesn't follow by default
- `testing-practices` — Instructions on how to write tests and what to test

**Best type**: Pattern (principles and decision frameworks)

**Tips**:
- Use deterministic scripts for objective checks (linting, formatting)
- Use LLM judgment for subjective checks (architecture, naming, readability)
- Consider making these run automatically via hooks

---

## 7. CI/CD & Deployment

Skills that help fetch, push, and deploy code. May reference other skills for data collection.

**Key content**: Deployment scripts, rollout procedures, monitoring checks.

**Examples**:
- `babysit-pr` — Monitors PR → retries flaky CI → resolves merge conflicts → enables auto-merge
- `deploy-service` — Build → smoke test → gradual traffic rollout with error-rate comparison → auto-rollback
- `cherry-pick-prod` — Isolated worktree → cherry-pick → conflict resolution → PR with template

**Best type**: Technique (deployment workflow)

**Tips**:
- Include safety checks and rollback procedures
- Reference monitoring skills for post-deploy verification
- Document the blast radius of each step

---

## 8. Runbooks

Skills that take a symptom (Slack thread, alert, error signature), walk through a multi-tool investigation, and produce a structured report.

**Key content**: Symptom → tool → query mapping, investigation steps, report templates.

**Examples**:
- `service-debugging` — Maps symptoms → tools → query patterns for high-traffic services
- `oncall-runner` — Fetches alert → checks usual suspects → formats finding
- `log-correlator` — Given a request ID, pulls matching logs from every system that touched it

**Best type**: Technique (investigation workflow)

**Tips**:
- Structure as decision tree: symptom → likely cause → investigation tool
- Include report templates in `assets/`
- Document which tools/MCPs are needed at each step

---

## 9. Infrastructure Operations

Skills that perform routine maintenance and operational procedures — some involving destructive actions that benefit from guardrails.

**Key content**: Operational procedures, safety checks, cleanup workflows.

**Examples**:
- `resource-orphans` — Finds orphaned pods/volumes → posts to Slack → soak period → user confirms → cleanup
- `dependency-management` — Your org's dependency approval workflow
- `cost-investigation` — "Why did our bill spike?" with specific buckets and query patterns

**Best type**: Technique (operational workflow)

**Tips**:
- Include confirmation steps before destructive actions
- Use on-demand hooks (e.g., `hooks:` in frontmatter) for safety guards
- Log all actions for audit trail

---

## Choosing a Category

```
What does the skill help the user DO?
│
├── Use a library/API correctly? ─────────── Library & API Reference
├── Verify code works? ──────────────────── Product Verification
├── Query/analyze data? ─────────────────── Data Fetching & Analysis
├── Automate a business process? ─────────── Business Process Automation
├── Generate boilerplate? ────────────────── Code Scaffolding & Templates
├── Review/enforce code quality? ─────────── Code Quality & Review
├── Deploy or manage CI/CD? ──────────────── CI/CD & Deployment
├── Investigate an incident? ─────────────── Runbooks
└── Perform infrastructure ops? ──────────── Infrastructure Operations
```

## Category × Type Matrix

| Category | Technique | Pattern | Reference |
|----------|-----------|---------|-----------|
| Library & API Reference | | | **Primary** |
| Product Verification | **Primary** | | |
| Data Fetching & Analysis | **Primary** | | Secondary |
| Business Process Automation | **Primary** | | |
| Code Scaffolding & Templates | **Primary** | | |
| Code Quality & Review | | **Primary** | |
| CI/CD & Deployment | **Primary** | | |
| Runbooks | **Primary** | | |
| Infrastructure Operations | **Primary** | | |

---

## Source

Based on Anthropic's internal skill categorization from "Lessons from Building Claude Code: How We Use Skills" (2026).
