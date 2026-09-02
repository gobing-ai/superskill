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
