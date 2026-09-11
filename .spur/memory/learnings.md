I have everything I need. Now I'll extract the learnings into clean markdown.

## 0112 — Live-confirm Codex agent discovery and model-key honoring (2026-08-09 / 2026-08-10)

### Conventions discovered

- **Codex subagents discovery contract (official OpenAI, verified 2026-08-09):** custom agents are standalone TOML files under `~/.codex/agents/` (personal) or `.codex/agents/` (project). No per-agent `[agents.<name>] config_file` registration is part of the contract — the `[agents]` table owns only global defaults and concurrency.
- **Codex model precedence contract:** file-level `model` and `model_reasoning_effort` in the agent TOML take precedence. `model_reasoning_effort` valid values are `low` / `medium` / `high` plus model-dependent higher levels `xhigh` / `max` / `ultra`.
- **Codex agent TOML ships five keys:** `name`, `description`, `model`, `model_reasoning_effort`, `developer_instructions`.
- **Evidence-reconciliation scope:** when a shipped adapter is already correct and the only defect is stale "unverified" wording, the task is a six-surface doc/comment reconciliation (ADR, two source TSDoc blocks, install comment, prior task Q&A, compatibility reference, feature scenario) — zero executable code change.
- **Feature scenario identity:** editing only the F3 scenario *body* via `spur feature update` while preserving the title exactly keeps task→feature traceability stable.

### Errors hit and resolved

- **R6 hygiene miss (P3):** scratch `CODEX_HOME` dir + `auth.json` symlink were correctly removed, but three stray scratch files (`/tmp/codex-smoke-events.jsonl`, `/tmp/codex-smoke-path.txt`, `/tmp/codex-smoke.err`) were left in OS temp. Left R6 PARTIAL at review. Resolved in the verify fix pass (`--fix all` removed the three files → R6 MET). Lesson: smoke probes that redirect stderr/path dumps to `/tmp` must enumerate *all* scratch artifacts for cleanup, not just the ones the probe intentionally created.

### Patterns that worked

- **Isolated scratch-`CODEX_HOME` smoke for a live compatibility signal:** `mktemp -d` for `CODEX_HOME`, symlink *only* the existing real `auth.json` (no copy, no real-home mutation), drop one `agents/zz_probe_agent.toml`, run `codex exec --json --sandbox read-only --ephemeral --skip-git-repo-check` that explicitly selects the agent type, expect `PONG`. A successful spawn = installed-client discovery compatibility. Reusable for any future codex-cli version-drift check.
- **Treating `list_agents` as a thread enumerator, not a registry probe:** it returns active/completed threads, not the configured agent-type registry — do not use it to validate agent discovery. The spawn itself is the probe.
- **Decoupling "discovery works" from "model is honored":** discovery is confirmed by a PONG spawn; model-key honoring is confirmed only by the official precedence contract — never inferred from agent output, latency, token use, response quality, or a no-model control agent. Keeps the two verdicts independently falsifiable.
- **Comment-only diffs verify with focused tests:** 37/37 adapter + 63/63 install tests pass; full gates (`lint`, `build`, `spur-check` → 2008 pass + 3/3 post-check rules) deferred to the pipeline test hop per bug-742.

### Gotchas

- **Feature shippable gate reports FAIL while a covering task sits at `testing`:** the F3 scenario shows "linked but unverified" because the feature checker only honors verdicts from `done` tasks. The `testing → done` transition is what clears the scenario; a verify PASS written at `testing` is correct and sufficient, not a defect.
- **`## Review` section ownership:** verify mode must not write `## Review`; it's owned by `/sp-dev-review`, and the `record` step backfills it only when bare. Historical P3 findings stay accurate as-of-review-time even if the verify fix pass resolves them — the Testing section documents the resolution.
- **`spur task update --section` for prior-task resolution:** appending a dated `RESOLUTION (2026-08-09, task 0112)` into 0111's Q&A is the correct way to settle an earlier task's stale premise without erasing its historical probe record.

# Wrap-up learnings — 2026-08-13 (feature A batch)

## 0115 (magent completeness disclosure-aware)

- Scoring surfaces must be exercised with real filesystem fixtures, not mocked `existsSync`: the live-link tests (temp dir, no mock) caught nothing the mock would miss — but they also certify the actual `fs` seam. Keep real-fixture tests for fs-touching heuristics.
- Biome `noAssignInExpressions` rejects the `while ((m = re.exec(body)) !== null)` idiom — `body.matchAll(re)` is the drop-in replacement and reads cleaner. Add to the mental lint checklist; implement agents will keep producing the exec-loop form.
- A change to `evaluate()` signature (optional param) is byte-identical for absent callers only if the default path never touches the new seam (`basePath === undefined → return false` before any fs call). Test that equivalence explicitly (`toEqual` vs explicit-undefined).

## 0116 (contradiction failure mode)

- Append-only enum growth with a frozen order: append last, derive types from the const, and let rejection messages self-enumerate via `join(', ')` — zero hand-maintained string lists. This survived review with no P1–P3.
- Doc-surface parity sweeps (grep the whole repo for the old enumeration) are cheap and catch stale counts in command files that tests never read. Do the sweep in the same change, not as a follow-up.

## 0117 (magent template minimization investigation)

- A scorer that measures "conciseness" as byte length will penalize any template with teaching prose that no dimension scores. Before blaming the template, attribute the body: measure how much of it is unscored padding. 70.1% here was enablement prose — a linkable restructure, not deletion.
- Counterfactual matrices (0/3/5 platforms) beat single-point measurements when a dimension is a `min(n/N, 1)` clamp — they expose both the penalty magnitude and its legitimacy.
- Investigation tickets that graduate implementation should write the follow-up ticket (0119) fully populated (Background/Requirements/AC/Design) in the same change — the decision is fresh, the context is loaded.

## 0118 (spur constitution template assessment)

- Line-number citations in docs rot fast (two P4 citation errors in one task, both caught by verify's live re-read). Verify's `--fix all` correcting them in the same pass is the right loop — cite section headings, and when you cite lines, re-verify them at verify time.

## Batch (process)

- The inline pipeline driver's native-subagent dispatch worked cleanly for all 16 agent.run stages; the one format-gate failure (0115) was fixed at root cause and re-ran green. The `test -s` gate on wrap capture files is the right success signal for agent-produced artifacts.
- Feature-sync bounded wrapper suppressed redundant blocked syncs mid-batch (expected — feature stays backlog until the batch-once feature-transition).

# Wrap-up learnings — 2026-08-13 (0120 harness discoverability)

## 0120 (harness discoverability bottlenecks — meta analysis task)

### Conventions discovered

- **Cross-repo routing: the task lives where the analysis ran.** Findings that land in another repo get routed as a new task there (`0534` in spur-new), and the source task's Solution records the correction of any finding that was wrong as originally written. Same-change write-up prevents re-deriving the routing decision.
- **Fix the CLI at the point of failure, not the agent guidance.** Agents with `sp:spur-cli` available still probed `--help` 11 times; "a guidance fix that competes with a one-line shell probe loses." The probe is cheaper than opening a reference — the surface must answer at the failure site.
- **When 7 independent agents route around a surface, the surface is missing an affordance, not the agents' discipline.** Don't frame it as a discipline fix.
- **Investigate before fixing:** fix the analyzer defect first (R4 before R1-R3) so the before/after comparison of the fix run is trustworthy.
- **Severity ledger** S0 >2h / S1 30m–2h / S2 <30m; anti-patterns seen in ≥2 independent sessions are codification candidates, single-session ones are not.

### Errors hit and resolved

- **Stale OMP field map corrupts forensic conclusions silently:** `references/session-formats.md` documented `input.command`; the live OMP toolCall block keys are `['arguments','id','intent','name','partialArgs','streamIndex','type']` — shell command lives at **`arguments.command`**. Following the stale map returned `test=0, spur=0`, a silently wrong "no test-loop waste" verdict. A forensic tool that fails open is worse than one that fails loudly — the fix added a self-check note that zero tool-command count means the field map is wrong, not that sessions were idle.
- **Miscalibrated heuristic flags correct behavior:** `section-write` firing at >2× task count would flag 38 writes for 5 tasks (7.6/task), but `feature-impl` tasks legitimately carry ~9 canonical sections — one write per section is correct. Threshold must be expressed per section *slot*, not per task.
- **R1 and R2 were wrong as originally written — verify findings at the fix site.** `showSuggestionAfterError` was already enabled (`spur task shwo` → `Did you mean show?`); the real fix is a `get`→`show` alias. The section list is already computed by `spur task sections <wbs> list`; the fix is a cross-reference, not a hoist.
- **R3's actual gap was narrower than the finding assumed:** `evaluate` already ran a deterministic heuristic mode by default; what it could not do was pass a `basePath`, so CLI scoring never resolved links — precisely why seven sessions hand-rolled `/tmp/*.ts` scripts. Fix was a threaded option, not a new command.
- **Plugin-doc guard enforces CLI/doc parity:** `plugins/cc/tests/structure.test.ts:222` ("keeps lifecycle wrapper argument hints aligned with Commander") fails until `magent-evaluate.md`'s `argument-hint` + Arguments row include the new flag. A CLI flag change ⇒ the cc command doc must change in the same commit.

### Patterns that worked

- **Default options to what the file means:** `basePath ?? dirname(resolvedPath)` — relative links in a doc resolve against the doc's own directory; override only when content is authored to live elsewhere (e.g. scaffold template scored as if at a project root).
- **Monotonicity makes defaulting-on safe:** link credit is additive-only (`scoreCompleteness` short-circuits on a heading match, only *adds* on a link match), so no stored score can regress when `basePath` defaults on. Applying the same default in `emitEnvelope`'s baseline keeps Scorer deltas comparable.
- **Real-fs fixtures for fs-touching heuristics:** `mkdtempSync` + `writeFileSync` fixture with every governance area inline except the one under test — "the delta isolates the link" (6/6 vs 5/6 completeness notes) — certifies the actual fs seam without mocks.
- **Batch-write-then-single-check protocol held:** 13 `spur task check` for 5 tasks (2.6/task) stayed under the 3-per-task guard — the protocol that prevented loop waste.
- **Discovery waste, not loop waste, is the expensive failure class:** 0 compactions and 1 repeated-command candidate across 876 tool calls — the ~60–95 min waste was probing (`--help` ×11, invalid `task get` ×6, guessed sections ×4) and hand-rolling scoring scripts (20 `/tmp/**` runs across 7 sessions, ~35–70 min).

### Gotchas

- **`spur task get` does not exist** — the verb is `show`; agents then build defensive fallback chains (`task show X --json || task get X --json || task list --json | jq ...`). Unknown-verb errors cost the failed call plus the fallback authoring.
- **Section names are only discoverable after a failed write:** the `does not contain section` rejection lists valid sections, but reading them costs a failure first.
- **Per-incident waste multipliers are estimates, not instrumented** — the ~60–95 min total is order-of-magnitude; counts and wall-clock are measured, multipliers are the skill's standard estimates.
- **`...(opts.basePath ? { basePath } : {})` silently drops an explicit empty `--base-path ""`** — the dirname fallback is right (empty dir is meaningless), but the guard is implicit; P4-flagged for a comment.
- **`basePath` default is computed in two places** (heuristic path and `emitEnvelope` baseline) — parity documented at `:222-226` but not enforced; a future change to one default silently diverges the envelope baseline from the default report.
- **basePath tests assert only the completeness note, not the area identity** the link matched — a wrong-area keyword match would still yield `6/6`. Advisory P4, but a caution for delta-isolation tests.

# Wrap-up learnings — 2026-09-01 (feature B: 0123 + 0124)

## 0123 (install provenance manifest)

### Conventions discovered

- **Two snapshots, not one.** Installed bytes are target-transformed; upstream comparison must hash the resolved plugin source tree. Using installed hashes for staleness creates false positives.
- **Plugin-keyed per-target path.** `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json`. Identity is the safe path segment, never a field inside untrusted JSON.
- **Native dests can live under `$HOME` while project `scopeRoot` is cwd.** Snapshot paths must stay in-scope; filter out-of-scope receipts instead of throwing after a successful dispatch.

### Errors hit and resolved

- Empty dest inventory was treated as success (`continue`). R5 requires fail-loud: throw per target when dispatch completed and no in-scope files resolved.
- Native claude/omp/grok dest walks were missing; tests that mocked empty dests went green. Seed dest files in native mocks; invert the empty-dest test to expect throw.
- `skills: [] as string[]` in rulesync stubs fails CLI typecheck against `RulesyncSkill[]`. Annotate the helper as `GenerateResult`.
- `spur task update --section` on an `AM` (index=skeleton, worktree=refined) task file can rewrite from the staged skeleton and drop Design/Plan/Solution. After every section write, `spur task show` and confirm other sections survived.

### Gotchas

- Focused `bun test <files>` exits 1 from bunfig 90/90 on unloaded files even when 0 tests fail. Judge the pass/fail counts, not the process exit.
- Dry-run must write no manifest. Manifest write is after successful dispatch, before the success line.

## 0124 (update verb)

### Conventions discovered

- **`listResolvablePlugins(undefined)` is CWD, not the packaged marketplace.** Bundled names must go through `resolveInstalledPackageRoot()` + that package's `.claude-plugin/marketplace.json`, same as install self-location.
- **Discovery must be scoped to selected `--targets`.** Walking every target dir then reading only selected ones reports false "reinstall to adopt" for a plugin manifested on another target.
- **0123 configured-path locators are plugin roots**, not marketplace.json. `resolvePlugin` throws; snapshot the directory and re-install via `pluginPath`.
- **Merge rank stale > unavailable**, but **exit code from unmerged rows**, so a mixed-channel plugin still re-installs and still yields exit 2 when a sibling lookup failed.

### Patterns that worked

- Core comparison stays pure; CLI owns I/O, stdout, exit, and `executeInstall`. Tests inject `executeInstall`, `npmLatest`, and `listBundledPlugins`.
- `--check` is strictly read-only. Bundled stale prints `npm i -g @gobing-ai/superskill@latest` once and never copy-patches the running CLI.
- Review P2s fixed in-host before verify (same as 0123), then `--fix all` added the missing discovery/arg-assertion tests.

### Gotchas

- Version-only stale with identical files used to render `(0 file(s) changed: )`. Omit the empty path list.
- `isTarget` must use `TARGETS.includes`, not a hand-copied union.
- Shippable FAIL while the last covering task is still `wip` is expected; per-task Verdict stays independent.
**Doc-evolve wrapup (0125) — audit clean, no repairs applied.**

Detection run against the task's changeset (`magents/team-stark-children/*` + `plugins/cc/rules/01|02`, docs-only, uncommitted):

- **00_ADR.md** — no drift. `magents/` bundling/published-content entries (lines 516–518, 565) still true; the task's decisions are product content, recorded in feature C, no T1. Frontmatter `updated_at: 2026-08-31` plausible.
- **03_ARCHITECTURE.md** — no drift. No claims on magent package layout, rule-module count, or overrides mechanics; `select-magent.ts` one-liner matches unchanged code.
- **04_DESIGN.md** — no T3 fired (no command/flag/config/schema/DTO change). No `spur status` / `spur init` dead-verb propagation (grep: zero hits across all four targets); the drift class was confined to the magent package and fixed there.
- **docs/design/*** — no repair per §4.2: phase docs are dated working records, not in the authority chain; nothing authoritative depends on them, and editing them would falsify history. 04's links to them are correctly labeled as phase design docs.
- **Flagged, not repaired (out of enumerated scope):** feature C shipped with no `docs/05_FEATURES.md` row — a T4 miss (feature B has a row at line 39, C has none). Recommend adding the row in the same commit that lands this changeset.

No task/feature corpus written. Learnings artifact at `.spur/run/wrapup-learnings.md`:

# Wrap-up learnings

## 2026-09-02

### 0125 — Refresh the team-stark-children magent package to SOTA

#### Conventions

- Verify every `spur <noun> <verb>` / `superskill <noun> <verb>` string in agent-facing docs by mechanical extraction against the binary's own `--help` (`rg -o` sweep, then resolve each noun/verb), never by eye. The extraction sweep is what caught the dead `spur status` / `spur init`; the real verbs are `spur self status` / `spur self init` (spur 0.3.71+).
- Plugin rules reach only claude + antigravity (`plugins/cc/rules/` installs to `.claude/rules/` and `.agents/rules/`, select-magent.ts). A doctrine meant for all nine targets must live in the root AGENTS.md and be mirrored into each `overrides/<target>/AGENTS.md` — overrides replace the root layer, never append.
- Derive a compression budget from the rubric weights before writing, not by taste: at safety 4/7 the aggregate-0.90 ceiling was 9,905 chars, so the target was 9,500 with 405 chars of margin. A round "≤10,000" target would have failed the gate at 0.8982.
- Rules that agents must keep under pressure carry their failure mode, not just the order ("shell-shaped tools last — unbounded output floods context and shadows the purpose-built tool"). A bare ranking is forgotten; a ranking with its reason can be re-derived.

#### Patterns

- Order of operations for a doc-refresh task: drift repair first (mechanical, stops the rewrite from carrying stale verbs forward), then compression (frees budget), then new doctrine (spends it), then the quality gate. Authoring doctrine first pushes the file further from target and forces a second pass.
- Relocate displaced depth into the existing rule modules along their themes instead of adding a new module — a fifth `plugins/cc/rules/*.md` makes `CLAUDE.md`'s inline module list stale and triggers a second sync obligation.
- The scorer is the instrument, not the subject: never tune `packages/core/src/quality/*` or the rubric to flatter the artifact being scored; that voids the gate that proves the work.
- Every acceptance-criteria row carried executable evidence (command + observed result), not prose claims — this is what made the pipeline verify PASS without re-investigation.

#### Gotchas / errors fixed

- `scoreSafety`'s keywordDensity matches whole words bounded by whitespace or `.,;:!?`: `[CRITICAL]`, `safety`, `never`, `block` scored; `security` was boundary-blocked (followed by `/` or `-`) and contributed nothing. Rewriting markers during compression silently moves the score — assert the four boundary-sensitive matches survive the rewrite.
- The CLI's "N safety markers found" note is naive substring counting and disagrees with the real whole-word scorer. Trust the regex in `heuristics.ts`, not the note.
- The CLI reports the rubric-weighted aggregate, not `computeAggregate`'s equal weighting (`apps/cli/src/operations/evaluate.ts:208` overwrites it) — reproduce the weighted sum when computing a budget by hand.
- opencode, hermes, grok, and omp receive no plugin rules at install time, so the CRITICAL safety table and verification gate cannot be relocated out of the root file — compress them in place.
- The "~32 KiB Codex cap" is asserted in a comment in the codex override, not enforced by any code — treat it as a documented budget checked with `wc -c`, not as a gate.
- Doc-side audit after the task: the dead-verb class did not propagate into the numbered docs (`docs/00`, `03`, `04`, `docs/design/*` carry no `spur status` / `spur init`), and a docs-only changeset fires no T3 sync trigger. Open follow-up: feature C shipped without a `docs/05_FEATURES.md` row (T4) — flagged, not repaired, as 05 was outside the wrapup's enumerated repair scope.
Doc-evolve wrapup complete. Repairs applied, artifact written.

## What was done

**Drift audit (deterministic detection + judgment) for batch tasks 0128 (grok-bot install target) + 0130 (post-install action mechanism):**

| Doc | Finding | Repair |
|---|---|---|
| `docs/00_ADR.md` | ADR-036/037 read "Accepted (design)" but are shipped (tasks done; 03/04 say implemented) — §6.1 r5 | Flipped both to `Accepted`; bumped version 1.12.0→1.13.0, `updated_at`→2026-09-10 |
| `docs/03_ARCHITECTURE.md` | Module tree missing `post-install.ts` (operations/) and `doctor.ts`+`install-post-actions.ts` (commands/) — §6.4 r4 | Added all three tree rows; version 2.13.0→2.14.0 |
| `docs/04_DESIGN.md` | `doctor` root command only in prose, not the command surface — §7 audit gap | Added table row transcribed from `registerDoctor` (`--targets grok-bot` required, `--json`, exit 0/1/2); version 2.10.0→2.11.0 |
| `docs/design/skill-update-notification.md` | Manifest schema predates the `grokBot.materialize` field (ADR-035 amendment) | Added §4.2-sanctioned `## Correction (2026-09-10)` block, no rewrite |

**Not edited (verified clean):** phase design docs (phase1-5) — their "doctor deferred in Phase 1" statements are historical scope records, not current-state claims. No task/feature corpus writes (tool-owned per §3). Flagged pre-existing same-class drift: ADR-035 is shipped but still reads "Accepted (design)" — out of batch scope.

**Verification:** re-ran the audit checks (statuses, tree rows, command row, correction section all landed); diff is intentional and additive over the tasks' own same-commit edits.

Artifact written to `.spur/run/38cf6018-2f29-4d34-b51b-4daa1eeddcd2-wrapup-learnings.md`.

---

# Wrapup Learnings — tasks 0128, 0130 (Grok Bot install target + post-install action mechanism)

Batch: feature D — opt-in grok-bot install target and safe slash-registration handoffs.
Doc-evolve wrapup run 2026-09-10. Grouped by date, then task WBS. Raw notes, not prose.

---

## 2026-09-08 — task 0128 (Add explicit opt-in Grok Bot VPS install target with durable workflow skills)

### Conventions
- **Install-only targets are a separate taxonomy from execution targets.** `grok-bot` lives in
  `INSTALL_TARGETS = [...TARGETS, 'grok-bot']`, never in `TARGETS`. It expands no executor
  mapping, joins no rulesync/native/magent/rule/script path. Widening `parseTargets` demands
  auditing every legacy transform/emitter so the new target cannot leak in. (targets.ts:26)
- **Explicit opt-in beats ambient detection.** Sand directories or `SAND_DATA` existing on a
  laptop must never enable Bot install. Omitted/empty configured targets and bare `--targets all`
  expand to the nine existing targets regardless of detection; only an explicit `--targets
  grok-bot` (or direct programmatic selection) opts in.
- **Marker-gated ownership, never prefix-based prune.** Sand `workflows/` is a shared host tree
  where a name prefix proves nothing. `.superskill-origin.json` (schemaVersion 1, per-workflow
  hashes) is the ownership/drift basis; unmarked/foreign/malformed markers fail replacement
  instead of overwriting. The existing flattened prune path is never entered for Bot.
- **Resolve the destination once per invocation, never at module-import time.** Resolution order:
  nonempty `SAND_DATA` → existing `<home>/sand-data` → qualifying `<home>/agent-data`; no
  fallback creation, no relative/URL/SSH/blank/dangling-link acceptance; share the result with
  install/update/doctor.
- **Bot is host-global only.** `--no-global` + explicit Bot fails preflight; a mixed-target
  preflight failure must occur before any target output write.

### Errors fixed (verify-pass `--fix all`, run inline-0128-20260908-155657-44026)
- **Docstring-claimed rollback was not implemented.** `emitGrokBotInstall` claimed rollback but
  performed plain writes. Repair: all workflow/canonical writes and prunes run inside
  `FilesystemTransaction`, receipt write in the rollback scope via a `finalize` callback.
  Regression: emission/receipt failure restores prior Bot output and reports rollback errors.
- **Drift-conflict gate was missing.** `planGrokBotInstall` replaced/pruned owned workflows
  without checking marker hashes — locally edited managed files were silently overwritten.
  Repair: `assertOwnedUndrifted` fails preflight on drifted owned content or unowned extras
  (bridge pointer stub is derived and carved out). 3 regression tests.
- **Update mode threading silently switched modes.** Bot marketplace reinstall ignored the
  receipt's `grokBot.materialize` — a silent full→bridge switch on update. Repair: thread the
  recorded mode into reinstall; a legacy Bot receipt without the field emits explicit reinstall
  guidance instead of guessing.
- **False pre-existing-red claim, root-caused.** Testing claimed `bun run test` exit 1 was
  pre-existing on clean HEAD. Re-run on clean db63531 in a worktree: 2239 pass / exit 0 — the
  claim was false. Root cause: new `doctor.ts` shipped at 78.57% line coverage, tripping bun
  1.3.14 per-file coverage thresholds. Fixed by covering human-output paths → 100/100, exit 0.

### Gotchas
- **Verify "pre-existing red" claims against a clean worktree before asserting them.** A false
  pre-existing claim hides a real regression (the new file's coverage) and lets a new file ship
  red. `bun run test` on clean HEAD is the baseline, not memory.
- **Corpus-check exit 1 is a standing baseline.** 168 errors / 710 warnings on the batch tree;
  clean db63531 worktree shows 197 errors / 718 warnings — strictly worse before the batch.
  Distinguish inherited findings from regressions; zero findings named task 0128 or feature D.
- **VPS host smoke is a separate deliverable.** Local fixture tests prove the filesystem
  contract; actual slash discovery/reload/invocation need an authorized Bot session. Never claim
  a local file listing proves GUI support. AC12's host half split to 0129 by operator decision.

---

## 2026-09-09 — task 0130 (Prepare safe Grok Bot slash registration handoffs within install)

### Conventions
- **Mechanism-first, consumer-second.** Build the reusable target post-install action contract
  (`PostInstallContext`/`PostInstallAction`/`PostInstallResult`/`TransactionalWrite`,
  `runPostInstallActions`, `createPostInstallRegistry` in post-install.ts) before the Grok Bot
  action. Future coding-agent customizations use the same extension path (ADR-037). OMP's
  `postInstallOmp` is the seam reference case, not an unrequested migration.
- **No public command or flag for what an internal hook can do.** A register command was
  rejected: it duplicates installed-catalog discovery and still requires the host agent. Handoff
  is generated inside `install` (apply path) within the existing `FilesystemTransaction`, before
  the receipt snapshot; dry-run previews without writes (guard writer throws).
- **Target-keyed registry, not subclass/factory discovery or shell hooks.** Per-invocation
  registry, duplicate-id reject per target, absent target = no-op. Second-target support = one
  action + one registration entry; the runner has zero target branches. Tested with a synthetic
  action on an existing non-Bot target through the same dispatcher.
- **Host boundary honesty: "prepared, never registered."** CLI preparation writes a stable
  `<sandRoot>/.superskill/grok-bot/register/<plugin>.json` handoff; it does not claim to have
  called `update_state` or solved unknown-id registration. `doctor` keeps filesystem fields and
  exit 0/1/2, adds `slashRegistry.status: 'unknown'` + guidance (verified host method, per-Bot
  enablement). Healthy files are never proof of registration/visibility.
- **Preserve, don't rehash, host-modified content.** A preserving round-trip regression asserts
  writing record bytes back keeps `markerHashesCurrent` true; changed full recipes/resources
  must surface as a conflict, never silently rehashed/overwritten/deleted-recreated.

### Errors fixed / patterns
- **Deterministic byte-stable handoff.** Realpath-normalized paths, 2-space JSON + trailing
  newline, no timestamps — reinstall produces byte-identical records. `botRealpath` uses
  realpathSync with resolve fallback so handoff bytes stay identical across symlinked roots.
- **Self-referential full-mode bodies rejected** (`GrokBotPreflightError`): a full record must
  not point its replacement body back at the workflow file it overwrites. Bridge bodies
  explicitly read/follow the distinct absolute canonical SKILL.md, pass arguments through,
  resolve resources beside it.
- **Actions run inside the target's transaction** via a `TransactionalWrite` handed to the
  factory; action/catalog/receipt failures restore prior artifacts, rollback failures reported.
  Success messages echo only post-commit.
- **Stale owned workflows are still inventoried for later prune** under no-prune reinstalls;
  prune computes the selected plugin's desired set, not all workflows; foreign/unmarked markers
  are reported by doctor, never adopted or deleted.

### Gotchas / residuals (recorded, not hidden)
- **P3 realpath guard gap:** the full-mode self-reference rejection matches only the
  realpath-normalized workflow path. On a symlinked Sand root (e.g. `/tmp`→`/private/tmp`), a
  body citing the unresolved-form absolute path passes R3 rejection. Carried as follow-up; the
  destructive path requires the host to ignore carried frontmatter/body.
- **`update` after `--plugin-path` install reports `upstream unavailable`** — task-0128-era
  upstream resolution for bare path locators; unchanged by 0130 (marketplace updates thread
  materialize + reinstall via `executeInstall`).
- **Host session was not authorized** (planning approval ≠ host authorization); R8's fallback
  applied — messages/caveat/doctor never claim registration. Local-vs-host evidence split must
  transcribe into `## Testing` at record (P3 residual).

---

## Cross-task doc-sync conventions (wrapup 2026-09-10)

- **A shipped ADR must read "Accepted", not "Accepted (design)".** §6.1 rule 5: readers must
  tell decided from shipped. ADR-036/037 said "Accepted (design)" while 03/04 and reality said
  implemented — repaired by flipping status (a state transition, like Superseded) + frontmatter
  bump. Pre-existing same-class drift: ADR-035 (update provenance manifest) is shipped but still
  reads "Accepted (design)" — flagged, out of batch scope.
- **Module trees drift silently on feature add.** Task 0130 added `post-install.ts`
  (operations/) and `doctor.ts` + `install-post-actions.ts` (commands/) without the wrapup pass
  catching the missing tree rows — §6.4 rule 4. The module list is a regenerate-from-code block,
  not a hand edit.
- **Every command belongs in the 04 command surface.** `doctor` was documented only in prose
  under the grok-bot section; the §7 audit item "04 covers every command" needs a table row.
  Transcribe flags from the registration (`--targets grok-bot` required, `--json`, exit 0/1/2).
- **Concluded design docs get dated correction sections, not rewrites** (§4.2).
  skill-update-notification.md predates the `grokBot.materialize` field (ADR-035 amendment
  2026-09-08); repaired with a `## Correction (2026-09-10)` block pointing to 04/ADR-035.
  Phase design docs (phase1-5) needed no edit — their "doctor deferred in Phase 1" statements are
  historical scope records, not current-state claims.
- **Do not write task/feature corpus in a doc-evolve wrapup.** Repairs stayed in 00/03/04 +
  docs/design/*; task files remain tool-owned (§3).
### Drift Audit & Documentation Repair Summary

Repaired drift across key architectural and design documentation following `docs/99_PROJECT_CONSTITUTION.md` §4–§7 for task `0131` (`Document and verify the native cc marketplace pilot`):

1. [docs/00_ADR.md](file:///Users/robin/xprojects/superskill/docs/00_ADR.md#L569-L573): Added dated amendment to ADR-034 codifying the end-to-end verified native Claude Code marketplace pilot against the published bundled marketplace manifest, confirming CLI cross-host conversion/placement, and documenting trigger-gated MCP gateway deferral. Bumped frontmatter to `v1.14.0`.
2. [docs/03_ARCHITECTURE.md](file:///Users/robin/xprojects/superskill/docs/03_ARCHITECTURE.md#L414-L429): Fixed CLI routing family count from 7 to 9 and added the `update` command row (ADR-035); added Invariant 12 codifying the cross-host placement vs native marketplace discovery boundary and MCP gateway deferral. Bumped frontmatter to `v2.15.0`.
3. [docs/04_DESIGN.md](file:///Users/robin/xprojects/superskill/docs/04_DESIGN.md#L15-L18): Added canonical landing and pilot links to the Phase 1 install surface reference. Bumped frontmatter to `v2.12.0`.
4. [docs/design/design-doc-phase1.md](file:///Users/robin/xprojects/superskill/docs/design/design-doc-phase1.md#L55-L65): Added amendment note to Section 1.3 documenting the target expansion to 9 execution targets (`grok`) and 10 install targets (`grok-bot`), the discovery vs placement invariant, and linked current flag surface.
5. [.spur/context/learnings.md](file:///Users/robin/xprojects/superskill/.spur/context/learnings.md#L15-L18): Recorded task 0131 key learning per constitution §8.
6. Artifact persisted to [wrapup-learnings.md](file:///Users/robin/xprojects/superskill/.spur/run/d732309e-6902-45a4-8251-5fec28ecef00-wrapup-learnings.md).

# Working Learnings

### 2026-09-10 — Task 0131: Document and verify the native cc marketplace pilot

#### Conventions
- **Canonical Landing Separation**: Unified the operator landing experience across `README.md` (designated universal landing entry point) and `docs/help/installation.md` (in-depth operational guide) to eliminate conflicting install instructions across docs.
- **Architectural Division of Labor**: Codified the invariant that marketplaces discover the installer, writers place skills, and host registration plus per-Bot enablement remain host responsibilities.
- **Three-Tier Lifecycle Discipline**: Structured multi-agent plugin adoption into three distinct tiers: (1) Filesystem Installation/Placement, (2) Host Registration, and (3) Per-Bot Enablement in settings.
- **Trigger-Gated Scope**: Deferred the proposed `@gobing-ai/superskill-mcp` gateway server until explicit preconditions (connector-only catalogs, remote/managed hub execution without CLI, or operator demand for in-chat calls) are met.

#### Errors Fixed
- **Stale Discovery Claims Reconciled**: Updated `docs/superskill_discovery_channel_SPEC.md` from draft status to Phase 1 Complete (verified pilot) and marked Phase 2 (Gateway MCP) deferred.
- **Omitted Target Documentation Restored**: Updated `docs/help/cmd_install.md` to document the opt-in `grok-bot` Sand workflow writer target in the supported targets table.
- **Documentation Drift Across Key Docs**: Corrected root command count and added missing `update` command in `docs/03_ARCHITECTURE.md`, added Invariant 12 for the discovery vs placement boundary, updated `docs/04_DESIGN.md` with canonical landing and pilot links, amended ADR-034 in `docs/00_ADR.md`, and added amendment notes to `docs/design/design-doc-phase1.md`.

#### Patterns
- **Empirical Evidence Capture**: Documented exact command lines, host environment and version (`Claude Code CLI 2.1.267`, `Darwin arm64`), dates, and observed stdout/component counts (23 skills, 5 agents, 1 hook) in a reproducible evidence matrix.
- **Idempotency & Reinstall Verification**: Validated update mechanisms using `superskill update cc --check` to verify upstream equivalence and documented controlled reinstall behavior when no upstream version bump was available.
- **Honest Boundary Reporting**: Explicitly documented environment limitations, unsupported host APIs, missing credentials, and unavailable GUI/VPS checks in the host/surface matrix rather than claiming unverified behavior.

#### Gotchas
- **Filesystem Placement != Chat Visibility**: Writing skills or workflows to disk (such as `<sandRoot>/workflows/<id>/SKILL.md` or registration handoffs) does not guarantee slash-menu visibility in chat GUIs (like Grok Bot); chat availability requires distinct host ingestion and user enablement. Files on disk must never be cited as proof of chat GUI visibility.
- **MCP Connector Misconception**: An MCP connector alone cannot install skill content without underlying filesystem placement writers or host-specific plugin installation support.
