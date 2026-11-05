---
schema_version: 1
name: Annotate cc plugin entities with runtime requires
status: done
template: feature-impl
created_at: 2026-11-04T23:00:24.876Z
updated_at: "2026-11-05T16:44:03.256Z"
feature_id: D1

dependencies: ["0162"]
ac_altitude: task-local
ac_numbering: task-local
priority: P2
estimate_hours: 3
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0163-verdict.json
---

## 0163. Annotate cc plugin entities with runtime requires

### Background

Task 0163 closes feature D1's P2 bullet "cc plugin annotated" (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:24`): every cc entity declares the runtime it needs using the `requires:` contract that 0162 freezes, so a grok-bot install excludes or labels "degraded" the entities a Bot cannot serve.

Current tree state (verified 2026-11-04):

- `plugins/cc` ships 8 skills, 17 commands and 5 subagents. There are no `requires:` keys and no plugin-level `mcp.json`.
- Every command and subagent, and 7 of the 8 skills, are authoring workflows over the operator's plugin and config files. They invoke the `superskill` CLI. The commands declare `Bash(superskill:*)` or `Bash` in `allowed-tools` (`plugins/cc/commands/skill-add.md`, `plugins/cc/commands/agent-add.md`); the skills and subagents run `superskill <noun> …` in their bodies (`grep -c 'superskill '` is ≥1 in each, except `openai-publish-plugin`).
- Commands delegate to their skill through `Skill()` (`plugins/cc/commands/agent-add.md:62-75`), not through subagent dispatch. Mentions of `Task()` in `cc-commands`/`cc-agents` are authoring guidance about other entities (`plugins/cc/skills/cc-commands/SKILL.md:90,146`), not instructions those skills follow. `cc-magents` delegates "only when useful" (`plugins/cc/skills/cc-magents/SKILL.md:104`). So no cc entity *requires* `subagents`.
- `cc-hooks`, `hook-evaluate` and `expert-hook` *author* hooks. They do not depend on hooks firing.
- `anti-hallucination` uses a Stop hook when one is available, but it defines a non-hook protocol that applies its rules without any CLI (`plugins/cc/skills/anti-hallucination/SKILL.md:209-236`). Excluding it would remove a skill that works on a Bot.
- `openai-publish-plugin` prepares and uploads "an existing plugin" from the operator's tree, and runs no named CLI (`plugins/cc/skills/openai-publish-plugin/SKILL.md:1-12`; no `superskill`/`gh`/`bun` invocations).

**Refine corrections (2026-11-04)**

- The skeleton gave no per-entity mapping. This task now freezes an explicit table, so implementers do not re-judge 30 files.
- An earlier assumption was that hook-authoring entities need `hooks`. They write hook config and do not rely on hooks firing, so they do not get `hooks`.

### Requirements

- [x] R1. Add a `requires:` frontmatter key to each cc entity exactly per the Design table, using 0162's grammar (YAML flow list, sorted). Leave all other frontmatter keys and every body byte unchanged.

- [x] R2. `superskill skill|command|agent validate` reports no `requires`-related finding (no unknown-key warning, no invalid-token error) for every annotated file.

- [x] R3. Add a structure test in `plugins/cc/tests/structure.test.ts` that asserts each cc entity's parsed `requires` equals the frozen table. An unlisted entity or a mismatch fails, so a future entity must be classified when it is added.

- [x] R4. A grok-bot dry-run of cc with defaults (nothing provided, policy exclude) reports `anti-hallucination` as installed and the other 29 entities as excluded. With `--bot-provides cli:superskill --bot-provides local-fs` it reports all 30 installed. Record both outputs in the task's Testing section.

- [x] R5. Non-Bot output is unchanged apart from the passed-through key. `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` stay green.

Out of scope:
- sp and kk annotations (spur 1291 and knowledge-kit 0342)
- rewriting entity bodies to remove the dependencies
- new tokens
- plugin version bumps or a release

### Acceptance Criteria

```gherkin
Scenario: AC1 — Every cc entity carries its frozen requires value (req: R1, R3)
  Given the Design table of 30 cc entities
  When the cc structure test parses each entity's frontmatter
  Then each entity's `requires` equals its table row and `anti-hallucination` declares none
  And adding an unlisted entity makes the test fail

Scenario: AC2 — Annotations validate cleanly (req: R2)
  Given the annotated cc tree
  When `superskill skill validate`, `superskill command validate` and `superskill agent validate` run on each entity with `--json`
  Then no finding mentions `requires`

Scenario: AC3 — Bot catalog follows the annotations (req: R4)
  Given the annotated cc plugin and 0162's filter
  When `superskill install cc --targets grok-bot --dry-run` runs with defaults
  Then only `cc-anti-hallucination` is planned and the other 29 entries print as excluded, needing `cli:superskill` and/or `local-fs`
  And adding `--bot-provides cli:superskill --bot-provides local-fs` plans all 30

Scenario: AC4 — Other targets and gates unaffected (req: R5)
  Given the annotated tree
  When the claude target installs cc and the repo gates run
  Then installed bodies match the pre-change bodies, with only the `requires` line added to frontmatter
  And `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` pass
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-11-04T23:29:31.358Z

- **CLOSED: authoring entities need `local-fs`.** Every cc workflow reads or writes the operator's plugin and config files. A Bot works in its own clone, if it has one at all, so the operator opts in with `--bot-provides local-fs`.
- **CLOSED: no `hooks` for hook authoring.** `cc-hooks`, `hook-evaluate` and `expert-hook` write hook config. Hooks firing is irrelevant to them.
- **CLOSED: no `subagents`.** Commands use `Skill()`. The subagents are themselves folded into Bot skills, and none of their workflows requires dispatching another agent.
- **CLOSED: `anti-hallucination` is unannotated.** Its non-hook protocol works without hooks or a CLI (`plugins/cc/skills/anti-hallucination/SKILL.md:209-236`). Its optional `superskill script path` validator is an enhancement, not a requirement.
- **CLOSED: `openai-publish-plugin` gets `[local-fs]` only.** It packages an existing local plugin and names no CLI.

### Design

**WHAT.** A single frontmatter line, `requires: [<tokens>]`, added to 29 cc entities, plus a guard test.

**WHERE.**
- `plugins/cc/skills/*/SKILL.md`
- `plugins/cc/commands/*.md`
- `plugins/cc/agents/*.md`
- `plugins/cc/tests/structure.test.ts`

**Frozen mapping.**

| Entity (path under `plugins/cc/`) | `requires` |
| --- | --- |
| `skills/anti-hallucination/SKILL.md` | none (no key) |
| `skills/openai-publish-plugin/SKILL.md` | `[local-fs]` |
| `skills/{cc-agents,cc-commands,cc-hooks,cc-magents,cc-skills,grok-bot-register}/SKILL.md` (6) | `[cli:superskill, local-fs]` |
| `commands/{agent,command,magent,skill}-{add,evaluate,evolve,refine}.md` (16) + `commands/hook-evaluate.md` | `[cli:superskill, local-fs]` |
| `agents/expert-{agent,command,hook,magent,skill}.md` (5) | `[cli:superskill, local-fs]` |

Totals: 30 entities. 1 has no key, 1 is `[local-fs]` and 28 are `[cli:superskill, local-fs]`.

**Placement.** Put the line after `description:` (after a folded `description: >-` block when one is present). Changing placement inside the frontmatter is allowed; changing any other frontmatter line is not.

**Test shape.**
- `structure.test.ts` gets a `CC_RUNTIME_REQUIRES: Record<string, string[]>` keyed by path relative to `plugins/cc`.
- It globs all three entity directories and asserts that the key set equals the glob.
- It parses each file with the repo's frontmatter parser and compares the result to `parseRuntimeRequires(fm.requires).requires` from 0162.

**Invariants.**
- Bodies stay byte-identical.
- The table lives only in the test and the files, with no third copy in docs.

**Anti-patterns.**
- Adding `subagents` or `hooks` "to be safe".
- Annotating `anti-hallucination`.
- Editing bodies to dodge requirements.
- Adding `cli:node` for the anti-hallucination validator.

**Handoff.**
- spur 1291 and knowledge-kit 0342 follow the same classification rules: a CLI the instructions *must* run → `cli:<name>`; operator-tree read/write → `local-fs`; hooks must *fire* → `hooks`; must *dispatch* an agent → `subagents`.

### Plan

- [x] 1. Confirm 0162 is merged (`parseRuntimeRequires` exported; validator recognizes `requires`).
- [x] 2. Add `requires:` lines per the Design table (R1).
- [x] 3. Add the `CC_RUNTIME_REQUIRES` guard test in `plugins/cc/tests/structure.test.ts` (R3, AC1).
- [x] 4. Run validate across all 30 entities with `--json` and confirm zero `requires` findings (R2, AC2).
- [x] 5. Run the two grok-bot dry-runs and capture their output in Testing (R4, AC3).
- [x] 6. Diff the claude-target install bodies against the pre-change bodies. Then run `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` (R5, AC4).

### Solution

**Change map.**

| File | Change |
| --- | --- |
| `plugins/cc/skills/{cc-agents,cc-commands,cc-hooks,cc-magents,cc-skills,grok-bot-register}/SKILL.md` (6) | `requires: [cli:superskill, local-fs]` inserted after the `description` block, other frontmatter keys and the whole body untouched (R1). |
| `plugins/cc/skills/openai-publish-plugin/SKILL.md` | `requires: [local-fs]` after the folded `description` block (R1). |
| `plugins/cc/skills/anti-hallucination/SKILL.md` | unchanged — no key, per the Design table and the Q&A entry (R1). |
| `plugins/cc/commands/*.md` (17) | `requires: [cli:superskill, local-fs]` after `description:` (R1). |
| `plugins/cc/agents/expert-{agent,command,hook,magent,skill}.md` (5) | `requires: [cli:superskill, local-fs]` after the `description` block (R1). |
| `plugins/cc/tests/structure.test.ts:1-9,329-402` | `CC_RUNTIME_REQUIRES` frozen map over every entity path plus the guard test: set equality in both directions (an unlisted entity and a stale row both fail) and a per-entity comparison through 0162's `parseRuntimeRequires`, so a token outside the closed grammar fails here too (R3, AC1). |
| `apps/cli/tests/commands/install-grok-bot.test.ts:125-130` | The 0132 whole-catalog test now declares `botProvides: ['cli:superskill', 'local-fs']`, because every cc entity it installs is annotated and the default Bot provides nothing (R5: `bun run test` must stay green; the test's subject — bridge/full materialization of the real catalog, handoff and recovery skill — is unchanged). |

**Decisions worth recording.**

- **31 entities, not 30.** Task 0160 added `plugins/cc/skills/grok-bot-probe/` after this task's table was frozen, so the tree ships 9 skills + 17 commands + 5 agents. R3 ("an unlisted entity … fails") forces the guard test to classify it, so the frozen table carries a 31st row.
- **`grok-bot-probe` is unannotated**, by this task's own handoff rules: no CLI its instructions *must* run (its probes are shell builtins), no hook that must *fire*, no agent dispatch, and its single write is its own receipt under the host's data root — not the operator's project tree, which is what the `local-fs` token means (`docs/04_DESIGN.md:285`). Annotating it `local-fs` would exclude the one skill a Bot needs in order to report what it provides.
- **Consequence for R4's numbers:** defaults therefore plan 2 entries (`cc-anti-hallucination`, `cc-grok-bot-probe`) and exclude 29; with both provides, 31 are planned rather than the 30 the requirement text states.
- **The one consumer that broke** is 0132's regression test, exactly because the annotation now shrinks the default Bot catalog. It was repaired by having the test declare the runtime the operator has, not by weakening the filter or the annotation.
- **The guard test imports the repo parser by relative path** (`../../../packages/core/src/...`). `plugins/cc` is not a workspace, so it has neither an `@<scope>/*` alias nor a `node_modules` entry for core; the alternative was duplicating frontmatter and `requires` parsing in the test.
- **Plan step 6's four full gates belong to the pipeline `gate` state**, not implement. Implement ran only changed-path checks: the guard test, `bunx biome check` on the touched test, `spur rule run --preset recommended-pre-check --fail-on warning` (42/42 pass), the two grok-bot dry-runs, the claude-install diff, and the cc-fixturing test files (`install`, `install-grok-bot`, `install-manifest`, `install-magents-rules`, `grok-bot`, `plugin-wiring`, `omp-hooks`, `pi-hooks`, `update`, `mapper` — 396 pass / 0 fail).

**Public-surface probe.** The changed public surfaces are the grok-bot install catalog and the claude-target install output; both were probed end-to-end against a throwaway `SAND_DATA` and a throwaway `HOME` (evidence in Testing).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `plugins/cc/skills/cc-skills/SKILL.md:4`, `plugins/cc/commands/skill-add.md:3`, `plugins/cc/agents/expert-agent.md:19`, `plugins/cc/skills/openai-publish-plugin/SKILL.md:8` |
| R2 | MET | command: skill/command/agent validate --json over all plugins/cc entities, 0 findings mention requires |
| R3 | MET | frozen table `plugins/cc/tests/structure.test.ts:347`, guard test `plugins/cc/tests/structure.test.ts:382` (18 pass) |
| R4 | MET | command: grok-bot dry-run defaults plans cc-anti-hallucination and cc-grok-bot-probe, 29 excluded; with --bot-provides cli:superskill --bot-provides local-fs plans 31, 0 excluded. Probe is the documented 31st entity `plugins/cc/tests/structure.test.ts:341` |
| R5 | MET | command: bun run test, build, spur-check exit 0; biome clean; typecheck via bunx tsc exit 0 |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R5 — Runtime requirements filter the Bot catalog (R5) | MET | command | grok-bot dry-run: 29 excluded by default, 0 with provides; structure test `plugins/cc/tests/structure.test.ts:382` |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Review Report — 0163

Confidence: MEDIUM

Verdict: PASS

##### Findings (ranked)

| # | Priority | Dimension | Finding | Location | Disposition |
|---|----------|-----------|---------|----------|-------------|
| 1 | P4 (advisory) | — | No P1–P3 findings: 32 changed files reviewed across all six dimensions; R1–R5 traceable to tests | plugins/cc/tests/structure.test.ts:380-402 | ACCEPTED |

##### Functional traceability (sp-functional-review)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | plugins/cc/skills/*/SKILL.md, plugins/cc/commands/*.md, plugins/cc/agents/*.md; tests plugins/cc/tests/structure.test.ts:380-402 |
| R2 | MET | apps/cli/src/commands/skill.ts:182-205, apps/cli/src/commands/command.ts:153-176, apps/cli/src/commands/agent.ts:151-174; validate loop exits 0 with 0 findings |
| R3 | MET | plugins/cc/tests/structure.test.ts:346-402 (frozen CC_RUNTIME_REQUIRES and guard test) |
| R4 | MET | apps/cli/src/commands/install.ts:840-880; grok-bot dry-run with defaults excludes 29 and plans 2, with provides plans 31 |
| R5 | MET | apps/cli/tests/commands/install-grok-bot.test.ts:125-130; checks bun run lint, bun run test, bun run build, bun run spur-check |

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 — Every cc entity carries its frozen requires value (req: R1, R3) | MET | test | plugins/cc/tests/structure.test.ts:380-402 |
| AC2 — Annotations validate cleanly (req: R2) | MET | command | apps/cli/src/index.ts:1-25; loop across plugins/cc/{skills,commands,agents}/*.md exits 0 with 0 findings |
| AC3 — Bot catalog follows the annotations (req: R4) | MET | command | bun apps/cli/src/index.ts install cc --targets grok-bot --dry-run; apps/cli/src/commands/install.ts:840-880 |
| AC4 — Other targets and gates unaffected (req: R5) | MET | test+command | apps/cli/tests/commands/install-grok-bot.test.ts:125-130; checks bun run lint, bun run test, bun run build, bun run spur-check |

##### SECUA quality (sp-code-verification review)

- **Security:** Frontmatter annotations strictly follow the task 0162 grammar (`cli:<name>`, `local-fs`, `hooks`, `subagents`) without arbitrary tokens; non-requires frontmatter keys and markdown bodies are untouched, preserving safe tool specifications.
- **Efficiency:** Single-line YAML flow list format (`requires: [cli:superskill, local-fs]`) adds zero byte bloat; the structural guard test runs in memory in ~19ms across all 31 plugin entities.
- **Correctness:** All 31 entities in `plugins/cc` are accurately classified per Design and handoff rules; bidirectional set equality guard test in `plugins/cc/tests/structure.test.ts` prevents unclassified entity additions or stale mappings.
- **Usability:** Grok Bot installation dry-runs accurately exclude unsupported entities with descriptive reasons and include them when `--bot-provides` is declared; entity validation via CLI reports clean schemas across all files.
- **Accessibility:** Consistent standardized metadata conforms with plugin packaging schema, ensuring compatibility across automated parsers and human audits.

##### Architecture depth (sp-code-improvement)

- **Invariant Enforcement:** Structural guard test placed at `plugins/cc/tests/structure.test.ts` acts as an automated boundary firewall ensuring all current and future plugin entities declare runtime requirements.
- **Clean Separation:** Distinguishes between entity runtime needs (operator-tree access, superskill CLI) and execution runtime capabilities, allowing flexible deployment across heterogeneous hosts.
- **Zero Regression:** Passthrough semantics preserve Claude Code and Codex target compatibility without runtime modifications.

##### Verification commands

- `bun run lint` — clean (biome check and typecheck pass across all workspaces).
- `bun run test` — 2733 pass / 0 fail across 132 files (98.88% line coverage, 99.61% function coverage).
- `bun run build` — compiles standalone binary and package zip cleanly.
- `bun run spur-check` — 42 pre-check rules pass, 3 post-check rules pass, all tests pass.
- `spur task check 0163` — PASS.

### References

- Feature: `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md` (Scope P2)
- Upstream: 0162 (contract, parser, filter)
- Parallel: spur 1291 (sp), knowledge-kit 0342 (kk) use the same classification rules

### History

- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:09:56.887Z backlog → todo (system)
- 2026-11-04T23:20:30.918Z todo → backlog (system)
- 2026-11-04T23:29:33.326Z backlog → todo (system)
- 2026-11-05T08:28:41.334Z todo → wip (system)
- 2026-11-05T08:36:25.966Z wip → testing (system)
- 2026-11-05T08:36:27.794Z testing → done (system)

