---
template: issue
schema_version: 1
name: Prefilter the sp task-write-guard before the spur task resolve spawn
description: ""
status: done
type: task
profile: standard
parent_wbs: null
priority: P1
tags: [bug]
dependencies: []
created_at: 2026-07-31T06:12:24.754Z
updated_at: 2026-07-31T23:56:25.229Z
---

## 0109. Prefilter the sp task-write-guard before the spur task resolve spawn

### Background
The `sp/task-write-guard` PreToolUse hook shells out to `spur task resolve` on **every** `Write` or
`Edit` that carries a `file_path`, whether or not the path could possibly be a task-corpus file.
Editing `src/foo.ts`, `package.json`, or a scratch file consults the Spur task corpus.

Measured cost on macOS (medians of 3):

| Command | Wall |
|---|---|
| `spur task resolve <file> --strict --json` | **2.40 s** |
| `superskill hook run sp task-write-guard` (process startup) | **1.22–1.53 s** |
| `superskill --version` | 1.35 s |
| `bun -e ''` | 1.41–2.00 s |
| `node -e ''` | **0.02 s** |

Combined: **≈3.7 s added to every file mutation**, in every repo with the sp plugin installed, for
every agent — including each nested `agent.run` subprocess inside a Spur pipeline run. The hook's
own dispatch is not the cost (user CPU was 0.06–0.14 s against 1.2 s wall — the process is starting,
not computing); the avoidable part is the second subprocess.

#### Provenance

Found while investigating the Spur H6 dogfood batch (`/skill:sp-dev-runall --feature H6 --auto`,
2026-07-31, ~20 h wall-clock for 6 small tasks). Two post-mortems attributed the overhead to hook
*volume* — "~1347 spawns × ~300 ms". Re-measurement showed those counts were 18-day ledger totals
rather than one session, and that the real problem is the opposite shape: **each spawn is large**,
and the largest one was unreported. Tracked in Spur as task `0398` R2 (feature `H7`).

#### A verified patch already exists

`0398-R2-superskill.patch` was authored and **executed** against a copy of this repo — not merely
inspected:

```
bun test apps/cli/tests/commands/hook-run.test.ts  → 43 pass / 0 fail   (28 → 43, +15 new)
bun test apps/cli/tests            (patched)       → 778 pass / 2 fail
bun test apps/cli/tests            (pristine)      → 765 pass / 2 fail
```

The same 2 failures (`evolve — empirical gate default-path invariance`) occur before and after, so
they are pre-existing and unrelated. Delta: **+13 pass, +0 fail**. `git apply --check` passes
against this repo at the commit it was generated from.

It was also **mutation-checked**: deleting only the guard line — keeping the export so the module
still loads — fails exactly the 6 "allows … without spawning" tests and leaves the other 37 green,
including deny-owned and fail-open. The tests target the guard itself, not the import.

The patch has **not** been applied here, because the authoring session could not write to this
repository. Its location is in `### References`. Applying it is the fastest path; implementing from
`### Design` is equivalent.

> Caveat carried forward honestly: verification was against a *copy* of this repo. The patch applies
> cleanly to the real one, but has not been observed running here. Re-run the suite after applying.
### Requirements
R1. **`runSpTaskWriteGuard` must not spawn `spur task resolve` for a path that cannot be a task-corpus file.** Today the function allows early on only three conditions — `SPUR_WRITE_GUARD=off` (`apps/cli/src/commands/hook-run.ts:126`), an unparseable payload (`:132`), and a non-`Write`/`Edit` tool or empty `file_path` (`:136-139`). Every other call reaches `resolveTaskOwnership` at `:143`, which `spawnSync`s `spur task resolve --strict --json` (`:101-113`, 8 s timeout). Add a cheap in-process check immediately before that call.

R2. **Ownership semantics must not change.** `spur task resolve` stays the sole authority for any path that survives the prefilter — the prefilter answers only "could this possibly be a task file?", never "is it owned?". A real task file must still be denied with the existing `permissionDecision:"deny"` JSON at exit 0 under Claude Code (`CLAUDE_PROJECT_DIR` set) and exit 2 + stderr elsewhere.

R3. **The guard must still fail open.** Every existing fail-open path (`SPUR_WRITE_GUARD=off`, unparseable payload, wrong tool, empty path, resolver error/timeout returning `unknown`) keeps its current behavior. The prefilter adds an allow path; it must never introduce a deny path.

R4. **Fail toward the spawn.** When the prefilter is unsure, spawn and let `spur task resolve` decide. A false spawn costs only latency; a false skip silently disables the write guard for a real task file, which is the strictly worse failure. Bias every ambiguous case to the expensive branch.

R5. **No new configuration surface.** Do not add a settings key, plugin option, or env var for the corpus folder list. Reuse the layout convention the rest of the corpus tooling already fixes — Spur's `defaultVerdictRunDir` resolves the same `docs/tasks<N>` / flat-`tasks` pair. `SPUR_WRITE_GUARD=off` remains the only knob.

R6. **The prefilter is unit-testable in isolation.** Export the predicate so it can be asserted directly on path strings, independent of payload parsing and of the injectable resolver.

R7. **Tests must prove the spawn is skipped, not merely that the call returns allow.** Use the existing injectable third parameter (`resolveTaskOwnership`) with a resolver that records whether it ran; assert it was *not* consulted for non-corpus paths and *was* consulted for corpus-shaped paths. A test that only checks `exitCode === 0` would pass even with the prefilter deleted.

R8. **No regression in the existing suite.** `bun test apps/cli/tests` must show no new failures against the pre-change baseline. At the time of writing that baseline is 765 pass / 2 fail, the 2 being `evolve — empirical gate default-path invariance`, which are pre-existing and unrelated — re-establish the baseline before judging rather than trusting this number.

R9. **Acceptance is a re-timing, not a green test.** After `bun run build` + `bun link`, re-measure `superskill hook run sp task-write-guard` on a non-corpus path. A passing unit test does not demonstrate that the installed hook got faster; only the timing does.
### Acceptance Criteria
Scenario-to-requirement map: skip→R1 · deny→R2 · fail-open→R3 · ambiguous→R4 · no-config→R5 ·
predicate→R6 · spy→R7 · suite→R8 · timing→R9.

```gherkin
Feature: task-write-guard ownership-spawn prefilter

  Scenario: A non-corpus path is allowed without consulting spur task resolve
    Given a PreToolUse payload for Write whose file_path is /repo/src/foo.ts
    When the sp task-write-guard runs
    Then the decision is allow
    And spur task resolve is never spawned

  Scenario: Markdown outside a tasks segment is allowed without the spawn
    Given a PreToolUse payload for Write whose file_path is /repo/README.md
    When the sp task-write-guard runs
    Then the decision is allow
    And spur task resolve is never spawned

  Scenario: A tasks-segment path that is not markdown is allowed without the spawn
    Given a PreToolUse payload for Write whose file_path is /repo/docs/tasks3/notes.txt
    When the sp task-write-guard runs
    Then the decision is allow
    And spur task resolve is never spawned

  Scenario: A corpus-shaped path still reaches the ownership check
    Given a PreToolUse payload for Write whose file_path is /repo/docs/tasks3/0398_example.md
    When the sp task-write-guard runs
    Then spur task resolve is consulted

  Scenario: A flat tasks directory still reaches the ownership check
    Given a PreToolUse payload for Write whose file_path is /repo/tasks/0042_example.md
    When the sp task-write-guard runs
    Then spur task resolve is consulted

  Scenario: An owned task file is still denied
    Given a PreToolUse payload for Write targeting a path the resolver reports as owned
    When the sp task-write-guard runs
    Then the decision is deny
    And the reason names the spur CLI as the correct edit path

  Scenario: The guard still fails open when ownership cannot be determined
    Given a PreToolUse payload whose path survives the prefilter
    And the resolver reports unknown
    When the sp task-write-guard runs
    Then the decision is allow

  Scenario: The prefilter predicate classifies paths correctly in isolation
    Given the exported prefilter predicate
    When it is called with corpus paths, non-markdown paths, and lookalike directory names
    Then markdown under a tasks or tasksN segment is a candidate
    And a tasksfoo segment is not a candidate
    And a Windows-separated corpus path is a candidate

  Scenario: The existing suite shows no new failures
    Given the pre-change baseline for bun test apps/cli/tests
    When the suite is run after the change
    Then every previously passing test still passes
    And the only failures are the ones present in the baseline

  Scenario: The installed hook is measurably faster on a non-corpus path
    Given the package is rebuilt and re-linked
    When superskill hook run sp task-write-guard is timed on a Write payload for README.md
    Then the wall time is close to the hook's own startup cost
    And it no longer includes the spur task resolve subprocess
```
### Q&A
**Q: Why not just make `spur task resolve` faster instead?**
Because the correct number of subprocesses for "am I editing `src/foo.ts`?" is zero, not "one, but
quicker". Speeding up the CLI is worth doing on its own merits and is tracked separately (the
companion ts-libs task covers attributing Spur CLI cold start), but it is orthogonal: even a 200 ms
`spur task resolve` would be 200 ms wasted on every mutation.

**Q: Does the prefilter weaken the write guard?**
For projects using the conventional corpus layout, no — the same paths reach `spur task resolve` and
the same ones get denied. For a project that relocated its corpus to a non-`tasks*` folder, yes: its
task files stop being guarded. That trade is stated explicitly in `### Design` along with a strictly
safer alternative (`.md`-only inversion). Pick one deliberately; do not let it be an accident.

**Q: Why is the timing the acceptance criterion instead of the test suite?**
Because the tests exercise `runSpTaskWriteGuard` directly with an injected resolver — they prove the
logic skips the call, but they run in-process and cannot show that the *installed* hook got faster.
The hook the host actually invokes is the built, linked bundle. A green suite with a stale build
would look identical to success and change nothing for real sessions.

**Q: Should the prefilter also cover `PostToolUse` (`context-post-tool`)?**
No. That hook does not spawn anything — it appends to a JSONL ledger in-process. Its cost is the
hook process startup, which this change cannot address. Both H6 post-mortems proposed tightening its
matcher; ledger evidence showed it recorded only 22 events across the entire H6 window, so that
would trade real observability for no measurable gain.

**Q: The patch was verified against a copy of this repo — is that good enough?**
It is good evidence, not proof. `git apply --check` passing means the context lines still match, and
the suite result came from actually executing the code, not reading it. What has *not* been observed
is the suite running in this working tree with its real `node_modules` and build config. Re-run it
after applying; the Plan's Verify section is written on that assumption.

**Q: Why does this task live here rather than in Spur?**
The defect is in this repository's `apps/cli/src/commands/hook-run.ts`. Spur task `0398` found it
and cannot fix it — the sp plugin's `hooks.json` routes to `superskill hook run`, and the runner
implementation lives here, not in `plugins/sp/hooks/`. Spur `0398` stays open pending this.
### Design
#### Shape

One exported predicate plus one guard line. Keep it dumb and in-process — the whole point is to
avoid a subprocess, so the check must not do I/O, read config, or stat the filesystem.

```ts
export function couldBeTaskCorpusPath(filePath: string): boolean {
    // Task corpus files are always markdown.
    if (!/\.md$/i.test(filePath)) return false;
    // ...living under a `tasks` / `tasks2` / `tasks3` … path segment.
    return filePath
        .replace(/\\/g, '/')
        .split('/')
        .some((segment) => /^tasks\d*$/i.test(segment));
}
```

Call site — immediately after the empty-path guard at `hook-run.ts:139`, before the
`resolveTaskOwnership` call at `:143`:

```ts
    // Skip the ~2.4 s ownership spawn for paths that cannot be task files.
    if (!couldBeTaskCorpusPath(filePath)) return preToolUseDecision('allow');
```

Two properties matter more than the regex:

- **Segment match, not substring.** `split('/')` with an anchored `/^tasks\d*$/i` means
  `docs/tasksfoo/x.md` and `docs/my-tasks/x.md` are *not* candidates, while `docs/tasks`,
  `docs/tasks2`, `docs/tasks3`, and a flat `tasks/` are. A substring test would over-match and give
  back the latency this change exists to remove.
- **Backslash normalization first**, so a Windows-separated path is segmented correctly rather than
  treated as one long segment.

#### Why this convention and not a config lookup

The `docs/tasks<N>` / flat-`tasks` layout pair is already hard-coded in the corpus tooling — Spur's
`defaultVerdictRunDir` resolves exactly this shape to find `.spur/run`. Reading Spur's config from
inside a Superskill hook would mean either parsing Spur's config files (coupling Superskill to
Spur's on-disk format) or shelling out (reintroducing the subprocess this change removes). Neither
is worth it. R5 forbids a new knob for the same reason: a knob nobody sets is a knob that silently
disables the guard for whoever forgot it.

#### Known limitation — state it, do not paper over it

A project that relocates its corpus to a folder not named `tasks*` (`spur task create --folder
work-items`) is not matched, so its task files stop being guarded. This is a real behavior change,
not a theoretical one.

It is accepted because (a) every other consumer of the corpus already assumes this convention, so
such a project is already partly unsupported, and (b) the guard is a convenience rail, not a
security boundary — `SPUR_WRITE_GUARD=off` has always existed and the CLI remains the enforcing
authority. Widening the match needs a real config surface and a decision about coupling direction,
which is a separate task, not a guess bolted onto a latency fix.

If that trade is unacceptable, the alternative is to invert the check — spawn for *all* `.md` files
and skip only non-markdown. That still removes the majority of spawns (source, manifests,
lockfiles, configs) while never mis-skipping a task file under any folder name. It is strictly
safer and strictly slower; the `.md`-heavy repos are exactly the ones that would keep paying. Pick
deliberately and record which.

#### Rejected

- **Caching ownership results across invocations.** Each hook fire is a fresh process; a cache would
  need a file, which reintroduces I/O and a staleness problem for a 2 ms saving over the prefilter.
- **Making `resolveSpurTaskOwnership` faster.** The 2.4 s is `spur`'s own cold start, not this
  repo's code. Worth investigating separately (see the companion ts-libs task on CLI startup
  attribution), but it does not belong here — the correct fix is to not call it at all.
- **Moving the guard off `spawnSync` to async.** PreToolUse hooks are synchronous by contract; the
  host blocks on the decision either way, so concurrency buys nothing.
### Plan
Two entry paths. **A** is the fast one if the patch still applies; **B** is equivalent and is the
fallback once this repo has moved on.

#### Path A — apply the pre-verified patch

> Not taken — the patch no longer applied (the working tree had since made
> `resolveSpurTaskOwnership`/`runSpTaskWriteGuard` async via the ts-runtime port). See `### Solution`.
> Path A's steps were: confirm `git apply --check`, apply the patch (hook-run.ts + its test file
> only), then skip to Verify. Superseded by Path B below.

#### Path B — implement from `### Design`

- [x] Add `couldBeTaskCorpusPath` to `apps/cli/src/commands/hook-run.ts`, exported (R6), placed next
      to `resolveSpurTaskOwnership` so the pair reads together.
- [x] Insert the guard line in `runSpTaskWriteGuard` after the empty-path check (`:139`) and before
      `resolveTaskOwnership` (`:143`).
- [x] Add the test block to `apps/cli/tests/commands/hook-run.test.ts`, importing the predicate.
      Follow the file's existing idiom: `it.each` for table cases, `payload(tool, file_path)`
      helper, and the injectable third parameter for the resolver.
- [x] The spy resolver is the load-bearing part (R7) — a closure that flips a flag when called:

```ts
function spyResolver() {
    let called = false;
    return { fn: () => { called = true; return 'unowned' as const; }, wasCalled: () => called };
}
```

#### Verify

- [x] Establish the baseline **first**, on a clean tree: `bun test apps/cli/tests`. Record the
      number. At authoring time it was 765 pass / 2 fail (`evolve — empirical gate default-path
      invariance`); do not trust that figure, re-derive it. → Re-derived: full suite green, 0 fail
      (see `## Testing`).
- [x] `bun test apps/cli/tests/commands/hook-run.test.ts` — expect 43 pass / 0 fail. → 50/0 (file
      gained the ts-runtime subprocess-contract block).
- [x] `bun test apps/cli/tests` — expect the baseline pass count + 15, with the *same* failures. →
      787/0, zero failures.
- [x] **Mutation-check the tests, do not just run them.** Delete only the guard line (keep the
      export so the module still loads) and re-run. Exactly the 6 "allows … without spawning" tests
      must fail, and the deny-owned / fail-open tests must keep passing. If deleting the guard leaves
      everything green, the tests assert nothing and the work is not done. Restore the line. →
      Re-run at verify: exactly 6 fail / 44 pass; restored 50/0.
- [x] `bun run lint` (or this repo's gate) clean.

#### Ship

- [x] `bun run build && bun link` — the installed hook runs the built bundle, so an unbuilt change
      has no effect on real sessions and will re-time as unchanged. → Both global payload copies
      refreshed (`~/.bun/install/global` + `~/node_modules` duplicate); prefilter grep-verified in
      each.
- [x] **Re-time on a non-corpus path (R9 — this is the acceptance criterion):**

```bash
for i in 1 2 3; do
  echo '{"tool_name":"Write","tool_input":{"file_path":"README.md"}}' \
    | /usr/bin/time -p superskill hook run sp task-write-guard >/dev/null
done
```

  Expect roughly the hook's own startup (~1.3 s), not ~3.7 s. If it is unchanged, the build or link
  did not take — check `which superskill` resolves to the linked package before concluding the fix
  failed. → 1.09 s ≈ bun floor (~1.0 s); spy-`SPUR_BIN` proves zero spawns.

- [x] **Re-time a corpus path** (`docs/tasks/0001_*.md`) and confirm it still takes the longer route
      and still denies. A fix that made everything fast has broken the guard. → 1.30 s with spawn;
      owned file still denied on both host channels.
- [x] Report both numbers in the task's `### Testing`, not a summary — the raw timing is the evidence.

#### Close-out

- [x] Note in `### Solution` which Design option shipped (segment-match, or the safer `.md`-only
      inversion) and why.
- [x] Cross-reference back: Spur task `0398` R2 / feature `H7` is the origin and is blocked on this.
      → Recorded in `### Solution`; unblocking 0398 itself is a spur-new-repo action.
### Root Cause
**Confidence: HIGH** — read from source and reproduced by direct timing.

#### The code path

`runSpTaskWriteGuard` (`apps/cli/src/commands/hook-run.ts:121-154`) allows early on exactly three
conditions:

| Line | Condition |
|---|---|
| `:126` | `SPUR_WRITE_GUARD === 'off'` |
| `:132` | payload is unparseable JSON |
| `:136-139` | tool is not `Write`/`Edit`, or `file_path` is empty |

Everything else falls through to `:143`:

```ts
const ownership = resolveTaskOwnership(filePath, env.CLAUDE_PROJECT_DIR ?? process.cwd());
```

which is `resolveSpurTaskOwnership` (`:101-113`):

```ts
const res = spawnSync(cmd, args, { cwd, encoding: 'utf-8', timeout: 8000 });
```

There is **no path-shape check anywhere in that chain**. The function's own doc comment states the
design as "pure delegation: ownership is decided by `spur task resolve`'s exit code alone" — which
is correct as a *correctness* property and is exactly what makes it expensive as a *performance*
property. Delegating the decision does not require delegating every path.

#### Why it costs what it costs

Two process startups per mutation, neither of which is doing meaningful work:

1. The hook itself — `superskill hook run sp task-write-guard` measured at 1.22–1.53 s, of which
   essentially all is runtime startup (user CPU 0.06–0.14 s against 1.2 s wall). `bun -e ''` alone
   measured 1.41–2.00 s on the same box against `node -e ''` at 0.02 s.
2. `spur task resolve` — 2.40 s, another full CLI cold start plus corpus resolution.

≈3.7 s per `Write`/`Edit`. The hook startup is unavoidable here (the host spawns it). The second
one is avoidable for any path that could not be a task file, which is the overwhelming majority of
mutations in a normal editing session.

#### Scope of the blast radius

`hooks.json` wires `task-write-guard` to `PreToolUse` with matcher `Write|Edit`, so this is paid by
every agent, in every repo with the sp plugin installed, on every file mutation — including each
nested `agent.run` subprocess inside a Spur pipeline run, where the tax compounds against steps that
are already fighting a hard timeout wall.

#### What is *not* the root cause

The two H6 post-mortems attributed the overhead to hook *volume*, citing "~1347 spawns × ~300 ms"
and a `PostToolUse` storm. Re-measurement found those were 18-day ledger totals rather than one
session, and that `PostToolUse` recorded only 22 events across the entire H6 window. Tightening the
`PostToolUse` matcher — the fix both reports recommended — would have optimised a non-problem while
degrading the token ledger. The defect is per-spawn cost on the `PreToolUse` path, not spawn count
on the `PostToolUse` one.
### Solution
Shipped **Path B** (the segment-match prefilter from `### Design`), not the safer `.md`-only inversion — the segment match removes more spawns (all non-corpus paths, not just non-markdown) and the encoded `docs/tasks<N>` / flat-`tasks` convention is already fixed elsewhere in the corpus tooling (Spur's `defaultVerdictRunDir`). The known limitation (a corpus relocated to a non-`tasks*` folder stops being guarded) is accepted and documented in the predicate's doc comment; widening it needs a real config surface, which this task deliberately does not add (R5).

The pre-verified patch (`0398-R2-superskill.patch`) no longer applied — the working tree had since made `resolveSpurTaskOwnership`/`runSpTaskWriteGuard` async with an injectable `ProcessExecutor` (the `ts-runtime` port). Implemented from `### Design` instead, adapting the test block to the async idiom (`Promise.resolve(...)` resolvers, `await`).

**Change map**

- `apps/cli/src/commands/hook-run.ts:138-148` — **+`couldBeTaskCorpusPath(filePath)`** (exported, R6): in-process predicate. `.md` extension AND a path segment matching `/^tasks\d*$/i` (after backslash normalization). Segment match, not substring — `docs/tasksfoo/x.md` and `docs/my-tasks/x.md` are NOT candidates. No I/O, no config read.
- `apps/cli/src/commands/hook-run.ts:174-175` — **+guard line** in `runSpTaskWriteGuard` after the empty-path check (`:173`) and before `resolveTaskOwnership` (`:179`): `if (!couldBeTaskCorpusPath(filePath)) return preToolUseDecision('allow');` — fails toward the spawn (R4).
- `apps/cli/tests/commands/hook-run.test.ts:6-12` — **+import** `couldBeTaskCorpusPath`.
- `apps/cli/tests/commands/hook-run.test.ts:210-283` — **+`describe('…prefilter (Spur task 0398 R2)')`** — 6 "allows … without spawning" spy tests (R7), 4 "still consults" spy tests, deny-preserved, fail-open-preserved, and 6 unit-level classification assertions. The spy resolver (closure flipping a flag) is the load-bearing part: it proves the spawn is skipped, not merely that the result is allow.

**What did NOT change**

Ownership semantics (R2): `spur task resolve` stays the sole authority for any path that survives the prefilter. Fail-open paths (R3): `SPUR_WRITE_GUARD=off`, unparseable payload, wrong tool, empty path, resolver unknown — all unchanged. No new config surface (R5).

Cross-reference: Spur task `0398` R2 / feature `H7` is the origin and is blocked on this.
### Testing
Independent verification re-run (2026-07-31, `/sp:dev-verify 0109 --force --focus all --fix all`). Every number below was reproduced **this run**. The implementer's earlier figures (43 targeted / 780 full / 0.18 s) were stale — actuals differ (50 / 787 / ~1.1 s), verdicts hold.

**Suite evidence (re-derived this run)**

- `bun test apps/cli/tests/commands/hook-run.test.ts` → **50 pass / 0 fail** (167 expect() calls).
- `bun test apps/cli/tests` → **787 pass / 0 fail** (2109 expect() calls, 45 files). Zero failures ⇒ no new failures against any baseline (R8).
- `bun run lint` (biome + `turbo run typecheck`, both workspaces) → exit 0.
- `spur task check 0109` → PASS (L4 WARN: missing feature_id — no feature in this corpus covers hook-runtime performance; the task is a standalone cross-repo bug fix).
- Coverage: `apps/cli/src/commands/hook-run.ts` **100% functions / 98.26% lines** (targeted run; uncovered lines 278,356,374,429 are sp/context-* ledger paths unrelated to this change).

**Mutation check (R7 — re-run this verify)**

Deleted only the guard line (`apps/cli/src/commands/hook-run.ts:175`), kept the export so the module loads. Re-ran the targeted suite: **exactly the 6 "allows a %s without spawning spur task resolve" spy tests fail, 44 pass** — deny-owned, fail-open, and still-consults tests stayed green. Guard restored, re-ran: 50/0. The tests genuinely assert the guard; deleting it is observable.

**End-to-end on the installed hook (R9 — the acceptance criterion, re-run this verify)**

Found the installed bundle STALE at verify time (`couldBeTaskCorpusPath` absent from the global payload; a second stale copy at `~/node_modules/@gobing-ai/superskill`, Jul 26). Rebuilt: `bun run build` → `dist/superskill` carries the predicate; `bun run build:bundle` refreshed `apps/cli/dist/index.js`; the global payload under `~/.bun/install/global/...` now grep-matches `couldBeTaskCorpusPath` ×2, and the duplicate `~/node_modules` copy was synced to the same bundle (dist + rubrics). (`bun install -g .` printed a DependencyLoop error yet the payload updated — PATH `superskill` provably runs the fixed bundle per the spy evidence below.)

Spy-`SPUR_BIN` proof on the installed hook (wrapper logging argv, emulating "owned" for the 0109 task file):

- `README.md` (non-corpus) → allow, exit 0, spy log **0 lines** — `spur task resolve` never spawned.
- `docs/tasks/0109_*.md` (owned) → deny, spy log **1 line**: `task resolve docs/tasks/0109_*.md --strict --json` — spawn still consulted for corpus paths.
- Claude host: `permissionDecision:"deny"` JSON at exit 0, reason names the spur CLI. Non-Claude host (`env -u CLAUDE_PROJECT_DIR`): exit 2 + same reason on stderr.

Timing (median of 3, this box):

| Path | Wall | Spawn? |
|---|---|---|
| `README.md` (non-corpus) | **1.09 s** | no |
| `docs/tasks/0109_*.md` (owned) | 1.30 s | yes (+~0.2 s spur) |
| `bun -e ''` floor | ~1.0 s | — |

Non-corpus sits at the bun startup floor — the `spur task resolve` subprocess is gone. Absolute figures differ from the task's sandbox table (expected; the task itself directs re-deriving per box). The structural win R9 accepts — one startup instead of two for the overwhelming majority of mutations — is verified.

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 (no spawn for non-corpus) | MET | Guard line `apps/cli/src/commands/hook-run.ts:174-175` placed before `resolveTaskOwnership` (`apps/cli/src/commands/hook-run.ts:179`); spy tests `apps/cli/tests/commands/hook-run.test.ts:230-244`; e2e spy log 0 lines (this run) |
| R2 (ownership semantics unchanged) | MET | Deny path `apps/cli/src/commands/hook-run.ts:180-188` unchanged; e2e deny both channels (JSON@0 Claude, exit 2+stderr non-Claude) this run |
| R3 (fail open preserved) | MET | Early-allow paths `apps/cli/src/commands/hook-run.ts:160,166,170,173`; unknown→allow `apps/cli/src/commands/hook-run.ts:189` + test `apps/cli/tests/commands/hook-run.test.ts:266-274`; suite green |
| R4 (fail toward the spawn) | MET | Prefilter only adds allow (`apps/cli/src/commands/hook-run.ts:175`); corpus-shaped paths still spawn (`apps/cli/src/commands/hook-run.ts:179`, spy tests `apps/cli/tests/commands/hook-run.test.ts:246-255`, e2e spy log 1 line) |
| R5 (no new config) | MET | `process.env` reads in `apps/cli/src/commands/hook-run.ts` limited to pre-existing `SPUR_BIN` (`:109`) + dispatcher (`:509`); `SPUR_WRITE_GUARD` the only knob; convention hard-coded `:138-147` |
| R6 (predicate unit-testable) | MET | `export function couldBeTaskCorpusPath` `apps/cli/src/commands/hook-run.ts:138`; direct assertions `apps/cli/tests/commands/hook-run.test.ts:276-283` |
| R7 (spawn-skip proven, not just allow) | MET | `spyResolver` `apps/cli/tests/commands/hook-run.test.ts:216-225`; 6 skip + 4 consult spy assertions; mutation check above (6 fail on guard deletion) |
| R8 (no suite regression) | MET | `bun test apps/cli/tests` → 787 pass / 0 fail this run |
| R9 (installed hook re-timed) | MET | Timing table above: non-corpus 1.09 s ≈ bun floor ~1.0 s, no spawn; corpus 1.30 s with spawn + deny |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| Non-corpus path allowed without consulting resolve | MET | test + command | `apps/cli/tests/commands/hook-run.test.ts:230-244` (spy, 6 rows); e2e spy log 0 lines for README.md |
| Markdown outside tasks segment allowed without spawn | MET | test | `apps/cli/tests/commands/hook-run.test.ts:234,237` (`/repo/README.md`, `/repo/docs/00_ADR.md` rows) |
| Tasks-segment non-markdown allowed without spawn | MET | test | `apps/cli/tests/commands/hook-run.test.ts:236` (`docs/tasks3/notes.txt` row) |
| Corpus-shaped path still reaches ownership check | MET | test + command | `apps/cli/tests/commands/hook-run.test.ts:246-255` (4 consult rows); e2e spy log 1 line |
| Flat tasks dir still reaches ownership check | MET | test | `apps/cli/tests/commands/hook-run.test.ts:249` (`/repo/tasks/0042_example.md` row) |
| Owned task file still denied, reason names spur CLI | MET | test + command | `apps/cli/tests/commands/hook-run.test.ts:257-264`; e2e deny JSON + exit-2 channel this run |
| Fails open when ownership unknown | MET | test | `apps/cli/tests/commands/hook-run.test.ts:266-274` |
| Predicate classifies in isolation | MET | test | `apps/cli/tests/commands/hook-run.test.ts:276-283` (tasksfoo false, Windows path true, non-md false) |
| Suite shows no new failures | MET | test | Full suite 787/0 this run |
| Installed hook measurably faster on non-corpus | MET | command | Timing table: 1.09 s ≈ bun floor ~1.0 s, spur subprocess eliminated |

**Design conformance**

7 claims: 6 DONE (exported predicate shape `apps/cli/src/commands/hook-run.ts:138-147`; guard placement `:174-175`; segment-match-not-substring; backslash normalization; no I/O/config in predicate; known-limitation doc comment) + 1 CHANGED externally — the working tree's `spawnSync`→async `ProcessExecutor` port (ts-runtime work) predates this task and is disclosed in `### Solution`; not a 0109 deviation. Rejected-alternative notes remain accurate for 0109's own scope.

**Artifacts written by this verify pass** (gitignored disclosure): `.spur/run/0109-verdict.json` (verdict artifact, written after this section).
### Review
Three-dimensional review of the 0109 diff (`apps/cli/src/commands/hook-run.ts` + `apps/cli/tests/commands/hook-run.test.ts`), performed 2026-07-31 alongside the independent verify re-run.

**Priority findings**

| Priority | Finding | Disposition |
|----------|---------|-------------|
| P1 | None | — |
| P2 | None | — |
| P3 | Implementer's Testing figures were stale (43 targeted / 780 full / 0.18 s vs actual 50 / 787 / ~1.1 s on this box) | Fixed this run: `## Testing` rewritten with fresh, re-derived evidence |
| P3 | Stale duplicate global install at `~/node_modules/@gobing-ai/superskill` (Jul 26, pre-prefilter); PATH resolves to the current `~/.bun/install/global` copy | Operator cleanup item; no runtime impact observed (spy-SPUR_BIN e2e proves the PATH binary carries the fix) |
| P4 | `bun install -g .` exited with a DependencyLoop error though the payload updated | Noted for the Ship checklist; canonical `bun run build:bundle` output verified correct |

**Functional dimension** — 9/9 requirements MET, 10/10 AC scenarios MET, each with executable evidence re-run this session (see `## Testing` traceability tables). Mutation check confirms the spy tests genuinely assert the guard (deleting it fails exactly the 6 skip tests).

**SECUA dimension** — S: prefilter is pure string matching, only adds allow paths, deny channel untouched; no new env/config surface (R5 grep-verified). E: O(segments), zero I/O — the spawn elimination is the fix. C: anchored segment regex + backslash normalization; lookalike (`tasksfoo`) and Windows paths covered by tests. U: deny message unchanged, still names the spur CLI. A: convention shared with existing corpus tooling; known limitation documented in the predicate's doc comment per Design. No blocker/major findings.

**Architecture dimension** — Design conformance 6/7 DONE, 1 CHANGED externally (the async `ProcessExecutor` port pre-existed in the working tree from the ts-runtime work; disclosed in `### Solution`). No shallow-module or coupling friction introduced; the predicate sits next to `resolveSpurTaskOwnership` per the Plan.

**Residual risk** — A corpus relocated to a non-`tasks*` folder stops being guarded; accepted and documented in code + Design (R5 deliberately adds no knob).

**Final disposition** — PASS. No P1/P2 findings; P3/P4 items are hygiene, not defects of the change.
### References
#### The patch

- `~/xprojects/spur-new/.spur/run/0398-R2-superskill.patch` — unified diff against
  `apps/cli/src/commands/hook-run.ts` + `apps/cli/tests/commands/hook-run.test.ts`.
  **Gitignored in the Spur repo** (`.spur/run/` is not tracked), so copy it somewhere durable before
  relying on it. Regenerate from `### Design` if it is gone — the Design section is self-sufficient.

#### Code sites in this repository

- `apps/cli/src/commands/hook-run.ts:101-113` — `resolveSpurTaskOwnership`, the `spawnSync` that
  costs 2.4 s.
- `apps/cli/src/commands/hook-run.ts:121-154` — `runSpTaskWriteGuard`, the three existing early-allow
  conditions and the missing prefilter.
- `apps/cli/src/commands/hook-run.ts:143` — the exact call site the guard goes in front of.
- `apps/cli/src/commands/hook-run.ts:71-87` — `preToolUseDecision`, the allow/deny result shape
  (deny is `permissionDecision:"deny"` JSON at exit 0 under `CLAUDE_PROJECT_DIR`, else exit 2 +
  stderr).
- `apps/cli/src/commands/hook-run.ts:422-423` — dispatcher table showing `sp/context-post-tool` and
  `sp/context-session-start` resolve to runners implemented *here*, not to the `.ts` files in the
  Spur repo's `plugins/sp/hooks/`. Relevant if you go looking for the hook source on the Spur side.
- `apps/cli/tests/commands/hook-run.test.ts:167-199` — existing write-guard tests; the injectable
  third parameter and the `payload()` helper the new tests reuse.

#### Origin (Spur repository, `~/xprojects/spur-new`)

- `docs/tasks3/0398_fix-h6-dogfood-defects-hook-spawn-overhead-pipeline-agent-ru.md` — task 0398,
  R2 is this work. Its `### Root Cause` RC-1 and `### Design` § "R2 prefilter shape" are the
  authoritative statement; this task file restates them for local consumption.
- `docs/features/H7_h6-dogfood-remediation-*.md` — feature H7, scenarios R2/R3/R4 map to this task's
  first four AC scenarios.
- `docs/dogfood/2026-07-31-sp-dev-runall-H6-dogfood.md` §7 — post-hoc correction note recording that
  the original hook-storm numbers were whole-ledger totals. **Gitignored**; the durable copy of those
  corrections is in 0398's `### Background`.
- `plugins/sp/hooks/hooks.json` — the wiring: `PreToolUse` matcher `Write|Edit` →
  `superskill hook run sp task-write-guard`, timeout 10 s.

#### Companion task

- `~/xprojects/ts-libs` — a sibling task covers propagating `AgentRunCorrelation` into the agent
  subprocess environment, and (as an explicitly unverified investigation) attributing Spur CLI cold
  start. The latter is the other half of the 3.7 s figure; this task removes the call, that one asks
  why the call is slow.

#### Measurement commands (reproduce before and after)

```bash
# the avoidable spawn
for i in 1 2 3; do /usr/bin/time -p spur task resolve <a-task-file>.md --strict --json >/dev/null; done
# the hook end to end
for i in 1 2 3; do echo '{"tool_name":"Write","tool_input":{"file_path":"README.md"}}' \
  | /usr/bin/time -p superskill hook run sp task-write-guard >/dev/null; done
# runtime floor on this box
for i in 1 2 3; do /usr/bin/time -p bun -e '' 2>&1 | grep real; done
for i in 1 2 3; do /usr/bin/time -p node -e '' 2>&1 | grep real; done
```

> All figures quoted in this task were measured inside a restricted agent sandbox on macOS. The
> *relative* cost (two startups per mutation, one of them avoidable) is structural and holds
> regardless. The absolute numbers should be re-derived on a normal shell before being cited.
### History
- 2026-07-31T23:48:03.360Z backlog → todo (system)
- 2026-07-31T23:48:04.506Z todo → wip (system)
- 2026-07-31T23:48:06.066Z wip → testing (system)
- 2026-07-31T23:48:07.786Z testing → done (system)
