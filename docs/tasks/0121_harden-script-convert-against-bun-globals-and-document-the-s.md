---
template: feature-impl
schema_version: 1
name: "Harden script convert against Bun globals and document the script run contract limits"
description: ""
status: done
type: task
profile: standard
feature_id: H1
parent_wbs: null
priority: P2
tags: []
dependencies: []
ac_numbering: task-local
created_at: "2026-08-19T00:09:45.164Z"
updated_at: "2026-08-19T01:26:20.574Z"
---

## 0121. Harden script convert against Bun globals and document the script run contract limits

### Background
Found while auditing `plugins/sp` (spur-new) against the plugin-script guide on 2026-08-18, against
superskill `752d839` / v0.3.16. Three issues in the script surface, one of them a silent-failure bug.

#### 1. `script convert` emits broken twins for any source using Bun globals — silently
`apps/cli/src/commands/script-convert.ts:39` bundles with `Bun.build({ entrypoints, target: 'node',
… })`. `target: 'node'` rewrites module resolution but **does not polyfill the `Bun.*` global
namespace**, and convert performs no post-bundle check. Reproduced end to end:

```
$ superskill script convert sp dogfood-testing/validate-report.ts
✓ …/validate-report.ts → …/validate-report.mjs (4526 bytes)      # exit 0, correct node shebang

$ node …/validate-report.mjs
function mainCli(argv = Bun.argv.slice(2)) {                      # ReferenceError: Bun is not defined
```

The command reports success and writes a `#!/usr/bin/env node` file that cannot run under Node —
exactly the outcome the Entrypoint Contract exists to prevent. It has gone unnoticed because
`plugins/cc/scripts/anti-hallucination/validate_response.ts`, the only converted script in the repo,
uses **zero** Bun globals. In the `sp` plugin, **5 of its 14** scripts would produce a broken
twin (`Bun.argv`, `Bun.file`, `Bun.spawn`, `Bun.spawnSync`).

This directly contradicts feature H1's own scope line, which lists *"requiring Bun on all targets"*
as **out of scope**.

#### 2. `script run` cannot host an externally-maintained or flag-driven script
From `apps/cli/src/commands/script-run.ts` (v0.3.16):

- `ScriptRunner.run(input: { stdinText?, env }): ScriptRunResult` — **no argv channel**, and
  **synchronous** (`scriptRun()` never awaits; `HookRunner` by contrast supports `async run`).
- `SCRIPT_RUNNERS` is a hardcoded `const` populated by a static top-level import
  (`from '../../../../plugins/cc/scripts/anti-hallucination/validate_response'`). There is **no
  dynamic registration path**, so a plugin living in another repo cannot self-register. `sp`'s hooks
  work only because `runSpTaskWriteGuard` was reimplemented inside `hook-run.ts`.

Consequence for plugin authors: any flag-driven CLI (`--wbs`, `--date`, subcommands) or any
async/subprocess script is disqualified from the optional contract, and an external plugin pays a
superskill release per fix. That is a legitimate design position — but it is currently undocumented,
so authors reach for `script run` expecting it to solve installed-path fragility and discover the
constraints only after committing.

#### 3. The guide overclaims and omits
`docs/help/how_to_organize_scripts_for_plugin_development.md` states the twin *"runs under bare Node
on any target"* without the Bun-globals precondition, and documents `ScriptRunner` registration
without noting it is first-party-only, argv-less, and sync. A patch for this is prepared and applied
separately from this task.

#### Downstream
spur-new task **0600** (feature `I`) aligns `plugins/sp`'s 14 scripts to the standard contract and is
**blocked on this task's release** for its twin-build step.
### Requirements
- R1 — Make `script convert` fail loudly instead of emitting a broken artifact: after bundling, detect any surviving reference to the `Bun` global and exit non-zero, naming the offending global and the source symbol that uses it.
- R2 — Offer a usable path forward in that failure message: name the Node equivalent for each detected global (`Bun.argv` → `process.argv.slice(2)`, `Bun.file` → `node:fs`, `Bun.spawn`/`Bun.spawnSync` → `node:child_process`).
- R3 — Cover the regression with a test that converts a fixture source using `Bun.argv` and asserts convert exits non-zero — the current suite passes only because the sole real subject happens to be Bun-free.
- R4 — Decide and record whether `script run` should gain an argv channel and async support, or stay deliberately minimal as a pure-validator surface; if it stays minimal, state that in the runner's own doc comment so the constraint is discoverable at the definition site.
- R5 — Decide and record whether an externally-maintained plugin can ever register a `ScriptRunner` without vendoring its logic into this repo; if not, say so explicitly at `SCRIPT_RUNNERS` so future authors are not misled by the plugin-agnostic `<plugin>` argument.
- R6 — Verify the shipped `cc` twin is genuinely Node-runnable by executing it under `node` in the build or test path, rather than treating a zero exit from convert as proof.
### Acceptance Criteria
```gherkin
Feature: script convert and script run contract hardening

  Scenario: R1 — a Bun-global source is rejected, not silently bundled
    Given a plugin script source that calls Bun.argv
    When superskill script convert is run against it
    Then the command exits non-zero
    And no .mjs twin is left behind as if it had succeeded

  Scenario: R2 — the failure tells the author what to do
    Given convert has rejected a source for using Bun globals
    When the error message is read
    Then it names each detected Bun global and its Node equivalent

  Scenario: R3 — the regression is covered by a fixture, not by luck
    Given a fixture source using a Bun global
    When the test suite runs
    Then a test asserts convert fails on that fixture

  Scenario: R4 — the runner's limits are discoverable at the definition
    Given a plugin author reads the ScriptRunner interface
    When they consider it for a flag-driven CLI
    Then the doc comment states whether argv and async are supported

  Scenario: R5 — external registration is answered explicitly
    Given a plugin maintained outside this repository
    When its author looks for how to register a ScriptRunner
    Then the registry states whether that is possible and what it requires

  Scenario: R6 — the shipped twin is proven runnable
    Given the cc validate-response twin is built
    When the build or test path runs
    Then the twin is executed under node and its exit status is asserted
```
### Q&A
Decisions closed during implement-ready refinement (2026-08-18). All verified against the working
tree at `752d839` + the uncommitted guide patch.

**Q1 — Should `script run` gain an argv channel and async support (R4)?**
**No — it stays deliberately minimal.** Authority: feature **H1 scope** already lists *"runtime
discovery of arbitrary third-party scripts without install"* as **Out**, and the dual contract
(`docs/04_DESIGN.md:124`) already routes flag-driven work to the **standard** contract:
`node "$(superskill script path <plugin> <rel>)" [args]` — which has full argv, full async, and no
superskill release coupling. Adding argv/async to `ScriptRunner` would duplicate the standard
contract inside a surface whose only justification is the compile-time deep import (ADR-022,
amended ADR-024). No ADR entry required: this records an existing decision, it does not create one.
Deliverable is a doc comment at the interface, not a signature change.

**Q2 — Can an externally-maintained plugin register a `ScriptRunner` without vendoring (R5)?**
**No.** `SCRIPT_RUNNERS` (`apps/cli/src/commands/script-run.ts:63`) is a hardcoded `const`
populated by a static top-level import. Registration requires code inside superskill's compile
graph, because `bun build --compile` must bundle it (ADR-022). The `<plugin>` argument is a
**namespace key**, not an extension point — that is the misleading part, and it is what the doc
comment must say. Precedent: `sp`'s own hook works only because `runSpTaskWriteGuard` was
reimplemented inside `hook-run.ts`. External plugins use the standard contract instead.
Same authority as Q1; no ADR entry.

**Q3 — Where does the Bun-global check live: source scan or bundle scan?**
**Bundle scan**, inside `convertScriptToPortableTwin`, immediately before `writeFileSync`. A source
scan misses a `Bun.*` reference reached through an imported module — and the bundle is what actually
ships. Placing it before the write is also what makes R1's *"no `.mjs` twin left behind"* true for
free, and matches the existing failure shape (the `bun build failed` throw already leaves no file;
`script-convert.test.ts:81,93` already assert `existsSync(out) === false`).

**Q4 — Do we add an escape-hatch flag (`--allow-bun-globals`)?**
**No.** There is no legitimate consumer: the twin exists precisely because the target has no Bun.
A flag would let the silent-failure mode back in behind an opt-in. Deferred with no re-open
condition short of a target that ships Bun.

**Q5 — Does `--dry-run` detect Bun globals?**
**No — out of scope.** `--dry-run` returns before bundling (`script-convert.ts:80-83`); detection
requires the bundle. Do not add bundling to `--dry-run` to "make it symmetric".

**Q6 — Textual scan false positives (a string literal containing `Bun.`)?**
**Accepted ceiling.** The scan is textual over the bundled text, so `const s = "use Bun.file"`
would fail convert. Cost of a false positive is a loud, actionable error the author resolves by
renaming a string; cost of the alternative (stripping literals/comments, or an AST pass) is real
code for a case that has never occurred. Record the ceiling with a `ponytail:`-style comment naming
the upgrade path (strip string literals before scanning). Do **not** build the AST pass now.
### Design
**WHAT** — one guard in `convertScriptToPortableTwin` that rejects a bundle still referencing the
`Bun` global, plus two doc comments recording already-settled contract limits (see `### Q&A`), plus
a node-execution assertion on the shipped `cc` twin. **No new flag, no signature change, no ADR.**

**WHY here** — the guard lives in the shared engine, not the command action, because every caller
(`--out`, `build:scripts`, the CLI action, future plugin authors) funnels through it, and because
placing it before `writeFileSync` is what makes "no `.mjs` left behind" true without cleanup code.

**WHERE — primary targets**

| File | Change |
| --- | --- |
| `apps/cli/src/commands/script-convert.ts` | add `BUN_GLOBAL_NODE_EQUIVALENTS`, `findBunGlobals()`, the pre-write guard, and a try/catch in the action |
| `apps/cli/tests/commands/script-convert.test.ts` | R3 fixture test, R2 message test, R6 twin-runs-under-node test |
| `apps/cli/src/commands/script-run.ts` | doc comments only — at `ScriptRunner` (R4) and at `SCRIPT_RUNNERS` (R5) |
| `docs/help/how_to_organize_scripts_for_plugin_development.md` | same-commit sync (see Doc sync below) |
| `docs/04_DESIGN.md` | same-commit sync of the one-line convert description (line ~124) |

**Frozen names**

```ts
/** Bun globals that survive `Bun.build({ target: 'node' })`, mapped to their Node replacement. */
const BUN_GLOBAL_NODE_EQUIVALENTS: Record<string, string> = {
    argv: 'process.argv.slice(2)',
    env: 'process.env',
    file: 'node:fs (readFileSync / createReadStream)',
    write: 'node:fs (writeFileSync)',
    spawn: 'node:child_process (spawn)',
    spawnSync: 'node:child_process (spawnSync)',
    $: 'node:child_process (execFileSync)',
    sleep: 'node:timers/promises (setTimeout)',
    stdin: 'process.stdin',
    stdout: 'process.stdout',
    stderr: 'process.stderr',
};

/** One surviving `Bun.<prop>` reference in the bundled output. */
export interface BunGlobalUse {
    /** Property name, e.g. `argv`. */
    prop: string;
    /** 1-based line number in the BUNDLED text (not the source). */
    line: number;
    /** Trimmed bundled line, so the author can locate the symbol. */
    text: string;
}

/** Scan bundled output for surviving `Bun.*` references. Exported for direct unit test. */
export function findBunGlobals(bundled: string): BunGlobalUse[];
```

`findBunGlobals` scan: `/\bBun\s*\.\s*([A-Za-z_$][\w$]*)/` applied per line, every match reported
(duplicate props on different lines are separate entries; de-duplicate only when rendering the
"→ equivalent" hint). Unknown prop → hint `'no Node equivalent recorded — replace with a Node built-in'`.

**Precedence / order of operations in `convertScriptToPortableTwin`**

1. `Bun.build` (unchanged) → existing `!res.success` throw (unchanged).
2. Read produced file, shebang rewrite, main-guard strip (unchanged).
3. **NEW:** `findBunGlobals(bundled)`; if non-empty, `throw new Error(<message below>)` — **before**
   `writeFileSync`. The `finally { rmSync(tmpDir) }` already cleans the temp dir.
4. `writeFileSync` → return `ConvertedTwin` (unchanged).

Scan the **post-processed** `bundled` string (step 3 after step 2) — that is the exact text that
would have been written.

**Frozen error message shape (R1 + R2)**

```
Bun globals survive the bundle — the twin would die under Node with "ReferenceError: Bun is not defined".
Not written: /abs/path/to/validate-report.mjs
  Bun.argv (bundled line 5: function mainCli(argv = Bun.argv.slice(2)) {) → process.argv.slice(2)
  Bun.file (bundled line 6: const f = Bun.file(argv[0] ?? "");) → node:fs (readFileSync / createReadStream)
Replace them in /abs/path/to/validate-report.ts, then re-run script convert.
```

Line numbers are **bundle-relative** and the message says so; the quoted line text is how the author
identifies the symbol. Assert on the substrings `Bun globals survive the bundle`, `Bun.argv`, and
`process.argv.slice(2)` — not on whitespace or full-message equality.

**CLI action error handling**

Wrap the `convertScriptToPortableTwin` call in the action in `try/catch`; on catch,
`echoError((err as Error).message)` then `exitFn(1)` — matching the existing `Source not found`
branch (`script-convert.ts:76-79`). Message goes to **stderr** and nothing to stdout, in both plain
and `--json` mode (a machine consumer reads exit code + empty stdout). This also gives the existing
`bun build failed` throw a clean CLI surface instead of an unhandled-rejection stack trace.

**R6 — twin-runnable proof**

A **test**, not a build step: `bun run check` runs it on every change, whereas a `&& node …` in
`build:scripts` only fires at build time. Spawn the committed twin
(`plugins/cc/scripts/anti-hallucination/validate_response.mjs`, resolved from `import.meta.dir`)
with `RESPONSE_TEXT` set, assert `status === 0` and stdout parses to `{ ok: true }`. Verified
runnable today, so this lands green: `echo '{"text":"hi"}' | node …/validate_response.mjs` →
`{"ok":true,"reason":"Task is complete"}`.

**Doc sync (same commit — the guide is already patched but will go stale)**

`docs/help/how_to_organize_scripts_for_plugin_development.md` currently carries an **uncommitted**
patch describing the bug as a live gap. Once R1 lands, three passages become false and must be
rewritten in the same commit:

1. The `script convert` bullet "A source calling `Bun.argv` … converts *successfully*" → convert now
   **rejects** it with the mapping table; keep the replacement guidance.
2. The status-table row "**Known gap:** does not polyfill or reject `Bun.*` globals" → gap closed.
3. The anti-pattern row "Trusting `script convert`'s exit code as proof the twin works" → keep the
   row (convert still cannot prove runtime behavior) but restate the reason: exit 0 now means
   *no Bun globals*, not *the twin runs*.

Edit the **working-tree** version (the patch is applied, not committed) and delete the stray
`docs/help/how_to_organize_scripts_for_plugin_development.md.bak`.
`docs/04_DESIGN.md:124` gains one clause: convert rejects sources whose bundle still references
`Bun.*`. The flag table (`docs/04_DESIGN.md:69`) is **unchanged** — no new flag.

**Anti-patterns — do NOT implement**

- **No `--allow-bun-globals` / `--force` escape hatch.** Q4 closed this.
- **No source-file scan** instead of / in addition to the bundle scan (misses transitive imports).
- **No AST or transpiler pass** to eliminate string-literal false positives. Leave a comment naming
  the ceiling and the upgrade path (strip string literals) — that is the whole mitigation.
- **No bundling inside `--dry-run`** to make detection symmetric (Q5).
- **No change to `ScriptRunner`'s signature or to `SCRIPT_RUNNERS`' shape** — R4/R5 are doc comments
  only. Do not add argv, do not make `run` async, do not add a dynamic registration path.
- **No autofix** that rewrites `Bun.argv` → `process.argv` in the author's source.
- **No rebuild/recommit of `validate_response.mjs`** — it is Bun-free and unchanged by this task.

**Cross-task**

No `dependencies[]`. **Downstream:** spur-new task **0600** (feature `I`) is blocked on this task's
**release**, not merely its merge — it needs a published superskill whose `script convert` rejects
Bun globals before it converts `plugins/sp`'s 14 scripts. Leave the twin-build behavior of
`build:scripts` unchanged so 0600's step is a plain `script convert` invocation. This task must not
touch `plugins/sp` in any repo.
### Plan
Ordered; each step names the R-item it satisfies. Steps 1-3 are one commit's worth of code; 4-6 are
docs/comments; 7 is the gate.

1. **[R1]** In `apps/cli/src/commands/script-convert.ts`, add `BUN_GLOBAL_NODE_EQUIVALENTS`,
   `BunGlobalUse`, and the exported `findBunGlobals(bundled)` per the frozen shapes in `### Design`.
   Add the ceiling comment naming the textual-scan limitation and its upgrade path.
2. **[R1+R2]** Wire the guard into `convertScriptToPortableTwin` between the main-guard strip and
   `writeFileSync`: non-empty result → `throw new Error(<frozen message>)`. Add the `try/catch` in
   the command action → `echoError(message)` + `exitFn(1)`.
3. **[R3]** Extend `apps/cli/tests/commands/script-convert.test.ts`:
   - engine-level: a fixture source using `Bun.argv` + `Bun.file` →
     `await expect(convertScriptToPortableTwin(src, out)).rejects.toThrow(/Bun globals survive/)` and
     `expect(existsSync(out)).toBe(false)` (mirrors the existing failure-path assertions at :81/:93).
   - message content **[R2]**: same rejection asserts the thrown message contains `Bun.argv` and
     `process.argv.slice(2)`.
   - CLI-level: `seedSource` variant writing a `Bun.argv` source → `parseAsync(... 'convert' ...)`
     with the injected `exit` throws `/exit 1/`, `exits` is `[1]`, stderr contains
     `Bun globals survive`, and no `.mjs` exists under the temp project root.
   - negative control: the existing Bun-free `demo.ts` cases must still succeed — do not weaken them.
4. **[R6]** Add the twin-runs-under-node test: spawn `node` on
   `plugins/cc/scripts/anti-hallucination/validate_response.mjs` (resolved from `import.meta.dir`)
   with `RESPONSE_TEXT` set; assert exit 0 and `JSON.parse(stdout).ok === true`.
5. **[R4+R5]** Doc comments only in `apps/cli/src/commands/script-run.ts`: at the `ScriptRunner`
   interface (argv-less + synchronous, deliberate, flag-driven/async → standard contract) and at
   `SCRIPT_RUNNERS` (first-party-only; `<plugin>` is a namespace key, not an extension point; cite
   the compile-time deep import and the `sp` hook precedent). Wording source: `### Q&A` Q1/Q2. No
   signature or registry-shape change.
6. **Doc sync (same commit)** — apply the three rewrites listed under `### Design` → *Doc sync* in
   `docs/help/how_to_organize_scripts_for_plugin_development.md` (edit the working-tree version, the
   patch is applied but uncommitted), delete the stray `.bak` beside it, and add the one clause to
   `docs/04_DESIGN.md:124`. Leave the `docs/04_DESIGN.md:69` flag table untouched.
7. **Gate** — `bun run lint`, `bun run test`, `bun run build` (must still produce the `cc` twin via
   `build:scripts` — it is Bun-free, so the new guard is a no-op for it), then `bun run spur-check`.
   `git status` shows only the files named in `### Design` → *WHERE*.

**Verification intent** — R1/R2/R3 are proven by the new fixture tests (rejection + no artifact +
message content, at both engine and CLI level); R6 by the node-spawn test; R4/R5 by reading the two
doc comments at their definition sites (no runtime behavior to assert). The end-to-end proof that
the bug is dead: `bun run build` still succeeds on the Bun-free `cc` source while a `Bun.argv`
fixture now fails convert.
### Solution
Implemented per the frozen design (steps 1–6). One commit's worth of code + docs. All claims verified: `bun run lint` clean, `bun run test` 2057 pass / 0 fail, `bun run build` succeeds producing the cc twin.

## Change map

**R1 + R2 — Bun-global guard in `script convert`**
- `apps/cli/src/commands/script-convert.ts:15` — added `BUN_GLOBAL_NODE_EQUIVALENTS` (10 Bun→Node mappings: argv/env/file/write/spawn/spawnSync/$/sleep/stdin/stdout/stderr).
- `apps/cli/src/commands/script-convert.ts:30` — `BunGlobalUse` interface.
- `apps/cli/src/commands/script-convert.ts:47` — exported `findBunGlobals(bundled)`: per-line textual scan (`\bBun\s*\.\s*prop`) over the bundled text. Textual-scan ceiling (string-literal `Bun.` false positive) documented with a `ponytail:` comment naming the upgrade path (strip string literals before scanning); no AST pass.
- `apps/cli/src/commands/script-convert.ts:104-120` — guard wired between the main-guard strip and `writeFileSync`: any surviving `Bun.*` throws the frozen error message (names each offending global by prop + bundle-relative line + Node equivalent; props deduped when rendering the hint) before any write → "no .mjs left behind" without cleanup code.
- `apps/cli/src/commands/script-convert.ts:165` — action wrapped `convertScriptToPortableTwin` in try/catch → `echoError(message)` + `exitFn(1)`, matching the `Source not found` branch; message to stderr, nothing to stdout, plain and `--json`. Unknown prop → "no Node equivalent recorded — replace with a Node built-in".

**R3 — regression coverage** (`apps/cli/tests/commands/script-convert.test.ts`)
- Engine-level: `Bun.argv` + `Bun.file` fixture → rejects `/Bun globals survive/`, `existsSync(out)===false`, message contains `Bun.argv` + `process.argv.slice(2)`.
- `findBunGlobals` direct unit: reports `['argv','file']` with correct bundle line numbers.
- CLI-level: seeded `Bun.argv` → injected `exit` throws `/exit 1/`, `exits=== [1]`, stderr contains `Bun globals survive`, no `.mjs` under temp project root.
- Existing Bun-free `demo.ts` negative-control cases untouched and still passing.

**R4 + R5 — contract limits documented** (`apps/cli/src/commands/script-run.ts`, doc comments only, no signature/registry change)
- `apps/cli/src/commands/script-run.ts:38` — `ScriptRunner`: deliberately argv-less + synchronous; flag-driven/async → standard contract (`node "$(superskill script path <plugin> <rel>)" [args]`).
- `apps/cli/src/commands/script-run.ts:66` — `SCRIPT_RUNNERS`: first-party-only (bundled at build time, ADR-022); `<plugin>` is a namespace key, not an extension point; cites `sp` `hook-run.ts` precedent; external plugins use the standard contract.

**R6 — twin-runnable proof** (`apps/cli/tests/commands/script-convert.test.ts`)
- Spawns `node` on `plugins/cc/scripts/anti-hallucination/validate_response.mjs` (resolved from `import.meta.dir`) with `RESPONSE_TEXT` set; asserts exit 0 and `JSON.parse(stdout).ok === true`.

**Doc sync (same commit)**
- `docs/help/how_to_organize_scripts_for_plugin_development.md` — rewrote the "must not use Bun-only globals" bullet (rejects + names equivalents + writes nothing; exit 0 = no Bun globals, not "the twin runs"); updated the validate_response blockquote; restated the "Trusting exit code" anti-pattern row; closed the "Known gap" status-table row.
- `docs/04_DESIGN.md` — added the clause that convert rejects sources whose bundle still references `Bun.*`. Flag table unchanged (no new flag).
- No `.bak` file existed in the working tree to delete; `validate_response.mjs` intentionally unchanged (Bun-free → guard is a no-op).

## Anti-patterns honored (not implemented)
No `--allow-bun-globals` flag; no source-scan instead of bundle-scan; no AST/transpiler pass; no bundling in `--dry-run`; no `ScriptRunner`/`SCRIPT_RUNNERS` shape change; no autofix of `Bun.argv`; no rebuild/recommit of `validate_response.mjs`.

## Files changed
- `apps/cli/src/commands/script-convert.ts`
- `apps/cli/src/commands/script-run.ts`
- `apps/cli/tests/commands/script-convert.test.ts`
- `docs/help/how_to_organize_scripts_for_plugin_development.md`
- `docs/04_DESIGN.md`
### Testing
**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `apps/cli/src/commands/script-convert.ts:104-120` — guard between main-guard strip and `writeFileSync`: `findBunGlobals(bundled)` non-empty → throws frozen message; nothing written (no `.mjs` left behind). CLI action try/catch → `echoError` + `exitFn(1)` at `:165-169`. Verified live: `script convert zz bad.ts` (Bun.argv+Bun.file fixture) → exit 1, empty stdout, no `.mjs` twin |
| R2 | MET | `apps/cli/src/commands/script-convert.ts:15-27` `BUN_GLOBAL_NODE_EQUIVALENTS` (argv/env/file/write/spawn/spawnSync/$/sleep/stdin/stdout/stderr); `:115-120` frozen message renders `Bun.<prop> (bundled line N: <text>) → <equiv>`. Live: `Bun.argv → process.argv.slice(2)`, `Bun.file → node:fs (readFileSync / createReadStream)` |
| R3 | MET | `apps/cli/tests/commands/script-convert.test.ts` — engine-level `Bun.argv`+`Bun.file` fixture rejects `/Bun globals survive/` + `existsSync(out)===false`; CLI-level seeded `Bun.argv` → `exits=== [1]`, stderr contains `Bun globals survive`, no `.mjs`; `findBunGlobals` direct unit. Negative control: Bun-free `demo.ts` cases still pass. File: 14 pass / 0 fail, 100% line+func coverage on script-convert.ts |
| R4 | MET | `apps/cli/src/commands/script-run.ts:38-41` — doc comment at `ScriptRunner` interface: deliberately argv-less + synchronous; flag-driven/async → standard contract `node "$(superskill script path <plugin> <rel>)" [args]`; no signature change |
| R5 | MET | `apps/cli/src/commands/script-run.ts:66-70` — doc comment at `SCRIPT_RUNNERS`: first-party-only (bundled at build time, ADR-022); `<plugin>` is a namespace key, not an extension point; external plugins use the standard contract; cites `sp` `hook-run.ts` precedent; no registry-shape change |
| R6 | MET | `apps/cli/tests/commands/script-convert.test.ts:131-138` spawns `node` on the committed twin; live: `RESPONSE_TEXT='{"text":"hi"}' node plugins/cc/scripts/anti-hallucination/validate_response.mjs` → `{"ok":true,"reason":"Task is complete"}`, exit 0 |
| R1 — a Bun-global source is rejected, not silently bundled | MET | command |
| R2 — the failure tells the author what to do | MET | command |
| R3 — the regression is covered by a fixture, not by luck | MET | test |
| R4 — the runner's limits are discoverable at the definition | MET | code |
| R5 — external registration is answered explicitly | MET | code |
| R6 — the shipped twin is proven runnable | MET | command |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)
### Review
## Review Report — 0121 (Harden script convert against Bun globals and document the script run contract limits)

**Scope:** working-tree diff of `apps/cli/src/commands/script-convert.ts`, `apps/cli/src/commands/script-run.ts`, `apps/cli/tests/commands/script-convert.test.ts`, `docs/help/how_to_organize_scripts_for_plugin_development.md`, `docs/04_DESIGN.md` (uncommitted changes for task 0121).
**Dimensions:** functional traceability (R1-R6), SECUA correctness, architecture depth.
**Verdict:** APPROVED — no P1/P2/P3 findings; 3 advisory (P4) items, none blocking.

**Findings (ranked)**

| # | Severity | Dimension | Finding | Location |
|---|----------|-----------|---------|----------|
| 1 | P4 | correctness | Scan under-detects Bun-global forms beyond frozen regex: `Bun?.x`, `Bun["x"]`, and bare `Bun` (e.g. `typeof Bun`) escape detection and would still ship a twin that dies under Node. Verified live: all three return `(none)`. The frozen regex (`/\bBun\s*\.\s*([A-Za-z_$][\w$]*)/g`) is honored exactly, so this is a residual gap R1's wording ("any surviving reference") does not fully cover — Q6 documents only the string-literal *over*-detection ceiling, never this under-detection gap. | `apps/cli/src/commands/script-convert.ts:39,47-57` |
| 2 | P4 | quality | `docs/04_DESIGN.md` carries unrelated table-separator whitespace churn across ~8 sections (install table, command surface, hooks table, skill-add verbs, source-parser, hooks.json, stdin table, npx-skills). Design specified "one clause at line ~124, flag table unchanged" — flag table is semantically unchanged (confirmed: `script convert` = `--out/--dry-run/--json`, no new flag) but the cosmetic reformatting widens the same-commit review surface beyond the stated doc-sync scope. | `docs/04_DESIGN.md` (multiple table rows) |
| 3 | P4 | robustness | R6 twin test uses `spawnSync` with no timeout; if the twin ever regresses into blocking on stdin, the test runner would hang. Passes today (RESPONSE_TEXT set, 23ms) — low risk. | `apps/cli/tests/commands/script-convert.test.ts:131-138` |

**Frozen design shapes — all honored**

- **`BUN_GLOBAL_NODE_EQUIVALENTS`** — exact 11-entry map, verbatim values (argv/env/file/write/spawn/spawnSync/$/sleep/stdin/stdout/stderr). ✅ `script-convert.ts:15-27`
- **`BunGlobalUse`** interface — `prop`/`line`(1-based bundle)/`text`(trimmed). ✅ `script-convert.ts:30-37`
- **`findBunGlobals(bundled)`** — exported; per-line `\bBun\s*\.\s*prop` scan, all matches reported, dedup only on hint render, unknown-prop fallback hint. ✅ `script-convert.ts:47-57`
- **Error message** — frozen shape confirmed live: `Bun globals survive the bundle…`, `Not written: <out>`, per-global `Bun.<prop> (bundled line N: <text>) → <equiv>`, `Replace them in <src>, then re-run script convert.` Substring assertions match (`Bun globals survive`, `Bun.argv`, `process.argv.slice(2)`). ✅ `script-convert.ts:115-120`
- **Precedence/order** — guard between main-guard strip and `writeFileSync`, scanning the post-processed `bundled` text; `finally { rmSync(tmpDir) }` cleans temp. ✅ `script-convert.ts:100-126`
- **CLI action** — try/catch → `echoError(message)` + `exitFn(1)`; stderr only, empty stdout in both plain and `--json`. ✅ `script-convert.ts:161-169`
- **R4 doc comment** — argv-less + sync, flag-driven/async → standard contract, no signature change. ✅ `script-run.ts:38-42`
- **R5 doc comment** — first-party-only, `<plugin>` is namespace key not extension point, cites ADR-022 + `sp` `hook-run.ts` precedent, no registry-shape change. ✅ `script-run.ts:66-71`

**Anti-patterns — none implemented (all 7 honored)**

- No `--allow-bun-globals`/`--force` escape hatch. ✅
- Bundle scan, not source scan (`findBunGlobals` runs on the bundled text). ✅
- No AST/transpiler pass; `ponytail:` comment names the string-literal ceiling + upgrade path. ✅
- No bundling inside `--dry-run` (returns before `convertScriptToPortableTwin`, `script-convert.ts:157-160`). ✅
- No `ScriptRunner` signature or `SCRIPT_RUNNERS` shape change (doc comments only). ✅
- No autofix rewriting `Bun.argv` → `process.argv`. ✅
- No rebuild/recommit of `validate_response.mjs` — confirmed byte-identical after `bun run build`. ✅

**Functional Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | MET | `script-convert.ts:100-121` guard; engine + CLI tests reject with no `.mjs`; live run verified |
| R2 | MET | `script-convert.ts:115-120` frozen message names global + Node equivalent; substring-asserted |
| R3 | MET | `script-convert.test.ts:95-118` Bun.argv+Bun.file fixture → rejects + no artifact; negative control intact |
| R4 | MET | `script-run.ts:38-42` doc comment at `ScriptRunner` definition site |
| R5 | MET | `script-run.ts:66-71` doc comment at `SCRIPT_RUNNERS` definition site |
| R6 | MET | `script-convert.test.ts:131-138` spawns `node` on committed twin, asserts exit 0 + `{ok:true}` |

**Verification evidence (fresh)**

- `bun test apps/cli/tests/commands/script-convert.test.ts` → **14 pass / 0 fail, 100% coverage** on `script-convert.ts`.
- `bun run test` → **2057 pass / 0 fail** (matches Solution claim).
- `bun run lint` (biome) + typecheck → clean.
- `bun run build` → succeeds; regenerates `validate_response.mjs` (6422 bytes) byte-identical to committed → guard is a genuine no-op for the Bun-free twin.
- Live end-to-end: `convertScriptToPortableTwin` against a `Bun.argv`/`Bun.file` fixture threw the exact frozen message; `git status` shows only the 5 design-named files + new task file; no `.bak`, no `plugins/sp` touched.

**Residual risk**

- `Bun?.x` / `Bun["x"]` / bare `Bun` escape the frozen regex → would still ship a broken twin (rare in practice; beyond frozen contract; recommend documenting as an accepted ceiling in a future task if desired).
- String-literal false positive (`const s = "use Bun.file"` fails convert) — documented Q6 accepted ceiling, `ponytail:` upgrade path noted.
- Failure mode emits human-oriented stderr + exit 1 with empty stdout (per design) — no machine-readable error envelope in `--json`.

**Next:** commit the 5-file diff + task file as one commit (task 0121); downstream task 0600 can then convert `plugins/sp`'s 14 scripts once released.
### References

H1

<!-- Links to the parent feature, design docs, related tasks, or external references. -->

### History
- 2026-08-19T01:14:28.596Z todo → wip (system)
- 2026-08-19T01:26:09.238Z wip → testing (system)
- 2026-08-19T01:26:20.574Z testing → done (system)
