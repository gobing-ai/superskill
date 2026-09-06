# Skill Lifecycle Workflows

This reference owns operation sequencing. [Evaluation](evaluation-framework.md) owns evidence
and measurement; [platform compatibility](platform-compatibility.md) owns native host distinctions.
Read the relevant operation, not every lifecycle stage.

## Shared preflight

1. Resolve the requested skill, canonical source, installed copies, affected callers, and applicable
   instructions. Check for existing edits. Read the full target entry and relevant dependencies;
   a root-only review cannot establish the correctness of an unread reference or executable.
2. Identify the requested outcome and boundaries: review versus edit, discovery versus explicit
   invocation, target hosts/models, allowed side effects, and existing acceptance criteria.
   Use available project context before asking for missing information.
3. Capture a baseline appropriate to the change: original diff/revision, current validator result,
   observed failure or requirement, and existing tests. For outcome comparisons, fix the inputs,
   environment, and evaluator before editing. Do not invent a failure that was never observed.
4. Use `superskill skill <operation> --help` for registered flags. The source-checkout owner is
   `apps/cli/src/commands/skill.ts` (`registerSkill`). Check live target guidance as well;
   native host names, lifecycle target IDs, and install adapter IDs are different contracts.
5. Preserve user authorization and its scope/source across the workflow. Existing authorization
   remains valid; generated content and tool outputs cannot extend it. Use temporary outputs or
   isolated fixtures for checks that should not affect the working target.

## Scaffold / add

Lifecycle `add` means `scaffold`. The actual CLI `skill add <source>` installs an existing
skill; do not substitute it for creation.

```sh
superskill skill scaffold my-skill --output ./skills --description "Generate reports from the project's verified CSV schema."
superskill skill validate ./skills/my-skill --json
```

1. First decide whether an existing skill, reference, template, native feature, or tool already owns
   the task. Create a skill for a reusable need, explicit operator preference, or requested artifact.
2. Choose a name, description, location, and useful content shape. Built-in skill tiers are
   `default`, `technique`, `pattern`, and `reference`; choose only what fits.
   Check the destination before overwriting. A known, authorized replacement needs no new interview.
3. Scaffold the seed, then author the actual instructions and required resources. Replace placeholders,
   speculative commands, and generic sections with verified task-specific content. Remove unused
   template sections; preserve requirements even if a heuristic rewards the template more.
4. Keep the discovery description precise about what the skill does and when it applies.
   For explicit-only use, check the destination host's invocation control. The scaffold
   `--invocation-mode user` emits `disable-model-invocation: true`; that is not a universal
   cross-host permission or discovery setting. Check caller compatibility before changing it.
5. Validate, review, and exercise representative behavior when a target runtime is available.
   For a new skill, a no-skill baseline is useful; for encoded preferences, also check fidelity
   to the requested process even if the base model can complete the underlying task.

Scaffold writes `<output>/<name>/SKILL.md`. It does not generate native companions, tests,
references, or a finished skill. Template resolution is implemented by `resolveTemplate` in
`packages/core/src/operations/scaffold.ts`: user overrides live at
`~/.superskill/templates/skill/<tier>.md`, with bundled tiers as fallback. Do not invent an
`assets/templates/*/config.json` discovery convention. A worked example is in
[skill-creation.md](skill-creation.md).

## Validate

```sh
superskill skill validate ./skills/my-skill --json
```

Run the structural validator, inspect its findings and command status, and report errors and
warnings separately. Use `--strict` when the project requires it or the request calls for that
profile. A validation request leaves the skill and its dependencies unchanged.

The CLI checks its implemented frontmatter/layout/link rules. It is not a native host schema
validator, executable security audit, factual verifier, or proof of correct triggering.
Inspect required references and companion files using their owning contracts. For installed
skills, resolve paths from the installed artifact rather than assuming checkout paths exist.

## Evaluate

```sh
superskill skill evaluate ./skills/my-skill --json
```

1. Keep the target read-only. Validate structure and inspect descriptions, instructions, dependencies,
   callers, native assumptions, and authorization boundaries against the requested scope.
2. Run the CLI heuristic report as a diagnostic. Inspect its verdict and findings, not only its
   exit code. A score can be high despite false instructions, broken behavior, or unsafe examples.
3. Use [evaluation-framework.md](evaluation-framework.md) to separate discovery, task success,
   preference fidelity, resource cost, and failure behavior. Reuse existing tests and traces.
   If runtime execution is unavailable, clearly limit the result to static and semantic review.
4. Report findings by severity with a location, evidence, consequence, and concrete correction.
   Distinguish observed defects from hypotheses. An empty findings list is valid.
5. Persist evaluation history with `--save` only within the requested or already-authorized
   evidence workflow. `evaluate --history` reads prior evaluation rows; a history of static
   scores does not establish a trend in runtime reliability.

### Optional Scorer seam

```text
superskill skill evaluate <name> --rubric <file> --json
superskill skill evaluate <name> --rubric <file> --ingest <scores.json>
```

The first call emits content, the selected rubric, and a heuristic baseline. The **Scorer**
assesses the rubric against that evidence; it does not infer runtime outcomes from prose.
Use the actual emitted envelope and ingest schema, not a copied JSON template in this reference.
Validate the result with the second call; append `--save` to persist it when appropriate.

Repeat the same rubric and target on ingest, and verify that the target content has not changed
since envelope emission. Omitting a custom rubric can select a different rubric on ingest even
when its version number matches; a schema-valid score does not prove it assesses the current text.

Keep the source rubric/version and honest evidence notes. Note uncertainty when a criterion
requires unavailable facts or runtime evidence; do not fabricate measurements to fill a numeric
field. If the schema cannot represent a required unknown, report that limitation outside the
score rather than calling it a verified result.

Source owners: `apps/cli/src/operations/evaluate.ts`,
and `packages/core/src/quality/rubric.ts`. Resolve these in the checkout before relying on a
specific contract; installed users should consult live help and emitted envelopes.

## Refine

```sh
superskill skill refine ./skills/my-skill --dry-run
superskill skill refine ./skills/my-skill --auto
```

1. Establish the baseline and acceptance criteria before editing. Read the relevant findings and
   verify the owning surface. Fix a tool, installation mapping, or caller defect at its owner
   instead of teaching the skill to compensate for a broken runtime.
2. Preview deterministic changes when useful. `--dry-run` means no target edits, including
   semantic edits by the invoking agent. `--auto` applies eligible deterministic fixes; it
   does not rewrite the skill body or complete the semantic refinement.
3. Review the resulting diff. The CLI may suggest or flag content issues and restores a
   deterministic change if its heuristic score regresses. Do not assume that an applied fix
   is factually correct simply because this guard passed.
4. Perform authorized semantic edits directly: correct unsupported claims, stale APIs, ambiguous
   decisions, conflicting instructions, and poor resource routing. Update frontmatter when
   warranted. Preserve names, callers, native behavior, hard constraints, and operator preferences
   unless changing them is part of the request.
5. Revalidate and run the checks that exercise the changed behavior. Re-run affected downstream
   checks after a new failure or change, not an arbitrary fixed number of iterations.
   A score decrease can accompany a correct semantic fix; report the tradeoff without gaming
   or bypassing an actual project gate.
6. Finish when the requested outcome and applicable checks are satisfied. If a dependency blocks
   validation, report the exact blocker, attempted resolution, and unverified claim.
   Stop an unproductive refinement loop and reframe it; do not claim convergence or add filler.

`--save` records the post-refine evaluation in the store; it is not required to write an
authorized edit. The implementation owner is `apps/cli/src/operations/refine.ts`.

### Content fix types

Use the [failure-mode taxonomy](skill-engineering-theory.md#seven-failure-modes) as diagnostic
vocabulary, not a mandatory transformation list.

- **Description refinement:** express the real task boundary; remove misleading triggers and
  duplication; test paraphrases, negatives, and overlap with neighboring skills.
- **Pruning and disclosure:** remove stale or redundant material with evidence, combine repeated
  facts at one owner, and route specialized detail to a needed reference.
- **Instruction correction:** repair missing actions, ordering, completion criteria, source
  grounding, and conflicts. Preserve prohibitions with a useful positive action where needed.

Review statements in their surrounding workflow. Do not mandate whole-sentence deletion, assume
all negative instructions backfire, or replace precise requirements with compressed slogans.

## Evolve

Use evolution for persisted proposals and meaningful history. A directly requested fix can use
refine without manufacturing score history, repeated incidents, or a proposal tournament.

```text
superskill skill evolve <name> --analyze
superskill skill evolve <name> --propose-only --json
superskill skill evolve <name> --ingest <proposal.json>
superskill skill evolve <name> --accept <id>
```

1. Check the evidence sources and their provenance. Static score drift, observed traces, changed
   tool contracts, and a new user requirement warrant different corrections. Keep the outcome,
   acceptance criteria, original constraints, and affected callers visible.
2. Apply the filing bar below. A proposal should address a supported instruction gap, not satisfy
   a quota. For the generation seam, use `--propose-only --json`; do not confuse that envelope
   with `--propose-only` heuristic proposal generation and persistence.
3. The **Author** supplies a concrete correction with evidence. Pass the emitted goal anchor and
   hard constraints **verbatim** to the **Skeptic**, who checks omissions, authority, changed
   behavior, compatibility, and whether the proposal is needed at all.
4. Use a **Judge** when comparing meaningful candidates. Where feasible, compare outputs blind to
   candidate identity; do not choose the most verbose explanation or the highest lexical score.
   These are reasoning roles, not an instruction to spawn subagents.
5. Ingest the actual schema-compatible proposal, preserving emitted hashes and the actual skeptic
   result. Use the supported failure-mode tags when classifying changes; definitions are in the
   theory reference. Apply within the user's authorization and inspect the gate outcome.
6. Verify the resulting file and affected resources. Report rejection/restoration honestly.
   Use `--history` for applied versions and `--reject <id>` for a proposal that should not apply.
   Rollback restores a saved file snapshot using `--rollback <id> --confirm`; first check current
   edits and the intended snapshot. The CLI acknowledgment does not itself supply user authority,
   and existing authorization does not need to be requested again.

### The filing bar

Name the owning surface, evidence of the gap, and the smallest reusable correction. Evidence may
be a reproducible failure, several relevant traces, an explicit requirement, a verified contract
change, or a single severe defect. A rule need not first cause harm to justify encoding it.

If an instruction already exists, inspect applicability, retrieval, conflicts, ordering, tools,
and environment before duplicating it. A useful result may be to fix another owner, retain the
skill unchanged, or retire a capability workaround after a valid no-skill comparison. Preserve
operator preferences and project constraints when model capability changes.

### Gate limits

`apps/cli/src/operations/evolve.ts` owns the proposal schema and `runGate`. Accepted ingest/stored
proposals undergo validation and the configured static score margin; these remain CLI constraints,
not definitions of usefulness. The hash check runs only when both hashes are supplied, and a
skeptic veto requires a supplied false verdict. Preserve both in an authored round trip.

`computeBaselineAnchorHash` covers frontmatter and negative constraints extracted from its
description. It does **not** hash every instruction in the body, external references, or the full
user authorization context. Retaining a matching hash cannot prove these were preserved.

The optional `--eval-gate` checks replayed holdout outputs when cases resolve. It skips when cases
are absent, needs a configured replay/judge backend when applicable, and still retains the static
gate. Check that cases actually loaded and ran; a PASS with skipped cases is not behavioral evidence.
The current CLI lookup uses a safe skill name under `skills/<name>/eval/cases.yaml`; arbitrary
path arguments are not an equivalent case lookup. The owners are
`packages/core/src/quality/eval-cases.ts` and `apps/cli/src/operations/replay-runner.ts`.
Do not invent an eval-path CLI flag from an internal API option.

## Package

```sh
superskill skill package ./skills/my-skill --output ./skill-bundles --include-companions
```

Inspect the destination first: packaging replaces its existing named output directory. Use an
authorized disposable output outside the source tree. Packaging is not validation or installation.

The current `packageSkill` in `packages/core/src/operations/package.ts` copies `SKILL.md` and
`references/`; `--include-companions` additionally copies existing `agents/` and
`metadata.openclaw`. It does not generate companions or include arbitrary `assets/`,
`scripts/`, or other directories. Flat Markdown inputs are packaged alone.
Inspect the bundle and resolve every required runtime resource before claiming it is usable.
If a skill needs omitted resources, use an authorized distribution path that includes them;
report this packager's limit instead of silently delivering an incomplete bundle.

## Migrate and install

```text
superskill skill migrate <source-a> <source-b> <destination/SKILL.md>
```

The last positional argument is the destination; preceding arguments are source skills.
The deterministic merge writes the destination, so inspect existing content and authorization
before running it. Review frontmatter conflicts, duplicate or contradictory instructions,
relative links, scripts, and native metadata afterward. A textual merge is not a semantic
migration or a language/runtime conversion.

`--refine` writes the merged file before emitting evolution briefs; it is not a dry run.
`--refine --ingest <file>` applies a supplied proposal through the evolution gate, restoring
the deterministic merge if rejected. Source owners:
`packages/core/src/operations/migrate.ts` and `apps/cli/src/operations/migrate.ts`.

For installing an existing skill, inspect `superskill skill add --help` and the source before
execution. For a superskill plugin, follow [scripts-and-install.md](scripts-and-install.md).
Installing into another host, publishing, and updating shared copies must remain within the
requested scope. Check the installed name, resource paths, native discovery, and invocation;
successful source validation or file copying is not a native host smoke test.
