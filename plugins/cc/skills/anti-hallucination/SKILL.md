---
name: anti-hallucination
description: Use for ANY task requiring external information (APIs, libraries, frameworks, facts, recent events). Zero-trust verification-before-generation with MCP tool priority.
license: Apache-2.0
metadata:
  author: cc-agents
  version: 3.0.0
  platforms: claude-code,codex,antigravity,opencode,openclaw
  interactions:
    - reviewer
    - pipeline
  severity_levels:
    - error
    - warning
    - info
  pipeline_steps:
    - check
    - select
    - search
    - cite
    - score
---

# Anti-Hallucination Protocol

**The zero-trust approach to LLM reliability.**

## Overview

This skill implements a verification-before-generation protocol that prevents hallucination by requiring source citations, confidence scoring, and tool usage evidence before making factual claims. Based on 16 validated research sources with 2,500+ citations.

**Key benefits:**
- Reduces hallucination by 24.5% (Counterfactual Probing)
- Achieves 70%+ preemptive detection (FactCheckMate)
- Zero training cost using prompt-based techniques

## When to Use

Activate this skill when:
- Query mentions external APIs, libraries, or frameworks
- User asks about recent changes, versions, or deprecations
- Task requires factual claims (dates, statistics, specific values)
- Implementing authentication, security, or integration features
- Working with technologies not in current codebase

**Trigger phrases:**
- "How do I use X API?"
- "What's the latest version of Y?"
- "Does Z library support feature W?"
- "Verify the method signature for..."
- "Check if this authentication approach is correct"

## Mental Model

Think of this as **"Source-First Architecture"**: Every claim must trace back to a verifiable source before generation. Like a court of law — facts require evidence, not confidence.

**Tool Philosophy**: Use the RIGHT tool for the job, not just ANY search tool.

```
Memory (Unreliable) → Tool Selection → Source Verification → Generate (Grounded)
                          │                   │
                   ┌────────┴────────┐       │
                   │                 │       │
              Docs? GitHub?      Both!   Evidence
                   │                 │       │
              ref_search_documentation       searchCode Required
```

## Quick Start (80/20 Rule)

For 80% of cases, use this simple pattern:

```bash
# Step 1: Search using BEST tool
# For APIs/libraries: ref_search_documentation
ref_search_documentation "{library} {method/feature} official documentation"

# For GitHub code: searchCode
searchCode "method_name" language=Python

# Fallback: WebSearch
WebSearch "{query} official documentation 2024 2025"

# Step 2: Cite your source
**Source**: [URL](link) | **Verified**: YYYY-MM-DD

# Step 3: Score confidence
**Confidence**: HIGH/MEDIUM/LOW | **Reasoning**: {why}
```

## Activation Triggers

**IMMEDIATELY activate when:**
- Query contains external APIs, libraries, frameworks
- User asks about recent changes, versions, deprecations
- Task requires factual claims (dates, statistics, specific values)
- Implementing authentication, security, or integration features
- Working with technologies not in current codebase

**Decision Tree:**
```
Is the claim verifiable?
├── YES → Select Tool → Search → Verify → Cite → Generate
│         │
│         ├─ Documentation? → ref_search_documentation
│         ├─ GitHub code? → searchCode
│         └─ Other? → WebSearch
│
└── NO  → State uncertainty explicitly → LOW confidence
```

## Core Verification Workflow

### The 5-Step Protocol
```
1. CHECK → Do I need verification? (see triggers)
2. SELECT → Choose best tool for information type
3. SEARCH → Use selected tool with specific query
4. CITE   → Include source with date
5. SCORE  → Assign confidence level
```

### Tool Selection Guide

| Information Type | Primary Tool | Fallback |
|-----------------|--------------|----------|
| **API/Library Docs** | `ref_search_documentation` | WebFetch → WebSearch |
| **GitHub Source Code** | `searchCode` | WebFetch → WebSearch |
| **Recent Events (<6mo)** | `WebSearch` | ref_search_documentation |
| **Local Codebase** | `Read` / `Grep` | - |
| **Specific URL** | `ref_read_url` | WebFetch |

**Key Principles:**
1. `ref_search_documentation` first for ANY documentation
2. `searchCode` first for ANY GitHub code
3. `WebSearch` only as fallback or for non-code content

### Confidence Scoring

| Level | Score | Criteria | Example |
|-------|-------|----------|---------|
| **HIGH** | >90% | Direct quote from official docs (2024+) | "React 19 docs state X" |
| **MEDIUM** | 70-90% | Synthesized from multiple sources | "Based on AWS + Voiceflow" |
| **LOW** | <70% | Memory, outdated, or incomplete | "I recall but can't verify" |
| **UNVERIFIED** | N/A | No sources found | "Cannot verify - do not use" |

## Red Flags (Stop & Verify)

| Pattern | Red Flag | Action |
|---------|----------|--------|
| **Memory-based** | "I recall", "I think", "Should be" | Search immediately |
| **No citation** | Claim without source link | LOW confidence |
| **Specific values** | Exact numbers, dates, versions | Verify each |
| **API methods** | Method signatures from memory | Check official docs |
| **Security code** | Auth, tokens, secrets | Triple-verify |

## Fallback Protocol

```
IF ref_search_documentation fails:
├── Try ref_read_url (if you have URL)
├── Try WebFetch (specific URL)
├── Try WebSearch
└── ELSE: State "UNVERIFIED" + LOW confidence

IF searchCode fails:
├── Try WebFetch (if GitHub URL)
├── Try WebSearch
├── Check local codebase (Read/Grep)
└── ELSE: State "UNVERIFIED" + LOW confidence

IF all verification fails:
├── "I cannot verify this from official sources"
├── Mark all claims as LOW confidence
└── NEVER present unverified code as working
```

## Output Templates

### HIGH Confidence
```markdown
**Source**: [Documentation URL]
**Version**: X.Y.Z
**Verified**: YYYY-MM-DD

**Confidence**: HIGH
```

### MEDIUM Confidence
```markdown
**Based on**: [Source 1], [Source 2]
**Assumptions**: [list assumptions]

**Confidence**: MEDIUM
**Verify**: [what to double-check]
```

### LOW Confidence
```markdown
**WARNING**: Could not verify from official sources

**Confidence**: LOW
**Required**: Manual verification of [specific items]
```

## Quick Reference

**Verification Checklist:**
- [ ] Searched official documentation
- [ ] Verified version compatibility
- [ ] Checked for recent changes/deprecations
- [ ] Confirmed method signatures
- [ ] Added source citation
- [ ] Assigned confidence level

**Citation Format:**
```typescript
// Verified: {library} {version}
// Source: {URL}
// Date: {YYYY-MM-DD}
```

## Guard Script

The guard engine at `plugins/cc/scripts/anti-hallucination/ah_guard.ts` provides Stop hook integration for automated protocol enforcement. See `references/guard-implementation.md` for integration details.

## Platforms Without Hooks

If the target coding platform does not support hook execution, follow the same protocol through an alternate enforcement point. The verification rules do not change; only the enforcement adapter changes.

**Preferred enforcement order:**

1. **Spur workflow (Phase 4, pending)**: Run the agent through `spur workflow run anti-hallucination.yaml --vars '{"agent":"codex"}'` — a single workflow that captures the final answer, validates it with the anti-hallucination guard engine, and only returns the answer if validation passes. Replaces the former per-agent launcher scripts.
2. **Direct validation**: Validate a captured answer with `plugins/cc/scripts/anti-hallucination/validate_response.ts` (reads `RESPONSE_TEXT` or stdin).
3. **Reviewer pass**: Use a second review step that checks for sources, confidence, and verification evidence before accepting the answer.
4. **Structured output contract**: Require the final answer to include explicit `sources`, `confidence`, and `verification_steps` fields that can be validated by the host application or workflow.
5. **Instruction-only fallback**: If no wrapper, reviewer, or validator is available, the agent must treat unsupported verification as blocking for strong claims and explicitly label the answer as unverified.

**Required behavior on non-hook platforms:**

- Apply the same external-information detection as the guard script.
- Do not finalize externally sourced claims without citations and confidence.
- Prefer blocking and revising over silently emitting an unverifiable answer.
- If enforcement is impossible, downgrade the response by stating what could not be verified.

**Design rule:**

Treat `ah_guard.ts` as the reusable verification engine and hooks as only one adapter. For platforms without hooks, use wrappers, reviewer workflows, or host-side validation instead of duplicating the verification rules.

See `references/non-hook-enforcement.md` for the validation adapter and cross-agent enforcement patterns, including `validate_response.ts` and the pending spur workflow.

## Workflows

### Step 1: Check - Do I need verification?
```
IF query contains external info (API, library, framework, facts):
  THEN activate protocol
ELSE:
  Skip verification (internal discussion only)
```

### Step 2: Select - Choose best tool
| Information Type | Tool |
|-----------------|------|
| API/Library Docs | ref_search_documentation |
| GitHub Code | searchCode |
| Recent Events | WebSearch |
| Specific URL | ref_read_url |
| Local Codebase | Read/Grep |

### Step 3: Search - Execute verification
```
Use selected tool with specific query
Parse results for relevant information
```

### Step 4: Cite - Include source with date
```
**Source**: [URL]
**Verified**: YYYY-MM-DD
```

### Step 5: Score - Assign confidence level
```
HIGH: Direct quote from official docs
MEDIUM: Synthesized from multiple sources
LOW: Memory, outdated, or incomplete
```

## Additional Resources

For comprehensive patterns and examples, see:

- **`references/tool-usage-guide.md`** - Detailed MCP tool usage examples
- **`references/non-hook-enforcement.md`** - Wrapper and host-side validation patterns for platforms without hooks
- **`references/prompt-patterns.md`** - Research-backed prompt patterns (CoVe, RAG, etc.)
- **`references/anti-hallucination-research.md`** - Complete 16-source research validation

## Research Foundation

**16 validated sources** with 2,500+ combined citations. Core techniques from:

| Source | Citations | Contribution |
|--------|-----------|--------------|
| CoVe (Meta AI) | 727+ | Chain-of-Verification pattern |
| Nature 2024 | 1,017+ | Entropy-based detection |
| HaluEval 2.0 | 226+ | Fact extraction benchmarks |
| UQLM | 115+ | Uncertainty quantification |
| Comprehensive Survey 2024 | 650+ | 32+ technique taxonomy |

## Expert Agent Integration

**When to invoke**: Any task involving external APIs, libraries, frameworks, or factual claims.

**Integration pattern:**
```
1. ACTIVATE anti-hallucination protocol
2. SELECT best tool (ref_search_documentation for docs, searchCode for code)
3. SEARCH with specific query
4. VERIFY from official source
5. CITE sources with dates
6. SCORE confidence levels
```

**Auto-routing**: Agents with external library competencies should reference this skill in their verification protocols and use MCP tools before generic web search.
