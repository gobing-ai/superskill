---
schema_version: 1
name: Fix cc plugin review findings across Stop-guard blanks, sentence dots, couplers, stdin twin, expert tools, confidence, and transcript tail
status: todo
template: issue
created_at: 2026-09-24T01:05:45.472Z
updated_at: "2026-09-24T01:13:51.354Z"
feature_id: H2

priority: P1
ac_numbering: task-local
ac_altitude: task-local
estimate_hours: 8
---

## 0147. Fix cc plugin review findings across Stop-guard blanks, sentence dots, couplers, stdin twin, expert tools, confidence, and transcript tail

### Background

This task came out of an advisory `/sp-dev-review plugins --agent inline --focus all` run on 2026-09-23. Path mode, so the review wrote no verdict artifact and applied no fixes. `--fix` on that command is a deprecated no-op. Every anchor below was re-read on `main@09ad0cd` before this task was written. The reproductions were `bun -e` imports of `plugins/cc/scripts/anti-hallucination/ah_guard.ts` plus one temp JSONL passed through `runStopGuard`. The plugin test suite was not re-run in that review. These tests become the permanent evidence.

Scope is `plugins/cc` only. That directory is the whole `plugins/` tree. Feature H2 already owns guard behavior, the generated portable twin, and plugin contract integrity. These scenarios are task-local (`ac_altitude: task-local`). They are not new H2 ship scenarios. Do not add them to `docs/features/H2_cc-plugin-security-and-contract-integrity.md`.

| ID | Req | Severity | Area | One-line finding |
| --- | --- | --- | --- | --- |
| F1 | R1 | major | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:150-172` and `:190-204` | A trailing assistant turn with omitted or `null` content becomes the string `"undefined"` or `"null"`, so the previous claim is never checked and Stop allows. The messages channel also returns on the first assistant even when its text is blank |
| F2 | R2 | major | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:354` | The sentence splitter treats every `.` as a boundary, so `readme.md` / `lodash.js` / `service.ts` separate a weak keyword from its coupler and the claim is allowed |
| F3 | R3 | major | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:342-343` | Couplers are present tense only. `returned`, `accepted`, `exposed`, and `will return` do not fire |
| F4 | R4 | major | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:504-533` and `plugins/cc/scripts/anti-hallucination/validate_response.mjs:136-167` | The staged stdin twin hardcodes 250 ms and, on stream error, keeps a partial buffer. It never reads `SUPERSKILL_STDIN_TIMEOUT_MS`. This is architecture candidate C1. ADR-024 forbids importing `apps/cli` |
| F5 | R5 | major | `plugins/cc/agents/expert-agent.md:19`, `plugins/cc/agents/expert-command.md:19`, `plugins/cc/agents/expert-hook.md:10` | Those three allowlists are `Read, Glob` while the bodies run `superskill` and, for agent and command, `Skill(...)`. The plugin's own frontmatter reference defines `tools` as the allowed-tools list |
| F6 | R6 | minor | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:62-68` | `Confidence: HIGHWAY` and a `### Confidence` heading with no level both count as a confidence declaration. Combined with `plugins/cc/plugin.json:1`, an uncited API claim verifies ok |
| F7 | R7 | minor | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:228` and `:258-265` | Every Stop `readFileSync`s the whole `transcript_path` with no size cap and no regular-file check. `plugins/cc/hooks/hooks.json:11` gives the hook 10 seconds |

Out of scope, confirmed holding in the same review. Do not edit them:

- `plugins/cc/skills/cc-hooks/examples/validate-bash.sh`, `validate-write.sh`, and `load-context.sh`, and their regressions in `plugins/cc/tests/hook-examples.test.ts`.
- `plugins/cc/scripts/anti-hallucination/lib/env.ts`. It is still a logic copy of `packages/core/src/env.ts`.
- `plugins/cc/agents/expert-skill.md:13` and `plugins/cc/agents/expert-magent.md:13`. Their tool lists already include `Bash`. Leave those two lines byte-identical.
- Hook decision JSON, exit code 0, and `hooks.json` `timeout: 10`. Do not change the host protocol.
- Do not add `function` or `method` back to `WEAK_KEYWORD_PATTERN` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:338`).
- Do not confine `transcript_path` to the project directory. Claude Code transcripts live outside the repo. Confining them would fail-open every real Stop.
- No new dependency, no ADR. `docs/00_ADR.md` ADR-024 (`:321`) still forbids this plugin script from importing `apps/cli`. The stdin fix is a kept-in-sync copy, which `docs/04_DESIGN.md:338-340` already requires.

Delegation notes:

- The defaults in `### Q&A` are binding. Do not reopen them during implementation.
- Implement in the phase order in `### Plan`. One atomic conventional commit per phase, on a feature branch, never on `main`.
- F2, F3, and F6 are independent regexes in one file. They share a commit so the sentence-local tests are updated once.
- F4 and C1 are the same defect. The fix is the contract test plus the copy. Do not merge the reader into `apps/cli` and do not import it.
- Re-read every `file:line` in this task at the start of each phase. Earlier phases shift later anchors.
- Before editing, read `.spur/context/pitfalls.md` and `.spur/context/buglog.md`.

### Requirements

- [ ] R1. (F1, major) Blank assistant turns must be skipped on both channels, and missing content must not be stringified. `messageText` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:150-161`) today does `return String(content)` for every non-array. `String(undefined)` is `"undefined"` and `String(null)` is `"null"`. Both are non-empty, so `extractLastAssistantFromTranscript` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:190-204`) returns them and stops, even though its comment at `:185-188` says entries with no text are skipped. `extractLastAssistantMessage` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:164-172`) returns on the first assistant from the end even when `messageText` is blank, so a trailing `tool_use`-only or empty assistant on the omp `messages` channel hides the previous claim too. After the fix: non-strings (null, undefined, numbers, plain objects) produce `''`; array content is unchanged (only `type === 'text'` parts with a truthy `text` are joined). Both extractors keep scanning while the text trims to empty. A real string whose characters are `undefined` or `null` is still that string. `last_message` is used only when no assistant message had text, and a blank `last_message` yields `undefined`. `runStopGuard` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:456-476`) is not rewritten. Its existing "no content" allow and its existing verify path pick up the fixed extractors. Current failure, reproduced on `09ad0cd`: a transcript whose first assistant text is `The library version 2.3.1 is required and the API returns paginated lists from the public endpoint.` and whose second assistant has no `content` field, or `content: null`, makes `runStopGuard` emit an allow envelope. The same transcript with a trailing `[{ type: 'tool_use' }]` content already blocks. That third case must stay blocking.
- [ ] R2. (F2, major) `hasWeakExternalClaim` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:352-359`) must not split on a dot that continues a token. The splitter is `text.split(/(?<=[.!?])(?:\s+|(?=\S))|\n+/)`. `(?=\S)` fires on the `m` in `readme.md`, the `j` in `lodash.js`, and the `t` in `service.ts`, so the weak keyword and the coupler land in different fragments and `requiresExternalVerification` returns false. Replace only the `(?=\S)` alternative with `(?=[A-Z])`, giving `/(?<=[.!?])(?:\s+|(?=[A-Z]))|\n+/`. A dot, exclamation mark, or question mark still starts a new sentence when the next character is whitespace or an ASCII uppercase letter. A dot followed by a lowercase letter or a digit does not. Newline splitting is unchanged. Do not special-case file extensions. An uppercase extension such as `README.MD` still splits, because `M` looks like the `local.The` case this rule exists to preserve. These three strings must require external verification: `The API documented in readme.md returns a paginated list.`, `The library (see lodash.js) returns a Buffer.`, and `The endpoint in service.ts returns 404 for unknown ids.` The existing sentence-local expectations in `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:207-219` must stay false, including the no-space case `The API change is local.The helper returns early when empty.`
- [ ] R3. (F3, major) `CLAIM_COUPLER_PATTERN` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:342-343`) must accept the past tense and a modal-plus-base-verb of the same verbs, still only in the same sentence as `WEAK_KEYWORD_PATTERN` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:338`). Do not use `returns?`. That would match the bare noun `return`. Use an explicit list: `returns|returned|accepts|accepted|expects|expected|supports|supported|requires|required|provides|provided|exposes|exposed|takes|took|emits|emitted|throws|threw|defaults? to|defaulted to`, each as a whole word, case-insensitive. Add a second pattern, OR'd in `hasWeakExternalClaim` next to the coupler and the lifecycle verb: `\b(?:will|would|can|could|did|does)\s+(?:return|accept|expect|support|require|provide|expose|take|emit|throw|default to)\b`. `LIFECYCLE_VERB_PATTERN` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:350`) stays as it is. `WEAK_KEYWORD_PATTERN` stays as it is: `api|library|framework|sdk|package|endpoint|documentation` only. These must require verification: `The library returned a Buffer from decode.`, `The API accepted a null body and returned 204.`, `The framework exposed a helper for retries.`, and `The API will return a paginated list of users.` This must stay false, and the test name must say residual-proof: `The function returned early when the list was empty.` The existing residual-proof block at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:196-204` must stay false, including `The function returns early when the list is empty.` The existing positives at `:222-225` (`provides`, `exposes`, `returns`) must stay true.
- [ ] R4. (F4 and C1, major) `readPipedStdin` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:504-536`) must implement the stdin contract already written at `docs/04_DESIGN.md:320-340`. The production Stop path (`superskill hook run` → `apps/cli/src/commands/hook-run.ts`) uses `apps/cli/src/stdin.ts` `readStdinNonBlocking` and is not this bug. The bug is the staged twin: direct `ah_guard.ts` and `validate_response.mjs`, which `plugins/cc/README.md:146` names as the standard install form. Today the twin defaults `idleMs` to `250`, never calls `getEnvVar('SUPERSKILL_STDIN_TIMEOUT_MS')`, and its `'error'` listener (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:532`) resolves whatever bytes were already buffered. `apps/cli/src/stdin.ts:28-31` and `:84-86` honor the env var and discard the read on error. Keep the copy. Do not import `apps/cli` from `ah_guard.ts` (the comment at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:496-498`, ADR-024). Add `DEFAULT_STDIN_TIMEOUT_MS = 250` and `resolveStdinTimeoutMs(env)` beside `readPipedStdin`, reading the env through `getEnvVar` from `./lib/env` when the caller does not pass an env record. Same rule as the CLI: a finite integer greater than 0 wins; unset, empty, `0`, negative, and non-numeric fall back to 250. `readPipedStdin(idleMs = resolveStdinTimeoutMs())` uses it. Return type stays `Promise<string>`. `''` is this function's encoding of the CLI reader's `undefined`, because `main` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:487-490`) and `readStdinText` (`plugins/cc/scripts/anti-hallucination/validate_response.ts:35-47`) already treat a blank string as no payload. Rows that must resolve `''`: interactive TTY, idle timeout with no bytes, whitespace-only, and stream error even after a data chunk. Rows that must resolve the payload text: data then `end`, and several writes whose gaps stay inside the idle budget. Do not hand-edit `plugins/cc/scripts/anti-hallucination/validate_response.mjs`. Regenerate it with `bun run build:scripts` (`package.json` script: `superskill script convert` of `validate_response.ts`, which bundles this reader). A test in `ah_guard.test.ts` must import `resolveStdinTimeoutMs` from both `ah_guard.ts` and `apps/cli/src/stdin.ts` and assert they return the same number for the same env record (`''`, `'0'`, `'-1'`, `'foo'`, `'400'`, `'250'`) and that the two default constants are equal. Production code stays free of that import.
- [ ] R5. (F5, major) `plugins/cc/agents/expert-agent.md:19`, `plugins/cc/agents/expert-command.md:19`, and `plugins/cc/agents/expert-hook.md:10` must each be exactly `tools: [Read, Glob, Bash, Skill]`. `Bash` is what runs the `superskill agent`, `superskill command`, and `superskill hook` examples those bodies require (`plugins/cc/agents/expert-agent.md:63-68` and `:134-135`, `plugins/cc/agents/expert-command.md:63-68`, `plugins/cc/agents/expert-hook.md:61-65`). `Skill` is what runs the Claude row `Skill(skill="cc:cc-agents")` or `Skill(skill="cc:cc-commands")` (`plugins/cc/agents/expert-agent.md:56`, `plugins/cc/agents/expert-command.md:56`) and the expert-hook fallback to `cc:cc-hooks` (`plugins/cc/agents/expert-hook.md:68`). Do not add `Write` or `Edit`. The bodies say the CLI owns file writes. Do not change `plugins/cc/agents/expert-skill.md:13` or `plugins/cc/agents/expert-magent.md:13`. `plugins/cc/README.md:103-106` currently says every agent has `tools: [Read, Glob]`, which is already false for skill and magent. Replace that bullet with the two allowlists: the three agents above, and the unchanged skill/magent list `tools: [Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch]`. Leave the `skills:` and `model: inherit` bullets. `plugins/cc/skills/cc-agents/references/frontmatter-reference.md:37` already says Claude Code `tools` is the allowed-tools list. Do not edit that sentence. Codex maps `tools` to N/A (`plugins/cc/skills/cc-agents/references/frontmatter-reference.md:13`). Do not add a Codex `sandbox_mode`. Do not edit `packages/core/src` Pi or subagent adapters. Their tests use inline `[Read, Glob]` fixtures, not these files.
- [ ] R6. (F6, minor) `CONFIDENCE_PATTERNS` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:62-68`) must accept a confidence word only as a whole word, and a `### Confidence` heading only when a level appears within 80 characters after it. Keep the patterns free of the `g` flag. The three patterns become: `/Confidence:\s*\**\b(?:HIGH|MEDIUM|LOW)\b\**/i`, `/\*\*Confidence\*\*:\s*\**\b(?:HIGH|MEDIUM|LOW)\b\**/i`, and `/### Confidence\b[\s\S]{0,80}?\b(?:HIGH|MEDIUM|LOW)\b/i`. These must be false: `Confidence: HIGHWAY`, `Confidence: HIGHly uncertain`, `Confidence: LOWER`, `Confidence: MEDIUM-rare`, and `### Confidence\n\nI am unsure about the API.` These must stay true, matching `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:89-114`: `**Confidence**: HIGH`, `Confidence: MEDIUM`, `Confidence: **HIGH**`, `Confidence: **MEDIUM**`, `### Confidence\n\nHIGH`, `confidence: low`. `verifyAntiHallucinationProtocol` on `Confidence: HIGHWAY\nThe API returns a paginated list.\nplugins/cc/plugin.json:1` must be `ok: false` and its `issues` must include the confidence-level string. `plugins/cc/plugin.json:1` still counts as a citation (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:53`). That credit is intentional (0079). This requirement does not remove it.
- [ ] R7. (F7, minor) The default transcript reader used by `resolveStopContext` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:225-228` and `:258-265`) must read at most the last 1 MiB of a regular file and must not open anything else. Export `TRANSCRIPT_TAIL_BYTES = 1_048_576` and `readTranscriptForStop(path, maxBytes = TRANSCRIPT_TAIL_BYTES): string` from `ah_guard.ts`. Pass `readTranscriptForStop` as the default `readTranscript`. `statSync` the path (follow symlinks; do not `lstat`). If it is not a regular file, throw an `Error` whose message says the path is not a regular file. The existing `catch` at `:262-263` then returns `allowReason` containing `transcript unavailable`. A missing path still throws from `statSync` and takes that same allow. Do not open the file before the `isFile()` check, so a fifo cannot block the hook. When `size <= maxBytes`, `readFileSync(path, 'utf-8')` as today. When `size` is larger, read exactly `maxBytes` bytes at position `size - maxBytes` with `openSync` / `readSync` / `closeSync` in a `try/finally`, decode utf-8, and drop the cut first record by slicing after the first `\n`. If that tail contains no newline, return `''` (no complete JSONL record). A `ponytail:` comment must name the ceiling: one JSONL record larger than 1 MiB is skipped and the guard fail-opens. Do not raise the cap and do not fall back to reading the whole file. Do not reject paths outside the project. A symlink to a regular file is read. `plugins/cc/hooks/hooks.json:11` stays `timeout: 10`. Injected `readTranscript` test doubles are unchanged, so existing tests that pass a fake reader keep working.
- [ ] R8. (docs and gates) In the same commit as R4, extend the paragraph at `docs/04_DESIGN.md:338-340` so it states both of these facts: the plugin duplicate returns `''` where `readStdinNonBlocking` returns `undefined` (TTY, no byte before the idle budget, whitespace-only, stream error), and `resolveStopContext`'s default reader reads at most the last 1 MiB of a regular file and refuses non-regular files without confining `transcript_path` to the project. Do not open a new ADR. `plugins/cc/README.md:145-146` already says the validator's stdin is bounded and that `validate_response.mjs` is generated. Leave those sentences unless a phrase in them becomes false. All gates must pass on the final tree: `bun run lint`, `bun run test` (coverage at least 90% lines and functions), `bun run build` (this runs `build:scripts` and must leave `validate_response.mjs` with no further diff), and `bun run spur-check`. No test is skipped, `.skip`'d, or weakened to go green. `git status` shows only files named in `### Plan`.

### Acceptance Criteria

- [ ] AC1 — Omitted transcript content no longer hides the claim (req: R1). In `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts`, build a temp JSONL. Line 1 is `{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: PRIOR }] } }` where `PRIOR` is exactly `The library version 2.3.1 is required and the API returns paginated lists from the public endpoint.` Line 2 is `{ type: 'assistant', message: { role: 'assistant' } }` with no `content` field. `runStopGuard(undefined, JSON.stringify({ transcript_path: <file>, stop_hook_active: false }))` returns output that `JSON.parse`s to `decision: 'block'` and a `reason` that contains `source citations`. The test is labeled as the omitted-content regression. It fails on `09ad0cd` because `messageText` returns `"undefined"`, which is under 50 characters and is allowed.
- [ ] AC2 — Null transcript content no longer hides the claim (req: R1). Same fixture as AC1, except line 2 is `{ type: 'assistant', message: { role: 'assistant', content: null } }`. Same block assertion. On `09ad0cd` the extractor returns the string `"null"` and the guard allows.
- [ ] AC3 — The messages channel skips a trailing blank assistant (req: R1). `extractLastAssistantMessage({ messages: [{ role: 'assistant', content: PRIOR }, { role: 'assistant', content: null }] })` returns `PRIOR`. The same call with the second message omitted `content`, with `content: ''`, and with `content: [{ type: 'tool_use' }]` also returns `PRIOR`. A messages array whose only assistant has `content: null` returns `undefined`, and `last_message: PRIOR` on that context returns `PRIOR`. A context whose only text is `last_message: 'undefined'` returns the string `undefined` (the word is real payload, not a missing field).
- [ ] AC4 — The existing tool_use transcript regression stays (req: R1). The test at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:690` (`skips trailing tool_use-only assistant turns`) still expects `the real claim`. A `runStopGuard` over that shape still blocks when the textual turn is `PRIOR`.
- [ ] AC5 — Filename dots stay inside the sentence (req: R2). `requiresExternalVerification` is true for all three strings named in R2 (`readme.md`, `lodash.js`, `service.ts`). The test name says they are one grammatical sentence. `verifyAntiHallucinationProtocol` on each, with no citation and no confidence line, is `ok: false`.
- [ ] AC6 — The 0108 sentence-local cases stay false (req: R2). The four expectations at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:207-219` stay false, including `The API change is local.The helper returns early when empty.` A new assertion `The API change is local.The helper returns early when empty.` is not rewritten to true. If the new splitter makes it true, the regex is wrong.
- [ ] AC7 — Past tense and modals fire, and the local-code residual stays false (req: R3). `requiresExternalVerification` is true for the four strings named in R3 (`returned`, `accepted`/`returned`, `exposed`, `will return`). A test labeled residual-proof asserts `The function returned early when the list was empty.` is false. The block at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:196-204` stays false. The block at `:222-225` stays true.
- [ ] AC8 — Both timeout resolvers agree (req: R4). A test imports `resolveStdinTimeoutMs` and `DEFAULT_STDIN_TIMEOUT_MS` from `ah_guard.ts` and from `apps/cli/src/stdin.ts`. The two defaults are equal. For one shared env record at a time (`SUPERSKILL_STDIN_TIMEOUT_MS` set to `''`, `'0'`, `'-1'`, `'foo'`, `'400'`, and `'250'`), the two functions return the same number. `'400'` and `'250'` return themselves. The other four return the default.
- [ ] AC9 — A stream error drops a partial buffer (req: R4). In the `readPipedStdin` describe (`plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:720`), with the TTY flag forced off, emit one `data` chunk `PARTIAL` and then emit `error`. The promise resolves to `''`, not to `PARTIAL`. The existing data-plus-end test (`:734`) and the multi-chunk test (`:751`) still expect the full payload. The silent-stdin test still expects `''`.
- [ ] AC10 — The default idle budget follows the env var (req: R4). `setEnvVar('SUPERSKILL_STDIN_TIMEOUT_MS', '80')` from `../lib/env`, then `readPipedStdin()` with no argument and no writes, resolves `''`. Elapsed time is under 1000 ms. `afterEach` restores the previous env value with `setEnvVar`, including restoring absence when it was unset. A whitespace-only `data` chunk followed by `end` also resolves `''`.
- [ ] AC11 — The generated twin carries the env contract (req: R4, R8). After `bun run build:scripts`, `rg -n "SUPERSKILL_STDIN_TIMEOUT_MS" plugins/cc/scripts/anti-hallucination/validate_response.mjs` matches. Running `bun run build:scripts` a second time leaves `git diff -- plugins/cc/scripts/anti-hallucination/validate_response.mjs` empty. The mjs file is not hand-edited.
- [ ] AC12 — The three expert allowlists can run the CLI (req: R5). A test in `plugins/cc/tests/structure.test.ts` reads the three agent files and asserts each frontmatter `tools` line is exactly `tools: [Read, Glob, Bash, Skill]`. It asserts `expert-skill.md` and `expert-magent.md` still contain `tools: [Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch]`. It asserts `plugins/cc/README.md` no longer contains the bullet `` `tools: [Read, Glob]` — minimal, read-only tool access `` and does contain both `tools: [Read, Glob, Bash, Skill]` and the skill/magent list.
- [ ] AC13 — Confidence words are whole words (req: R6). `hasConfidenceLevel` is false for `Confidence: HIGHWAY`, `Confidence: HIGHly uncertain`, `Confidence: LOWER`, `Confidence: MEDIUM-rare`, and `### Confidence\n\nI am unsure about the API.` It stays true for every string already asserted in `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:89-114`. `verifyAntiHallucinationProtocol('Confidence: HIGHWAY\nThe API returns a paginated list.\nplugins/cc/plugin.json:1')` is `ok: false` and `issues` includes `confidence level (HIGH/MEDIUM/LOW)`.
- [ ] AC14 — A non-regular transcript fail-opens without reading it (req: R7). `resolveStopContext(undefined, JSON.stringify({ transcript_path: <a temp directory> }))` using the default reader returns `allowReason` containing `transcript unavailable` and `content` undefined. The call returns. It does not follow a directory. A second case passes `transcript_path` of a symlink to a small regular JSONL file whose only assistant text is `PRIOR` from AC1. That case returns `content === PRIOR`.
- [ ] AC15 — A long transcript still yields the last textual turn (req: R7). Write a temp file larger than a test cap of 64 bytes by calling `readTranscriptForStop(path, 64)`. The file is `X`.repeat(200) plus a newline plus one complete assistant JSONL line whose text is `tail-claim`, plus a newline. The returned string does not include the `X` prefix, `JSON.parse`s as one record, and `extractLastAssistantFromTranscript` of it returns `tail-claim`. A file of 20 bytes `{"ok":true}\n` read with the default cap returns that same text unchanged. A file whose entire contents are `no-newline-at-all` and whose size exceeds the test cap returns `''`.
- [ ] AC16 — The design doc names the twin and the tail cap (req: R7, R8). `docs/04_DESIGN.md` around the current `:338-340` paragraph contains `SUPERSKILL_STDIN_TIMEOUT_MS`, states that `readPipedStdin` returns `''` where `readStdinNonBlocking` returns `undefined`, states the `1 MiB` or `1048576` tail cap, and states that non-regular files are refused. It does not say `transcript_path` must sit inside the project directory.
- [ ] AC17 — The gates pass (req: R8). On the final tree, `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check` each exit 0. Coverage stays at or above 90% lines and 90% functions. No test is skipped or weakened. `git status` lists only the files named in `### Plan`. The focused loop during implementation is `bun test plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts plugins/cc/tests/structure.test.ts plugins/cc/tests/hook-examples.test.ts`, then the full gates once at the end.

### Q&A

These defaults are binding for implementation. The operator may override them before the task moves to `wip`.

**Q1. F1: should the literal string `undefined` be treated as missing content?**
A: No. Only a missing field, `null`, a non-string, or a blank string is missing text. An assistant whose `content` is the string `undefined` said that word. AC3 locks the difference.

**Q2. F1: why change `extractLastAssistantMessage` when the reproduction was a transcript?**
A: `messageText` returning `''` for `null` fixes the transcript scanner, which already skips blank text (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:203`). The messages scanner returns on the first assistant (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:170-171`) and would still hide the previous claim. Both channels share one rule: skip blank assistant turns.

**Q3. F2: why not split only on whitespace, and undo the no-space `local.The` case?**
A: That case is the 0108 fix (`plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:217`). Two sentences with no space must stay two sentences when the next character is uppercase. The residual is a dot followed by a lowercase letter or a digit. `(?=[A-Z])` is the whole change. Do not add an extension allowlist. 0079 rejected those because a missed extension blocks a real citation. The cost is that `README.MD` still splits. Accept it.

**Q4. F3: `returns?` is shorter. Why the explicit list?**
A: `returns?` matches the noun `return` in `The API return value is local`, which is not the claim the coupler exists for. Spell the past-tense forms. A mild false positive such as `I returned the API payload` is accepted. A false positive on `The function returned early when the list was empty.` is not. `function` and `method` stay out of `WEAK_KEYWORD_PATTERN`.

**Q5. F4: why not import `readStdinNonBlocking` from `apps/cli`?**
A: `plugins/cc/scripts/anti-hallucination/ah_guard.ts:496-498` and ADR-024. This file is staged and run by path on non-Claude targets. The copy stays. The new test imports both resolvers so the next drift fails the suite. The plugin function returns `''` where the CLI function returns `undefined`, because `main` and `readStdinText` already treat a blank string as no payload. Do not change that return type.

**Q6. F4: does the production Stop hook have this bug?**
A: No. `plugins/cc/hooks/hooks.json:10` runs `superskill hook run cc anti-hallucination`, and `hook-run.ts` reads stdin with `apps/cli/src/stdin.ts`. R4 repairs the direct script and the generated `validate_response.mjs`. Do not change `hook-run.ts` unless a typecheck forces it, and if it does, stop and report.

**Q7. F5: why `Skill` on expert-hook, whose primary path is the CLI?**
A: One allowlist for the three agents. expert-hook's fallback sentence (`plugins/cc/agents/expert-hook.md:68`) invokes `cc:cc-hooks` when `superskill` is not on PATH. `Skill` covers that row. `Write` and `Edit` stay off all three. expert-skill and expert-magent already edit files in their skill fallback, and their lists stay as they are.

**Q8. F5: Codex ignores `tools`. Should the frontmatter grow a sandbox field?**
A: No. `plugins/cc/skills/cc-agents/references/frontmatter-reference.md:13` maps Codex `tools` to N/A. Adding `Bash` and `Skill` is for hosts that enforce the allowlist (Claude Code `tools`, OpenClaw `tools.allow`). Do not add `sandbox_mode`. Do not edit the Pi adapter.

**Q9. F6: why an 80-character window after `### Confidence`?**
A: The existing true case is `### Confidence\n\nHIGH` (`plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:106`). Eighty characters covers that and a short following line. A level buried in a later paragraph does not count. Do not go back to matching the heading alone.

**Q10. F7: why not confine `transcript_path` to the project, or read the whole file with a timeout?**
A: The host chooses the path. Claude Code transcripts are outside the repo. A project-root check would allow every real Stop (`allowReason: transcript unavailable`). The damage to bound is a huge file or a fifo inside the 10-second hook budget (`plugins/cc/hooks/hooks.json:11`). The tail cap does that. A single JSONL record bigger than 1 MiB fail-opens. That ceiling is a `ponytail:` comment, not a second reader.

**Q11. Is an ADR required?**
A: No. R4 implements the contract `docs/04_DESIGN.md:320-340` already states. R7 adds a bound on an existing read and is recorded in that same paragraph. Nothing in `docs/00_ADR.md` is superseded. Do not edit `docs/03_ARCHITECTURE.md` unless a sentence there describes the unbounded `readFileSync` and would become false. As of `09ad0cd`, the mechanism lives in `docs/04_DESIGN.md`, not in `03`.

**Q12. Should these scenarios be added to feature H2?**
A: No. H2's ship scenarios stay the ones already in `docs/features/H2_cc-plugin-security-and-contract-integrity.md`. This task is `ac_altitude: task-local` so DD-09 does not demand those new titles on the feature. Reopening H2 to `active` is bookkeeping, because a non-terminal task is now linked. It is not a scope edit.

### Design

**Scope guard.** Production edits stay inside `plugins/cc/scripts/anti-hallucination/ah_guard.ts`, the regenerated `validate_response.mjs`, `plugins/cc/agents/expert-agent.md`, `expert-command.md`, `expert-hook.md`, `plugins/cc/README.md`, and `docs/04_DESIGN.md` (the one paragraph at `:338-340`). Tests stay inside `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts` and `plugins/cc/tests/structure.test.ts`. `apps/cli/src/stdin.ts` is imported by the new parity test only. If `hook-run.ts`, `packages/core`, or an adapter test must change, stop and report. No new dependency. `vendors/` is untouched.

#### D1 — F1 blank assistant turns (R1)

`messageText` returns `''` unless `content` is a string or an array. The array branch stays: collect `part.type === 'text' && part.text`. Do not `String()` anything else.

```typescript
function messageText(content: Message['content'] | null | undefined): string {
    if (Array.isArray(content)) {
        const textParts: string[] = [];
        for (const part of content) {
            if (part.type === 'text' && part.text) textParts.push(part.text);
        }
        return textParts.join('\n');
    }
    return typeof content === 'string' ? content : '';
}
```

The parsed transcript message type must allow `content?: Message['content'] | null` so the `null` case typechecks without `any` and without a `biome-ignore`.

`extractLastAssistantMessage` uses the same loop shape as `extractLastAssistantFromTranscript`: walk from the end, skip non-assistants, skip text that trims empty, return the first non-empty text. Only if that loop finds nothing, honor `last_message` when it is a non-blank string. `extractLastAssistantFromTranscript` already has the skip (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:203`). Leave that skip. It starts working for `null` once `messageText` returns `''`.

Rejected: treating the words `undefined` and `null` as empty. That drops a real message. Rejected: changing `runStopGuard`. It already allows when `content` is `undefined` and verifies when `content` is text.

#### D2 — F2 sentence dots (R2)

One character-class change in `hasWeakExternalClaim`:

```typescript
const sentences = text.split(/(?<=[.!?])(?:\s+|(?=[A-Z]))|\n+/);
```

`local.The` still splits because `T` is uppercase. `readme.md` does not, because `m` is lowercase. `v2.0` does not, because `0` is not uppercase. No extension list.

Rejected: requiring whitespace again. That reopens the 0108 false positive on `local.The`.

#### D3 — F3 coupler tenses (R3)

Replace `CLAIM_COUPLER_PATTERN` with the explicit alternation in R3. Add `MODAL_COUPLER_PATTERN` for `will|would|can|could|did|does` plus the base verb. `hasWeakExternalClaim` is true when one sentence matches the weak keyword and any of: the coupler, the modal coupler, or `LIFECYCLE_VERB_PATTERN`. Do not edit the lifecycle pattern or the weak-keyword pattern.

Rejected: `returns?` and the other optional-s forms. They match nouns (`return`, `support`, `expect`).

#### D4 — F6 confidence words (R6)

Replace `CONFIDENCE_PATTERNS` with the three expressions in R3's neighbor requirement R6. No `g` flag, so `RegExp.test` stays stateless. `\b` after the level rejects `HIGHWAY`, `LOWER`, and `MEDIUM-rare`. Trailing stars still match `Confidence: **HIGH**` because the boundary sits between `H`/`D` and `*`, and `\**` consumes the stars. The heading pattern is non-greedy over at most 80 characters and then requires a whole-word level.

Rejected: deleting the heading pattern. `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:106` requires `### Confidence\n\nHIGH` to pass.

#### D5 — F4 stdin twin (R4, C1)

Duplicate the CLI resolver next to `readPipedStdin`. Do not import `apps/cli` from this module.

```typescript
export const DEFAULT_STDIN_TIMEOUT_MS = 250;

export function resolveStdinTimeoutMs(
    env: Record<string, string | undefined> = {
        SUPERSKILL_STDIN_TIMEOUT_MS: getEnvVar('SUPERSKILL_STDIN_TIMEOUT_MS'),
    },
): number {
    const parsed = Number.parseInt(env.SUPERSKILL_STDIN_TIMEOUT_MS ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STDIN_TIMEOUT_MS;
}
```

`readPipedStdin(idleMs = resolveStdinTimeoutMs())`. One `finish(value: string)` settles with `value.trim().length > 0 ? value : ''`. `end` and the idle timer call `finish(data)`. `error` calls `finish('')`, which discards `data`. TTY still resolves `''` immediately. Update the comment at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:493-502` so it names the `''` versus `undefined` mapping and the env var.

The parity test lives in `ah_guard.test.ts` and is the only file that imports `apps/cli/src/stdin.ts` for this work. Relative import from `plugins/cc/scripts/anti-hallucination/tests/` is `../../../../../apps/cli/src/stdin.ts`.

Then `bun run build:scripts` and commit the `validate_response.mjs` diff. Do not patch the generated file by hand.

Rejected: deleting `readPipedStdin` and importing the CLI reader. The staged `.mjs` would then reference a module that is not on the install target.

#### D6 — F7 transcript tail (R7)

```typescript
export const TRANSCRIPT_TAIL_BYTES = 1_048_576;

export function readTranscriptForStop(filePath: string, maxBytes = TRANSCRIPT_TAIL_BYTES): string {
    const st = statSync(filePath);
    if (!st.isFile()) throw new Error(`transcript is not a regular file: ${filePath}`);
    if (st.size <= maxBytes) return readFileSync(filePath, 'utf-8');
    const buf = Buffer.alloc(maxBytes);
    const fd = openSync(filePath, 'r');
    try {
        readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
    } finally {
        closeSync(fd);
    }
    const text = buf.toString('utf-8');
    const newline = text.indexOf('\n');
    // ponytail: a single JSONL record larger than maxBytes has no complete line in the tail and fail-opens
    return newline === -1 ? '' : text.slice(newline + 1);
}
```

Default argument of `resolveStopContext` becomes `readTranscriptForStop`. The `catch` at `:262-263` already maps a throw to `transcript unavailable`. Imports of `openSync`, `readSync`, `closeSync`, and `statSync` come from `node:fs` beside the existing `readFileSync` import (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:27`).

Rejected: `createReadStream`. The injected reader is synchronous, and the tests call `resolveStopContext` synchronously. Rejected: `lstat`, which would refuse a symlink to a normal transcript. Rejected: a path prefix check.

#### D7 — F5 allowlists (R5)

Frontmatter only, plus the README bullets at `plugins/cc/README.md:103-106`. The three `tools:` lines become `tools: [Read, Glob, Bash, Skill]`. Do not rewrite the agent bodies. They already name the CLI and the Skill row. The structure test in AC12 locks the lines so the README and the files cannot drift apart again.

Rejected: giving these three agents `Write` and `Edit` to match expert-skill. Their bodies forbid editing the generated files themselves.

#### D8 — docs (R8)

Insert two sentences after the existing "keep the two in sync" sentence at `docs/04_DESIGN.md:338-340`. Wording is constrained by AC16. Do not copy the algorithm into `docs/03_ARCHITECTURE.md`.

### Plan

Each phase is one atomic conventional commit on a feature branch (never on `main`). Write the failing test first, then the fix. After each phase, run `bun test plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts plugins/cc/tests/structure.test.ts plugins/cc/tests/hook-examples.test.ts` and `bun run lint`. Before starting, read `.spur/context/pitfalls.md` and `.spur/context/buglog.md`. Re-read every `file:line` anchor in this task at the start of each phase. Earlier phases shift line numbers in `ah_guard.ts`.

- [ ] P0. Setup: `git switch -c fix/0147-cc-plugin-review-findings`, then `spur task update 0147 wip`. Confirm `git rev-parse --short HEAD` and re-read `plugins/cc/scripts/anti-hallucination/ah_guard.ts:62-68`, `:150-206`, `:338-359`, `:493-536`, and `:225-269` before editing. The anchors in this task were taken at `09ad0cd`.
- [ ] P1. R1, D1. Tests AC1–AC4 first in `ah_guard.test.ts`, next to the existing describe at `:689`. Then `messageText` and both extractors. Commit `fix(cc): skip blank assistant turns in the stop guard`.
- [ ] P2. R2, R3, R6, D2–D4. Tests AC5–AC7 and AC13 first, in the existing `requiresExternalVerification` and `hasConfidenceLevel` describes. Then the splitter, the two coupler patterns, and `CONFIDENCE_PATTERNS`. Do not edit `WEAK_KEYWORD_PATTERN` or `LIFECYCLE_VERB_PATTERN`. Commit `fix(cc): keep filename dots in-sentence and widen stop-guard claim and confidence matches`.
- [ ] P3. R7, D6. Tests AC14 and AC15 first, using a temp directory and a temp file. Then `readTranscriptForStop` and the `resolveStopContext` default. Commit `fix(cc): read only the tail of a regular stop transcript`.
- [ ] P4. R4 and R8, D5 and D8. Tests AC8–AC10 first. Then the resolver and the `readPipedStdin` error and whitespace paths. Update `docs/04_DESIGN.md:338-340` (AC16). Run `bun run build:scripts` and include the `validate_response.mjs` diff (AC11). Commit `fix(cc): align the staged stdin reader with the cli idle contract`.
- [ ] P5. R5, D7. Test AC12 first in `plugins/cc/tests/structure.test.ts`. Then the three `tools:` lines and the README bullets at `:103-106`. Commit `fix(cc): let expert agent, command, and hook run their cli`.
- [ ] P6. Full gates (AC17): `bun run lint && bun run test && bun run build && bun run spur-check`, then `git diff -- plugins/cc/scripts/anti-hallucination/validate_response.mjs` is empty after the build. If coverage drops below 90%, add behavior tests. Never lower the threshold. `plugins/cc/tests/hook-examples.test.ts` must still pass untouched.
- [ ] P7. Bookkeeping:
  - Append F1 and F4 to `.spur/context/buglog.md` with date, file, root cause, fix, and tags `cc`, `ah-guard`, `stdin`, `transcript`.
  - Append one `.spur/context/pitfalls.md` do-not-repeat: do not `String()` a missing message content, and do not split sentences on `(?=\S)` after a dot. The preserved case is uppercase (`local.The`), not every following character.
  - Update `.spur/context/anatomy.md` only if a new file was added. This plan adds none.
  - Append a row to `.spur/context/memory.md`.
  - Replace `### Solution` with the per-phase change map. Leave `### Testing` and `### Review` for `/sp-dev-verify 0147` and `/sp-dev-review 0147`.

Stop and ask the operator if any of these happens:

- `apps/cli/src/commands/hook-run.ts` or `packages/core` needs a source edit.
- The sentence-local test at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:217` (`local.The`) becomes true.
- `The function returns early when the list is empty.` or `The function returned early when the list was empty.` becomes true.
- `bun run build:scripts` emits a bundle that still imports `apps/cli` or mentions `Bun.`. `script convert` rejects `Bun.*` and would write nothing. Fix the source. Do not hand-write the mjs.
- A Q&A default is infeasible.

### Root Cause

- **F1 (R1).** `messageText` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:160-161`) assumes every non-array content is a string and coerces it with `String`. JSON `null` and a missing field both become non-empty words, so the "skip turns with no text" comment at `:185-188` never sees an empty string. Separately, `extractLastAssistantMessage` (`:170-171`) returns the first assistant it finds, blank or not, so the messages channel never walks back. The transcript channel does walk back, which is why a trailing `tool_use`-only turn already works (`plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:690`) and a trailing `null` does not. Reproduced on `09ad0cd` with `runStopGuard` and a two-line JSONL: omitted content and `content: null` allowed; `[{ type: 'tool_use' }]` blocked.
- **F2 (R2).** The 0108 fix made a dot a sentence boundary even with no following space, using `(?=\S)` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:354`). That also matches the character after a dot inside `readme.md`, `lodash.js`, and `service.ts`. The weak keyword stays in the left fragment and the coupler moves to the right fragment, so `hasWeakExternalClaim` is false and `requiresExternalVerification` does not fire. Reproduced: all three filename sentences returned `needs: false` and `verifyOk: true`. The no-space case `local.The` is a real two-sentence split and must remain one.
- **F3 (R3).** `CLAIM_COUPLER_PATTERN` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:342-343`) lists only the present-tense forms that the 0077 tests use (`returns`, `accepts`, `exposes`, …). Past tense (`returned`, `accepted`, `exposed`) and `will return` are the same claim and do not match. Reproduced: those four sentences returned `needs: false`. The present-tense control `The API returns a paginated list` still blocked. This is the untested half of the coupler gate, not a change to the weak-keyword set.
- **F4 (R4, C1).** `readPipedStdin` was copied from `apps/cli/src/stdin.ts` and the comment at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:496-498` says to keep them in sync. The CLI reader later gained `resolveStdinTimeoutMs` (`apps/cli/src/stdin.ts:28-31`) and an error path that settles `undefined` (`apps/cli/src/stdin.ts:84-86`). The copy still defaults to `250` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:504`) and its error listener calls `settle`, which resolves the buffered `data` (`:511-518`, `:532`). `plugins/cc` has no `SUPERSKILL_STDIN_TIMEOUT_MS` reference. `plugins/cc/scripts/anti-hallucination/validate_response.mjs:136-167` is that copy, bundled. `docs/04_DESIGN.md:320-340` already documents the CLI rows and tells the reader to keep the duplicate in sync. The duplicate is required by ADR-024. The missing piece is a test that imports both resolvers.
- **F5 (R5).** `plugins/cc/agents/expert-agent.md:19`, `plugins/cc/agents/expert-command.md:19`, and `plugins/cc/agents/expert-hook.md:10` allow only `Read` and `Glob`. The same files tell the agent to execute `superskill agent|command|hook` and, for agent and command, `Skill(...)`. `plugins/cc/skills/cc-agents/references/frontmatter-reference.md:37` defines Claude Code `tools` as the allowed-tools list. `plugins/cc/README.md:104` still says every agent is `tools: [Read, Glob]`, which does not match `plugins/cc/agents/expert-skill.md:13` or `plugins/cc/agents/expert-magent.md:13` either. The bodies and the allowlists were edited on different passes and nothing asserts they agree.
- **F6 (R6).** The first confidence pattern (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:65`) is `Confidence:\s*\**(?:HIGH|MEDIUM|LOW)\**` with no word boundary, so `HIGH` matches inside `HIGHWAY` and `HIGHly`, and `LOW` matches inside `LOWER`. The heading pattern (`:67`) is `/### Confidence/i` and does not look for a level. Reproduced: `Confidence: HIGHWAY` plus `plugins/cc/plugin.json:1` plus `The API returns a paginated list.` verified `ok: true`, because the citation pattern at `:53` credits `plugins/cc/plugin.json:1` and the prefix match credits confidence. The file:line credit is the 0079 behavior and is not the defect.
- **F7 (R7).** `resolveStopContext` (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:228`) defaults `readTranscript` to `readFileSync(path, 'utf-8')` and calls it on every string `transcript_path` (`:258-265`). There is no `stat`, no regular-file check, and no byte cap. The hook budget is 10 seconds (`plugins/cc/hooks/hooks.json:11`). A fifo or a multi-hundred-megabyte transcript blocks or stalls inside that budget. The block reason does not echo file contents. The review did not reproduce a timeout. The defect is the missing bound.

### Solution

Pre-implementation map. The implementer replaces the "pending" clause of each bullet at the end of P7 with the post-edit line. Do not claim a gate passed unless that command's output is in `### Testing`. The citations below are the `09ad0cd` sites the change map starts from.

- P1 pending. Start at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:150` (`messageText`), `plugins/cc/scripts/anti-hallucination/ah_guard.ts:164` (`extractLastAssistantMessage`), `plugins/cc/scripts/anti-hallucination/ah_guard.ts:190` (`extractLastAssistantFromTranscript`), and the tests beside `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:690`. AC1–AC4. No deviation yet.
- P2 pending. Start at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:354` (splitter), `plugins/cc/scripts/anti-hallucination/ah_guard.ts:342` (`CLAIM_COUPLER_PATTERN`), `plugins/cc/scripts/anti-hallucination/ah_guard.ts:62` (`CONFIDENCE_PATTERNS`). Do not edit `plugins/cc/scripts/anti-hallucination/ah_guard.ts:338` or `plugins/cc/scripts/anti-hallucination/ah_guard.ts:350`. AC5–AC7 and AC13. No deviation yet.
- P3 pending. Start at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:228` and `plugins/cc/scripts/anti-hallucination/ah_guard.ts:258`. Add `readTranscriptForStop`. AC14–AC15. No deviation yet.
- P4 pending. Start at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:504` and `apps/cli/src/stdin.ts:28`. Update `docs/04_DESIGN.md:338`. Regenerate `plugins/cc/scripts/anti-hallucination/validate_response.mjs:136`. AC8–AC11 and AC16. `ah_guard.ts` must not import `apps/cli`. No deviation yet.
- P5 pending. Start at `plugins/cc/agents/expert-agent.md:19`, `plugins/cc/agents/expert-command.md:19`, `plugins/cc/agents/expert-hook.md:10`, and `plugins/cc/README.md:104`. Do not edit `plugins/cc/agents/expert-skill.md:13` or `plugins/cc/agents/expert-magent.md:13`. AC12. No deviation yet.
- P6 pending. Gates named in `### Plan`. AC17. No files beyond this list.

The implementer keeps this bullet shape and replaces "pending" with the commit subject and the new line numbers.

Each phase bullet must include:

- The commit subject from `### Plan`.
- Every file touched, with the new `file:line` of the edited symbol (re-read after the edit, because earlier phases move lines).
- The AC ids that phase turned from red to green.
- Any deviation from `### Design`, in one sentence, with the reason. If there is no deviation, write "no deviation".

Required rows even when the phase went exactly as designed:

- P1. `messageText`, `extractLastAssistantMessage`, and `extractLastAssistantFromTranscript`, plus the new tests next to `ah_guard.test.ts` describe `extractLastAssistantFromTranscript`. AC1–AC4.
- P2. The splitter, `CLAIM_COUPLER_PATTERN`, the new modal pattern, and `CONFIDENCE_PATTERNS`. AC5–AC7 and AC13. State that `WEAK_KEYWORD_PATTERN` and `LIFECYCLE_VERB_PATTERN` were not edited.
- P3. `TRANSCRIPT_TAIL_BYTES`, `readTranscriptForStop`, and the `resolveStopContext` default argument. AC14–AC15.
- P4. `DEFAULT_STDIN_TIMEOUT_MS`, `resolveStdinTimeoutMs`, `readPipedStdin` error and whitespace behavior, the `docs/04_DESIGN.md` paragraph, and the regenerated `validate_response.mjs`. AC8–AC11 and AC16. State that `ah_guard.ts` does not import `apps/cli`.
- P5. The three `tools:` lines and the README bullets. AC12. State that `expert-skill.md` and `expert-magent.md` were not edited.
- P6. The four gate commands and their exit codes. AC17. Name any extra test file added to hold coverage.

Do not put a `###` heading in this section. Use the `P1.` labels above.

### Testing

Not run yet. `/sp-dev-verify 0147` replaces this section from a fresh run. The evidence bar, anchored at the current tests `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:89` and `plugins/cc/tests/structure.test.ts:1`, is:

- For each of AC1–AC16, the test name in `ah_guard.test.ts` or `structure.test.ts` and the command that ran it, with a pass count. A description of the code is not evidence.
- AC11 is a command, not a unit test: `bun run build:scripts`, then `rg -n "SUPERSKILL_STDIN_TIMEOUT_MS" plugins/cc/scripts/anti-hallucination/validate_response.mjs`, then a second `bun run build:scripts` whose `git diff -- plugins/cc/scripts/anti-hallucination/validate_response.mjs` is empty.
- AC17 is the four full commands from `### Plan` P6, each with its exit code, pasted from the run that just finished. A green unit file does not stand in for `bun run spur-check`.
- `plugins/cc/tests/hook-examples.test.ts` is named in the focused loop and must be in the paste, because this task must not disturb those examples.
- Coverage line: the `bun run test` summary's line and function percentages, both at or above 90. If the report has no percentage, say so and paste the command output. Do not invent a number.

Pre-existing failures, if any, get their own line with the command and the first error. They are not marked fixed by this task.

### Review

Not reviewed post-implementation. `/sp-dev-review 0147` replaces this section. The input review's open rows, anchored at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:150`, are:

When this section is written it must contain a findings table with columns Priority, Dimension, Location, Finding, and Disposition. Disposition is `fixed in <commit>` or `still open`. One row per id below, including the ones this task claims to close. A closed row cites the test name from `### Testing`.

- F1 blank assistant turns. Correctness. `ah_guard.ts` `messageText` and both extractors.
- F2 filename dots splitting sentences. Correctness. `hasWeakExternalClaim`.
- F3 past-tense and modal couplers. Correctness. `CLAIM_COUPLER_PATTERN` and the modal pattern.
- F4 staged stdin twin, which is also architecture candidate C1. Correctness. `readPipedStdin` and `validate_response.mjs`. The disposition says whether the parity test imports both resolvers and whether `ah_guard.ts` itself imports `apps/cli` (it must not).
- F5 expert allowlists. Usability. The three agent files and `plugins/cc/README.md`.
- F6 confidence word boundaries. Correctness. `CONFIDENCE_PATTERNS`.
- F7 transcript tail. Security and efficiency. `readTranscriptForStop`. The disposition says the reader refuses non-regular files and does not confine the path to the project.

If the post-implementation review finds a new issue, add a row. Do not delete an F-row to make the table shorter. `blocker` or `major` left `still open` means this task is not ready for `done`.

### References

- Origin: advisory `/sp-dev-review plugins --agent inline --focus all` on 2026-09-23. Path mode. `--fix` was a no-op. No verdict file was written. Anchors re-read on `main@09ad0cd` while authoring this task.
- Reproductions from that review, to be replaced by AC1–AC15:
  - `runStopGuard` on a two-line JSONL whose second assistant omits `content`, or sets `content: null`, returned an allow envelope. A trailing `[{ type: 'tool_use' }]` returned `decision: 'block'`.
  - `requiresExternalVerification` was false for `The API documented in readme.md returns a paginated list.`, `The library (see lodash.js) returns a Buffer.`, `The endpoint in service.ts returns 404 for unknown ids.`, `The library returned a Buffer from decode.`, `The API accepted a null body and returned 204.`, `The framework exposed a helper for retries.`, and `The API will return a paginated list of users.`
  - `requiresExternalVerification('The API returns a paginated list')` was true.
  - `hasConfidenceLevel('Confidence: HIGHWAY')` was true. `verifyAntiHallucinationProtocol('Confidence: HIGHWAY\nThe API returns a paginated list.\nplugins/cc/plugin.json:1')` was `ok: true`.
  - `rg -n "SUPERSKILL_STDIN_TIMEOUT_MS" plugins/cc` returned no matches.
- Source anchors at `09ad0cd`:
  - `plugins/cc/scripts/anti-hallucination/ah_guard.ts:27` (`readFileSync` import), `:53` (file:line citation), `:62-68` (confidence), `:150-181` (`messageText`, `extractLastAssistantMessage`), `:184-206` (transcript extractor), `:225-269` (`resolveStopContext`), `:338` (weak keywords), `:342-343` (couplers), `:350` (lifecycle verbs), `:352-359` (sentence split), `:456-476` (`runStopGuard`), `:487-490` (`main`), `:493-536` (`readPipedStdin`)
  - `plugins/cc/scripts/anti-hallucination/validate_response.ts:35-47` (`readStdinText`)
  - `plugins/cc/scripts/anti-hallucination/validate_response.mjs:136-167` (bundled reader, generated)
  - `plugins/cc/scripts/anti-hallucination/lib/env.ts` (`getEnvVar`)
  - `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:89-114`, `:180-225`, `:689-711`, `:714-763`
  - `apps/cli/src/stdin.ts:20-94`
  - `apps/cli/src/commands/hook-run.ts:212-220` (production Stop path, out of scope)
  - `plugins/cc/hooks/hooks.json:10-11`
  - `plugins/cc/agents/expert-agent.md:19`, `:56`, `:63-68`, `:134-135`
  - `plugins/cc/agents/expert-command.md:19`, `:56`, `:63-68`
  - `plugins/cc/agents/expert-hook.md:10`, `:61-68`
  - `plugins/cc/agents/expert-skill.md:13` and `plugins/cc/agents/expert-magent.md:13` (do not edit)
  - `plugins/cc/README.md:103-106`, `:145-146`
  - `plugins/cc/skills/cc-agents/references/frontmatter-reference.md:13`, `:37`
  - `docs/04_DESIGN.md:305-311`, `:320-340`
  - `docs/00_ADR.md:321` (ADR-024)
  - `docs/features/H2_cc-plugin-security-and-contract-integrity.md` (ship scenarios, not extended by this task)
  - `package.json` script `build:scripts`
- Conventions: `AGENTS.md` testing section (residual-proof negatives carry both halves and are labeled). `docs/99_PROJECT_CONSTITUTION.md` same-commit doc sync: this task updates `docs/04_DESIGN.md` because R4 and R7 change a contract that file already states. No ADR, because the decision is not new.
- Sibling task: `0146` is the packages/core review batch. It does not overlap these files. Do not edit it.

### History
