# cc-magents Workflows

## Shared Workflow Framework

All `cc-magents` operations follow the shared **Meta-Agent Workflow Schema**:

1. Parse source material into the capability-aware workspace model.
2. Validate platform capability support and source confidence.
3. Generate or analyze native platform artifacts.
4. Run embedded LLM content improvement through the invoking agent when human-quality wording or judgment is required.
5. Return a decision vocabulary of `PASS`, `WARN`, or `BLOCK`.

## Create Workflow

| Step | Phase | Owner | Decision |
| --- | --- | --- | --- |
| 1 | Capture requirements | Agent | `WARN` if target platform is missing |
| 2 | Select template | `synthesize.ts` | `BLOCK` if template missing |
| 3 | Generate platform output | `generator.ts` | `WARN` for provisional platforms |
| 4 | Validate output | `validate.ts` | `PASS` only when no errors |

## Validate Workflow

| Step | Phase | Owner | Decision |
| --- | --- | --- | --- |
| 1 | Parse documents | `parser.ts` | `BLOCK` on unreadable or empty input |
| 2 | Check platform capability | `capabilities.ts` | `WARN` for low-confidence support |
| 3 | Check safety coverage | `validate.ts` | `WARN` when approval boundaries are absent |
| 4 | Return verdict | `validate.ts` | `PASS`, `WARN`, or `BLOCK` |

## Adapt Workflow

### Step 1: Parse Source

Read the source file and infer or accept the source platform.

### Step 2: Build Workspace Model

Normalize documents, rules, personas, memories, permissions, and platform bindings.

### Step 3: Generate Output

Generate target-native files from the workspace model. Multi-file targets such as
OpenClaw, Cursor, Copilot, Windsurf, Cline, Gemini, OpenCode, and Aider must be
represented as multiple generated files.

### Step 4: Validate Target

Validate the generated target shape and report mapped, approximated, dropped, and
unsupported features.

## Evolve Workflow

### Closed-Loop Phases

| Phase | Action | Output |
| --- | --- | --- |
| 1 | Inspect registry confidence | Platform refresh proposals |
| 2 | Inspect real adaptation reports | Fixture and adapter improvements |
| 3 | Embedded LLM proposal review | Human-readable improvement candidates |
| 4 | Apply approved changes | Updated registry, docs, or tests |

Embedded LLM review is performed by the invoking agent. There is no separate
`--llm-eval` command path.

## Decision Vocabulary

| Decision | Meaning |
| --- | --- |
| `PASS` | Output satisfies the requested platform and task requirements. |
| `WARN` | Output is usable but has confidence, portability, or quality caveats. |
| `BLOCK` | Output is unsafe, invalid, or missing required platform behavior. |

