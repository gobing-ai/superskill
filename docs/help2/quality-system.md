# Quality system

superskill scores agent-facing content — skills, slash commands, subagents, hooks, and main-agent
configs — across type-specific quality dimensions. The same lifecycle applies to every type, and
every score can be persisted so later improvements are judged against real history.

## The operation lifecycle

```
scaffold → validate → evaluate → refine → evolve
                ↑                        │
                └──── longitudinal ──────┘
```

| Operation | Purpose | What gates it |
|-----------|---------|---------------|
| `scaffold` | Create a new entity from a type-specific template | Structure validation |
| `validate` | Check required fields, schema, and target format compliance | Zero errors required for applied changes |
| `evaluate` | Score quality across dimensions (heuristic, or rubric via the scorer seam) | Rubric-weighted scoring |
| `refine` | Apply low-risk fixes automatically, suggest the rest | Fix classification: auto-apply / suggest / flag |
| `evolve` | Propose longitudinal improvements from evaluation history | Double-loop gate (see below) |

Extra operations exist where a type needs them: `skill` has `package` and `migrate`; `hook` has
`emit` and `run`. They are documented on the [skill](./skill.md) and [hook](./hook.md) pages.

## Quality dimensions by type

Each type is scored across a type-specific dimension set (five for skill, command, agent and
magent, four for hook). The aggregate is a weighted mean on the heuristic path,
or the rubric-weighted score on the ingest path.

### Skill

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| `completeness` | 0.25 | Does the skill cover its stated purpose end-to-end? |
| `clarity` | 0.25 | Is the instruction unambiguous to a fresh agent? |
| `trigger-accuracy` | 0.20 | Does it fire on the right inputs and not adjacent ones? |
| `anti-hallucination` | 0.15 | Does it prevent fabrication and invite verification? |
| `conciseness` | 0.15 | As short as possible while complete? |

### Agent (subagent)

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| `completeness` | 0.20 | Are all required subagent fields present and populated? |
| `role-clarity` | 0.25 | Is the role/name unambiguous and specific? |
| `tool-selection` | 0.20 | Are the declared tools appropriate for the role? |
| `skill-linkage` | 0.20 | Does the subagent reference relevant skills correctly? |
| `model-fit` | 0.15 | Is the model alias appropriate for the task complexity? |

### Command

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| `completeness` | 0.25 | Does the command cover its function end-to-end? |
| `clarity` | 0.25 | Is the purpose and usage unambiguous? |
| `argument-hints` | 0.20 | Are argument hints present and accurate? |
| `tool-references` | 0.15 | Are tool references correct and reachable? |
| `slash-syntax` | 0.15 | Is the slash syntax correct and consistent? |

### Hook

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| `correctness` | 0.25 | Does the hook's logic produce the intended effect? |
| `event-coverage` | 0.20 | Does it handle all events it claims to? |
| `safety` | 0.35 | Does it avoid destructive side effects? |
| `pattern-match-quality` | 0.20 | Are the matchers precise? |

### Magent (main-agent config)

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| `completeness` | 0.25 | Does the config cover its stated scope end-to-end? |
| `platform-coverage` | 0.25 | Does it address all platforms it claims to support? |
| `tone-consistency` | 0.20 | Is the tone consistent across the config? |
| `conciseness` | 0.15 | As short as possible while complete? |
| `safety` | 0.15 | Does it avoid dangerous defaults? |

## Evaluate: heuristic and rubric paths

`evaluate` works out of the box with built-in heuristic checks, and ships one package-default rubric
per type. A custom rubric rides in with `--rubric <file>`:

```bash
# Heuristic evaluation, persisted to the store
superskill skill evaluate my-skill --save

# Envelope-out: emit a scoring work order for an external model
superskill skill evaluate my-skill --rubric --json > scoring-brief.json

# Ingest-in: persist the agent-scored result
superskill skill evaluate my-skill --ingest scored-result.json --save
```

The CLI never scores or generates prose inline. Quality operations drive four personas through this
two-call seam — the CLI emits envelopes, an agent processes them offline, the CLI ingests results:

| Persona | Role | Input | Output |
|---------|------|-------|--------|
| Scorer | Rubric judge | Envelope from `evaluate --rubric --json` | Scores + notes per dimension |
| Author | Rewriter | Envelope from `evolve --propose-only --json` | Proposed changes with anchors |
| Skeptic | Refuter | Proposal + verbatim goal anchor | Verdict with violations, if any |
| Judge | Tournament selector | Multiple candidate proposals | Winning proposal ID |

## Evolve: the double-loop gate

`evolve` reads evaluation history from the store, computes per-dimension trends, and either emits a
generation envelope for an external author (`--propose-only --json`) or applies an authored proposal
(`--ingest <file>`) through four gates:

```
ingest proposal → backup original → apply → re-evaluate
  gate 1  deterministic validate has 0 errors?
  gate 2  score improvement ≥ --margin (default 0.05)?
  gate 3  goal anchor hash unchanged?
  gate 4  skeptic review found no regression?
  all pass → proposal accepted and persisted
  any fail → file restored byte-identical, proposal stays draft
```

Related flags (all types except where noted): `--from <date>` limits history analysis, `--accept
<id>` / `--reject <id>` act on draft proposals, `--analyze` prints trends without writing,
`--history` lists applied versions, and `--rollback <id> --confirm` restores a prior version.

### Empirical behavior gate (`--eval-gate`)

`evolve --eval-gate` adds a behavior check on top of the form gates: when a
`skills/<name>/eval/cases.yaml` file exists, held-out eval cases are replayed against the candidate
skill, and the proposal is accepted only when the candidate strictly outperforms the baseline on the
holdout set. Cases use `exact`, `rule`, or `rubric` reference kinds; open-ended rubric cases are
judged pairwise (candidate vs baseline in one call), and replay-based noise-floor estimation keeps
within-noise differences from being scored as wins. No `cases.yaml`, no gate — it is additive and
skip-when-absent.

```yaml
# skills/<name>/eval/cases.yaml
version: 1
cases:
  - id: deploy-mentions-wrangler
    split: holdout
    prompt: "How do I deploy the worker?"
    reference_kind: rule
    reference:
      checks:
        - op: contains
          arg: "wrangler"
```

## Hook divergence — by design

Hooks are security-critical JSON config, so their surface is deliberately narrower:

- `hook refine` is **suggest-only** — it surfaces findings as recommendations; there is no `--auto`.
- `hook evolve` is **analyze-only** — trends and summaries; no apply, no `--history`, no rollback.

See [hook](./hook.md) for the exact flag set.

## Where scores live

All type commands share one SQLite database at `~/.superskill/evaluations.db` with two tables:

| Table | Writes | Lifecycle |
|-------|--------|-----------|
| `evaluations` | Every `evaluate --save` and `refine --save` appends a row | Append-only |
| `proposals` | `evolve` proposals | `draft` → `accepted` or `rejected` |

Version-aware trends partition by rubric version, so updating a rubric does not manufacture false
regression signals.

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: verbs/skill_evaluate.txt,
verbs/skill_evolve.txt, verbs/hook_refine.txt, verbs/hook_evolve.txt, verbs/agent_evolve.txt) >
docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
