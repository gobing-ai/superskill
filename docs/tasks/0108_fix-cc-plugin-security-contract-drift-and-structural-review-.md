---
template: issue
schema_version: 1
name: "Fix cc plugin security, contract drift, and structural review findings"
description: ""
status: testing
type: issue
profile: standard
feature_id: null
parent_wbs: null
priority: P2
tags: ["bug"]
dependencies: []
created_at: "2026-07-26T18:12:58.484Z"
updated_at: "2026-07-26T18:27:48.353Z"
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

R8. Replace obsolete `tasks`/`cc:tasks` lifecycle instructions with the current `spur task`
CLI-gated section/status workflow.

R9. Make the context-loading example idempotent so repeated SessionStart runs do not append
duplicate environment exports.

R10 (architecture). Deepen the plugin structure test surface with generic invariants for balanced
fences, resolvable live links, and command-wrapper/Commander option parity so future drift fails
deterministically.
### Acceptance Criteria
- [x] Shell payloads such as `rm --recursive --force ...` and `echo $(...)` cannot exit as allow.
- [x] A quoted malicious write path produces parseable JSON; `foo..bar` is not treated as traversal.
- [x] The direct Bun validator exits within its idle budget when stdin remains open and silent.
- [x] Weak vocabulary in one sentence plus a local coupler/lifecycle verb in another returns false.
- [x] Plugin README and anti-hallucination references describe exit-0 JSON decisions consistently.
- [x] Every distributed Markdown file has balanced fences and every non-example relative link resolves.
- [x] Wrapper option hints have exact parity with their corresponding Commander subcommands.
- [x] No live `tasks update` or `cc:tasks` lifecycle instruction remains.
- [x] Running `load-context.sh` twice leaves one export per key.
- [x] Regression tests fail on fence, link, CLI-surface, shell-safety, JSON-escaping, and idempotency regressions.
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
1. `plugins/cc/skills/cc-hooks/examples/validate-bash.sh:13` and
   `plugins/cc/skills/cc-hooks/examples/validate-write.sh:13` now use fail-safe command
   classification and `jq`-encoded canonical decisions; `load-context.sh:7` suppresses repeated
   exports. `plugins/cc/tests/hook-examples.test.ts:29` executes the examples against adversarial
   and idempotency fixtures.
2. `plugins/cc/scripts/anti-hallucination/ah_guard.ts:352` makes weak coupling sentence-local, and
   `plugins/cc/scripts/anti-hallucination/validate_response.ts:34` reuses the bounded
   idle-rearming stdin reader. The generated portable `validate_response.mjs` twin was rebuilt.
3. Plugin command wrappers, Stop-contract references, task lifecycle guidance, links, and fences
   now match their runtime contracts. `plugins/cc/tests/structure.test.ts:108` enforces fence
   balance, live-link resolution, and exact wrapper/Commander help parity.
4. `apps/cli/src/commands/helpers.ts:20` registers `--invocation-mode` only for skill scaffolding;
   `docs/04_DESIGN.md:47` and `docs/design/design-doc-phase2.md:44` own the synchronized surface.
### Testing
- `bun test plugins/cc`: PASS — 121 tests, 0 failures; 98.41% functions / 98.10% lines.
- Direct open-stdin regression: PASS at
  `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts:63`.
- `shellcheck` on all three changed hook examples: PASS.
- `bun run lint`: PASS — Biome checked 214 files; both workspace typechecks passed.
- `bun run test`: PASS — 1907 tests, 0 failures; 99.64% functions / 98.91% lines.
- `bun run build`: PASS — portable validator twin regenerated and standalone CLI compiled.
- `bun run spur-check`: PASS — 31/31 enabled pre-check rules, full suite, and 3/3 post-check rules.
- `git diff --check`: PASS.
### Review
Final disposition: PASS.

- P1/P2: All reproduced shell-safety, JSON-injection, blocking-stdin, and false-positive defects
  are fixed with executable regression evidence.
- P3/P4: Wrapper/help drift, stale Stop/task prose, broken links, unbalanced fences, and repeated
  context exports are fixed.
- C1: Generic plugin asset invariants now cover every distributed Markdown file and lifecycle
  wrapper, rather than enumerating only the current defects.
- C2: The ignored cross-family `--invocation-mode` option was removed from non-skill scaffold
  surfaces and the authoritative design contract was synchronized.
- Residual risk: The shell scripts remain examples and intentionally route unknown commands to
  approval; they are not a general shell parser. No unresolved finding remains in the requested
  scope.
- Lifecycle note: the task remains `testing`; the final `done` transition was correctly denied
  because this standalone review did not create a Spur task-pipeline provenance record.
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
