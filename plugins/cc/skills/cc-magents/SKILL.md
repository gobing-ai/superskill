---
name: cc-magents
description: "Create, validate, evaluate, refine, and evolve main agent customization files across coding-agent platforms using a capability-aware model."
license: Apache-2.0
metadata:
  author: superskill
  version: "5.0.0"
  platforms: "agents-md,codex,claude-code,gemini-cli,opencode,cursor,copilot,windsurf,cline,zed,amp,aider,openclaw,antigravity,pi"
---

# cc-magents

`cc-magents` manages **main agent customization**, not subagents. It handles
files such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*.mdc`,
`.github/copilot-instructions.md`, `.windsurf/rules/*.md`,
`.clinerules/*.md`, `.rules`, `.aider.conf.yml`, `opencode.json`, and
OpenClaw workspace files.

## When to Use

Use this skill when the task involves main-agent configuration files:

- Trigger phrases: "create AGENTS.md", "add CLAUDE.md", "evaluate this agent config",
  "refine AGENTS.md", "validate .cursor/rules", "score my main agent file"
- File patterns: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
  `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.windsurf/rules/*.md`,
  `.clinerules/*.md`, `.rules`, `.aider.conf.yml`, `opencode.json`
- Operations: synthesize, validate, evaluate, refine, or evolve main-agent
  configurations across coding-agent platforms

Do NOT use for subagent definitions (use `cc:cc-agents`), slash commands
(`cc:cc-commands`), skills (`cc:cc-skills`), or hooks (`cc:cc-hooks`).

## Core Principle

Main-agent support is capability-based. Each platform declares:

- native files and locations
- discovery and precedence
- import/modularity support
- rule activation and scoping
- known limits
- supported operations
- source confidence and verification evidence

Each platform's resolved values for these attributes live in the capability
matrix at [references/platform-compatibility.md](references/platform-compatibility.md).

A main-agent file is always-on context. Keep its root layer to stable,
project-specific instructions the model cannot infer reliably: exact commands,
authority and scope, tool choices, verification gates, and safety boundaries.
Move deeper domain guidance to live, authority-owned links. A scaffold is a
starting point, not evidence that any generated project fact is true.

### Harness awareness

Use `superskill magent` for main-agent lifecycle work when the CLI is present.
This does not make a general shell the preferred tool for ordinary file,
search, or web work: use purpose-built native tools first and invoke a shell
for a real CLI or when no dedicated tool exists. See
[references/workflows.md](references/workflows.md#harness-usage-workflow) for
canonical commands and the tool-selection ladder.

## Operations

| Operation | Command | Purpose |
| --- | --- | --- |
| add | `superskill magent scaffold <name>` | Create a config seed from the built-in template |
| validate | `superskill magent validate <nameOrPath>` | Validate document and registry structure |
| evaluate | `superskill magent evaluate <nameOrPath>` | Two-call seam: envelope-out (`--rubric --json`) → Scorer → ingest-in (`--ingest --save`) |
| refine | `superskill magent refine <nameOrPath>` | Classify structural fixes and surface low-scoring dimensions for review |
| evolve | `superskill magent evolve <name>` | Propose longitudinal content changes through the Author → Skeptic → Judge seam |

## Quick Start

```bash
# Create CLAUDE.md in the current directory from the built-in template
superskill magent scaffold CLAUDE --target claude --output .

# Evaluate: envelope-out → Scorer → ingest-in
superskill magent evaluate AGENTS.md --rubric <file> --json
# ... Scorer persona scores offline ...
superskill magent evaluate AGENTS.md --ingest <scores.json> --save

# Apply deterministic structural fixes non-interactively
superskill magent refine AGENTS.md --auto --save

# Evolve: envelope-out → Author → Skeptic → Judge → ingest-in
superskill magent evolve AGENTS.md --propose-only --json
# ... Author rewrites, Skeptic refutes, Judge selects ...
superskill magent evolve AGENTS.md --ingest <proposal.json> --accept <id>
```

`validate`, `evaluate`, and `evolve` support `--json`; `scaffold` and `refine`
do not. Confirm the exact option surface with the leaf command's `--help`.

## Workflows

| Workflow | Steps | Handler |
| --- | --- | --- |
| **Add** | inspect facts -> scaffold seed -> replace boilerplate -> validate -> evaluate | `superskill magent scaffold` -> invoking agent -> `validate` -> `evaluate` |
| **Validate** | parse -> registry check -> structural lint | `superskill magent validate` |
| **Evaluate** | envelope-out → Scorer scores offline → ingest-in (two-call seam) | `superskill magent evaluate --rubric --json` → Scorer → `superskill magent evaluate --ingest --save` |
| **Refine** | structural preview/fix -> semantic audit/edit -> per-target verification | `superskill magent refine --dry-run` -> invoking agent -> `validate` / `evaluate` |
| **Evolve** | envelope-out → Author → Skeptic → (Judge) → ingest-in (two-call seam) | `superskill magent evolve --propose-only --json` → Author/Skeptic/Judge → `superskill magent evolve --ingest --accept <id>` |

Branching:
- IF validate fails -> stop and surface registry/parse errors
- IF evaluate score below threshold -> route to `refine`

**Goal-anchor verbatim discipline.** The evolve seam passes each brief's goal anchor — original frontmatter, rubric criterion, and negative constraints — **verbatim** to the Author, Skeptic, and Judge personas. Do not summarize, compact, or paraphrase the anchor. The CLI double-loop gate (F024) enforces this via `anchor_hash`: if a persona strips or alters the anchor, the hash will not match and the gate rejects the proposal.

Use the [main-agent evaluation and refinement workflow](references/workflows.md#main-agent-evaluation-and-refinement)
for the semantic checks that CLI heuristics cannot prove. See
[references/workflows.md](references/workflows.md) for full step tables and
[references/platform-compatibility.md](references/platform-compatibility.md) for the platform capability matrix.

## Rubric and Evaluation Criteria

`superskill magent evaluate` uses the canonical rubric at
`packages/core/src/rubrics/magent.yaml`; read weights there rather than copying
them. Its deterministic score is a signal, not a semantic proof:

| Dimension | Deterministic signal |
| --- | --- |
| **completeness** | Six governance areas appear inline or through live relative links: project, commands, verification, conventions, safety, docs. |
| **platform-coverage** | Platforms are declared or detected in prose. |
| **conciseness** | Body length is near the 1,000–8,000-character range with low no-op and within-body duplication density. |
| **tone-consistency** | Tone, style, voice, personality, or forbidden-phrase signals are present consistently. |
| **safety** | Safety vocabulary is present. This lexical proxy does not prove least privilege or correct approval boundaries. |

The invoking human or LLM must separately audit precedence, assembled target
content, command liveness, tool-selection rationale, disclosure links, and the
meaning of safety and verification rules. Report heuristic findings and
semantic findings separately; never tune prose merely to satisfy keywords.

`refine --auto` applies only deterministic structural fixes and skips semantic
body rewrites. The invoking agent owns those edits and must re-run validation
and evaluation afterward. The evaluate and evolve two-call seams remain
platform-agnostic because their envelopes carry the content, rubric, and
baseline.

## Source Material

The platform capability matrix lives in
[references/platform-compatibility.md](references/platform-compatibility.md),
with high-confidence entries verified on 2026-04-30. Provisional platforms such
as Antigravity must remain marked at the matrix's current confidence until
official docs or reproducible product tests justify a change.

## Additional Resources

- [references/workflows.md](references/workflows.md) - Detailed operation workflows
- [references/platform-compatibility.md](references/platform-compatibility.md) - Per-platform capability matrix
