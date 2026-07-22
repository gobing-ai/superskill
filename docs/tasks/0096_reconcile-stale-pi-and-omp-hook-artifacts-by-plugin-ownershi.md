---
template: standard
schema_version: 1
name: "Reconcile stale Pi and OMP hook artifacts by plugin ownership"
description: ""
status: done
type: task
profile: standard
feature_id: null
parent_wbs: null
priority: P1
tags: []
dependencies: []
created_at: "2026-07-22T17:21:19.491Z"
updated_at: "2026-07-22T17:49:43.411Z"
---

## 0096. Reconcile stale Pi and OMP hook artifacts by plugin ownership

### Background
Installing the `sp` and `cc` plugins for Pi can leave two commands on the same `agent_end` event:

```json
{
    "hooks": {
        "agent_end": [
            { "command": "superskill hook run sp context-session-stop", "timeout": 5 },
            { "command": "superskill hook run cc anti-hallucination", "timeout": 10 }
        ]
    }
}
```

`@vahor/pi-hooks` invokes both commands whenever the agent ends. `cc/anti-hallucination` can request
another turn, which causes `agent_end` to fire again. An observed Pi session showed 14
`context-session-stop` calls and 11 `anti-hallucination` calls alternating over 131 seconds; the
session did not terminate normally.

#### Root causes

| ID | Cause | Current surface | Consequence |
|----|-------|-----------------|-------------|
| RC1 | The `sp` plugin previously declared `context-session-stop` on canonical `Stop`, which maps to Pi/OMP `agent_end`. It now declares `SessionEnd`, which maps to `session_shutdown`. | Upstream `sp` plugin hook manifest | Reinstalling the corrected plugin adds the new event, but cannot remove the old event under the current append-only merge. |
| RC2 | `mergePiHooks` unions existing and new entries by command and never removes entries previously generated for the plugin being reinstalled. | `apps/cli/src/hooks.ts` | Event moves, hook removal, timeout/argument changes, and target-policy exclusions leave stale entries active forever. |
| RC3 | `HOOK_TARGET_POLICY` correctly excludes `cc/anti-hallucination` from Pi and OMP, but policy filtering only controls newly emitted hooks. | `apps/cli/src/hooks.ts` | A clean install omits the hook; an upgrade preserves the stale pre-policy copy. |
| RC4 | The anti-hallucination loop guard checks Claude Code's `stop_hook_active`. Pi/OMP `agent_end` payloads carry messages but not that field. | `plugins/cc/scripts/anti-hallucination/ah_guard.ts` | Even without the `sp` teardown hook, a stale anti-hallucination hook can repeatedly continue the same Pi/OMP session. |

The same lifecycle bug exists in the OMP native adapter. `generateOmpHookModules` writes generated
files under `hooks/pre/` and `hooks/post/`, but never removes modules that are no longer in the
installing plugin's desired hook set. A policy-excluded `anti-hallucination.js` therefore remains
loadable after reinstall.

#### Required product behavior

An install is a reconciliation of the installing plugin's generated hook state, not an append-only
event. Before adding the current canonical + target-policy result, remove only artifacts provably
owned by that plugin. Preserve user hooks and every other plugin's artifacts.

After installing a republished `sp` plugin carrying the `SessionEnd` declaration and reinstalling
both `sp` and `cc` for Pi, the resulting config is:

```json
{
    "hooks": {
        "tool_call": [
            { "command": "superskill hook run sp task-write-guard", "timeout": 10 }
        ],
        "tool_result": [
            { "command": "superskill hook run sp context-post-tool", "timeout": 10 }
        ],
        "session_start": [
            { "command": "superskill hook run sp context-session-start", "timeout": 15 }
        ],
        "session_shutdown": [
            { "command": "superskill hook run sp context-session-stop", "timeout": 15 }
        ]
    }
}
```

There is no `agent_end` key after empty event arrays are removed. Repeating either install must not
add duplicates or resurrect removed entries.

#### Immediate operator workaround before a fixed CLI is installed

Existing Pi installations can remove the two stale commands manually, then reinstall a published
`sp` version carrying the `SessionEnd` declaration:

```bash
jq '.hooks.agent_end |= (map(select(.command | test("anti-hallucination|context-session-stop") | not)))
  | (if (.hooks.agent_end | length) == 0 then del(.hooks.agent_end) else . end)' \
  ~/.pi/agent/hooks.json > /tmp/pi-hooks.json && mv /tmp/pi-hooks.json ~/.pi/agent/hooks.json

superskill install sp --targets pi
```

This manual edit is recovery guidance only; the implementation must make subsequent plugin
reinstalls self-healing.

Rubric: E1 D1 L1 C0 R1 = 4 — keep as one task. Pi JSON and OMP modules are two adapters enforcing
one plugin-owned reconciliation invariant, and splitting them would make cross-target parity easy to
lose.
### Requirements
- [x] R1. **Choose the safe target policy (Decision B).** Keep `cc/anti-hallucination` excluded from Pi and OMP in `HOOK_TARGET_POLICY`. Do not add a Pi stop profile, change `ah_guard.ts`, or emit anti-hallucination on `agent_end` in this task. The Claude-only `stop_hook_active` loop sentinel makes Pi/OMP enforcement unsafe until a native, contract-verified loop guard exists.
- [x] R2. **Thread plugin ownership through every emitter path.** Add the installing plugin ID to the Pi-style and OMP reconciliation APIs and all callers: the main `executeInstall` Pi branch; `postInstallOmp` → `generateOmpHookModules`; `emitHooksForSurrogateTarget`; and `commands/hook.ts` (`superskill hook emit`). Update direct unit-test call sites and JSDoc signatures. A secondary command path must not retain append-only behavior.
- [x] R3. **Define ownership from the command grammar.** Reuse one parser for commands matching `superskill hook run <plugin> <hookId> ...`, returning `<plugin>/<hookId>`. An artifact belongs to the installing plugin only when the parsed key starts with the exact `<plugin>/` namespace. Commands that do not parse, including user scripts, are unowned and preserved. Export the parser or an equivalent shared ownership predicate from `hooks.ts` so OMP does not implement a divergent parser.
- [x] R4. **Reconcile Pi-style JSON before unioning.** In `mergePiHooks`, remove the installing plugin's existing entries across every event, delete events that become empty, then merge the current target-policy result and deduplicate by command. Preserve object and string entry shapes, other plugins, event order where possible, and the existing corrupt-input fail-soft contract.
- [x] R5. **Reconcile an authoritative empty desired set.** A valid canonical hook config that becomes empty after target mapping/policy filtering must still reach reconciliation. Do not return before pruning when `hookCount === 0`; this is the exact `cc/anti-hallucination` upgrade case. Missing or malformed canonical input remains fail-soft and must not trigger destructive cleanup. The result message should distinguish “no desired hooks after reconciliation” from an input parse failure if needed for operator clarity.
- [x] R6. **Prune OMP generated modules by proven ownership.** Before generating current modules, inspect direct `*.js` files under `<installPath>/hooks/pre` and `hooks/post`. Delete a file only when it contains both the Superskill-generated banner and a `// Command:` line whose parsed hook key belongs to the installing plugin. Preserve user files, `.ts` files, malformed/foreign generated files, and modules owned by other plugins.
- [x] R7. **Run OMP cleanup even when current output is empty.** Perform the owned-module prune before the `parsed.length === 0` return so a policy exclusion or removed hook deletes orphan modules. When `postInstallOmp` is called with `skipHooks` because `minCliVersion` is unmet, retain the existing skip behavior: do not generate and do not prune.
- [x] R8. **Preserve current hooks and host boundaries.** Do not change canonical event mappings, the `@vahor/pi-hooks` file layout, Hermes behavior, native Claude/Grok delivery, hook-run exit contracts, or unrelated install behavior. The corrected upstream `SessionEnd` mapping already resolves to `session_shutdown`; no new mapping is required in this repository.
- [x] R9. **Lock Pi regressions with observable tests.** Cover moved-event cleanup, policy-excluded-to-empty cleanup, preservation of another plugin, preservation of a user command, deletion of an emptied event, idempotent reinstall, string/object entry compatibility, and the `hook emit` path. Prefer public-emitter behavior tests; export merge internals only if a focused test seam is justified.
- [x] R10. **Lock OMP regressions with filesystem tests.** Prove that all generated orphan modules owned by the installing plugin are removed from both `pre` and `post`, current modules are regenerated, another plugin's generated module survives, user-authored JavaScript survives, non-JavaScript files survive, empty desired output still cleans, and `skipHooks` leaves the cache untouched.
- [x] R11. **Verify the complete upgrade sequence in isolation.** Seed stale Pi and OMP artifacts, run the equivalent of `sp` then `cc` installs against a throwaway output root/cache, and assert the exact desired state. Repeat the sequence and assert structural and byte-level idempotency where serialization is deterministic. Never mutate the operator's real home during automated tests.
- [x] R12. **Ship self-contained operator guidance.** Add an Unreleased changelog entry describing self-healing Pi/OMP hook reinstalls and the intentional continued exclusion of anti-hallucination. Update `docs/help/cmd_hook.md` if its documented internal call signature changes. Record that the corrected `sp` hook manifest must be published/reinstalled before `context-session-stop` can appear on `session_shutdown`.
- [x] R13. **Pass the repository gates.** Run focused hook tests first, then `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check`. No tests may be skipped; `git status` must contain only intentional changes.
### Acceptance Criteria
**AC1 — Pi moved-event reconciliation (R2–R5, R9).**

- Given existing Pi hooks contain `sp/context-session-stop` under `agent_end`
- And the corrected `sp` desired set contains that command under `session_shutdown`
- When `sp` is reinstalled
- Then the command exists once under `session_shutdown`
- And no copy remains under `agent_end`
- And an empty `agent_end` event is removed.

**AC2 — Pi policy exclusion reaches empty reconciliation (R1, R4–R5, R9).**

- Given existing Pi hooks contain `cc/anti-hallucination` under `agent_end`
- And a valid `cc` canonical config is filtered to zero Pi hooks by `HOOK_TARGET_POLICY`
- When `cc` is reinstalled
- Then the stale command is removed
- And the zero-hook early-return path does not bypass reconciliation.

**AC3 — Pi ownership boundary (R3–R5, R9).**

- Given one event contains installing-plugin entries, another plugin's entries, object-form user hooks, and string-form user hooks
- When the installing plugin is reconciled
- Then only that plugin's previous entries are replaced
- And all foreign/unowned entries retain their values and relative order.

**AC4 — Pi idempotency and command updates (R4–R5, R9).**

- Given reconciliation completed once
- When the same plugin is installed again with the same desired set
- Then serialized output is unchanged
- And there are no duplicate commands
- And changing an owned command's timeout or arguments replaces the old owned entry rather than retaining both versions.

**AC5 — OMP orphan cleanup with empty desired output (R1, R3, R6–R7, R10).**

- Given `hooks/post/anti-hallucination.js` carries the Superskill banner and `cc/anti-hallucination` command metadata
- And current OMP policy yields zero hooks for `cc`
- When OMP modules are regenerated for `cc`
- Then the orphan file is removed even though no replacement module is written.

**AC6 — OMP ownership boundary (R3, R6–R7, R10).**

- Given both hook directories contain owned generated modules, another plugin's generated modules, user-authored `.js`, and `.ts` modules
- When one plugin is reconciled
- Then every stale owned generated `.js` is removed before regeneration
- And all other files are byte-identical
- And `skipHooks` performs neither pruning nor generation.

**AC7 — Complete Pi upgrade state (R1, R8, R11).**

- Given a stale pre-policy/pre-event-move Pi config
- And an `sp` package whose teardown hook uses canonical `SessionEnd`
- When `sp` and `cc` are installed for Pi
- Then `tool_call`, `tool_result`, `session_start`, and `session_shutdown` contain the four expected `sp` commands and timeouts
- And `agent_end` is absent
- And reinstalling both produces the same file.

**AC8 — No unsafe anti-hallucination expansion (R1, R8).**

- Given the task is complete
- When the policy and guard diff are inspected
- Then Pi and OMP remain absent from `HOOK_TARGET_POLICY['cc/anti-hallucination']`
- And no Pi profile or Pi-native loop detector was added to `ah_guard.ts`.

**AC9 — Secondary command parity (R2, R9).**

- Given hooks are emitted through `superskill hook emit` instead of `superskill install`
- When the surrogate target is Pi or OMP Pi-style config
- Then the plugin ID reaches the same ownership-aware reconciliation path and produces the same cleanup behavior.

**AC10 — Verification gates (R12–R13).**

- Given implementation and documentation are complete
- When focused tests and all repository verification gates run
- Then every command exits zero, no test is skipped, and only task-scoped files are changed.

**Manual smoke (release verification, non-blocking for unit CI).** In a `.spur/context` project with
`@vahor/pi-hooks` installed, start and end one Pi session. Confirm `agent_end` does not enter a
continuation loop and `context-session-stop` runs once on `session_shutdown`.
### Q&A
| Question | Decision | Rationale |
|----------|----------|-----------|
| Keep anti-hallucination on Pi/OMP `agent_end`? | No — Decision B | Its only recursion sentinel is Claude's `stop_hook_active`; Pi/OMP do not provide it. A forced continuation re-fires `agent_end`. |
| What would be required to revisit Decision A? | A Pi-native “already requested verification” detector over recent assistant messages, an optional consecutive-continuation cap, a Pi `StopProfile` emitting the verified `@vahor/pi-hooks` continuation contract, and explicit policy opt-in for Pi/OMP | The observed interpretation of `decision: block` is insufficient as a contract. Verify primary host documentation and behavior before implementing. |
| Why is append + dedupe insufficient? | Reinstall must replace the installing plugin's generated state | Dedupe prevents duplicates but cannot express removal, event moves, policy exclusion, timeout changes, or argument changes. |
| How is ownership proven? | Exact `superskill hook run <plugin> <hookId> ...` grammar, plus the generated banner for OMP files | Filename alone is not ownership; user and foreign artifacts must survive. |
| Should a zero desired set reconcile? | Yes, when derived from a valid canonical config | Policy exclusion is a desired empty state. Returning early is the root reason stale anti-hallucination survives. |
| Should malformed/missing canonical input prune? | No | Preserve the current fail-soft behavior; invalid input is not authoritative evidence that the plugin intentionally removed all hooks. |
| Should the CLI clean artifacts when hooks are skipped for `minCliVersion`? | No | Compatibility skip means the current CLI cannot safely establish the desired set. Preserve existing state and report the skip. |
| Is the upstream `sp` event move part of this repository's code change? | No | The canonical map already handles `SessionEnd → session_shutdown`. This task fixes reconciliation; release verification depends on publishing/reinstalling the corrected plugin manifest. |
| Why one task? | Both adapters implement one ownership/reconciliation contract | Separate tasks could ship Pi self-healing while leaving OMP with the identical stale-artifact failure. |
### Design
#### Chosen model: replace one plugin's projection, preserve the shared container

Treat the target hook store as a multi-owner materialized view:

```text
existing shared target state
    - artifacts owned by installing plugin
    + installing plugin's current canonical → policy → target projection
    = reconciled shared target state
```

The blast-radius boundary is ownership, not event name or filename. This lets one plugin move a hook
between events or remove it without touching another plugin or a user's custom integration.

#### Shared ownership parser

Use `hookRunKey(command)` (export it if necessary) as the single grammar:

```ts
hookRunKey('superskill hook run sp context-session-stop') === 'sp/context-session-stop';
hookRunKey('my-script.sh') === '';
```

An entry is owned by plugin `p` iff the result starts with `${p}/`. OMP additionally requires the
exact generated banner before trusting its `// Command:` metadata. Do not infer ownership from
`context-session-stop.js`, because a user or another generator may choose the same filename.

#### Pi-style config algorithm

1. Parse the canonical config using the existing fail-soft reader.
2. If input is valid, apply `HOOK_TARGET_POLICY` and convert it to Pi events, even when the result is
   empty.
3. Read existing target `hooks.json`.
4. Across every event, remove entries whose parsed key belongs to the installing plugin; delete
   empty arrays.
5. Union the remaining entries with the current desired set, deduplicating by command as today.
6. Write `{ hooks: reconciled }` through the existing path/layout rules. Dry-run computes/report
   counts but does not mutate.

The plugin argument must flow through both call graphs:

```text
executeInstall(plugin) ────────────────> emitPiStyleHooks(..., plugin)
hook emit(plugin) -> emitHooksForSurrogateTarget(..., plugin)
                                           └────> emitPiStyleHooks(..., plugin)
```

Do not keep the `hookCount === 0` return ahead of steps 3–6. Returning an `emitted: false` result
after a successful empty reconciliation is acceptable, but the message must not imply that cleanup
was skipped.

#### OMP native module algorithm

`postInstallOmp` already receives `plugin`; forward it to `generateOmpHookModules`. For each direct
`*.js` child of `hooks/pre` and `hooks/post`:

1. Read it fail-soft.
2. Require `// Generated by superskill install — do not edit manually.`.
3. Extract the single-line `// Command: ...` metadata.
4. Delete only if the shared parser proves the command belongs to the installing plugin.
5. Generate the current parsed hooks using the existing naming/content logic.

Cleanup occurs after successful canonical JSON parsing but before the `parsed.length === 0` return.
This ordering makes policy exclusion authoritative without deleting anything on malformed input.
`skipHooks` stays outside the generator and bypasses the entire cleanup/generation operation.

#### Rejected alternatives

- **Blindly rewrite all target hooks:** breaks multi-plugin accumulation and destroys user hooks.
- **Delete by hook filename:** filenames do not encode plugin ownership and collide across plugins.
- **Widen `HOOK_TARGET_POLICY` to Pi/OMP:** reintroduces the infinite loop; policy is not the bug.
- **Add a Pi profile without a native loop guard:** output-shape adaptation alone does not prevent
  recursive `agent_end` continuation.
- **Only fix the main install loop:** leaves `superskill hook emit` and OMP post-processing with
  inconsistent stale-artifact behavior.

#### Impacted surfaces

- `apps/cli/src/hooks.ts`: ownership parser visibility, Pi reconciliation, emitter signature/result.
- `apps/cli/src/omp-hooks.ts`: owned generated-file prune and generator signature.
- `apps/cli/src/commands/install.ts`: plugin argument plumbing for install, OMP, and surrogate helper.
- `apps/cli/src/commands/hook.ts`: plugin argument plumbing for `hook emit`.
- `apps/cli/tests/hooks.test.ts`: Pi policy/ownership/idempotency regressions.
- `apps/cli/tests/omp-hooks.test.ts`: OMP cleanup and preservation regressions.
- `apps/cli/tests/commands/install-omp-helpers.test.ts` and hook command tests: call-chain parity.
- `docs/help/cmd_hook.md`, `CHANGELOG.md`: internal call-shape diagram if changed and release note.

No ADR is expected: this restores the existing multi-plugin install contract and target policy
rather than introducing a new architecture or CLI surface. If implementation changes a documented
CLI/config contract, follow the constitution and update the authoritative doc first.
### Plan
1. [x] Reproduce the stale Pi upgrade with a focused red test: seed `sp/context-session-stop` and `cc/anti-hallucination` under `agent_end`, then show current reinstall leaves both entries.
2. [x] Add the shared hook-command ownership seam and thread `plugin` through `executeInstall`, `emitPiStyleHooks`, `emitHooksForSurrogateTarget`, `hook emit`, `postInstallOmp`, and `generateOmpHookModules`.
3. [x] Implement Pi prune-then-merge reconciliation, including the valid-zero-desired path and empty-event deletion; preserve malformed-input and dry-run behavior.
4. [x] Extend Pi tests for event moves, policy exclusion, user/foreign preservation, object/string entries, timeout/argument replacement, both command paths, and repeated-install idempotency.
5. [x] Add an OMP red fixture with a Superskill-generated orphan plus foreign/user files; prove current generation leaves the orphan.
6. [x] Implement OMP banner + command-metadata ownership cleanup before generation and before the zero-parsed return; retain `skipHooks` as a no-op for both prune and generate.
7. [x] Extend OMP and install-helper tests for pre/post cleanup, empty desired sets, regeneration, foreign/user preservation, idempotency, and compatibility skip.
8. [x] Add an isolated end-to-end upgrade fixture for corrected `sp` + policy-excluded `cc`; assert the exact Pi config and repeat-install stability without writing to the real home directory.
9. [x] Update `docs/help/cmd_hook.md` if the internal helper signature/diagram changed, and add an Unreleased changelog entry with the upstream `sp` publish/reinstall prerequisite.
10. [x] Run focused tests, `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check`; inspect `git diff`/`git status`, then record Solution, Testing, and Review through the task pipeline.
### Solution
Implemented plugin-owned reconciliation for both hook adapters and closed the residual verification gaps found by the forced `--fix all` pass.

- `apps/cli/src/hooks.ts:160-170` exports the existing `hookRunKey` grammar as the shared ownership parser. Pi/OMP remain absent from the anti-hallucination target policy at `apps/cli/src/hooks.ts:144-155`.
- `apps/cli/src/hooks.ts:251-299` now prunes only the installing plugin's prior Pi-style entries across all events, removes emptied events, then deduplicates and adds the current desired projection. The merge helper remains private.
- `apps/cli/src/hooks.ts:315-354` threads the plugin ID into Pi-style emission and performs reconciliation before returning the valid-zero-desired result.
- `apps/cli/src/omp-hooks.ts:164-216` prunes direct generated `.js` modules only after successful canonical parsing and only when the Superskill banner plus command grammar prove ownership; cleanup runs before the zero-output return.
- `apps/cli/src/commands/install.ts:410-417`, `apps/cli/src/commands/install.ts:742-767`, and `apps/cli/src/commands/install.ts:1068-1083` propagate ownership through the main Pi install, OMP post-install, and surrogate emitter paths.
- `apps/cli/src/commands/hook.ts:112-115` passes the plugin ID through `superskill hook emit`.
- `apps/cli/tests/hooks.test.ts:470-649` covers policy-excluded empty reconciliation, event moves, ownership boundaries, command replacement, exact Pi upgrade state, and byte-idempotent reinstall.
- `apps/cli/tests/omp-hooks.test.ts:528-662` covers zero-output orphan deletion, foreign/user preservation, both module directories, regeneration, and byte-idempotent reinstall.
- `apps/cli/tests/commands/install-omp-helpers.test.ts:205-230` proves compatibility skips do not prune; `apps/cli/tests/commands/install-omp-helpers.test.ts:414-450` proves the secondary surrogate emitter reconciles stale policy-excluded entries.
- `docs/help/cmd_hook.md:155-166` and `docs/help/cmd_install.md:229-270` document the ownership argument and reconciliation behavior; `CHANGELOG.md:8-12` records the upgrade fix and upstream `sp` publish/reinstall prerequisite.

No Pi/OMP stop profile or loop detector was added, no canonical event mapping changed, and Hermes/Claude/Grok behavior remains outside the reconciliation change.
### Testing
**Verify run:** 2026-07-22T17:42:19Z (`--auto --next --force --focus all --fix all`)

**Verdict: PASS**

**Coverage:** 98.92% lines and 99.85% functions aggregate (`bun run test`). Changed hook modules: `hooks.ts` 100% functions / 99.62% lines; `omp-hooks.ts` 100% functions / 99.14% lines.

**Fresh command evidence**

| Command | Outcome |
|---------|---------|
| `bun test apps/cli/tests/hooks.test.ts apps/cli/tests/omp-hooks.test.ts apps/cli/tests/commands/install-omp-helpers.test.ts` | PASS — 89 tests, 0 failures, 263 assertions |
| `bun run lint` | PASS — Biome checked 179 files; core and CLI typechecks exited 0 |
| `bun run test` | PASS — 1577 tests, 0 failures, 3949 assertions; 98.92% line / 99.85% function coverage |
| `bun run build` | PASS — portable script generated; CLI bundled 825 modules and compiled `dist/superskill` |
| `bun run spur-check` | PASS — lint/typecheck; 29 pre-check rules; 1577 tests; coverage, citation, and TSDoc post-checks |
| `git diff --check HEAD` | PASS — no whitespace errors |
| `git diff HEAD -- plugins/cc/scripts/anti-hallucination/ah_guard.ts plugins/cc/hooks/hooks.json` | PASS — empty; Decision B and canonical hook config unchanged |

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 | MET | `apps/cli/src/hooks.ts:144-155` keeps Pi/OMP absent; empty `git diff` for `ah_guard.ts` and `plugins/cc/hooks/hooks.json` |
| R2 | MET | Plugin propagation at `apps/cli/src/commands/install.ts:410-417`, `:742-767`, `:1068-1083`; `apps/cli/src/commands/hook.ts:112-115` |
| R3 | MET | Shared parser `apps/cli/src/hooks.ts:157-170`; OMP consumer `apps/cli/src/omp-hooks.ts:199-206` |
| R4 | MET | Pi prune-then-merge and empty-event deletion `apps/cli/src/hooks.ts:251-299`; ownership tests `apps/cli/tests/hooks.test.ts:493-570` |
| R5 | MET | Reconciliation precedes zero-result return `apps/cli/src/hooks.ts:323-354`; regression `apps/cli/tests/hooks.test.ts:470-491` |
| R6 | MET | Banner + command ownership cleanup `apps/cli/src/omp-hooks.ts:182-212`; preservation test `apps/cli/tests/omp-hooks.test.ts:557-605` |
| R7 | MET | Cleanup precedes empty return `apps/cli/src/omp-hooks.ts:182-216`; skip bypass `apps/cli/src/commands/install.ts:758-767`; test `apps/cli/tests/commands/install-omp-helpers.test.ts:205-230` |
| R8 | MET | Policy/event map unchanged; hook dispatcher and other target branches have no task diff beyond plugin propagation |
| R9 | MET | Pi regressions `apps/cli/tests/hooks.test.ts:470-649`; surrogate cleanup `apps/cli/tests/commands/install-omp-helpers.test.ts:414-450` |
| R10 | MET | OMP zero/prune/preserve/idempotency regressions `apps/cli/tests/omp-hooks.test.ts:528-662`; compatibility skip test `apps/cli/tests/commands/install-omp-helpers.test.ts:205-230` |
| R11 | MET | Pi exact state + repeat install `apps/cli/tests/hooks.test.ts:599-649`; OMP pre/post + repeat generation `apps/cli/tests/omp-hooks.test.ts:607-662`; all use isolated temp roots |
| R12 | MET | Release note `CHANGELOG.md:8-12`; helper/docs sync `docs/help/cmd_hook.md:155-166`, `docs/help/cmd_install.md:229-270` |
| R13 | MET | Fresh focused/full tests, lint, build, and spur-check all exited 0; no skipped-test rule violations |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| AC1 Pi moved event | MET | test | `apps/cli/tests/hooks.test.ts:493-519`; focused suite exit 0 |
| AC2 Pi policy exclusion to empty | MET | test | `apps/cli/tests/hooks.test.ts:470-491`; focused suite exit 0 |
| AC3 Pi ownership boundary | MET | test | `apps/cli/tests/hooks.test.ts:521-557`; focused suite exit 0 |
| AC4 Pi idempotency and replacement | MET | test | `apps/cli/tests/hooks.test.ts:441-461`, `:521-557`, `:599-649`; focused suite exit 0 |
| AC5 OMP empty desired cleanup | MET | test | `apps/cli/tests/omp-hooks.test.ts:528-555`; focused suite exit 0 |
| AC6 OMP ownership boundary | MET | test | `apps/cli/tests/omp-hooks.test.ts:557-662` plus skip test `apps/cli/tests/commands/install-omp-helpers.test.ts:205-230`; focused suite exit 0 |
| AC7 complete Pi upgrade state | MET | test | `apps/cli/tests/hooks.test.ts:599-649`; focused suite exit 0 |
| AC8 no unsafe policy expansion | MET | command | Empty targeted `git diff`; policy at `apps/cli/src/hooks.ts:144-155` still excludes Pi/OMP |
| AC9 secondary command parity | MET | test | `apps/cli/tests/commands/install-omp-helpers.test.ts:414-450`; focused suite exit 0 |
| AC10 verification gates | MET | command | `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check` all exited 0 this run |

**Design conformance:** PASS — shared parser, plugin-projection replacement, zero-desired reconciliation, OMP provenance guard, and both call graphs are DONE. No unmatched implementation hunk exceeds task scope.

**SECUA review:** PASS. Security: deletion requires generated provenance plus exact plugin namespace. Efficiency: one bounded pass over existing event entries/direct hook-module children. Correctness: moved, excluded, empty, corrupt-input, foreign/user, skip, and idempotency paths are executable tests. Usability: zero-result message and help docs name reconciliation. Architecture: ownership parsing is shared; Pi merge remains private; target adapters keep their existing boundaries.

**Fix-pass disclosure:** `.spur/run/0096-solution-verify.md:1-14` and `.spur/run/0096-testing-verify.md:1-58` stage the tracked section bodies; the final machine verdict is `.spur/run/0096-verdict.json:1`. The mandatory build also refreshed `plugins/cc/scripts/anti-hallucination/validate_response.mjs`; its source and behavior are unrelated to hook reconciliation. Dependency/version changes in `package.json`, `apps/cli/package.json`, and `bun.lock`, plus the original issue capture, predated this verification and were preserved.

**Residual:** Live Pi manual smoke remains release verification because it requires a published/reinstalled `sp` plugin and the operator's real Pi environment; the isolated executable upgrade scenario is green. This non-blocking smoke does not replace any automated core AC.
### Review
**Verdict:** PASS — the full SECUA review found no blocker, major, minor, or advisory defect in the task-scoped implementation.

| Priority | Dimension | Location | Finding | Disposition |
|----------|-----------|----------|---------|-------------|
| P1 | Security | `apps/cli/src/omp-hooks.ts:182-212` | None — deletion requires both the Superskill-generated banner and an exact plugin-owned command key; user and foreign files are preserved. | Clear |
| P2 | Correctness | `apps/cli/src/hooks.ts:251-354` | None — reconciliation removes only the installing plugin's prior projection, handles zero desired hooks, deletes empty events, and then merges the desired set. | Clear |
| P3 | Efficiency / Architecture | `apps/cli/src/hooks.ts:157-170`; `apps/cli/src/omp-hooks.ts:164-216` | None — ownership parsing is shared while target-specific reconciliation stays within each adapter; work is bounded by existing hook entries and direct module children. | Clear |
| P4 | Usability | `docs/help/cmd_hook.md:155-166`; `docs/help/cmd_install.md:229-270`; `CHANGELOG.md:8-12` | None — helper signatures, reconciliation behavior, and the upstream publish/reinstall prerequisite are documented. | Clear |

**Verification basis:** focused hook tests passed 89/89; the full suite passed 1577/1577 with 98.92% line and 99.85% function coverage; lint, build, and `spur-check` passed. No new suppression comment, production `console.*`, secret, dependency, workflow, or vendor change was introduced by this task.

**Residual risk:** Live Pi smoke remains a release verification step because it depends on publishing and reinstalling the corrected `sp` plugin in a real Pi environment. The isolated exact-state and repeat-install scenario is green, so this is non-blocking.
### References
- Feature: `docs/features/F028-pi-omp-hook-shim.md`
- Architecture decisions: `docs/00_ADR.md` ADR-010 (target dispatch), ADR-020 (unknown hooks fail open), ADR-021 (plugin/CLI compatibility), ADR-023 (plugin script delivery)
- Surface contract: `docs/04_DESIGN.md` — canonical hooks config and anti-hallucination target behavior
- Pi JSON adapter: `apps/cli/src/hooks.ts` — `HOOK_TARGET_POLICY`, `hookRunKey`, `mergePiHooks`, `emitPiStyleHooks`
- OMP native adapter: `apps/cli/src/omp-hooks.ts` — `buildModuleContent`, `generateOmpHookModules`
- Install call graph: `apps/cli/src/commands/install.ts` — `executeInstall`, `postInstallOmp`, `emitHooksForSurrogateTarget`
- Secondary emitter: `apps/cli/src/commands/hook.ts` — `superskill hook emit`
- Guard limitation: `plugins/cc/scripts/anti-hallucination/ah_guard.ts` — `StopProfile`, `resolveStopContext`, `stop_hook_active` loop guard
- Tests: `apps/cli/tests/hooks.test.ts`, `apps/cli/tests/omp-hooks.test.ts`, `apps/cli/tests/commands/install-omp-helpers.test.ts`
- Related implementation history: tasks 0035 (Pi/OMP/Hermes hook shim), 0073 (OMP native plugin hooks), 0074 (hook version skew)
- Upstream release prerequisite: publish an `sp` plugin whose `context-session-stop` hook uses canonical `SessionEnd` with timeout 15, then reinstall it so the CLI projects the hook to `session_shutdown`
### History
- 2026-07-22T17:24:14.950Z backlog → todo (system)
- 2026-07-22T17:32:35.000Z todo → done (system)
- 2026-07-22T17:38:02.466Z done → wip (system)
- 2026-07-22T17:44:06.932Z wip → testing (system)
- 2026-07-22T17:48:54.111Z testing → done (system)
