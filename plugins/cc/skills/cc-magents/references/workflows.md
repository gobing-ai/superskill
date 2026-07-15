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

## Harness-Usage Workflow

When the spur + superskill harness is present (both binaries resolve on
`PATH`), a main agent should instruct the coding agent to reach for the
harness **first** for lifecycle work, falling back to native tools only for
operations the harness does not cover. The main agent's manifest must name
the harness verbs and pin the fallback explicitly (see
[platform-compatibility.md](platform-compatibility.md#harness-row-spur--superskill)
for the preferred-tools statement template).

### Use this first

| Work | Use this first | Fallback (harness does not cover) |
| --- | --- | --- |
| Track a unit of work | `spur task create` / `spur task update` | `TODO.md` (avoid — drifts from the WBS) |
| Group tasks under a feature | `spur feature create` | Manual heading in a doc |
| Validate task file shape | `spur task check <wbs>` | Manual review |
| Author / score a main-agent config | `superskill magent scaffold` / `evaluate` / `refine` / `evolve` | Hand-author `AGENTS.md` |
| Author / score a skill | `superskill skill scaffold` / `evaluate` / `refine` / `evolve` | Hand-author skill dir |
| Enforce a project constraint | `spur rule run` | Ad-hoc lint script |
| Run a multi-phase pipeline | `spur workflow run` | Hand-rolled orchestration prompt |
| Install plugin to other platforms | `superskill install <plugin> --targets ...` | Per-platform manual setup |

### Canonical command patterns

The main agent should instruct the coding agent to use these exact patterns
for day-to-day work. All commands are CLI-first and platform-agnostic — they
run the same on Claude Code, Codex, Pi, Omp, OpenCode, and the provisional
platforms.

**Tasks (spur task):**

```bash
# Create a task (allocates a race-safe WBS number)
spur task create "Implement auth module"

# Transition lifecycle (todo → wip → testing → done)
spur task update 0082 wip
spur task update 0082 testing
spur task update 0082 done

# Replace a section body (Solution, Testing, Review, ...)
spur task update 0082 --section Solution --from-file /tmp/0082-solution.md

# Validate a task file before transitioning
spur task check 0082

# List tasks by status
spur task list --status wip
```

**Features (spur feature):**

```bash
# Create a feature (allocates a hierarchical ID)
spur feature create "Authentication"

# Advance a feature through its lifecycle
spur feature advance A1

# Show a feature and its linked tasks
spur feature show A1
```

**Rules (spur rule):**

```bash
# Validate a rule file or preset
spur rule validate

# Evaluate constraint rules over the working tree
spur rule run
```

**Workflows (spur workflow):**

```bash
# Validate a workflow definition
spur workflow validate .spur/workflows/release.yaml

# Run a workflow
spur workflow run .spur/workflows/release.yaml

# Resume a paused (HITL) workflow run
spur workflow continue <run-id>
```

**Main-agent config (superskill magent):**

```bash
# Scaffold a new platform-native config from a template
superskill magent scaffold general-agent --output AGENTS.md

# Validate document and registry structure
superskill magent validate AGENTS.md

# Evaluate: two-call seam (envelope-out → Scorer → ingest-in)
superskill magent evaluate AGENTS.md --rubric <file> --json
# ... Scorer persona scores offline ...
superskill magent evaluate AGENTS.md --ingest <scores.json> --save

# Refine: auto-suggest and persist
superskill magent refine AGENTS.md --auto --save

# Evolve: two-call seam (envelope-out → Author → Skeptic → Judge → ingest-in)
superskill magent evolve AGENTS.md --propose-only --json
# ... Author rewrites, Skeptic refutes, Judge selects ...
superskill magent evolve AGENTS.md --ingest <proposal.json> --accept <id>
```

**Skills (superskill skill):**

```bash
superskill skill scaffold my-skill --output ./skills
superskill skill evaluate ./skills/my-skill --rubric <file> --json
superskill skill evaluate ./skills/my-skill --ingest <scores.json> --save
superskill skill refine ./skills/my-skill --auto --save
superskill skill evolve my-skill --propose-only --json
```

**Install (superskill install):**

```bash
# One-shot multi-target install of a Claude Code plugin
superskill install cc --targets codex,opencode,pi
```

### Cross-platform notes

- `spur` and `superskill` are Node/Bun CLIs — they run identically on every
  platform the harness supports. A main agent manifest should declare them as
  the preferred tool surface regardless of the host agent.
- On platforms without native subagents (Codex, Pi, OpenCode), `spur task`
  and `superskill` replace what would otherwise be `Agent`-dispatched work.
  The main agent should instruct the coding agent to invoke the CLIs directly
  via the native shell tool (`Bash`, `shell`, `bash`, `command`,
  `run_terminal_command`).
- Skills delegation (`Skill()` / `cc:` namespace) is Claude Code-native. On
  other platforms, `superskill install` flattens skills to platform-native
  entries; the main agent should reference skills by name, never by `cc:`
  deep links, so the portability survives the install conversion.
- Hooks are Claude Code-native in their prompt form. Use `superskill hook`
  to author canonical hooks and `superskill install` to emit the
  platform-native equivalent; where a platform has no hook runtime, the
  install reports `WARN` and the main agent should note the loss.

## Decision Vocabulary

| Decision | Meaning |
| --- | --- |
| `PASS` | Output satisfies the requested platform and task requirements. |
| `WARN` | Output is usable but has confidence, portability, or quality caveats. |
| `BLOCK` | Output is unsafe, invalid, or missing required platform behavior. |

