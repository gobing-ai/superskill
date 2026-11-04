---
schema_version: 1
name: Runtime requires frontmatter contract and grok-bot catalog filtering
status: todo
template: feature-impl
created_at: 2026-11-04T23:00:24.487Z
updated_at: "2026-11-04T23:27:15.581Z"
feature_id: D1

dependencies: ["0160"]
ac_altitude: task-local
ac_numbering: task-local
priority: P1
estimate_hours: 8
---

## 0162. Runtime requires frontmatter contract and grok-bot catalog filtering

### Background

Task 0162 is the P2 leg of feature D1 (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md`, Scope "P2 runtime requirements"): a `requires:` frontmatter contract that lets an entity declare what runtime it needs, and a grok-bot catalog filter that excludes or labels "degraded" the entities a Bot cannot serve. Downstream: 0163 (annotate cc), spur 1291 (annotate sp) and knowledge-kit 0342 (annotate kk) all consume this contract verbatim.

Current tree state (verified 2026-11-04):

- No `requires` key exists anywhere in `packages/core/src` (grep, 2026-11-04). `superskill skill|command|agent validate` warns `Unknown frontmatter key` for any key outside `FIELD_TYPES`/`REQUIRED_FIELDS`/`KNOWN_OPTIONAL` (`packages/core/src/operations/validate.ts:90-96,597-631`), so annotating entities today would add a warning per file.
- The mapper folds skills, commands and subagents into `outputDir/skills/<plugin>-<name>/SKILL.md` (`packages/core/src/mapper.ts:186-262`). Skills keep their source frontmatter apart from `name` (`setSkillName`, `:98-111`); commands go through `adaptCommandToSkill` (`packages/core/src/pipeline/adapt-command.ts:19`) and subagents through `adaptSubagentToSkill`, which "preserves description, tools, model, skills, color, and all other fields" (`packages/core/src/pipeline/adapt-subagent.ts:21`). Whether `normalizeCommandFrontmatter` keeps an unknown key is asserted by a test in this task (AC2), not assumed.
- grok-bot reads the staged tree through `parseBotSkillEntry` (`packages/core/src/operations/grok-bot.ts:271-301`, already parses frontmatter with `parseFrontmatter`) and `collectBotSkillEntries`; install Step 2b then plans and emits (`apps/cli/src/commands/install.ts:785-892`). The Bot runtime already drops hooks/mcp/magents/scripts as whole artifact classes (`apps/cli/src/commands/install.ts:777-784`), but an entity whose *instructions* depend on hooks, subagent dispatch, a host CLI or the operator's filesystem is installed as if it works.
- `superskill update` threads only `grokBot.materialize` from the manifest into the Bot reinstall (`apps/cli/src/commands/update.ts:303,359-370`; manifest shape `packages/core/src/operations/install-manifest.ts:53-54`), so any new install-time option must be recorded there or update would silently change the catalog.

**Refine corrections (2026-11-04)**

- Feature says the filter is "probe-informed" → install reading a Bot-written receipt would let untrusted host data steer the catalog (same reasoning as 0161) → the operator declares what the Bot provides with a flag, citing the 0160 receipt; the CLI never reads the receipt here.
- Adding `requires:` without a validator change would make every annotation in 0163/1291/0342 emit an unknown-key warning (`packages/core/src/operations/validate.ts:625-630`) → the validator recognizes and shape-checks the key in this task.
- Install-time filter options not persisted would be lost on `superskill update` (`apps/cli/src/commands/update.ts:359-370`) → the manifest records them additively.

### Requirements

- [ ] R1. Freeze the `requires:` contract for skills, commands and subagents: an optional frontmatter key whose value is a YAML list of strings (a single string is accepted as a one-item list). Valid tokens are `hooks`, `subagents`, `local-fs` and `cli:<name>` with `<name>` matching `^[a-z0-9][a-z0-9._-]*$`. Duplicates collapse; order is normalized (sorted). Meaning: `hooks` — instructions rely on lifecycle hooks firing; `subagents` — relies on dispatching a subagent; `local-fs` — reads/writes the operator's own project working tree; `cli:<name>` — shells out to `<name>`.

- [ ] R2. One shared parser in core (`parseRuntimeRequires`) is used by both the validator and the grok-bot path. `validate` recognizes `requires` for skill/command/agent (no unknown-key warning) and reports an `error` finding per invalid token or non-string/list value.

- [ ] R3. `parseBotSkillEntry` carries the parsed requirements on `BotSkillEntry.requires`; a staged entity with an invalid `requires` value fails grok-bot install before any write with a `GrokBotPreflightError` naming the id and the token. Requirements must survive the mapper for all three entity kinds.

- [ ] R4. grok-bot install (every mode: bridge, full and 0161's plugin) filters the entry set right after `collectBotSkillEntries` and before planning or plugin lint. The Bot provides nothing by default; `--bot-provides <requirement>` (repeatable, same token grammar, grok-bot only) declares provided requirements. An entry is unmet when any requirement is not provided. `--bot-unmet <exclude|degrade>` (default `exclude`, grok-bot only) chooses the policy: `exclude` drops the entry; `degrade` keeps it, appends ` [degraded on Grok Bot: needs <r1>, <r2>]` to its description and inserts a one-line blockquote notice as the first body line. Every decision prints `grok-bot: excluded <id> (needs …)` or `grok-bot: degraded <id> (needs …)`, sorted by id, in dry-run too. If filtering leaves zero entries, install exits 1 naming the filter.

- [ ] R5. The manifest records the options additively as `grokBot: { materialize, provides?: string[], unmet?: 'exclude' | 'degrade' }`, validated on read; `superskill update` reinstalls grok-bot with the recorded `provides`/`unmet`. A manifest without them keeps today's behavior (default exclude, nothing provided). Invalid flag values exit 2.

- [ ] R6. Non-grok-bot targets are unaffected: their staged and emitted output for a fixture with `requires:` is byte-identical to the same fixture's output with the key copied through (no filtering, no rewriting). Sync `docs/04_DESIGN.md` (frontmatter contract subsection + install flag rows) and `docs/03_ARCHITECTURE.md` (filter step in the grok-bot flow) in the same commit; the ADR amendment belongs to 0164. `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` stay green.

Out of scope: annotating any shipped plugin (0163/spur 1291/kk 0342), reading the 0160 receipt, applying `requires` on non-Bot targets, new requirement tokens beyond the four, doctor reporting of filtered entries, new dependencies.

### Acceptance Criteria

```gherkin
Scenario: AC1 — The requires grammar parses and validates (req: R1, R2)
  Given frontmatter values `[cli:spur, hooks]`, `"subagents"`, `[local-fs, local-fs]`, `[cli:Spur]`, `[network]` and `42`
  When `parseRuntimeRequires` and `superskill skill validate` run on them
  Then the first three parse to sorted, de-duplicated lists with no unknown-key warning
  And `cli:Spur`, `network` and `42` each produce one error finding naming the token or value

Scenario: AC2 — Requirements survive the mapper for every entity kind (req: R3)
  Given a fixture plugin with a skill, a command and a subagent each declaring `requires: [cli:spur]`
  When the grok-bot install stages and collects them
  Then each `BotSkillEntry.requires` equals `['cli:spur']`
  And a fixture entity with `requires: [bogus]` fails grok-bot install before any write, naming the entity id and `bogus`

Scenario: AC3 — Unmet entities are excluded by default (req: R4)
  Given entities requiring `cli:spur`, `hooks`, nothing, and `[cli:spur, subagents]`
  When grok-bot install runs with `--bot-provides cli:spur` and no `--bot-unmet`
  Then the `hooks` and `[cli:spur, subagents]` entities are absent from the Bot catalog and printed as excluded with their unmet requirements
  And the other two are installed unchanged

Scenario: AC4 — Degrade policy labels instead of dropping (req: R4)
  Given the same fixture
  When install runs with `--bot-unmet degrade` and nothing provided
  Then every requiring entity is installed with the degraded description suffix and the body notice, and the non-requiring entity is byte-identical to an unfiltered install
  And `--dry-run` prints the same decisions and writes nothing

Scenario: AC5 — Options persist through update (req: R5)
  Given a grok-bot install made with `--bot-provides cli:spur --bot-unmet degrade`
  When the receipt is read back and `superskill update` reinstalls the stale plugin
  Then the manifest holds `provides: ['cli:spur']`, `unmet: 'degrade'` and the reinstall applies them
  And a manifest without those fields reinstalls with exclude and nothing provided, and `--bot-unmet maybe` exits 2

Scenario: AC6 — Other targets are unaffected and docs synced (req: R6)
  Given the fixture with `requires:` declarations
  When a rulesync target and the claude target install it
  Then their outputs match the baseline with the key passed through unchanged
  And `docs/04_DESIGN.md` and `docs/03_ARCHITECTURE.md` describe the contract, flags and filter step, and `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check` pass
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-11-04T23:27:13.633Z

- **CLOSED — four tokens, closed grammar.** `hooks`, `subagents`, `local-fs`, `cli:<name>` (feature P2 list). A new token is a contract change here, not free text, so annotations in three repos stay checkable.
- **CLOSED — the Bot provides nothing by default.** hooks are dropped as a class (`apps/cli/src/commands/install.ts:777-784`); subagent dispatch and any host CLI are unverified until 0160's receipt says otherwise; the operator's working tree is unreachable from a cloud Bot. The operator opts in with `--bot-provides`, typically after reading a receipt.
- **CLOSED — default policy `exclude`.** A visibly missing workflow is safer than one that silently fails mid-run; `degrade` is an explicit choice for operators who prefer discoverability.
- **CLOSED — filter before plugin lint.** 0161's 200-skill cap must count what is actually installed, so the filter runs first.
- **CLOSED — persisted in the manifest.** Update must reproduce the catalog; the fields are optional so existing receipts stay valid.
- **DEFERRED — doctor visibility of degraded/excluded entries.** Needs a doctor surface change; no owner until a Bot user asks.

### Design

**WHAT.** A shared `requires:` parser, validator recognition, `BotSkillEntry.requires`, and a pre-plan filter in grok-bot install with two flags persisted in the manifest.

**WHERE.** New `packages/core/src/operations/runtime-requires.ts` (re-exported from `packages/core/src/index.ts`); edits to `packages/core/src/operations/validate.ts` (`KNOWN_OPTIONAL` + shape check), `packages/core/src/operations/grok-bot.ts` (`BotSkillEntry.requires`, `parseBotSkillEntry`, filter/degrade functions), `packages/core/src/operations/install-manifest.ts` (optional fields + validation), `apps/cli/src/commands/install.ts` (flags, validation, filter call between `collectBotSkillEntries` and planning), `apps/cli/src/commands/update.ts` (thread fields), docs.

**Frozen names.**

| Kind | Name / value |
| --- | --- |
| type | `RuntimeRequirement = 'hooks' \| 'subagents' \| 'local-fs' \| \`cli:${string}\`` |
| constants | `RUNTIME_REQUIREMENT_KEYWORDS = ['hooks', 'subagents', 'local-fs'] as const`, `RUNTIME_REQUIREMENT_CLI_RE = /^cli:[a-z0-9][a-z0-9._-]*$/` |
| parser | `parseRuntimeRequires(value: unknown): { requires: RuntimeRequirement[]; invalid: string[] }` — `undefined` → empty; non-string/list → `invalid: ['<type>']`; sorted, de-duplicated |
| entry field | `BotSkillEntry.requires: RuntimeRequirement[]` (empty when undeclared) |
| filter | `filterGrokBotEntries(entries: BotSkillEntry[], options: { provides: RuntimeRequirement[]; unmet: 'exclude' \| 'degrade' }): { entries: BotSkillEntry[]; decisions: GrokBotRequiresDecision[] }` |
| decision DTO | `GrokBotRequiresDecision { id: string; action: 'excluded' \| 'degraded'; unmet: RuntimeRequirement[] }` (sorted by id) |
| degrade helper | `applyGrokBotDegradation(entry: BotSkillEntry, unmet: RuntimeRequirement[]): BotSkillEntry` — rewrites only the frontmatter `description` (frontmatter-bounded, like `setSkillName` in `packages/core/src/mapper.ts:98-111`) and inserts `> **Grok Bot:** degraded — expects <r…>, not declared as provided on this Bot.` as the first body line |
| CLI flags | `--bot-provides <requirement>` (repeatable), `--bot-unmet <exclude\|degrade>` — both grok-bot only, exit 2 otherwise or on an invalid value |
| manifest | `grokBot: { materialize; provides?: string[]; unmet?: 'exclude' \| 'degrade' }` |

**Invariants.** (1) Filtering is pure and runs before any write or plan. (2) The same entry set feeds bridge, full and plugin modes. (3) Non-grok-bot staging and emission never call the filter. (4) A degraded entry's id and file set are unchanged; only SKILL.md text changes, so markers hash the delivered bytes.

**Anti-patterns.** Reading the probe receipt; inventing per-target capability tables for other agents; stripping `requires` from other targets' output; treating unknown tokens as warnings in the grok-bot path; deleting previously installed excluded entries without `--prune` (existing prune semantics govern removal).

**Handoff.** 0163, spur 1291 and kk 0342 annotate using exactly the R1 grammar and must pass `superskill <kind> validate` with no `requires` findings. 0161 inserts its lint after `filterGrokBotEntries`. 0164 documents the contract in ADR-036/037.

### Plan

- [ ] 1. Add `packages/core/src/operations/runtime-requires.ts` (type, constants, `parseRuntimeRequires`) and export it (R1).
- [ ] 2. Validator: add `requires` to `KNOWN_OPTIONAL` for skill/command/agent and emit an error per invalid token via the parser (R2).
- [ ] 3. grok-bot core: `BotSkillEntry.requires`, parse in `parseBotSkillEntry` with a preflight error on invalid tokens, `filterGrokBotEntries`, `applyGrokBotDegradation` (R3, R4).
- [ ] 4. Install: flags + exit-2 validation, filter call after `collectBotSkillEntries` with decision echo (dry-run included), zero-entry error, manifest fields (R4, R5).
- [ ] 5. Manifest read/write validation and `update.ts` threading of `provides`/`unmet` (R5).
- [ ] 6. Tests: parser/validator matrix (AC1); mapper survival + invalid-token preflight (AC2); exclude/degrade/dry-run in `apps/cli/tests/commands/install-grok-bot.test.ts` (AC3, AC4); manifest round-trip + update threading (AC5); rulesync/claude byte-parity for a `requires` fixture (AC6).
- [ ] 7. Docs: `docs/04_DESIGN.md` contract subsection + flag rows; `docs/03_ARCHITECTURE.md` filter step (R6).
- [ ] 8. Run `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`; check `git status` (AC6).

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- Feature: `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md` (Scope P2, scenario R5)
- Upstream: 0160 (receipt evidence the operator cites for `--bot-provides`). Siblings: 0161 (lint after filter)
- Downstream: 0163 (cc annotations), spur 1291 (sp annotations), knowledge-kit 0342 (kk annotations), 0164 (ADR)

### History

- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:27:15.581Z backlog → todo (system)

