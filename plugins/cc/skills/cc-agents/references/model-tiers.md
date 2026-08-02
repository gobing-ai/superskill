# Model-Tier Classification Rubric

A **rule, not a registry.** This rubric classifies an agent into one of two model tiers
(`judgment` or `execution`) based on observable characteristics. Tier assignments for
specific agents are *derived outcomes* recorded as worked examples below - if the rule
and an example ever disagree, the **rule wins** and the example is re-derived.

## Why Two Tiers

Sub-agents that inherit the parent-session model do so at uncontrolled cost and effort.
Every agent gets a pinned tier instead: a deliberate per-role assignment reviewed at
authoring time. The binary partition keeps the decision simple and auditable while
closing the cost leak.

| Tier | Profile | Rationale |
|------|---------|-----------|
| `judgment` | High decision authority + high error blast radius | Frontier base, moderate effort, latency-bounded (in-loop spawns) |
| `execution` | Artifact-producing + downstream-caught errors | Efficient base, maximum effort per invocation (long-running depth) |

## Classification Signals (priority order)

Classify by walking the signals top-down. The first signal that clearly resolves the
tier wins; lower-priority signals refine edge cases.

### 1. Decision Authority (primary)

Does the agent make **accept/reject/route/prioritize** calls that bind downstream
behavior, or does it **produce artifacts** (code, text, data) consumed by a caller?

| Signal value | Leans toward |
|--------------|-------------|
| Makes gating decisions: plans approved/rejected, review verdicts (PASS/FAIL), task routing, priority calls, expert dispatch | `judgment` |
| Produces deliverables: code, tests, docs, configs, data transforms | `execution` |

**Key question:** If you swapped this agent's output for a placeholder, would the
*next* agent proceed on garbage, or would a downstream gate catch it? If the former,
the agent has decision authority.

### 2. Error Blast Radius (secondary)

If the agent produces a wrong output, does it **propagate silently into other agents'
decisions**, or is it **caught downstream** by tests, review, or compilation?

| Signal value | Leans toward |
|--------------|-------------|
| Wrong output poisons planning, routing, or verdict chains - no automated gate between the agent and its consumers | `judgment` |
| Wrong output fails a test, a linter, a build, or a human review before it propagates | `execution` |

### 3. Invocation Pattern (tertiary)

How is the agent **spawned** relative to the session?

| Signal value | Leans toward |
|--------------|-------------|
| In-loop, latency-sensitive: many spawns per session, each feeding the next step | `judgment` (moderate effort keeps loop latency bounded) |
| Long-running single delegation: one spawn per task, allowed to think deeply | `execution` (maximum effort for per-invocation depth) |

### 4. Output Consumer (quaternary)

Who **consumes** the agent's output?

| Signal value | Leans toward |
|--------------|-------------|
| Other agents' judgments (plans feed executors, verdicts feed pipelines) | `judgment` |
| Code/test execution or direct user consumption | `execution` |

## Decision Procedure

```
1. Read the agent's name, description, and body.
2. Score each signal (authority, blast radius, invocation, consumer).
3. If signals 1+2 both lean judgment  -> judgment.
4. If signals 1+2 both lean execution -> execution.
5. If signal 1 and signal 2 disagree:
   a. Signal 1 (authority) is primary and wins.
   b. UNLESS signal 2 (blast radius) is "judgment" AND signal 4 (consumer)
      is also "judgment" - then the wrong output poisons other agents'
      decisions via their judgments, escalating to judgment.
6. Signals 3-4 refine remaining edge cases; they never override a clear 1+2 verdict.
```

## Tier Profiles

### `judgment`

- **Decision authority:** High. The agent's output is a directive, verdict, or routing
  decision that downstream agents act on without re-verification.
- **Error blast radius:** High. A wrong verdict, plan, or route propagates silently -
  there is no test or compiler between the judgment and its consumers.
- **Invocation pattern:** In-loop, latency-sensitive. Judgment agents spawn frequently
  within a session; moderate effort keeps each spawn bounded.
- **Output consumer:** Other agents' judgments. The output feeds orchestration, not
  direct execution.

### `execution`

- **Decision authority:** Low. The agent produces an artifact (code, test, doc) that a
  caller inspects, runs, or reviews. It does not gate downstream behavior.
- **Error blast radius:** Low. Wrong output is caught by tests, linters, builds, or
  review before it propagates into decisions.
- **Invocation pattern:** Long-running single delegation. One spawn per task; maximum
  effort extracts the most depth per invocation.
- **Output consumer:** Code/test execution or direct user consumption. The output is
  run, not obeyed.

## Worked Examples

These are **derived outputs** of the rule above, not the mechanism. Each example
shows the signal scores that produce the tier. If an agent's responsibilities shift,
re-derive from the rule - do not copy the tier from this table.

### Agents with planning / review / routing authority

| Agent | Authority | Blast radius | Invocation | Consumer | Derived tier |
|-------|-----------|-------------|------------|----------|-------------|
| Orchestration planner (task decomposition, pipeline sequencing) | judgment | judgment | in-loop | other agents | `judgment` |
| Code reviewer (verdict: PASS/PARTIAL/FAIL, findings with severity) | judgment | judgment | in-loop | other agents | `judgment` |
| Expert router (dispatches to specialist, routes based on domain) | judgment | judgment | in-loop | other agents | `judgment` |
| Expert evaluator (validates agent quality, returns scores) | judgment | judgment | in-loop | other agents | `judgment` |

### Agents that produce artifacts

| Agent | Authority | Blast radius | Invocation | Consumer | Derived tier |
|-------|-----------|-------------|------------|----------|-------------|
| Code implementer (writes production code from a task spec) | execution | execution (tests/review catch) | long-running | code/test execution | `execution` |
| Test writer (generates test suites from requirements) | execution | execution (test runner catches) | long-running | test execution | `execution` |

## Frontmatter Contract

Agent authors stamp the resolved tier into frontmatter:

```yaml
---
name: my-agent
description: ...
model-tier: judgment   # or: execution (default when absent)
---
```

- **`model-tier: judgment`** - the adapter maps to a frontier base at moderate effort.
- **`model-tier: execution`** - the adapter maps to an efficient base at maximum effort.
- **Absent** - defaults to `execution` (most subagents are doers; cost control is the
  default policy).
- **Unknown value** - the adapter throws at install time (fail loud on typos).

The tier name is platform-neutral. Each target adapter owns its tier-to-model mapping;
only the Codex adapter has one today (`CODEX_MODEL_TIERS` in
`packages/core/src/pipeline/adapt-subagent.ts`). The SSOT agent file never carries
platform-specific model slugs.

## Judge Integration (authoring time only)

Classification is an **authoring decision**, never an install-time operation:

1. **On-demand:** the quality-brain Scorer reads the agent's name + description + body
   and returns `{ tier, rationale }` against this rubric.
2. **Evolving:** the `superskill agent evolve` proposal flow stamps `model-tier` into
   frontmatter after human acceptance of the judge's classification.
3. **Install is a photocopier:** `superskill install` reads the declared tier and
   emits the mapped model. No LLM, no network, no re-classification. The same plugin
   bytes always produce the same TOML.

**Rejected:** install-time classification. It would make `superskill install`
non-deterministic, network-dependent, and differently-shaped per run (same plugin
bytes -> different TOML depending on the judge's mood), and re-derive on every
reinstall what the author already decided.

## Versioning

- The rubric is stable; tier semantics (`judgment` / `execution`) do not change.
- The tier-to-model mapping (`CODEX_MODEL_TIERS`) is version-pinned by TSDoc to the
  Codex CLI version it was probed against. Model drift is a one-line edit in one const.
- If a future Codex CLI adds more effort levels or models, update the mapping const -
  not this rubric.
