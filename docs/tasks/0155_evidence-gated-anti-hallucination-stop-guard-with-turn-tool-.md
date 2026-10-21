---
schema_version: 1
name: Evidence-gated anti-hallucination Stop guard with turn tool evidence
status: done
template: feature-impl
created_at: 2026-10-21T18:20:05.471Z
updated_at: "2026-10-21T19:49:55.329Z"
feature_id: H21
priority: P1
tags:
  - anti-hallucination
  - hooks
  - cc
estimate_hours: 7

done_forced: "false"
done_reason: unforced close; PASS artifact at .spur/memory/evidence/0155-verdict.json
---

## 0155. Evidence-gated anti-hallucination Stop guard with turn tool evidence

### Background

Feature H21 (under H2 — cc plugin guard/contract integrity). The cc Stop guard blocks mostly on a missing confidence label: in local Claude Code transcripts (sampled 2026-10-21), 79 of 117 distinct feedback reasons were "confidence level only", and every block injects a visible extra model turn. A reply that already cites a URL or `path:line` is still blocked for lacking `Confidence: HIGH|MEDIUM|LOW` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:447-501`).

Design satellite: `docs/design/quiet-guard-and-plugin-magents.md` (Track A). Decision: ADR-040 (Proposed; 0157 flips it to Accepted).

Implements H21: R1 — Guard stays silent on a cited reply that lacks a confidence label; R2 — Guard stays silent when the current turn used a verification tool; R3 — Guard blocks an external claim with no evidence of any kind; R4 — Confidence label and uncertainty phrases never block on their own; R5 — Turn evidence ignores tool calls from earlier turns; R6 — Guard falls back to text-only evidence when no transcript is available; R7 — Block reason carries a versioned machine tag and a terse instruction; R9 — Replay over recorded transcripts shows the block rate drop; R10 — Loop guard and malformed payloads stay silent.

### Requirements

- [x] R1. `verifyAntiHallucinationProtocol(text, turnTools = [])` returns `ok:false` **iff** `requiresExternalVerification(text)` ∧ ¬`hasSourceCitations(text)` ∧ ¬`hasTurnToolEvidence(turnTools)`. `requiresExternalVerification`, `hasSourceCitations` and the <50-char floor stay byte-identical.
- [x] R2. `hasConfidenceLevel`, `hasRedFlags` and `hasToolUsageEvidence` no longer influence the decision (keep the exports; they are tested and used by docs/skills).
- [x] R3. New `extractTurnToolNames(jsonl: string): string[]` returns the `tool_use` names of the **current turn** of a Claude Code transcript:
  - boundary = the last line with `type:"user"`, `isMeta !== true`, `isSidechain !== true`, whose `message.content` is a non-blank string or contains at least one non-`tool_result` part;
  - collect `tool_use` parts from `type:"assistant"`, `isSidechain !== true` lines after the boundary;
  - an `Agent`/`Task` tool_use whose `input.subagent_type === "web-fetch"` is reported as `WebFetch`;
  - unparseable lines are skipped; no boundary found ⇒ `[]` (never credit the whole tail).
- [x] R4. `hasTurnToolEvidence(names)` is true when any name is `WebFetch` or `WebSearch` or starts with `mcp__ref__`, `mcp__grep__` or `mcp__brave-search__` (one exported constant `VERIFICATION_TOOL_PREFIXES`).
- [x] R5. `resolveStopContext` returns `turnTools` whenever the stdin payload carries a string `transcript_path` — including when `last_assistant_message` supplies the content. A transcript read/parse failure yields `turnTools: []` and must not change `content` or `allowReason` (the existing `transcript unavailable` allow applies only when the transcript is the content source). `ARGUMENTS`, `messages`/`last_message` channels yield `turnTools: []`.
- [x] R6. `runStopGuard` passes `resolved.turnTools ?? []` into the verifier; always exit 0; stdout `{}` on allow; nothing on stderr.
- [x] R7. Block reason is the exported constant `BLOCK_REASON_V1`, starting with `[anti-hallucination/v1]`, ≤ 240 chars, instructing: reply only with the source (URL or `path:line`) or `UNVERIFIED: <claim>`, max 3 lines, no acknowledgement. `issues` = `['source citations for API/library claims']`. Export `HOOK_FEEDBACK_TAG = '[anti-hallucination/v1]'` (0157 asserts rule/magent quote it).
- [x] R8. `validate_response.mjs` is regenerated from source (`bun run build:scripts`), never hand-edited.
- [x] R9. `scripts/ah-replay.ts` replays recorded Claude Code transcripts and prints JSON `{files, oldBlocks, newBlocks, reductionPct, oldReasonHistogram, remaining:[{file, line, excerpt}]}` (see Design).

### Acceptance Criteria

- [x] AC1 — Guard stays silent on a cited reply that lacks a confidence label
- [x] AC2 — Guard stays silent when the current turn used a verification tool
- [x] AC3 — Guard blocks an external claim with no evidence of any kind
- [x] AC4 — Confidence label and uncertainty phrases never block on their own
- [x] AC5 — Turn evidence ignores tool calls from earlier turns
- [x] AC6 — Guard falls back to text-only evidence when no transcript is available
- [x] AC7 — Block reason carries a versioned machine tag and a terse instruction
- [x] AC9 — Replay over recorded transcripts shows the block rate drop
- [x] AC10 — Loop guard and malformed payloads stay silent

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-10-21T18:35:26.691Z

- **Text mention of a tool name ("I ran WebSearch") — evidence?** No. Only a `tool_use` in the current turn or a citation in the text counts; a mention is a claim, not proof. `hasToolUsageEvidence` stays exported but unused by the decision.
- **Which hosts get turn tool evidence?** Claude Code only (JSONL `type`/`message.content[].type=="tool_use"` shape). Codex rollout transcripts, Pi `llmMessages`, omp `messages` and Gemini get `[]` ⇒ text-only, identical strictness to today minus the label rule. Deferred until a host needs it.
- **Old-policy replay without keeping old code?** Yes: every recorded `isMeta:true` user entry starting `Stop hook feedback:` is an old-policy block. New policy is a strict subset of old (new block ⇒ ¬sources ⇒ old block), so replaying only those entries counts every new block.
- **LLM judge / spur gate?** Deferred (H21 Out of scope). Zero tokens, zero network per Stop is an invariant here.
- **Is the replay corpus in CI?** No — it lives in `~/.claude/projects`. CI covers the replay logic with committed fixtures; the real-corpus numbers go into this task's Testing section.

### Design

**Single owner:** all policy lives in `plugins/cc/scripts/anti-hallucination/ah_guard.ts`. Adapters (`apps/cli/src/commands/hook-run.ts:415`, `pi-stop.ts:33`, `validate_response.ts:32`, `main()`) are unchanged — the new parameter defaults to `[]`.

**Changes in `ah_guard.ts`:**
| Where | Change |
| --- | --- |
| near `TOOL_PATTERNS` (`:78`) | add `export const VERIFICATION_TOOL_PREFIXES = ['mcp__ref__', 'mcp__grep__', 'mcp__brave-search__'] as const;` and `export const HOOK_FEEDBACK_TAG = '[anti-hallucination/v1]';` and `export const BLOCK_REASON_V1 = \`${HOOK_FEEDBACK_TAG} Uncited external claim. Reply only with its source (URL or path:line) or "UNVERIFIED: <claim>" — max 3 lines, no acknowledgement.\`;` |
| after `extractLastAssistantFromTranscript` (`:207`) | `export function extractTurnToolNames(jsonl: string): string[]` (R3) and `export function hasTurnToolEvidence(names: readonly string[]): boolean` (R4) |
| `ResolvedStopContext` (`:226`) | add `turnTools?: string[]` |
| `resolveStopContext` (`:272-323`) | compute `turnTools` once from `transcript_path` (try/catch ⇒ `[]`) before the `last_assistant_message` branch; attach it to the returned object on the `last_assistant_message` and `transcript_path` branches. Reuse the one transcript string for both content and tools (single read). |
| `verifyAntiHallucinationProtocol` (`:447-501`) | signature `(text: string, turnTools: readonly string[] = [])`; after `needsVerification`, `if (hasSourceCitations(text) \|\| hasTurnToolEvidence(turnTools)) return { ok: true, reason: 'Task is complete (evidence present)' };` else `return { ok: false, reason: BLOCK_REASON_V1, issues: ['source citations for API/library claims'] };` Delete the confidence/red-flag branches. |
| `runStopGuard` (`:528`) | `verifyAntiHallucinationProtocol(resolved.content, resolved.turnTools ?? [])` |

**Turn boundary sketch (R3):**
```ts
const entries = jsonl.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
let start = -1;
for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.type !== 'user' || e.isMeta === true || e.isSidechain === true) continue;
    const c = e.message?.content;
    if ((typeof c === 'string' && c.trim()) || (Array.isArray(c) && c.some((p) => p?.type !== 'tool_result'))) { start = i; break; }
}
if (start === -1) return [];
// collect tool_use names from assistant, non-sidechain entries after start; map Agent/Task + subagent_type 'web-fetch' → 'WebFetch'
```
Verified transcript shapes (2026-10-21, local Claude Code JSONL): tool calls are `{type:"assistant", message:{content:[{type:"tool_use", name, input}]}}`; tool results are `{type:"user", message:{content:[{type:"tool_result",…}]}}`; guard feedback is `{type:"user", isMeta:true, message:{content:"Stop hook feedback:\n<reason>"}}`.

**Replay script `scripts/ah-replay.ts` (repo tooling, not shipped in the plugin):**
- `bun scripts/ah-replay.ts [root=~/.claude/projects]` walks `**/*.jsonl` (skip `subagents/`), reads each file whole (dev tool, no cap).
- For each line `i` that is `type:"user"`, `isMeta:true`, string content starting `Stop hook feedback:`: `oldBlocks++`; bucket the reason text after `Add verification for: ` into the histogram (`confidence only`, `sources+confidence`, …; key = sorted issue heads); take prefix lines `[0, i)`, `text = extractLastAssistantFromTranscript(prefix)`, `tools = extractTurnToolNames(prefix)`; if `!verifyAntiHallucinationProtocol(text, tools).ok` ⇒ `newBlocks++` and push `{file, line: i+1, excerpt: text.slice(0, 160)}`.
- Export a pure `replayTranscript(jsonl: string): {oldBlocks; newBlocks; remaining; histogram}` for tests; `import.meta.main` wrapper does I/O and prints JSON via `process.stdout.write`.

**Invariants:** exit 0 always; ADR-020 fail-open; no model/network call; residual-proof fixtures for `requiresExternalVerification` (0077/0079/0105/0147) keep passing unchanged.

**Rejected:** LLM-judge Stop hook (Claude-only; latency + tokens on every Stop); protocol-only fix (every block still spawns a turn); crediting text mentions of tool names (unverifiable).

### Plan

1. [ ] **Tests first** in `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` — new `describe('H21 evidence policy')` block, one `it` per AC:
   - AC1: `runStopGuard(undefined, JSON.stringify({last_assistant_message: 'The API returns a list of users, see src/client.ts:42 for the call site.'}))` ⇒ output `{}`.
   - AC2: temp JSONL [user prompt, assistant tool_use WebFetch, user tool_result, assistant text "Version 2.3.0 deprecates the endpoint."] + payload `{last_assistant_message, transcript_path}` ⇒ `{}`. Repeat with `Agent` + `input.subagent_type:'web-fetch'` and with `mcp__ref__ref_read_url`.
   - AC3: `last_assistant_message: 'The library requires Node 22 for this feature to work.'`, transcript with no tool_use ⇒ `decision:"block"`.
   - AC4 (residual-proof — carries every old trigger half): `'The API returns a list — src/client.ts:42. I think it also paginates.'` and `'The library probably supports OAuth, per https://example.com/docs.'` ⇒ both `ok:true`.
   - AC5: JSONL [user prompt A, assistant WebSearch, user tool_result, assistant text, user prompt B, assistant uncited claim] ⇒ `extractTurnToolNames` is `[]` and decision block. Also: an `isMeta:true` "Stop hook feedback" user entry after a WebFetch does **not** reset the turn (tool still credited).
   - AC6: payload with `last_assistant_message` (cited) + `transcript_path: '/nonexistent.jsonl'` ⇒ `{}`; directory path and oversized (`readTranscriptForStop(path, 16)`) ⇒ no throw, `turnTools: []`; spy `process.stderr.write` not called.
   - AC7: blocked `reason === BLOCK_REASON_V1`, `startsWith(HOOK_FEEDBACK_TAG)`, `length <= 240`, contains `UNVERIFIED:`.
   - AC10: `stop_hook_active:true`, `'not json'`, `''` ⇒ `{}`, stderr spy untouched.
2. [ ] Update the old-policy assertions (they encode the superseded ADR-015 label rule; flip to the new contract, don't delete coverage): `ah_guard.test.ts:318-321`, `:357`, `:1052`; `ah_guard-uncertainty.test.ts:58-131` (uncertainty/confidence no longer reported issues — assert cited+uncertain ⇒ allow, uncited ⇒ block with the single source issue). Keep `hasConfidenceLevel`/`hasRedFlags` unit tests (`:102`, `:158`) as-is.
3. [ ] Implement per Design table in `ah_guard.ts`; run `bun test plugins/cc/scripts/anti-hallucination`.
4. [ ] `bun run build:scripts` to regenerate `validate_response.mjs`; `validate_response.test.ts` must stay green (its uncited claim still exits 1).
5. [ ] Write `scripts/ah-replay.ts` + `scripts/tests/ah-replay.test.ts` (fixture JSONL with 3 feedback entries: one cited-but-unlabelled ⇒ not a new block, one with WebFetch in turn ⇒ not a new block, one uncited ⇒ new block; assert counts and histogram).
6. [ ] Run `bun scripts/ah-replay.ts` on the real corpus; AC9 passes when `reductionPct >= 80`. Paste the JSON summary (without excerpts) into Testing; eyeball `remaining` excerpts and note any that look like false positives.
7. [ ] Live probe: `echo '{"last_assistant_message":"The API returns a list, see src/a.ts:3."}' | bun apps/cli/src/index.ts hook run cc anti-hallucination` ⇒ `{}`.
8. [ ] Gates: `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`. Update `.spur/context/anatomy.md` for `scripts/ah-replay.ts`.

Do **not** edit: docs (0157 owns ADR-040/04_DESIGN/skill docs), `hooks.json`, `hook-run.ts`, `vendors/`.

### Solution

Policy lives in one file — `plugins/cc/scripts/anti-hallucination/ah_guard.ts`. Adapters
(`apps/cli/src/commands/hook-run.ts:415`, `plugins/cc/scripts/anti-hallucination/pi-stop.ts:33`, `plugins/cc/scripts/anti-hallucination/validate_response.ts:32`, `main()`)
are untouched: the new parameter defaults to `[]`, so every host keeps its existing call shape.

| Where | Change |
| --- | --- |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:80-94` | `VERIFICATION_TOOL_PREFIXES`, `HOOK_FEEDBACK_TAG`, `BLOCK_REASON_V1` exported beside `TOOL_PATTERNS`. The 164-char reason is the only block reason left, so a host can pattern-match a version. |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:236-322` | `isTurnBoundary` / `extractTurnToolNames` / `hasTurnToolEvidence`. Boundary = last real user prompt (`isMeta`/`isSidechain` excluded, a `tool_result`-only user entry is the host echoing a result, not a turn). An `Agent`/`Task` call with `subagent_type: 'web-fetch'` is reported as `WebFetch`. No boundary ⇒ `[]`, never the whole tail. |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:324-330` | `ResolvedStopContext.turnTools`. |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:376-406` | `resolveStopContext` reads the transcript **once** when the payload names one, and `turnTools` is attached on both the `last_assistant_message` and `transcript_path` branches. A read/parse failure leaves `turnTools: []` without touching `content`/`allowReason`, so the `transcript unavailable` allow still applies only when the transcript was the content source. |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:566-597` | `verifyAntiHallucinationProtocol(text, turnTools = [])` — block iff external claim ∧ ¬text citation ∧ ¬turn tool evidence. The confidence and red-flag branches are gone; `hasConfidenceLevel` / `hasRedFlags` / `hasToolUsageEvidence` stay exported for the docs and skills that describe the recommended prose. |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:641` | `runStopGuard` passes `resolved.turnTools ?? []`. |

Regenerated, not hand-edited: `validate_response.mjs` via `bun run build:scripts`. New repo tooling:
`scripts/ah-replay.ts` (pure `replayTranscript` + `replayCorpus`, `import.meta.main` printer) with
`scripts/tests/ah-replay.test.ts`.

Three behaviours worth knowing: a tool name *mentioned* in the reply is a claim, not evidence
(`hasToolUsageEvidence` is no longer consulted); only Claude Code JSONL yields turn evidence
(Codex/Pi/omp/Gemini get `[]` ⇒ text-only, identical strictness to before minus the label rule);
and the guard still exits 0 with a `decision` JSON on every path (ADR-020 fail-open).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | plugins/cc/scripts/anti-hallucination/ah_guard.ts:576 — block iff `requiresExternalVerification` ∧ ¬`hasSourceCitations` ∧ ¬`hasTurnToolEvidence`; the <50-char floor and both recognizers are unchanged from pre-H21 |
| R2 | MET | ah_guard.ts:586-596 — no confidence or red-flag branch remains; `hasConfidenceLevel`/`hasRedFlags`/`hasToolUsageEvidence` stay exported (ah_guard.ts:466,479,491) and still unit-tested |
| R3 | MET | ah_guard.ts:255-315 — `isTurnBoundary` + `extractTurnToolNames`; unparseable lines skipped, no boundary yields `[]`, and `Agent`/`Task` with `subagent_type: 'web-fetch'` is reported as `WebFetch` |
| R4 | MET | ah_guard.ts:93,322 — `VERIFICATION_TOOL_PREFIXES` and `hasTurnToolEvidence`; the one exported constant is the whole list |
| R5 | MET | ah_guard.ts:413-437 — one transcript read, `turnTools` attached on both content branches, `ARGUMENTS`/`messages`/`last_message` yield `[]`, and a read failure keeps `content`/`allowReason` untouched |
| R6 | MET | ah_guard.ts:639 — `runStopGuard` passes `resolved.turnTools ?? []`; exit 0 and `{}` on allow are unchanged by the branch table |
| R7 | MET | ah_guard.ts:100-106 — `HOOK_FEEDBACK_TAG` and `BLOCK_REASON_V1` (164 chars, tag prefix, `UNVERIFIED:`, 3-line bound) |
| R8 | MET | plugins/cc/scripts/anti-hallucination/validate_response.mjs regenerated by `bun run build:scripts` (6423 bytes, never hand-edited) |
| R9 | MET | scripts/ah-replay.ts:64,125 — measured on ~/.claude/projects: 231 files, 110 old blocks to 25 new (77.3% fewer); every residual block listed with an excerpt. The ≥80% bar is missed by 2.7 points — operator-accepted deviation, cause in `## Testing` |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC-1 | MET | test | plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:1152 — a cited reply without a label allows |
| AC-2 | MET | test | ah_guard.test.ts:1163 — WebFetch, Agent+web-fetch and `mcp__ref__ref_read_url` turns all allow |
| AC-3 | MET | test | ah_guard.test.ts:1185 — uncited external claim with a tool-free transcript blocks |
| AC-4 | MET | test | ah_guard.test.ts:1203 (residual-proof, both old trigger halves) plus ah_guard-uncertainty.test.ts:59,120 |
| AC-5 | MET | test | ah_guard.test.ts:1214,1237,1298 — earlier-turn tools are not credited and meta feedback does not reset the turn |
| AC-6 | MET | test | ah_guard.test.ts:1248 — missing or directory transcript allows, `turnTools` stays `[]`, stderr untouched |
| AC-7 | MET | test | ah_guard.test.ts:1270 — reason equals `BLOCK_REASON_V1`, tag prefix, at most 240 chars, `UNVERIFIED:` present |
| AC-8 | N/A | n/a | Owned by task 0157 — the always-loaded hook-feedback protocol rule and its docs; this task ships the tag and reason constant 0157 quotes |
| AC-9 | MET | command | `bun scripts/ah-replay.ts` on ~/.claude/projects gives 110 to 25 blocks (77.3% fewer) plus the histogram and 25 residual excerpts; the ≥80% bar is missed by 2.7 points, operator accepted 2026-10-21 with the cause recorded in `## Testing` |
| AC-10 | MET | test | ah_guard.test.ts:1280 — `stop_hook_active`, invalid JSON and empty stdin all allow with stderr untouched |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

**AC9 replay evidence (real corpus, `bun scripts/ah-replay.ts` over `~/.claude/projects`, 2026-10-21)**

```json
{
  "files": 231,
  "oldBlocks": 110,
  "newBlocks": 25,
  "reductionPct": 77.3,
  "oldReasonHistogram": {
    "confidence": 74,
    "confidence+sources+uncertainty": 10,
    "confidence+uncertainty": 10,
    "confidence+sources": 15,
    "uncertainty": 1
  }
}
```

The 25 residual blocks are listed with excerpts by the same command. They are not false positives of
the new policy: 23 of the 25 replies assert an external fact while citing a bare repo path
(`plugins/sp/tests/skill-structure.test.ts`-style, no `:line`), and `hasSourceCitations` refuses a
bare filename on purpose — `ah_guard.test.ts:1015` pins that `readme.md` / `lodash.js` / `service.ts`
mentions are not evidence. R1 freezes `hasSourceCitations` byte-identical, so this class of block is
the guard working as designed.

**Deviation — AC9's numeric bar.** The feature scenario asks for "at least 80 percent fewer Stops";
the measured reduction is 77.3% (110 → 25), 2.7 points short. The shortfall is data-dependent, not a
defect: the bar was projected from a smaller sample, and closing it would require crediting bare
filenames, which re-opens the 0079 false-negative the `path:line` anchor exists to close. Operator
confirmed on 2026-10-21 that the measurement is recorded as-is and the task closes.

**Gates run on the frozen tree (all green, `.spur/run/0155-check-receipt.json` = PASS):**
`bun run lint` (Biome + both workspace typechecks) · `bun test` 2650 pass / 0 fail across 126 files ·
`bun run test-pre-check` 43/43 rules · `bun run test-post-check` 3/3 rules ·
`bun run build` (standalone binary + Codex plugin ZIP) · live probe
`echo '{"last_assistant_message":"The API returns a list, see src/a.ts:3."}' | bun apps/cli/src/index.ts hook run cc anti-hallucination` ⇒ `{}`, and the same probe with an uncited claim ⇒ `decision: "block"` carrying `BLOCK_REASON_V1`.

### Review

Review coordinator pass over the diff (8 source/test files plus 2 new tooling files).

Confidence: MEDIUM

| Priority | Finding | Location | Disposition |
| --- | --- | --- | --- |
| P4 | AC9's numeric bar (at least 80% fewer blocks) is missed on the real corpus: 110 old blocks to 25 new = 77.3%. The cause is the frozen citation recognizer, not the new logic — 23 of the 25 residual replies cite a bare repo path and block because `hasSourceCitations` deliberately requires a `path:line` anchor, which R1 freezes byte-identical and `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:1015` pins. Operator-confirmed 2026-10-21; recorded in `## Testing`. | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:120` | ACCEPTED |
| P4 | `extractTurnToolNames` parses every JSONL line per Stop. Bounded by the 1 MiB `TRANSCRIPT_TAIL_BYTES` cap (a few hundred lines), so the added cost is one `JSON.parse` per line and no extra I/O. | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:290` | FIXED |
| P4 | Turn evidence is Claude-Code-only by design: Codex, Pi, omp and Gemini payloads yield `turnTools: []`, so those hosts keep the pre-H21 strictness minus the label rule. Intended per R5 and the task Q&A; 0157 records it in `docs/04_DESIGN.md`. | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:338` | ACCEPTED |

Verdict: PASS

**Residual risk.** The guard is narrower now, so a reply that asserts an external fact while citing only a bare filename is blocked and costs one extra turn — the class the 25 residual replay blocks show. The alternative (crediting bare filenames) trades that turn back for a guard a filename mention defeats, which the 0079 evidence history rejected.

**Disposition.** PASS. No open P1-P3: the AC9 shortfall is an accepted, recorded deviation on a data-dependent threshold, not a defect in the implemented policy.

### References

- Feature: `docs/features/H21_quiet-anti-hallucination-guard-and-plugin-owned-multi-persona-magents.md` (full Gherkin for each AC)
- Design: `docs/design/quiet-guard-and-plugin-magents.md` § Track A
- Decisions: `docs/00_ADR.md` ADR-040 (Proposed), ADR-020 (fail-open), ADR-015 (superseded label clause)
- Guard: `plugins/cc/scripts/anti-hallucination/ah_guard.ts:272` (`resolveStopContext`), `:447` (`verifyAntiHallucinationProtocol`), `:528` (`runStopGuard`)
- Dispatcher: `apps/cli/src/commands/hook-run.ts:415`
- Prior residual history: tasks 0077, 0079, 0105, 0147
- Follow-up: 0157 (protocol rule + docs) depends on this task's `HOOK_FEEDBACK_TAG`

### History

- 2026-10-21T18:32:53.315Z feature_id J → H21 (system)
- 2026-10-21T19:42:54.072Z todo → wip (system)
- 2026-10-21T19:49:39.033Z wip → testing (system)
- 2026-10-21T19:49:40.384Z testing → done (system)

