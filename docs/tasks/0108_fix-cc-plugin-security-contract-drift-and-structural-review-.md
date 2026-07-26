---
template: issue
schema_version: 1
name: "Fix cc plugin security, contract drift, and structural review findings"
description: ""
status: done
type: issue
profile: standard
feature_id: C
parent_wbs: null
priority: P2
tags: ["bug"]
dependencies: []
created_at: "2026-07-26T18:12:58.484Z"
updated_at: "2026-07-26T20:49:17.119Z"
---

## 0108. Fix cc plugin security, contract drift, and structural review findings

### Background
The 2026-07-26 standalone `sp-dev-review plugins/cc --auto --focus all` audit found executable
security defects, runtime correctness defects, and distribution-contract drift across the bundled
cc plugin. Empirical probes reproduced shell-validation bypasses, malformed decision JSON, an
indefinitely blocked direct-Bun validator, and cross-sentence anti-hallucination false positives.
Static checks also found CLI-wrapper option drift, obsolete task lifecycle commands, stale hook
exit semantics, unbalanced Markdown fences, broken live links, and non-idempotent environment
initialization.

The fix is centered in `plugins/cc`. The adjacent CLI helper and its parity test are also in scope
because `--invocation-mode` was registered for artifact types whose core scaffold operation ignored
it; `docs/04_DESIGN.md` and its phase-2 detail stay synchronized with that surface correction.
### Requirements
R1. Make the Bash-validation example fail safe: only a narrowly defined command grammar may pass
without review; shell metacharacters, unknown commands, and destructive variants must never be
silently allowed.

R2. Emit hook decisions as valid canonical JSON even when file paths contain quotes/newlines, and
detect traversal by path segment rather than rejecting benign `..` substrings.

R3. Replace the direct validator's synchronous `/dev/stdin` read with the bounded idle-rearming
reader already owned by the anti-hallucination engine; preserve TTY, empty-input, and 0/1 exit
semantics.

R4. Couple weak external vocabulary with capability/lifecycle assertions inside the same sentence,
so unrelated local-code sentences cannot trigger external-verification requirements.

R5. Synchronize cc plugin documentation and structural-test wording with the shipped exit-0
`decision:"block"` Stop contract.

R6. Repair live relative links and unbalanced Markdown fences in distributed plugin assets.

R7. Make every `commands/*-{add,evaluate,evolve}.md` argument hint and option table match the real
Commander surface, including required positional arguments and removal of nonexistent flags.

R8. Replace obsolete `tasks`/`cc:tasks` lifecycle instructions with the current validated
`spur task` section/status workflow.

R9. Make the context-loading example idempotent so repeated SessionStart runs do not append
duplicate environment exports.

R10 (architecture). Deepen the plugin structure test surface with generic invariants for balanced
fences, resolvable live links, and command-wrapper/Commander option parity so future drift fails
deterministically.
### Acceptance Criteria
Scenario: Shell payloads such as `rm --recursive --force ...` and `echo $(...)` cannot exit as allow.
  Given an executable hook example receives a shell payload
  When the payload contains a destructive command or command substitution
  Then the hook must deny or ask instead of allowing it

Scenario: A quoted malicious write path produces parseable JSON; `foo..bar` is not treated as traversal.
  Given the write validator receives an arbitrary path
  When the path is unsafe or contains benign adjacent dots
  Then its decision is valid JSON and traversal detection remains segment-aware

Scenario: The direct Bun validator exits within its idle budget when stdin remains open and silent.
  Given the validator starts with an open stdin stream
  When no payload arrives before the idle deadline
  Then the process exits within the bounded budget

Scenario: Weak vocabulary in one sentence plus a local coupler/lifecycle verb in another returns false.
  Given a response contains weak vocabulary and local lifecycle language in separate sentences
  When the anti-hallucination guard evaluates it
  Then external verification is not required

Scenario: Plugin README and anti-hallucination references describe exit-0 JSON decisions consistently.
  Given the distributed hook documentation
  When decision semantics are described
  Then ask and deny decisions use the host's exit-zero JSON contract consistently

Scenario: Every distributed Markdown file has balanced fences and every non-example relative link resolves.
  Given the distributed plugin Markdown corpus
  When structural integrity is checked
  Then code fences are balanced and non-example relative links resolve

Scenario: Wrapper option hints have exact parity with their corresponding Commander subcommands.
  Given a distributed command wrapper documents Commander options
  When its option table is compared with CLI help
  Then the documented and executable option sets match exactly

Scenario: No live `tasks update` or `cc:tasks` lifecycle instruction remains.
  Given the distributed lifecycle documentation
  When obsolete command forms are scanned
  Then no live instruction uses `tasks update` or `cc:tasks`

Scenario: Running `load-context.sh` twice leaves one export per key.
  Given an existing context environment file
  When `load-context.sh` runs repeatedly
  Then each managed key has exactly one current export

Scenario: Regression tests fail on fence, link, CLI-surface, shell-safety, JSON-escaping, and idempotency regressions.
  Given the plugin regression suite
  When a protected contract regresses
  Then the relevant structural, safety, escaping, or idempotency test fails
### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design
1. Treat hook examples as executable security guidance, not illustrative pseudocode. Emit decisions
   through one `jq` helper so untrusted values are encoded, use a strict allow grammar for a small
   safe command set, and route everything else to `ask` or `deny`.
2. Reuse `readPipedStdin` from `ah_guard.ts` in `validate_response.ts`; that import is inside the
   self-contained plugin script boundary and is bundled into the portable `.mjs` twin.
3. Split text into punctuation-delimited sentences only for weak keyword coupling. Strong claim
   patterns remain message-wide, preserving intended version/URL positives.
4. Add generic asset-contract tests to `plugins/cc/tests/structure.test.ts`. Links inside fenced
   examples and placeholder destinations are not live links; all other relative links must exist.
5. Query each real Commander subcommand's `--help` in an isolated process rather than duplicating
   an expected option list in the test. Wrapper filenames map `add` to the actual `scaffold`
   subcommand without pulling the whole CLI graph into focused-test coverage.
6. Restrict `--invocation-mode` registration to skill scaffolding, the only core output contract
   that consumes it, and synchronize the authoritative CLI design docs.
7. Repair distributed prose in place; no new runtime dependency or architectural boundary is added.
### Plan
1. Harden the three hook example scripts and add executable regression tests.
2. Make validator stdin bounded and weak-claim coupling sentence-local; extend unit tests.
3. Repair wrapper surfaces, lifecycle guidance, exit-contract docs, links, and Markdown fences.
4. Add generic structure/CLI-contract checks and regenerate the portable validator twin.
5. Run plugin tests, ShellCheck, lint, full tests, build, `spur-check`, task strict-core, and record
   the standalone PASS/PARTIAL/FAIL verdict.
### Root Cause
The plugin treated executable examples and prose artifacts as secondary to runtime source. As a
result, security-sensitive shell samples used permissive denylisting and raw JSON interpolation,
while command/help and hook-contract prose drifted without a generic test that compared them to the
actual CLI/runtime. In the guard engine, a message-wide weak-keyword conjunction ignored sentence
locality, and the secondary validator bypassed the engine's already-correct bounded stdin reader.
### Solution
The original remediation remains intact, and the forced verification pass closed five residual
findings without adding a dependency or changing a package boundary.

1. `plugins/cc/skills/cc-hooks/examples/validate-bash.sh:26` keeps malformed and non-allowlisted
   commands on `ask`/`deny`; `plugins/cc/tests/hook-examples.test.ts:41` executes the adversarial
   shell cases.
2. `plugins/cc/skills/cc-hooks/examples/validate-write.sh:26` emits canonical JSON and normalizes
   path segments; the forced pass restored `/sys` and `/sys/*` protection at line 57.
   `plugins/cc/tests/hook-examples.test.ts:88` covers JSON escaping, traversal, platform aliases,
   `/sys`, malformed payloads, and symlink redirection.
3. `plugins/cc/scripts/anti-hallucination/validate_response.ts:34` reuses the bounded reader;
   `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:65` executes the silent
   open-stdin case. `plugins/cc/scripts/anti-hallucination/validate_response.mjs:91` is the
   regenerated portable twin.
4. `plugins/cc/scripts/anti-hallucination/ah_guard.ts:352` couples weak vocabulary sentence-locally,
   including punctuation without following whitespace; the residual-proof negatives are at
   `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:206`.
5. `plugins/cc/skills/anti-hallucination/references/guard-implementation.md:14` now describes the
   actual exit-zero JSON Stop contract. `plugins/cc/tests/structure.test.ts:227` prevents exit-code
   drift.
6. `plugins/cc/tests/structure.test.ts:29` now parses CommonMark fence marker/length state and shares
   it with live-link scanning. It exposed and fixed the nested-fence defect at
   `plugins/cc/skills/cc-agents/references/agent-anatomy.md:295`.
7. `plugins/cc/tests/structure.test.ts:187` compares option hints, option tables, ordered required
   positionals, and live Commander help. Exact `<name>` / `<nameOrPath>` contracts are recorded at
   line 3 and in the Arguments table of:
   `plugins/cc/commands/agent-add.md`, `agent-evaluate.md`, `agent-evolve.md`, `agent-refine.md`,
   `command-add.md`, `command-evaluate.md`, `command-evolve.md`, `command-refine.md`,
   `hook-evaluate.md`, `magent-add.md`, `magent-evaluate.md`, `magent-evolve.md`,
   `magent-refine.md`, `skill-add.md`, `skill-evaluate.md`, `skill-evolve.md`, and
   `skill-refine.md`.
8. `plugins/cc/skills/cc-hooks/examples/load-context.sh:7` retains atomic key-level environment
   upserts, and `plugins/cc/tests/hook-examples.test.ts:159` executes repeated runs.
9. `apps/cli/src/commands/helpers.ts:20` still restricts `--invocation-mode` registration to the
   skill call at `apps/cli/src/commands/skill.ts:424`; agent, command, and magent calls at
   `apps/cli/src/commands/agent.ts:203`, `apps/cli/src/commands/command.ts:202`, and
   `apps/cli/src/commands/magent.ts:203` omit it.
### Testing
Forced verification completed 2026-07-26T20:47:08Z.

**Requirement Traceability**

| Req | Status | Evidence |
|---|---|---|
| R1 | MET | Narrow allow grammar and fail-safe decisions at `plugins/cc/skills/cc-hooks/examples/validate-bash.sh:26`; executable shell-safety cases at `plugins/cc/tests/hook-examples.test.ts:41`. |
| R2 | MET | Canonical JSON and segment/path normalization at `plugins/cc/skills/cc-hooks/examples/validate-write.sh:26`; escaping, benign-dot, traversal, `/sys`, malformed-input, and symlink cases at `plugins/cc/tests/hook-examples.test.ts:88`. |
| R3 | MET | Bounded-reader adapter at `plugins/cc/scripts/anti-hallucination/validate_response.ts:34`; direct open-stdin process regression at `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:65`. |
| R4 | MET | Punctuation/newline sentence-local coupling at `plugins/cc/scripts/anti-hallucination/ah_guard.ts:352`; residual-proof negatives and intended positives at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:206`. |
| R5 | MET | Exit-zero `decision:"block"` documentation at `plugins/cc/skills/anti-hallucination/references/guard-implementation.md:14`; invariant at `plugins/cc/tests/structure.test.ts:227`. |
| R6 | MET | Marker/length-aware fences and live-link resolution at `plugins/cc/tests/structure.test.ts:29`; repaired nested asset at `plugins/cc/skills/cc-agents/references/agent-anatomy.md:295`. |
| R7 | MET | Live Commander option and ordered-positionals parity at `plugins/cc/tests/structure.test.ts:187`; all lifecycle wrappers expose exact `<name>` / `<nameOrPath>` hints. |
| R8 | MET | Current `spur task` guidance in `plugins/cc/skills/cc-skills/SKILL.md:54`; corpus-wide obsolete-instruction regression at `plugins/cc/tests/structure.test.ts:237`. |
| R9 | MET | Atomic key upsert at `plugins/cc/skills/cc-hooks/examples/load-context.sh:7`; repeated-run regression at `plugins/cc/tests/hook-examples.test.ts:159`. |
| R10 | MET | Generic asset/CLI contract surface at `plugins/cc/tests/structure.test.ts:29`, `:150`, `:164`, `:187`, `:227`, and `:237`, plus executable hook examples at `plugins/cc/tests/hook-examples.test.ts:41`. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|---|---|---|---|
| AC1 Shell payloads cannot allow | MET | test | `plugins/cc/tests/hook-examples.test.ts:41` executes forced removal, substitution, newline separation, and malformed payloads. |
| AC2 Write decisions are parseable and segment-aware | MET | test | `plugins/cc/tests/hook-examples.test.ts:88` parses hostile quoted/newline paths and distinguishes traversal from benign adjacent dots. |
| AC3 Direct validator respects idle budget | MET | test | `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:65` holds stdin open and requires exit within one second. |
| AC4 Weak coupling is sentence-local | MET | test | `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:206` covers whitespace, newline, and no-whitespace punctuation boundaries. |
| AC5 Stop documentation uses exit-zero JSON | MET | test | `plugins/cc/tests/structure.test.ts:227` asserts `decision:"block"`, the exit-zero row, and absence of an exit-1/2 denial row. |
| AC6 Markdown fences and links are structurally valid | MET | test | `plugins/cc/tests/structure.test.ts:150` and `:164` scan the complete distributed Markdown corpus. |
| AC7 Wrapper surfaces exactly match Commander | MET | test | `plugins/cc/tests/structure.test.ts:187` compares live help with hint/table options and ordered required positionals. |
| AC8 Obsolete lifecycle instructions are absent | MET | test | `plugins/cc/tests/structure.test.ts:237` scans every distributed Markdown file. |
| AC9 Context loading is idempotent | MET | test | `plugins/cc/tests/hook-examples.test.ts:159` runs the script twice over duplicate stale exports and expects one current value per key. |
| AC10 Protected contracts fail regressions | MET | test | `plugins/cc/tests/structure.test.ts` and `plugins/cc/tests/hook-examples.test.ts` execute fence, link, CLI, Stop-doc, shell, JSON, path, and idempotency invariants. |

**Design Conformance**

| Check | Status | Evidence |
|---|---|---|
| design-conformance | PASS | 7/7 Design claims DONE: fail-safe jq decisions, bounded stdin reuse, punctuation-local weak claims, generic asset tests, live-help parity, skill-only invocation mode, and no new dependency/boundary. |
| scope-creep | PASS | Every changed hunk maps to R2, R4–R7, or R10 and its regression; no unrelated production module changed. |
| SECUA | PASS | Five residual P1/P2 findings were repaired; no blocker, major, minor, or advisory finding remains. |
| evidence-rule-pass | PASS | Every behavior-bearing AC has executable `test` evidence from this run. |
| cli-golden-path-present | PASS | The structure suite invoked every mapped lifecycle subcommand with `--help` and received exit 0. |

**Fresh Gates**

- Focused regressions — all 118 selected tests passed with 0 failures and 740 assertions. The
  focused runner exited 1 after its partial coverage report; the authoritative full-repository
  coverage command below exited 0.
- `shellcheck plugins/cc/skills/cc-hooks/examples/{validate-bash,validate-write,load-context}.sh`
  — PASS with no diagnostics.
- `bun run lint` — PASS: Biome checked 214 files; both workspace typechecks exited 0.
- `bun run spur-check` — PASS: all 31 enabled pre-check rules, 1,923 tests across 100 files with
  0 failures and 5,400 assertions, 98.90% line / 99.65% function coverage, and all 3 post-check
  rules passed.
- `bun run build` — PASS: the portable validator twin regenerated and the standalone CLI bundled
  and compiled.
- `git diff --check` — PASS.
- `spur task check 0108 --strict-core --json` — PASS with no findings.
- Fix-pass artifact disclosure: `.spur/run/0108-verdict.json:1` is rewritten after tracked evidence
  is finalized; no other persistent `.spur/run/**` deliverable is changed.
### Review
Forced all-focus review companion — 2026-07-26.

| Priority | Dimension | Evidence | Finding | Resolution |
|---|---|---|---|---|
| P1 | Security / Correctness | `plugins/cc/skills/cc-hooks/examples/validate-write.sh:55` | The system-directory allow policy omitted Linux `/sys`, so `/sys/...` produced no decision and silently allowed the write. | Restored `/sys` and `/sys/*` denial; executable regression at `plugins/cc/tests/hook-examples.test.ts:98`. |
| P2 | Correctness / Usability | `plugins/cc/skills/anti-hallucination/references/guard-implementation.md:14` | The reference still documented exit 2 as the Stop denial signal, contradicting the shipped exit-zero `decision:"block"` contract. | Replaced the table with the canonical exit-zero contract and added a structural regression at `plugins/cc/tests/structure.test.ts:227`. |
| P2 | Correctness | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:352` | Sentence locality required whitespace after punctuation, so two punctuation-delimited sentences without a space were recombined into a false external claim. | Split at punctuation boundaries with or without following whitespace; residual-proof regression at `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:206`. |
| P2 | Architecture / Correctness | `plugins/cc/tests/structure.test.ts:150` | Fence validation only counted matching-looking lines; mismatched markers and nested same-length fences could pass. The stronger probe exposed malformed nested examples in `agent-anatomy.md`. | Added marker/length-aware scanning shared by fence and link checks, repaired the asset with four-backtick outer fences, and added a false-green regression. |
| P2 | Architecture / Usability | `plugins/cc/tests/structure.test.ts:187` | Wrapper parity checked only whether some required positional existed, so wrong names and counts passed despite the exact-parity contract. | Compare ordered required positionals from hints and tables against live Commander Usage; synchronized all 17 wrappers to `<name>` / `<nameOrPath>`. |

No residual P1, P2, P3, or P4 finding remains. Security, efficiency, correctness, usability, and
architecture were re-audited against R1–R10, all ten scenarios, and all seven Design claims.
### References
- Review scope: `plugins/cc`
- Reproduction: `validate-bash.sh` allowed `rm --recursive --force` and command substitution.
- Reproduction: `validate-write.sh` emitted invalid JSON for a quoted `/etc/...` path.
- Reproduction: direct `bun validate_response.ts` remained alive after 350 ms on silent open stdin.
- Reproduction: `requiresExternalVerification("The API change is local. The helper returns early.")`
  returned `true`.
- Binding script delivery decisions: ADR-023 and ADR-024 in `docs/00_ADR.md`.
- Plugin/runtime surface: `docs/04_DESIGN.md`.
### History
- 2026-07-26T18:14:12.558Z backlog → todo (system)
- 2026-07-26T18:14:13.910Z todo → wip (system)
- 2026-07-26T18:24:03.879Z wip → testing (system)
- 2026-07-26T20:49:17.119Z testing → done (system)
