---
schema_version: 1
name: Annotate cc plugin entities with runtime requires
status: todo
template: feature-impl
created_at: 2026-11-04T23:00:24.876Z
updated_at: "2026-11-04T23:29:33.326Z"
feature_id: D1

dependencies: ["0162"]
ac_altitude: task-local
ac_numbering: task-local
priority: P2
estimate_hours: 3
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

- [ ] R1. Add a `requires:` frontmatter key to each cc entity exactly per the Design table, using 0162's grammar (YAML flow list, sorted). Leave all other frontmatter keys and every body byte unchanged.

- [ ] R2. `superskill skill|command|agent validate` reports no `requires`-related finding (no unknown-key warning, no invalid-token error) for every annotated file.

- [ ] R3. Add a structure test in `plugins/cc/tests/structure.test.ts` that asserts each cc entity's parsed `requires` equals the frozen table. An unlisted entity or a mismatch fails, so a future entity must be classified when it is added.

- [ ] R4. A grok-bot dry-run of cc with defaults (nothing provided, policy exclude) reports `anti-hallucination` as installed and the other 29 entities as excluded. With `--bot-provides cli:superskill --bot-provides local-fs` it reports all 30 installed. Record both outputs in the task's Testing section.

- [ ] R5. Non-Bot output is unchanged apart from the passed-through key. `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` stay green.

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

- [ ] 1. Confirm 0162 is merged (`parseRuntimeRequires` exported; validator recognizes `requires`).
- [ ] 2. Add `requires:` lines per the Design table (R1).
- [ ] 3. Add the `CC_RUNTIME_REQUIRES` guard test in `plugins/cc/tests/structure.test.ts` (R3, AC1).
- [ ] 4. Run validate across all 30 entities with `--json` and confirm zero `requires` findings (R2, AC2).
- [ ] 5. Run the two grok-bot dry-runs and capture their output in Testing (R4, AC3).
- [ ] 6. Diff the claude-target install bodies against the pre-change bodies. Then run `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` (R5, AC4).

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- Feature: `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md` (Scope P2)
- Upstream: 0162 (contract, parser, filter)
- Parallel: spur 1291 (sp), knowledge-kit 0342 (kk) use the same classification rules

### History

- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:09:56.887Z backlog → todo (system)
- 2026-11-04T23:20:30.918Z todo → backlog (system)
- 2026-11-04T23:29:33.326Z backlog → todo (system)

