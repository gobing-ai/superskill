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

Before selecting a template, inspect the active instruction load graph, project
docs, package scripts, and sibling configs. Ask only for missing, stable facts
that cannot be inferred from the repository. Treat scaffold prose as a seed:
delete generic defaults and never invent commands, paths, or platform support.

## Validate Workflow

| Step | Phase | Owner | Decision |
| --- | --- | --- | --- |
| 1 | Parse documents | `parser.ts` | `BLOCK` on unreadable or empty input |
| 2 | Check platform capability | `capabilities.ts` | `WARN` for low-confidence support |
| 3 | Check safety coverage | `validate.ts` | `WARN` when approval boundaries are absent |
| 4 | Return verdict | `validate.ts` | `PASS`, `WARN`, or `BLOCK` |

## Main-Agent Evaluation and Refinement

Run two lanes. The CLI lane supplies reproducible structural and heuristic
evidence; the semantic lane checks whether the instructions are true, useful,
and safe. A passing score cannot replace the semantic lane.

### Evaluation lane

1. **Resolve the load graph.** Identify root and closest manifests, imports,
   scoped rules, platform overrides, and precedence. Evaluate the content each
   target actually receives, not one source file in isolation.
2. **Record a baseline.** Run strict validation and heuristic evaluation. Keep
   the aggregate, every dimension, body size, and findings; use `--base-path`
   when links are authored for a different destination.
3. **Audit semantics.** Apply every row below and cite the file/line or command
   output supporting each finding.
4. **Return a verdict.** Separate deterministic scorer findings from semantic
   findings. `PASS` requires no unresolved blocker; uncertainty is `WARN`, not
   invented confidence.

```bash
superskill magent validate AGENTS.md --strict
superskill magent evaluate AGENTS.md --json
superskill magent refine AGENTS.md --dry-run
```

| Audit | Pass condition |
| --- | --- |
| Authority and scope | Higher-priority user/project/platform rules win; duplicate owners and contradictions are removed. |
| Information budget | Root contains stable, non-inferable instructions; defaults, tutorials, stale inventories, and speculative rules do not consume every-request context. |
| Command liveness | Every copy-pasteable command and flag resolves against current leaf `--help`; nested verbs appear in the parent's `Commands` list and the leaf `Usage` names the exact path. Exit code alone is insufficient. |
| Tool selection | Domain harness for owned lifecycle work; otherwise purpose-built native tool first. Shell-shaped tools (`bash`, `Bash`, `shell`, `Shell`, `run_terminal_command`, `Python`, equivalents) are last among built-ins because unbounded output floods context, costs tokens, and a general shell shadows dedicated tools. |
| Search and web | Native search → `rg` / `sg` → `grep` / `sed` / `awk` / `perl`; native web search/fetch → `curl` / `wget` / MCP or plugin surfaces. `rg` and `sg` respect ignore rules and avoid irrelevant files. |
| Boundaries and gates | Always / ask-first / never boundaries, least privilege, destructive-action guards, secrets handling, and runnable completion gates retain their meaning. |
| Disclosure and targets | Every relative link resolves and each fact has one owner. Replacement overrides are self-sufficient; targets that receive no rule modules retain critical safety and verification inline. |

### Refinement lane

1. Freeze the requested invariants and baseline: headings/order when required,
   platform targets, critical constraints, command surface, and all dimension
   scores.
2. Fix contradictions, dead commands, and unsafe guidance first. Then delete
   no-ops, collapse duplication, remove sediment, and move rarely needed depth
   to a live owning document. Do not trade missing behavior for brevity.
3. Add only missing non-inferable guidance: exact commands, the tool ladder and
   its reason, authority, approval boundaries, or a runnable verification gate.
   Do not add a rule for a hypothetical failure.
4. Reassemble every target, resolve every link, re-run strict validation and
   evaluation, and compare every dimension with baseline. Restore or revise a
   change that regresses a dimension or drops a critical boundary.
5. Report before/after evidence, residual uncertainty, and deliberately
   deferred work. Do not claim semantic body changes were applied by
   `refine --auto`; that command only applies deterministic structural fixes.

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

Evolve only from evidence: a repeated failure, persisted score trend, confirmed
command drift, or platform capability change. A proposal's `reason` names that
evidence, why the chosen root or disclosed destination is authoritative, and
the expected instruction-budget effect. Preserve the verbatim goal anchor and
reject speculative rules added "for completeness."

## Harness-Usage Workflow

When the spur + superskill harness is present, use it first for the lifecycle
data it owns. For direct file, search, web, and delegation work, prefer the
purpose-built native tool. A shell-shaped tool is appropriate for running the
actual harness CLI or when no dedicated tool exists; bound its output. The
main-agent manifest must name exact harness verbs and this fallback (see
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
# Scaffold CLAUDE.md in the current directory
superskill magent scaffold CLAUDE --target claude --output .

# Validate document and registry structure
superskill magent validate AGENTS.md

# Evaluate: two-call seam (envelope-out → Scorer → ingest-in)
superskill magent evaluate AGENTS.md --rubric <file> --json
# ... Scorer persona scores offline ...
superskill magent evaluate AGENTS.md --ingest <scores.json> --save

# Refine: apply deterministic structural fixes and persist the post-score
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

# Install and select a specific magent (main-agent config) from a multi-magent plugin
superskill install cc --targets codex --magent dev

# Dry-run with verbose to preview magent variant selection per target
superskill install cc --targets claude,pi --dry-run --verbose
```

A plugin may ship a top-level `magents/<kebab-name>/` directory with per-target
variant files (`AGENTS.md`, `AGENTS.<target>.md`, `CLAUDE.md`). During install,
`superskill` selects the best variant per target (target-specific override wins
over the common `AGENTS.md` fallback), shims plugin-scoped references, and
writes `AGENTS.md` (or `CLAUDE.md` for claude) to the project root. When the
plugin ships multiple magents, `--magent <name>` selects one; with no selector
the install skips magent emission and prints a verbose note. A single magent
auto-selects.

### Cross-platform notes

- `spur` and `superskill` are Node/Bun CLIs — they run identically on every
  platform the harness supports. A main agent manifest should declare them as
  the preferred tool surface regardless of the host agent.
- Check the current capability matrix before naming a native subagent or other
  platform tool; extensions and host versions can change the surface. Prefer
  that purpose-built tool when present. Invoke `spur` / `superskill` through
  the native shell only because they are real CLIs, and keep output bounded.
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
