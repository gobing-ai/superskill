---
schema_version: 1
name: Grok Bot host capability probe skill and doctor receipt reader
status: done
template: feature-impl
created_at: 2026-11-04T22:58:00.110Z
updated_at: "2026-11-05T09:36:02.383Z"
feature_id: D1

ac_altitude: task-local
priority: P1
estimate_hours: 6
done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0160-verdict.json
---

## 0160. Grok Bot host capability probe skill and doctor receipt reader

### Background

Task 0160 is the P0 leg of feature D1 (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:22`): a read-only probe skill a Grok Bot reads and follows, plus the doctor reader that reports the receipt's capabilities honestly. Every live-host capability behind ADR-036/037 is still an assumption — the Sand data root, the skill-save tool schema and the personal plugin-install route were never observed on a real Bot, and the authorized host smoke is `cancelled` (0129); 0128/0130/0132 are `done` with their live-host outcomes still `UNVERIFIED` (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:18`, verified against `spur task show` on 2026-11-04).

Current tree state (verified 2026-11-04):

- `superskill doctor` is `apps/cli/src/commands/doctor.ts:36-66`. It accepts only `--targets grok-bot` and `--json`, calls `inspectGrokBotTarget`, prints root/catalog/slash-registry state, and exits 0/1/2 purely from filesystem health.
- `GrokBotDoctorReport` (`packages/core/src/operations/grok-bot.ts:920-940`) carries `available`, root fields, `issues` and `slashRegistry` (always `status: 'unknown'`, `packages/core/src/operations/grok-bot.ts:942-968`). No field consumes host evidence, and `docs/04_DESIGN.md:230-232` documents doctor as a Sand-root + catalog check only.
- `grok-bot` is install-only (`packages/core/src/targets.ts:26`); materialization is `bridge|full` only (`apps/cli/src/commands/install.ts:121,139-144`). The cc plugin already ships one Bot-facing skill, `plugins/cc/skills/grok-bot-register/SKILL.md`, installed as `cc-grok-bot-register` through the plugin-prefix mapper (`packages/core/src/mapper.ts:115-125`); `plugins/cc/README.md:38,83` lists it as skill 7 of 8.
- No receipt format, no producer and no consumer exists today, so feature P1's rule "mode becomes primary only when the P0 receipt confirms a personal install route" (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:23`) has nothing to test against.

Scope boundary. This task owns feature R1 (probe captures live capability without mutation) and R2 (doctor reports probe evidence honestly). Feature P1 and P2 are filed separately: 0161 (`--materialize plugin` Cursor-plugin emission, feature R3/R4) and 0162 (the `requires:` runtime-requirements contract and catalogue filtering, R5) both list 0160 as their only prerequisite; 0163 (annotating cc entities with `requires:`) follows 0162, and the aggregate documentation sweep 0164 follows 0161 and 0162. R6 here therefore covers only the doc rows this task's own contract changes in the same commit (see R6).

**Refine corrections (2026-11-04)**

- Scaffold Background was a title echo with no premises → audited against the tree: the doctor has no receipt input, no probe skill exists in `plugins/cc/skills/`, and 0128/0130/0132/0129 statuses above are confirmed → the task is a genuine gap, not already-fixed work; scope is frozen to R1+R2.
- Feature claim "`superskill doctor --targets grok-bot` reads a supplied receipt" (`docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:22`) → doctor has no receipt parameter at all (`apps/cli/src/commands/doctor.ts:36-66`) → Design adds an optional `--receipt <path>` plus a default receipt path; read-only, no CLI-side host probing.
- ADR-036 "Doctor scope" says doctor "is explicitly not a GUI discovery or connection test" (`docs/00_ADR.md:743`) → reading an operator-supplied file is neither, so the decision stands → no supersede; ADR-036 gains a dated amendment that records the receipt reader and its unchanged exit semantics.
- Concurrent decomposition appeared while this refine ran (0161-0164 created 15:00:42, after the audit pass) → `dependencies: ['0160']` on 0161/0162 means this task is their upstream, and 0164's title claims "amend ADR-036/037 and sync owning docs for probe, plugin mode and requires" → R6 is narrowed to the doc rows this task's own command/schema/ADR change requires in the same commit (`docs/04_DESIGN.md` doctor row and probe subsection, ADR-036 amendment, `docs/03_ARCHITECTURE.md` module row, `plugins/cc/README.md` skill inventory); the cross-feature sweep stays with 0164, which must also cover the probe half it now names.
- Proposal, not applied: 0164 lists `dependencies: ['0161','0162']` but its stated scope includes the probe documentation that only 0160 produces → the edge `0164 → 0160` is missing. Adding it is an operator decision on another task's spec; recorded here so it is not lost.

### Requirements

- [x] R1. Add `plugins/cc/skills/grok-bot-probe/SKILL.md` — a read-only skill a Bot reads and follows (frontmatter `name: grok-bot-probe` plus a non-empty description carrying the probe triggers), which probes exactly the eight capability ids in R2 with permitted read-only commands and writes exactly one JSON receipt to the operator-given path (default `<sandRoot>/.superskill/grok-bot/probe/receipt.json`). It creates only that file's parent directory, writes nothing else, deletes nothing, performs no install/registration/network action, and reports `unverified` — never `absent` and never a guess — for any capability it could not observe.

- [x] R2. Freeze receipt schema version 1: `{"schemaVersion":1,"kind":"superskill.grok-bot.probe","generatedAt":"<ISO-8601 UTC>","capabilities":[{"id":"<id>","status":"observed|absent|unverified","value":<string|string[]|null>,"evidence":<string|null>}]}` with the eight ids `host-os-arch`, `host-home`, `sand-env`, `sand-roots`, `skill-save`, `plugin-install`, `runtime-persistence`, `mcp-command` (feature P0 list, `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:22`). `observed` means the capability was exercised or read successfully, `absent` means it was observed missing, `unverified` means it was not determined.

- [x] R3. Add `packages/core/src/operations/grok-bot-probe.ts` exporting the schema types, the path helper and a never-throwing reader, re-exported through `packages/core/src/index.ts` next to the existing `operations/grok-bot` export (`packages/core/src/index.ts:25`). The reader treats the receipt as untrusted input: absent or non-regular file → `missing`; unparseable JSON, wrong `schemaVersion`/`kind`, invalid `generatedAt`, a duplicate capability id, a value longer than 200 characters, or a file larger than 64 KiB → `invalid` with a static reason that echoes no file content; unknown top-level keys and unknown capability ids are stripped; ids absent from the receipt are surfaced as `missingIds`, never synthesized.

- [x] R4. `superskill doctor --targets grok-bot [--json] [--receipt <path>]` gains a `capabilities` section. Default path is `<dataRoot>/.superskill/grok-bot/probe/receipt.json`; `--receipt` overrides it and is relative to the invocation directory; with no resolved root and no `--receipt`, state is `missing` with `path: null`. State is `missing | invalid | stale | valid`, where `stale` means `generatedAt` older than 30 days (clock injectable for tests). JSON adds `capabilities: {state, path, generatedAt, entries, missingIds, problem}`; text mode appends one header line, one line per reported capability, and — only when non-empty — a not-reported line. The text also names the probe skill path so an operator can produce a receipt.

- [x] R5. Every existing doctor field, human line, `available` value and exit code (0 healthy/creatable, 1 broken/unavailable, 2 usage) is unchanged, and receipt state never influences any of them — valid, stale, invalid and missing receipts all exit on filesystem health alone.

- [x] R6. Sync the owning docs this task's own contract changes, in the same implementation commit: `docs/04_DESIGN.md` (doctor signature row and a probe-receipt subsection), `docs/00_ADR.md` (dated ADR-036 amendment for the receipt reader), `docs/03_ARCHITECTURE.md` (the new `operations/` module row), `plugins/cc/README.md` (skill count and inventory row). Cross-feature doc aggregation belongs to 0164, not here. `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` stay green, including `skill-citations-resolve` over the new SKILL.md.

Out of scope: `--materialize plugin` / Cursor-plugin bundle emission (feature R3/R4), the `requires:` runtime-requirements contract and grok-bot catalogue filtering (feature R5), marketplace/registration automation, a `superskill probe` command or any CLI-side host probing, and new dependencies.

### Acceptance Criteria

Feature-scenario coverage (DD-09):

- [x] R1 — Probe captures live host capability without mutation (R1)
- [x] R2 — Doctor reports probe evidence honestly (R2)


- [x] AC1 — A Bot following `plugins/cc/skills/grok-bot-probe/SKILL.md` on a host where it can reach Shell but not every documented tool writes one receipt at the default path containing all eight capability ids, each marked `observed`, `absent` or `unverified` with evidence, and containing no environment-variable values, tokens or credentials; the SKILL.md must state each id exactly once and its non-goals must forbid install, registration and network actions (req: R1, R2).

- [x] AC2 — The core reader classifies a valid receipt `valid`, one whose `generatedAt` is older than 30 days `stale` (with the injected clock deciding), and each of these `invalid` with a static reason: truncated JSON, wrong `schemaVersion`, wrong `kind`, non-ISO `generatedAt`, duplicate capability id, a 201-character value, a 64 KiB+1 file, a directory or symlinked-in path outside a regular file; an absent path is `missing` with `path` set and `entries: []`, and a receipt omitting ids reports them in `missingIds` rather than inventing entries (req: R3).

- [x] AC3 — `doctor --targets grok-bot --json` resolves the receipt from `--receipt` when given and from `<dataRoot>/.superskill/grok-bot/probe/receipt.json` otherwise, emitting `capabilities: {state, path, generatedAt, entries, missingIds, problem}`; text mode prints the state header, one `probe <id>: <status>` line per reported entry, and a not-reported line only when `missingIds` is non-empty, and names the installed probe skill path (`workflows/cc-grok-bot-probe/SKILL.md`) (req: R4).

- [x] AC4 — For a healthy root with a valid, stale, malformed and missing receipt, exit is 0 in every case, and for an unresolvable root exit is 1 regardless of receipt state; `--targets` misuse still exits 2; every pre-existing human line and JSON field keeps its value and order, with the capability block appended (req: R5).

- [x] AC5 — `docs/04_DESIGN.md`, `docs/00_ADR.md`, `docs/03_ARCHITECTURE.md` and `plugins/cc/README.md` describe the shipped flag, schema and skill; a test asserts the SKILL.md capability ids and the code union agree; `bun run lint`, `bun run test`, `bun run build` and `bun run spur-check` pass (req: R6).

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-11-04T23:00:58.953Z

#### Q&A entry — 2026-11-04

- **CLOSED — receipt ownership and location.** The Bot produces the receipt; the CLI only reads it. Default path is `<dataRoot>/.superskill/grok-bot/probe/receipt.json` (the existing hidden superskill tree, same convention as the register handoff in `docs/04_DESIGN.md:50-53`) and `--receipt <path>` overrides it for a receipt copied off the Bot host. Rejected: a Bot writing into a repo working tree, and a receipt embedded in the install manifest — the probe must work on a Bot that never ran `superskill install`.
- **CLOSED — no CLI-side probing.** The probe is a skill the Bot executes, not a `superskill probe` command. The CLI runs on the operator's machine, cannot see the Bot's tool set, and ADR-036 keeps the Bot target free of new public commands (`docs/00_ADR.md:687-745`).
- **CLOSED — staleness is 30 days and additive.** A receipt older than 30 days reports `stale`; the reader takes an injectable `now` so tests are deterministic. Every receipt state is reported, never corrected, and no state changes `available` or an exit code — a stale receipt is evidence aging, not a broken install.
- **CLOSED — three statuses, no fourth.** `observed | absent | unverified` per feature R1. `absent` is reserved for a capability that was looked for and found missing; anything not determined is `unverified`. `unverified` is never upgraded by inference, and a capability the host cannot expose stays `unverified` rather than being inferred from a neighbouring capability.
- **CLOSED — eight ids are the whole schema.** The P0 probe list in `docs/features/D1_grok-bot-plugin-native-distribution-and-host-probe.md:22` is frozen as the R2 id set. A P1/P2 need for another id is a schema addition (version bump), not an open-ended id space; the reader drops unknown ids so an older CLI never fails on a newer receipt.
- **CLOSED — untrusted-input posture.** The receipt is Bot-written data: parse with a validating schema, strip unknown keys, cap file size and value length, reject duplicate ids, and never echo raw file content in an error. A receipt carrying instruction-like text is data, not instructions to the operator or the agent.
- **CLOSED — skill packaged in cc.** `plugins/cc/skills/grok-bot-probe/` with `name: grok-bot-probe`, installed as `cc-grok-bot-probe` by the existing plugin-prefix mapper (`packages/core/src/mapper.ts:115-125`) — the same route as the shipped `cc-grok-bot-register` (`docs/04_DESIGN.md:66-69`).
- **DEFERRED — plugin emission and `requires:` (feature P1/P2).** Both need this receipt as input but neither is implemented here. Condition to unblock P1's "mode becomes primary": a receipt whose `plugin-install` entry is `observed` with a git-URL or local-dir route.
- **DEFERRED — cross-host receipt aggregation.** One receipt per host root; multi-Bot comparison is out of scope with no owner.

### Design

**WHAT.** Two artifacts: a Bot-side probe skill that produces one JSON receipt, and a CLI-side reader that reports it inside the existing doctor report. Nothing else changes shape — no new command, no new dependency (`zod` is already a core dependency, `packages/core/src/marketplace.ts:3`).

**WHERE.** New `packages/core/src/operations/grok-bot-probe.ts`, re-exported from `packages/core/src/index.ts` beside `export * from './operations/grok-bot'` (`packages/core/src/index.ts:25`). The schema lives in core, not in `apps/cli`, because the doctor command (`apps/cli/src/commands/doctor.ts`) and any later consumer (feature P1 emission readback) must share one parser. New `plugins/cc/skills/grok-bot-probe/SKILL.md`. Edits: `packages/core/src/operations/grok-bot.ts` (report field + inspect wiring), `apps/cli/src/commands/doctor.ts` (flag, text lines), `plugins/cc/README.md`, `docs/04_DESIGN.md`, `docs/03_ARCHITECTURE.md`, `docs/00_ADR.md`.

**Frozen names** (implemented verbatim; no synonyms):

| Kind | Name / value |
| --- | --- |
| constants | `GROK_BOT_PROBE_SCHEMA_VERSION = 1`, `GROK_BOT_PROBE_KIND = 'superskill.grok-bot.probe'`, `GROK_BOT_PROBE_STALE_DAYS = 30`, `GROK_BOT_PROBE_MAX_BYTES = 65536`, `GROK_BOT_PROBE_MAX_VALUE_CHARS = 200` |
| capability ids (`GrokBotProbeCapabilityId`) | `host-os-arch`, `host-home`, `sand-env`, `sand-roots`, `skill-save`, `plugin-install`, `runtime-persistence`, `mcp-command` — exported as `GROK_BOT_PROBE_CAPABILITY_IDS` (const array, union derived from it) |
| status / state | `GrokBotProbeStatus = 'observed' \| 'absent' \| 'unverified'`; `GrokBotProbeReceiptState = 'missing' \| 'invalid' \| 'stale' \| 'valid'` |
| DTOs | `GrokBotProbeEntry { id; status; value: string \| string[] \| null; evidence: string \| null }`; `GrokBotProbeReceipt { schemaVersion; kind; generatedAt; capabilities: GrokBotProbeEntry[] }`; `GrokBotProbeReport { state; path: string \| null; generatedAt: string \| null; entries: GrokBotProbeEntry[]; missingIds: GrokBotProbeCapabilityId[]; problem: string \| null }` |
| functions | `grokBotProbeReceiptPath(dataRoot: string): string` → `<dataRoot>/.superskill/grok-bot/probe/receipt.json`; `readGrokBotProbeReceipt(input: { path: string \| null; now?: Date }): GrokBotProbeReport` |
| doctor field | `GrokBotDoctorReport.capabilities: GrokBotProbeReport` (always present, additive); `inspectGrokBotTarget` gains optional `receiptPath?: string` and `now?: Date` |
| CLI flag | `--receipt <path>` on `superskill doctor` |

**Reader precedence** (`readGrokBotProbeReceipt`, never throws). `path === null` → `missing`, `path: null`, empty `entries`/`missingIds`. Otherwise, in order: stat fails or is not a regular file → `missing`; size > `GROK_BOT_PROBE_MAX_BYTES` → `invalid`; `JSON.parse` throws → `invalid`; schema fails → `invalid`; all pass → `valid`, then `stale` when `now - generatedAt > 30d`. `invalid` carries a static `problem` string (e.g. `duplicate capability id: skill-save`) that never embeds file content beyond a known id. `entries` keeps the eight-id order from `GROK_BOT_PROBE_CAPABILITY_IDS` regardless of receipt order, unknown ids are dropped, and `missingIds` lists ids the receipt did not report. `generatedAt` in the report is the parsed ISO string on `valid`/`stale` and `null` otherwise.

**Doctor wiring.** `inspectGrokBotTarget` fills `capabilities` from `readGrokBotProbeReceipt({ path: options.receiptPath ?? (resolution?.dataRoot ? grokBotProbeReceiptPath(resolution.dataRoot) : null), now: options.now })` and leaves every existing field byte-identical. The CLI passes `--receipt` through as an already-resolved absolute path (resolve against `process.cwd()` in `apps/cli/src/commands/doctor.ts`, before the report call). Text output is appended after the existing slash-registry lines: `grok-bot: probe receipt: <state> — <path>` (with `(<generatedAt>, stale)` on stale, and `— <problem>` on invalid), then one `grok-bot: probe <id>: <status>` line per entry (` = <value>` appended when `value !== null`; arrays joined with `, `), then `grok-bot: probe not reported: <ids>` only when non-empty, then one guidance line naming `<dataRoot>/workflows/cc-grok-bot-probe/SKILL.md` (omitted when no root resolves). `--json` is the report object as-is; `capabilities` is the only new key.

**Skill contract (`plugins/cc/skills/grok-bot-probe/SKILL.md`).** Frontmatter `name: grok-bot-probe` + a description with the probe triggers (`probe this Bot host`, `capture host capabilities`, `produce the grok-bot receipt`), matching the shipped register skill's shape and length budget. Body: purpose (one receipt, honest statuses), bootstrap (a human pastes "read and follow `<dataRoot>/workflows/cc-grok-bot-probe/SKILL.md`" — no `/` command is claimed), the eight probes each with the permitted read-only action and the exact rule for `observed` / `absent` / `unverified`, the sanitization rules (env **names** only — never values; home path only; no token, cookie or key material in any field; truncate to the 200-character value cap), the single-file write rule (create the parent directory, write `receipt.json`, nothing else — no install, no registration, no `update_state` write, no network), a self-check (re-read and confirm the JSON parses and lists eight ids), and the closing report the Bot gives the human. Non-goals section explicitly forbids: installing or registering anything, writing outside the receipt, deleting files, inventing capability results, and echoing secrets.

**Invariants.** (1) Receipt state never affects `available`, human output for existing lines, or exit codes — `report.available` stays derived from root/catalog health alone (`packages/core/src/operations/grok-bot.ts:977-1088`). (2) The reader holds no state and writes nothing. (3) `GROK_BOT_PROBE_CAPABILITY_IDS` is the only source of truth; the skill text is a mirror checked by a test, never a second definition in code. (4) A receipt is data — parsed, validated, length-capped — and its strings are printed, never executed or obeyed.

**Anti-patterns (do not implement).** A `superskill probe` command, or the CLI trying to inspect a remote/SSH Bot; a strict-reject schema that fails the whole doctor run on a newer receipt (unknown keys/ids must degrade, not throw); synthesizing `unverified` entries for ids the receipt omits; putting the schema in `apps/cli`; letting a malformed receipt change the exit code "because the install looks wrong"; copying the register-handoff transaction machinery — the receipt is a 400-byte file, not a transactional emission.

**Handoff to dependent work.** 0161 (Cursor-plugin emission) already declares `dependencies: ['0160']` and consumes `plugin-install` (`observed` + route string) and `skill-save` (`observed` + tool name/schema) as its switch condition; 0162 (`requires:` filtering, then 0163) consumes `runtime-persistence` and `mcp-command`; 0164 aggregates the doc sweep. None is a dependency of this task (`dependencies[]` stays empty), none may change this schema without a version bump, and this task must not pre-implement their halves.

### Plan

- [x] 1. Add `packages/core/src/operations/grok-bot-probe.ts`: the frozen constants, id union, zod schema for schema-v1, and the never-throwing `readGrokBotProbeReceipt` implementing the precedence, ordering, stripping, caps and `missingIds` rules (R3; AC2).
- [x] 2. Export `./operations/grok-bot-probe` from `packages/core/src/index.ts` beside the existing `operations/grok-bot` export, and add `capabilities: GrokBotProbeReport` to `GrokBotDoctorReport` with `receiptPath`/`now` options on `inspectGrokBotTarget` — defaulting the path from the resolved Sand root (R3, R4; AC2).
- [x] 3. Add `--receipt <path>` to `superskill doctor` in `apps/cli/src/commands/doctor.ts`, resolve it against the invocation directory, and append the text header/entry/not-reported/guidance lines; leave every existing print and the `process.exit(report.available ? 0 : 1)` logic untouched (R4, R5; AC3, AC4).
- [x] 4. Author `plugins/cc/skills/grok-bot-probe/SKILL.md`: frontmatter plus purpose, bootstrap, the eight probes with exact status rules, sanitization, single-file write rule, self-check, closing report, and non-goals (R1, R2; AC1). Keep every path citation resolvable for `skill-citations-resolve` (`.spur/rules/quality/skill-citations.yaml`).
- [x] 5. Tests, behavior-first and without mocking the code under test: `packages/core/tests/operations/grok-bot-probe.test.ts` for valid/stale/missing/invalid matrices against real temp files with an injected `now`, ordering, unknown-id/unknown-key stripping, `missingIds`, and the 64 KiB / 200-character / duplicate-id caps (AC2); extend `apps/cli/tests/commands/doctor.test.ts` using its existing `runDoctor` harness (`apps/cli/tests/commands/doctor.test.ts:10-35`) for text and `--json` on all four states, the default path under `SAND_DATA`, the `--receipt` override, and unchanged 0/1/2 exits (AC3, AC4); add an id-parity assertion that `plugins/cc/skills/grok-bot-probe/SKILL.md` names each of `GROK_BOT_PROBE_CAPABILITY_IDS` (AC5).
- [x] 6. Sync owning docs: `docs/04_DESIGN.md` (doctor signature row + probe receipt subsection with the schema and text shapes), `docs/00_ADR.md` (dated ADR-036 amendment: doctor reads an operator-supplied receipt; exit semantics unchanged), `docs/03_ARCHITECTURE.md` (`operations/grok-bot-probe.ts` row + the receipt data flow), `plugins/cc/README.md` (skill count 8 → 9, layout entry, inventory row) (R6; AC5).
- [x] 7. Run `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`, and inspect `git status` for only intentional changes. The new SKILL.md must pass the citation gate; `spur-check`'s `skill-citations-resolve` and coverage rules are the acceptance evidence (R6; AC5).

### Solution

# Task 0160 — Solution

- **Reader (new, `packages/core/src/operations/grok-bot-probe.ts:125`, id table :37, view :70, path :80).** Zod
  schema-version-1 reader `readGrokBotProbeReceipt(options)`: state
  `missing` (path does not resolve / file absent), `invalid` (size > 64 KiB,
  non-JSON, schema mismatch, duplicate id), `stale` (`generatedAt` older than
  `GROK_BOT_PROBE_STALE_DAYS`), `valid`. Untrusted-input posture on the
  Bot-written file: sanitized entries in canonical id order
  (`GROK_BOT_PROBE_CAPABILITY_IDS`, SSOT list of the eight D1 P0 ids), unknown
  ids dropped, unknown keys stripped, `value`/`evidence` strings truncated to
  200 chars (`GROK_BOT_PROBE_MAX_VALUE_CHARS`), `missingIds` reported, never
  throws, never echoes raw content. Staleness uses an injectable `now` clock
  defaulting to real time.
- **Wiring (additive, `packages/core/src/operations/grok-bot.ts:942` field, `:983` helper).** `GrokBotDoctorReport` gains one optional field
  `capabilities: GrokBotProbeReport`; `inspectGrokBotTarget(dataRoot, options)`
  populates it when a dataRoot resolves. It never affects `available`,
  problems, or doctor exit codes. `--receipt <path>` overrides the Sand-root
  default (`<dataRoot>/.superskill/grok-bot/probe/receipt.json`,
  `grokBotProbeReceiptPath`); receipt read failures degrade to `problem`
  strings, never thrown.
- **CLI (`apps/cli/src/commands/doctor.ts:18` print, `:72` flag).** New `--receipt` option;
  `printCapabilities` appends lines after the slash-registry section:
  `probe receipt: <state> — <path>` (with `(<generatedAt>, stale)` when stale,
  `— <problem>` when invalid), one `probe <id>: <status> = <value-or-v>` line
  per reported entry, `probe not reported: <ids>` when any of the eight are
  missing, and a `probe guidance:` line pointing the operator at
  `<dataRoot>/workflows/cc-grok-bot-probe/SKILL.md`. Exit codes unchanged.
- **Skill (new, `plugins/cc/skills/grok-bot-probe/SKILL.md`).** Bot-dialect
  frontmatter (`name`/`description` with the trigger phrases); bootstrap prompt;
  the eight-capability table with exact human command steps and status rules
  (`observed`/`absent`/`unverified`); sanitization rules (no secret echo,
  truncation); a write step (create parent dir, write one JSON file, atomic
  ensemble: receipt + no other writes) with a single retry and explicit stop
  guidelines; a compact valid-receipt example; closing report template; non-goals
  (read-only, no install, no network). Each capability id appears exactly once
  (verified by an id-parity test, below). Name: `grok-bot-probe` (mapped to
  installed id `cc-grok-bot-probe` on grok-bot installs by the existing
  machinery).
- **Docs.** `04_DESIGN.md` doctor row gains `--receipt` + a §Probe-receipt
  subsection (schema v1 + states + human lines); `03_ARCHITECTURE.md` module
  row for `grok-bot-probe.ts`; `00_ADR.md` ADR-036 amendment (CLI reads a
  receipt, never probes a host; receipt state never changes exit codes);
  `plugins/cc/README.md` skills count 8→9 + layout/inventory rows.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | plugins/cc/skills/grok-bot-probe/SKILL.md:2 (name), :33 (unverified-not-inferred rule), :103 (Non-goals: no install, registration, network actions); id-parity test packages/core/tests/operations/grok-bot-probe.test.ts:151 pins every id exactly once |
| R2 | MET | packages/core/src/operations/grok-bot-probe.ts:15-49 (schema version/kind/frozen id list/status type); docs/04_DESIGN.md:258-268 (probe-receipt contract section) |
| R3 | MET | packages/core/src/operations/grok-bot-probe.ts:80 (path helper), :125 (reader), tests packages/core/tests/operations/grok-bot-probe.test.ts:53-114 (AC2 matrix incl. 201-char value, 64KiB+1, symlink, duplicate id); barrel export packages/core/src/index.ts:26 |
| R4 | MET | apps/cli/src/commands/doctor.ts:18 (printCapabilities), :72 (--receipt flag), :96 (report wiring), packages/core/src/operations/grok-bot.ts:1026-1118 (capabilities field wiring); doctor tests apps/cli/tests/commands/doctor.test.ts:145 |
| R5 | MET | regressions in apps/cli/tests/commands/doctor.test.ts:39 (exit 0/1/2 matrix) run against the new build; exit logic untouched (commit 717eb5a diff: doctor.ts additive only) |
| R6 | MET | docs/04_DESIGN.md:255 (doctor `--receipt`), :258 (probe-receipt section), docs/00_ADR.md:751 (ADR-036 amendment 2026-11-04), docs/03_ARCHITECTURE.md:169 (grok-bot-probe module row), plugins/cc/README.md:38 (9 skills); verification below |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| R1 — Probe captures live host capability without mutation (R1) | MET | test | packages/core/tests/operations/grok-bot-probe.test.ts:151 (id-parity: each id appears exactly once in SKILL.md); plugins/cc/skills/grok-bot-probe/SKILL.md:33,103 |
| R2 — Doctor reports probe evidence honestly (R2) | MET | test | packages/core/tests/operations/grok-bot-probe.test.ts:28-142 — truncated JSON, wrong schemaVersion, wrong kind, non-ISO generatedAt, duplicate id, 201-char value, 64KiB+1, directory/symlink, absent path → missing with path set, omitted ids → missingIds; stale via injected clock |
| AC3 | MET | test | apps/cli/tests/commands/doctor.test.ts:145 (JSON shape state/path/generatedAt/entries/missingIds/problem; human lines; guidance line naming <dataRoot>/workflows/cc-grok-bot-probe/SKILL.md) |
| AC4 | MET | test | packages/core/src/operations/grok-bot.ts:1026-1118 — capabilities built additively and only when --targets grok-bot doctor runs; doctor exit 0/1/2 logic untouched (apps/cli/src/commands/doctor.ts:91-99, unchanged in commit 717eb5a) |
| AC5 | MET | test | packages/core/tests/operations/grok-bot-probe.test.ts:96,140 (200-char cap, static problem strings echo no file content); reader strips unknown ids/keys before any output |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

#### Functional traceability (sp-functional-review)

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | plugins/cc/skills/grok-bot-probe/SKILL.md:2 (name), :33 (unverified-not-inferred rule), :103 (Non-goals: no install, registration, network actions); id-parity test packages/core/tests/operations/grok-bot-probe.test.ts:151 pins every id exactly once |
| R2 | MET | packages/core/src/operations/grok-bot-probe.ts:15-49 (schema version/kind/frozen id list/status type); docs/04_DESIGN.md:258-268 (probe-receipt contract section) |
| R3 | MET | packages/core/src/operations/grok-bot-probe.ts:80 (path helper), :125 (reader), tests packages/core/tests/operations/grok-bot-probe.test.ts:53-114 (AC2 matrix incl. 201-char value, 64KiB+1, symlink, duplicate id); barrel export packages/core/src/index.ts:26 |
| R4 | MET | apps/cli/src/commands/doctor.ts:18 (printCapabilities), :72 (--receipt flag), :96 (report wiring), packages/core/src/operations/grok-bot.ts:1026-1118 (capabilities field wiring); doctor tests apps/cli/tests/commands/doctor.test.ts:145 |
| R5 | MET | regressions in apps/cli/tests/commands/doctor.test.ts:39 (exit 0/1/2 matrix) run against the new build; exit logic untouched (commit 717eb5a diff: doctor.ts additive only) |
| R6 | MET | docs/04_DESIGN.md:255 (doctor `--receipt`), :258 (probe-receipt section), docs/00_ADR.md:751 (ADR-036 amendment 2026-11-04), docs/03_ARCHITECTURE.md:169 (grok-bot-probe module row), plugins/cc/README.md:38 (9 skills); verification below |

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| AC1 | MET | test | packages/core/tests/operations/grok-bot-probe.test.ts:151 (id-parity: each id appears exactly once in SKILL.md); plugins/cc/skills/grok-bot-probe/SKILL.md:33,103 |
| AC2 | MET | test | packages/core/tests/operations/grok-bot-probe.test.ts:28-142 — truncated JSON, wrong schemaVersion, wrong kind, non-ISO generatedAt, duplicate id, 201-char value, 64KiB+1, directory/symlink, absent path → missing with path set, omitted ids → missingIds; stale via injected clock |
| AC3 | MET | test | apps/cli/tests/commands/doctor.test.ts:145 (JSON shape state/path/generatedAt/entries/missingIds/problem; human lines; guidance line naming <dataRoot>/workflows/cc-grok-bot-probe/SKILL.md) |
| AC4 | MET | test | packages/core/src/operations/grok-bot.ts:1026-1118 — capabilities built additively and only when --targets grok-bot doctor runs; doctor exit 0/1/2 logic untouched (apps/cli/src/commands/doctor.ts:91-99, unchanged in commit 717eb5a) |
| AC5 | MET | test | packages/core/tests/operations/grok-bot-probe.test.ts:96,140 (200-char cap, static problem strings echo no file content); reader strips unknown ids/keys before any output |

#### SECUA quality (sp-code-verification review)

- Security: reader bounds input (64 KiB, 200 chars, unknown-key strip) before any echo; no raw
  content in problem strings; doctor never probes a host (ADR-036 amendment). MET.
- Correctness: reader never throws (stat failures caught); stale decided on the injected clock.
  MET.
- Maintainability: types + zod schema colocated in one module, re-exported from the barrel; test
  naming ties assertions to the AC matrix. MET.

#### Architecture depth (sp-code-improvement)

- The receipt reader is a self-contained core operation with no CLI-owned probing — the
  Bot-produces/CLI-consumes boundary is explicit and matches ADR-036 without widening it.
- No speculative abstraction: the capability field is additive-only on the doctor report,
  future receipt versions bump one constant. No refactor needed.

#### Verification commands

- `bun run test` — 2694 pass / 0 fail across 130 files (task worktree, commit 717eb5a).
- `bunx tsc --noEmit` in packages/core and apps/cli — both exit 0 (PATH-level tsc gap pre-exists
  on this host at main; documented in .spur/run/0160-testing.md).
- `bun run build` — succeeds; `bun run test-pre-check` 42 rules, `bun run test-post-check` 3
  rules (incl. skill-citations) all pass.

Confidence: HIGH

| Priority | Finding | Location | Disposition |
| --- | --- | --- | --- |
| P4 | wrap residual — none | — | closed |

Verdict: PASS

Remediate delta (commit 25548b1): lint/style/useTemplate fix in packages/core/tests/operations/grok-bot-probe.test.ts:103-104; gates re-run green (gate recheck PASS, 2694 tests / 0 fail).

Open P1-P3 findings: none. Wrap residual (P4, non-blocking): none.

### References

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History

- 2026-11-04T23:01:08.029Z backlog → todo (system)
- 2026-11-04T23:03:28.070Z feature_id J → D1 (system)
- 2026-11-04T23:49:43.357Z todo → wip (system)
- 2026-11-05T00:19:42.355Z wip → testing (system)
- 2026-11-05T00:22:27.039Z testing → done (system)
- 2026-11-05T09:35:37.514Z done → testing (system)
- 2026-11-05T09:36:02.371Z testing → done (system)

