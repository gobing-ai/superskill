---
name: Make cc command-evaluate ready to replace rd3 command-evaluate
description: Make cc command-evaluate ready to replace rd3 command-evaluate
status: Backlog
created_at: 2026-06-21T18:15:31.834Z
updated_at: 2026-06-21T18:15:31.834Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-commands","evaluate","dogfood","migration","rd3-parity","schema-bug"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0049. Make cc command-evaluate ready to replace rd3 command-evaluate

### Background

Dogfood pair-run on target plugins/cc/commands/agent-add.md: /cc:command-evaluate scored 0.43 FAIL/Grade F while /rd3:command-evaluate scored 97% Grade A. ROOT CAUSE = SCHEMA MISMATCH (P1 correctness bug): the cc command evaluator requires a 'name' frontmatter field (REQUIRED_FIELDS.command=['name','description']) and an 'arguments' array (command.ts checks Array.isArray(data.arguments)), but Claude Code commands use NO 'name' (named by filename) and NO 'arguments' array — they use 'description' + 'argument-hint' (string) + 'allowed-tools' + $ARGUMENTS. So every valid Claude Code command is penalized: completeness 0.25 'Missing fields: name', argument-hints 0.00 'No arguments array found'. The cc command evaluator scores the WRONG schema. Commands are file-based (.md), so the skill B1 dir fix does not apply.


### Requirements

Fix the cc command evaluator to score the actual Claude Code command schema (description + argument-hint string + allowed-tools), not a fictional name+arguments[] schema. After the fix, plugins/cc/commands/*.md should score PASS comparable to rd3 97%. Also apply D1 (remove --json from command wrapper) + fix --save description. Gates: bun run lint, bun run test (no skips, add regression tests), bun run build, git clean. Do NOT flip /command-evaluate alias until the evaluator scores real commands correctly AND the global binary ships.


### Q&A



### Design

Pair-run maturity assessment + fix plan for `/cc:command-evaluate` → `/rd3:command-evaluate`. Verified
2026-06-21. **This evaluator has a P1 schema-mismatch bug** — it scores a fictional command schema and
FAILS every valid Claude Code command.

---

## Pair-run evidence (executed both, same target)

Target: `plugins/cc/commands/agent-add.md` (a real, valid Claude Code command).

Its actual frontmatter (verified):
```yaml
---
description: Create a new agent with scaffolding and templates
argument-hint: "<agent-name> [--description <text>] [--target <platform>] [--output <dir>] [--force]"
allowed-tools: ["Read", "Write", "Glob", "Bash", "Skill"]
---
```

**cc** (`bun apps/cli/src/index.ts command evaluate <target>`):
```
completeness     0.25  Missing fields: name
clarity          0.50  Good imperative style
argument-hints   0.00  No arguments array found
tool-references  0.60  Limited tool references
slash-syntax     1.00  Valid slash syntax
AGGREGATE        0.43   Verdict: FAIL  Grade: F
```

**rd3** (`bun <rd3-cache>/skills/cc-commands/scripts/evaluate.ts <target> --scope full`):
```
PASS (97%)  Grade: A   Pass threshold: 80%
Content Quality 10/12 · Cross-Platform 7/8 · Frontmatter 15/15 · Description 15/15 ·
Structure 10/10 · Delegation 12/12 · Argument Design 8/8 · Circular-Ref 5/5 · Security 10/10 · Naming 5/5
```

**Read:** A valid command scores 0.43 FAIL on cc and 97% PASS on rd3. The cc result is WRONG — it's
penalizing the command for not having fields the Claude Code command format does not use.

---

## Root cause (P1 — verified against source)

The cc command evaluator checks a schema that doesn't match Claude Code commands:

1. **`completeness 0.25 'Missing fields: name'`** — `packages/core/src/quality/types.ts:74`:
   `REQUIRED_FIELDS.command = ['name', 'description']`. Claude Code commands have NO `name` field;
   they are named by filename (`agent-add.md` → `/cc:agent-add`). The `name` requirement is wrong.

2. **`argument-hints 0.00 'No arguments array found'`** — `packages/core/src/quality/command.ts`:
   - line 9: `const argsFactor = Array.isArray(data.arguments) ? 1 : 0;` (in `scoreCompleteness`)
   - lines 25-29: `scoreArgumentHints` expects `data.arguments` to be an array of `{name, description}`.
   Claude Code commands have NO `arguments` array. They declare a single `argument-hint` STRING
   (e.g. `"<agent-name> [--description <text>] ..."`) and consume `$ARGUMENTS`. The evaluator is
   modeling a different tool's command schema (possibly an older/foreign format).

**Net:** two of five dimensions are structurally guaranteed to score ~0 for any real Claude Code command.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Engine | `skills/cc-commands/scripts/evaluate.ts` | `superskill command evaluate` → `packages/core/src/quality/command.ts` |
| Dims | 10 weighted /100 (Content/Cross-Platform/Frontmatter/Description/Structure/Delegation/Argument/Circular/Security/Naming), threshold 80% | 5 ASE: completeness, clarity, argument-hints, tool-references, slash-syntax |
| Rubric | config | `packages/core/src/rubrics/command.yaml` (completeness, clarity, argument-hints, tool-references, slash-syntax) |
| Input | file `.md` | file `.md` (B1 dir fix N/A — `command evaluate <dir>` correctly → "File not found") |

Canonical files to change:
- `packages/core/src/quality/command.ts` — the buggy scorers
- `packages/core/src/quality/types.ts` — `REQUIRED_FIELDS.command`
- `packages/core/src/rubrics/command.yaml` — dimension criteria text (align with corrected schema)
- `plugins/cc/commands/command-evaluate.md` — wrapper hygiene
- Tests: `packages/core/tests/quality/` (command scorer)

---

## Work Items

### C1 [BLOCKER/P1] — Fix `completeness`: drop the `name` requirement, score the real frontmatter

**File:** `packages/core/src/quality/types.ts:74` + `packages/core/src/quality/command.ts:scoreCompleteness`.

**Fix:**
- `REQUIRED_FIELDS.command`: change `['name', 'description']` → `['description']`. Claude Code commands
  are named by filename; `description` is the only required frontmatter field. (Optionally also recognize
  `allowed-tools`/`argument-hint` as present-signals, but do not REQUIRE them.)
- `scoreCompleteness` (command.ts): remove `argsFactor = Array.isArray(data.arguments)`. Replace with a
  factor based on the REAL optional fields: presence of `argument-hint` (string) and/or `allowed-tools`.
  Do not penalize a command for lacking arguments — many valid commands take none.

**Acceptance:** `command evaluate plugins/cc/commands/agent-add.md` → completeness ≈ 1.00, note
"All required fields present". No "Missing fields: name".

### C2 [BLOCKER/P1] — Fix `argument-hints`: score the `argument-hint` STRING, not an `arguments` array

**File:** `packages/core/src/quality/command.ts:scoreArgumentHints` (lines ~25-44).

**Fix:** rewrite to evaluate the Claude Code convention:
- If the command has no parameters, `argument-hint` may be absent → score 1.0 (not a defect).
- If `argument-hint` (string) is present → score on its quality: does it name positional args
  (`<agent-name>`) and/or flags (`[--description <text>]`)? Reward a descriptive hint; penalize an empty
  or placeholder-only hint.
- Drop all `data.arguments` array logic.

**Acceptance:** `agent-add.md` (rich `argument-hint`) → argument-hints ≈ 1.00. A command with no params and
no hint → 1.00. A command that takes params but has an empty hint → < 1.0.

### C3 [MAJOR] — Align `command.yaml` rubric criteria + (optional) tool-references with `allowed-tools`

**File:** `packages/core/src/rubrics/command.yaml`, `packages/core/src/quality/command.ts:scoreToolReferences`.

**Fix:**
- Update the `argument-hints` and `completeness` criterion text in the rubric to describe the
  `argument-hint`-string convention (so the Scorer persona, in rubric mode, judges the right thing).
- `tool-references` (cc scored 0.60 "Limited tool references"): confirm it reads `allowed-tools`
  (the Claude Code field) and not a foreign `tools:` field. `agent-add.md` declares 5 tools in
  `allowed-tools` — it should not be "limited". Verify and fix the field lookup.

**Acceptance:** rubric criteria match the real schema; `tool-references` for a 5-tool command is not "limited".

### C4 [MAJOR] — Command wrapper: D1 flag boundary + --save description

**File:** `plugins/cc/commands/command-evaluate.md`.

**Fix (mirror skill-evaluate.md from 0047, file-based wording):**
- Remove `--json` row (D1).
- Fix `--save` description → "Persist the evaluation to the evaluation store (enables evolve trend analysis)".
- Keep `command-path | Path to the command .md file` (file-based; do not say "directory").
- Sync `argument-hint`.

**Acceptance:** wrapper has no `--json`; `--save` describes the store; arg says ".md file".

### C5 [MINOR] — Emit dimension findings/recommendations for commands

**File:** `packages/core/src/quality/command.ts`.

**Fix:** like the skill scorer (task 0047), emit `findings`/`recommendations` for low dimensions
(rd3 gives actionable advice). Additive/optional.

**Acceptance:** sub-perfect command prints a Findings + Recommendations block.

---

## Regression tests (REQUIRED)

In `packages/core/tests/quality/`:
- A valid Claude Code command (`description` + `argument-hint` string + `allowed-tools`, no `name`, no
  `arguments[]`) scores completeness ≈ 1.0 and argument-hints ≈ 1.0 → overall PASS.
- A command with no params and no `argument-hint` → argument-hints 1.0 (not penalized).
- A command missing `description` → completeness penalized.
- Guard against regression: assert "Missing fields: name" NEVER appears for a command with description.

---

## Policy decisions (inherited from 0047)

- **D1** `--json` CLI-only. **D2** rubric centralized in `command.yaml`. **D3** enrich in code, no template engine.
- **Shared P1 (deployment):** global `superskill` stale (0.1.7); do not flip alias until binary ships.

## Do-not-drift guardrails

- The fix is to match the CLAUDE CODE command schema (`description`+`argument-hint`+`allowed-tools`+`$ARGUMENTS`).
  Do NOT invent yet another schema. Verify against real files in `plugins/cc/commands/*.md`.
- Commands are file-based: no directory resolution. `command evaluate <dir>` → "File not found" is correct.
- Additive `QualityReport`/`DimensionScore` changes only. No per-skill scripts, no 10-dim model.


### Solution



### Plan

P1 schema-mismatch bug: cc command evaluator scores a fictional name+arguments[] schema. Fix it to score
the real Claude Code command schema, then parity polish.

### Phase 1 — Fix the schema mismatch (blockers)
1. **C1 completeness** (`types.ts:74` + `command.ts:scoreCompleteness`): `REQUIRED_FIELDS.command` →
   `['description']`; remove `Array.isArray(data.arguments)` factor; base optional factor on
   `argument-hint`/`allowed-tools` presence.
2. **C2 argument-hints** (`command.ts:scoreArgumentHints`): rewrite to score the `argument-hint` STRING
   (positional `<x>` + flags `[--y]`); no-params + no-hint → 1.0; drop `data.arguments` logic.
3. **C3 rubric + tool-references** (`command.yaml`, `command.ts:scoreToolReferences`): align criterion text;
   ensure tool-references reads `allowed-tools` (5-tool command must not be "limited").
4. **Regression tests** (`packages/core/tests/quality/`): valid command PASS; no-param command not penalized;
   missing description penalized; assert "Missing fields: name" never appears for a described command.

### Phase 2 — Wrapper + findings
5. **C4 command wrapper** (`plugins/cc/commands/command-evaluate.md`): remove `--json` (D1); fix `--save`
   description; keep ".md file" arg.
6. **C5 dimension findings** (`command.ts`): emit findings/recommendations for low dimensions. Additive.

### Verification gate
- `bun run lint` clean; `bun run test` pass (no skips); `bun run build` PASS; `git status` clean.
- Functional: `bun apps/cli/src/index.ts command evaluate plugins/cc/commands/agent-add.md` → PASS,
  completeness ~1.0, argument-hints ~1.0, aggregate comparable to rd3 97%.
- Re-run across several `plugins/cc/commands/*.md` to confirm no false FAILs.
- Atomic commits: `fix(quality): score real Claude Code command schema`, `fix(cc-commands): align command-evaluate wrapper`.

### Do-not-drift
- Match the Claude Code schema (verify against real files), not a foreign one. File-based: no dir resolution.
- Additive type changes; no per-skill scripts; no 10-dim model. Coordinate alias flip with the 0047 release.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


