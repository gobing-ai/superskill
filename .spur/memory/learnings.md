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

