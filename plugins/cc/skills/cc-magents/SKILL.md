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

### Harness awareness

`superskill magent` is **harness-aware**: every operation assumes the harness
(spur + superskill) is the preferred tool surface when present. A scaffolded
or refined main agent must declare `spur task` / `spur feature` as the
preferred work-tracking surface and `superskill magent` / `superskill skill`
as the preferred lifecycle surface, falling back to native tools only for
operations the harness does not cover. The scaffold, evaluate, refine, and
evolve commands all emit and reward this declaration. See
[references/workflows.md](references/workflows.md#harness-usage-workflow) for
canonical command patterns and the preferred-tools statement template.

## Operations

| Operation | Command | Purpose |
| --- | --- | --- |
| add | `superskill magent scaffold <name>` | Create (synthesize) a new platform-native config from a template |
| validate | `superskill magent validate <nameOrPath>` | Validate document and registry structure |
| evaluate | `superskill magent evaluate <nameOrPath>` | Two-call seam: envelope-out (`--rubric --json`) → Scorer → ingest-in (`--ingest --save`) |
| refine | `superskill magent refine <nameOrPath>` | Recommend native splits, scoping, safety, and evidence improvements |
| evolve | `superskill magent evolve <name>` | Two-call seam: envelope-out (`--propose-only --json`) → Author → Skeptic → Judge → ingest-in (`--ingest --accept`) |

## Quick Start

```bash
# Create a new platform-native config from a template
superskill magent scaffold general-agent --output AGENTS.md

# Evaluate: envelope-out → Scorer → ingest-in
superskill magent evaluate AGENTS.md --rubric <file> --json
# ... Scorer persona scores offline ...
superskill magent evaluate AGENTS.md --ingest <scores.json> --save

# Preview and apply refinements non-interactively
superskill magent refine AGENTS.md --auto --save

# Evolve: envelope-out → Author → Skeptic → Judge → ingest-in
superskill magent evolve AGENTS.md --propose-only --json
# ... Author rewrites, Skeptic refutes, Judge selects ...
superskill magent evolve AGENTS.md --ingest <proposal.json> --accept <id>
```

JSON output is supported on every command via `--json` for automation.

## Workflows

| Workflow | Steps | Handler |
| --- | --- | --- |
| **Add** | template selection -> scaffold -> validate -> evaluate | `superskill magent scaffold` -> `superskill magent validate` -> `superskill magent evaluate` |
| **Validate** | parse -> registry check -> structural lint | `superskill magent validate` |
| **Evaluate** | envelope-out → Scorer scores offline → ingest-in (two-call seam) | `superskill magent evaluate --rubric --json` → Scorer → `superskill magent evaluate --ingest --save` |
| **Refine** | auto-suggest -> review -> persist | `superskill magent refine --auto --save` |
| **Evolve** | envelope-out → Author → Skeptic → (Judge) → ingest-in (two-call seam) | `superskill magent evolve --propose-only --json` → Author/Skeptic/Judge → `superskill magent evolve --ingest --accept <id>` |

Branching:
- IF validate fails -> stop and surface registry/parse errors
- IF evaluate score below threshold -> route to `refine`

**Goal-anchor verbatim discipline.** The evolve seam passes each brief's goal anchor — original frontmatter, rubric criterion, and negative constraints — **verbatim** to the Author, Skeptic, and Judge personas. Do not summarize, compact, or paraphrase the anchor. The CLI double-loop gate (F024) enforces this via `anchor_hash`: if a persona strips or alters the anchor, the hash will not match and the gate rejects the proposal.

See [references/workflows.md](references/workflows.md) for full step tables and
[references/platform-compatibility.md](references/platform-compatibility.md) for the platform capability matrix.

## Rubric and Evaluation Criteria

When `superskill magent evaluate` runs against a main agent, the scorer
applies the canonical rubric (owned at `packages/core/src/rubrics/magent.yaml`
— read it there; do not restate weights here, they drift). The following
dimensions are harness-aware: a manifest that properly positions the harness
tools and accounts for cross-platform differences scores higher.

| Dimension | What the scorer rewards | Harness-aware signal |
| --- | --- | --- |
| **Harness positioning** | The manifest declares `spur task` / `spur feature` as the preferred work-tracking surface and `superskill magent` / `superskill skill` as the preferred lifecycle surface, with a named fallback to native tools. | A "Preferred tools (harness present)" section naming `spur` and `superskill` verbs. |
| **Cross-platform coverage** | The manifest accounts for platform tool-surface differences (e.g. Claude `Agent` vs Grok `spawn_subagent`, `WebFetch` vs `web_search`) and does not assume a single native surface. | References to the lossy-mappings table or per-platform tool notes. |
| **Lossy-mapping awareness** | The manifest notes where harness declarations do not survive `superskill install` conversion and names the workaround (e.g. skills by name, not `cc:` deep links; `superskill hook` for cross-platform hooks). | A loss-reporting or workaround note per lossy mapping. |
| **Confidence honesty** | Platform claims mark confidence levels (HIGH/MEDIUM/LOW) honestly; provisional platforms (Antigravity, Pi, OpenClaw, Hermes, Grok) stay LOW until official docs exist. | Inline confidence markers on platform-specific claims. |
| **Safety boundaries** | The manifest preserves approval boundaries and does not grant destructive tool permissions silently when porting across platforms. | No new `bypassPermissions` / `--dangerously-skip-permissions` declarations without an explicit guard. |

### `superskill magent` commands are harness-aware

All five operations — **scaffold**, **validate**, **evaluate**, **refine**,
**evolve** — emit and ingest harness-aware content:

- **scaffold** emits a "Preferred tools (harness present)" section by default
  when the harness is detected on `PATH`.
- **evaluate** scores the harness-positioning and cross-platform-coverage
  dimensions above; a manifest with no harness declaration caps at the
  pre-harness baseline and cannot reach grade A.
- **refine** recommends adding the harness declaration and fixing lossy
  mappings when they are absent.
- **evolve** proposes longitudinal improvements that keep the harness
  declaration in sync as the spur/superskill CLI surface changes; the
  goal-anchor verbatim discipline (F024) prevents a persona from stripping
  the harness declaration during a rewrite.

The two-call evaluate and evolve seams are platform-agnostic: the envelope
JSON carries the manifest content + rubric + baseline, so the scorer and
author/skeptic/judge personas run the same on every host agent.

## Source Material

The platform capability matrix lives in
[references/platform-compatibility.md](references/platform-compatibility.md),
with high-confidence entries verified on 2026-04-30. Provisional platforms such
as Antigravity and Pi must remain marked as low confidence until official docs
or reproducible product tests exist.

## Additional Resources

- [references/workflows.md](references/workflows.md) - Detailed operation workflows
- [references/platform-compatibility.md](references/platform-compatibility.md) - Per-platform capability matrix
