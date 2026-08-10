---
template: standard
schema_version: 1
name: "Live-confirm codex agent discovery and model-key honoring (post-2026-08-07 retry)"
description: ""
status: done
type: task
profile: standard
feature_id: F3
parent_wbs: null
priority: P2
tags: []
dependencies: ["0111"]
created_at: "2026-08-02T22:19:02.164Z"
updated_at: "2026-08-10T00:59:18.838Z"
---

## 0112. Live-confirm codex agent discovery and model-key honoring (post-2026-08-07 retry)

### Background
**Type:** evidence reconciliation with one isolated compatibility smoke; no production behavior change is expected.

**Goal:** close task 0111's two stale Codex premises against the current official OpenAI subagents contract and the installed `codex-cli 0.147.0`, then remove the repository's obsolete "unverified" wording.

**Current evidence (verified 2026-08-09):**

- Official OpenAI documentation states that personal custom agents are standalone TOML files under `~/.codex/agents/` and project agents are under `.codex/agents/`; no per-agent `[agents.<name>] config_file` registration is part of that contract.
- The same documentation states that file-level `model` and `model_reasoning_effort` take precedence. It lists `model` and `model_reasoning_effort` as supported custom-agent keys and shows both in official examples.
- The installed CLI is `codex-cli 0.147.0`, newer than the 0.146.0 binary examined by 0111.
- The shipped adapter already emits the documented shape. The remaining defect is stale evidence language in ADR-033, source comments, task 0111, and the F3 verification scenario.
- The old R1 instrument is invalid: `list_agents` enumerates active and completed threads, not the configured agent-type registry. The old two-agent `PONG` comparison also cannot establish the effective model or effort unless runtime metadata exposes those values.

**Scope:** perform one scratch-`CODEX_HOME` discovery smoke on 0.147.0; reconcile the official evidence and smoke result across the named repository surfaces; keep the existing adapter, tier mapping, and install behavior unchanged.

**Out of scope:** `[agents.<name>] config_file` emission; removing model keys; changing `CODEX_MODEL_TIERS`; adding a probe framework or permanent fixture; inferring model/effort from agent prose; writing anywhere under the operator's real `~/.codex` except reading the existing authentication file for the scratch-home symlink.
### Requirements
- R1. **Authoritative evidence:** cite the current official OpenAI subagents page and record its two relevant contracts: custom-agent files load from `~/.codex/agents/` or `.codex/agents/`, and file-level `model` / `model_reasoning_effort` take precedence. Record `codex --version` output from the implementation session.
- R2. **Discovery smoke:** create a `mktemp -d` `CODEX_HOME`, symlink only the existing `auth.json`, and place one valid `agents/zz_probe_agent.toml` with the five shipped keys (`name`, `description`, `model`, `model_reasoning_effort`, `developer_instructions`). Run one `codex exec --json --sandbox read-only` prompt that explicitly spawns `agent_type: zz_probe_agent`, waits, and expects `PONG`. A successful spawn is the installed-client compatibility signal; do not use `list_agents` as a registry probe and do not add `[agents.zz_probe_agent]` config.
- R3. **Model-key verdict:** record "honored" from the official precedence contract. Treat child-session model/effort metadata as optional corroboration only; never infer the verdict from `PONG`, response quality, latency, token use, or a no-model control agent. If the smoke contradicts the documented discovery contract, stop with the raw `--json` evidence and leave production behavior unchanged.
- R4. **Evidence reconciliation:** replace obsolete "unverified / retry after 2026-08-07" wording in `docs/00_ADR.md` ADR-033, `packages/core/src/pipeline/adapt-subagent.ts` TSDoc, and `apps/cli/src/commands/install.ts` comments. Add a dated resolution to task 0111 `Q&A` through `spur task update`; preserve its original 2026-08-02 probe record as historical context.
- R5. **User-facing and traceability docs:** correct the Codex reasoning-effort list in `plugins/cc/skills/cc-agents/references/platform-compatibility.md` to match current official guidance, including model-dependent higher levels. Update only the final F3 scenario body so it points to official evidence plus the 0.147.0 smoke; preserve the scenario title exactly so task-feature identity remains stable.
- R6. **Hygiene and verification:** remove the scratch authentication symlink first, then remove only the validated `mktemp` directory. Leave no scratch files, no real-home mutations, and no production code behavior changes. Run the focused adapter/install tests, `bun run lint`, `bun run build`, and `bun run spur-check`; record exact command output during implementation.
### Acceptance Criteria
- [x] Codex agent discovery and model-key honoring are live-verified and routed.
  - Given the current official OpenAI custom-agent contract and installed `codex-cli 0.147.0`
  - When one isolated scratch-home custom agent is spawned and the repository evidence is reconciled
  - Then the task records directory discovery as smoke-confirmed and model-key precedence as officially verified, removes every named stale claim, preserves production behavior, and leaves no scratch or real-home writes
### Q&A
**Q: Is `[agents.<name>] config_file` emission still a candidate solution?**

A: No. Current official OpenAI documentation defines standalone files under the personal or project `agents/` directory. The `[agents]` table owns global subagent defaults and concurrency settings, not per-file registration.

**Q: Must a live A/B agent pair prove model and reasoning selection?**

A: No. The official contract explicitly states that file-level `model` and `model_reasoning_effort` take precedence. Runtime metadata may corroborate that contract, but agent output cannot prove it. The smoke is limited to installed-client discovery compatibility.

**Q: What happens if the 0.147.0 smoke contradicts the official contract?**

A: Stop and attach the raw `codex exec --json` evidence. Do not auto-add config registration, remove model keys, or change the adapter; that would be a new product decision based on a reproduced client defect or version drift.

**Q: Does this task add runtime code or tests?**

A: No new runtime logic or test cases are planned. Existing focused tests are rerun because comments and documentation describe an already-shipped adapter. Add a regression test only if the smoke exposes a reproducible production defect.
### Design
**Decision:** keep the shipped Codex adapter and install dispatch unchanged. Resolve the evidence debt at its six existing surfaces; one ephemeral smoke confirms the installed client can discover the documented file shape.

**Frozen evidence flow:**

1. Use the official OpenAI subagents page as the source of truth for directory discovery, required keys, supported optional keys, and model/effort precedence.
2. Use `codex --version` and a single scratch-home spawn only as local compatibility evidence for `codex-cli 0.147.0`.
3. Record the resolved result in ADR-033 and task 0111, then remove stale comments and align the user-facing compatibility reference and F3 scenario body.

**Primary targets:**

- `docs/00_ADR.md` — ADR-033 evidence paragraph only; state the official contract and dated verification.
- `docs/tasks/0111_*.md` — merge a dated resolution into `Q&A` via `spur task update`; do not erase the original offline probe history.
- `packages/core/src/pipeline/adapt-subagent.ts` — TSDoc above `CODEX_MODEL_TIERS` and `adaptSubagentToCodex` only.
- `apps/cli/src/commands/install.ts` — remove the obsolete unconfirmed-discovery comment.
- `plugins/cc/skills/cc-agents/references/platform-compatibility.md` — retain the existing official link; align the effort-value guidance with the current page.
- `docs/features/F3_superskill-install-command-marketplace-registration.md` — update the final scenario body through `spur feature update`; keep its title unchanged.

**No new API:** no exported symbol, flag, config key, file format, dependency, or runtime branch changes. `docs/03_ARCHITECTURE.md`, `docs/04_DESIGN.md`, and `docs/05_FEATURES.md` already describe the shipped mechanism without the stale uncertainty and are not targets unless implementation finds a direct contradiction.

**Smoke contract:** the probe agent name is `zz_probe_agent`; its file lives at `<scratch-code-home>/agents/zz_probe_agent.toml`; it declares `gpt-5.6-luna` / `max` and instructions to return only `PONG`. The parent prompt explicitly selects that agent type, waits for completion, and emits JSON. Success means the custom type spawns and returns `PONG`. The smoke does not claim to measure model choice.

**Anti-patterns:** no `list_agents` registry inference; no output-quality model inference; no second control agent; no per-agent config registration; no writes to the real Codex home; no new probe utility; no rewriting completed task 0111 outside `spur`.

**Dependency handoff:** task 0111 supplies the shipped adapter and historical evidence. This task only reconciles that evidence. It leaves no implementation work for another WBS unless the smoke produces a concrete contradiction.
### Plan
- [x] P1 (R1): fetch the official OpenAI subagents page, capture the relevant directory/schema/precedence statements, and record `codex --version`.
- [x] P2 (R2, R3, R6): run the single scratch-`CODEX_HOME` `zz_probe_agent` spawn, save raw JSON evidence outside the task corpus while working, and clean the symlink plus validated scratch directory.
- [x] P3 (R4): update ADR-033, merge a dated task 0111 Q&A resolution through `spur`, and correct the two source-comment blocks without changing executable code.
- [x] P4 (R5): align the compatibility reference and replace only the final F3 scenario body through `spur feature update`, preserving its scenario title.
- [x] P5 (R6): run focused adapter/install tests, lint, build, and `spur-check`; confirm `git diff` contains only the evidence reconciliation plus pre-existing operator changes, then record exact outputs in task 0112 during the implementation pipeline.
### Solution
**Change map (evidence reconciliation, 2026-08-09; no production code behavior change):**

| Surface | Change |
|---|---|
| `docs/00_ADR.md:449-459` | ADR-033 evidence paragraph: replaced the stale "unverified / retry after 2026-08-07" premises with the dated 2026-08-09 verified state — official OpenAI subagents contract (developers.openai.com/codex/subagents) defines standalone custom-agent TOML under `~/.codex/agents/` or `.codex/agents/` with no per-agent `[agents.<name>]` registration, and file-level `model`/`model_reasoning_effort` take precedence |
| `packages/core/src/pipeline/adapt-subagent.ts:210-217` | `CODEX_MODEL_TIERS` TSDoc: model-key honoring now verified (task 0112, codex-cli 0.147.0); removed the 0111 R14 "not yet confirmed / retry" block |
| `packages/core/src/pipeline/adapt-subagent.ts:233-240` | `adaptSubagentToCodex` TSDoc: directory discovery now verified (task 0112, codex-cli 0.147.0); removed the 0111 R9 "not yet confirmed / retry" block |
| `apps/cli/src/commands/install.ts:670-672` | Codex dispatch comment: "unconfirmed on codex-cli 0.146.0" → "verified on codex-cli 0.147.0 (task 0112 - scratch-home probe)" |
| `docs/tasks/0111_dispatch-plugin-subagents-natively-to-codex-as-agents-toml-d.md:121` | Appended dated Q&A `RESOLUTION (2026-08-09, task 0112)` settling discovery (smoke-confirmed) and model-key honoring (officially verified); the original 2026-08-02 probe record is preserved as historical context |
| `plugins/cc/skills/cc-agents/references/platform-compatibility.md:175` | Codex `model_reasoning_effort` valid-values list corrected to current official guidance: `low`, `medium`, `high`, plus model-dependent higher levels `xhigh`, `max`, `ultra` |
| `docs/features/F3_superskill-install-command-marketplace-registration.md:87-90` | Final F3 scenario body updated to point at official evidence plus the 0.147.0 scratch-home smoke (PONG); scenario title preserved exactly |

**Evidence (R1-R3, R6):**
- `codex --version` → `codex-cli 0.147.0` (installed `/opt/homebrew/bin/codex`).
- Official OpenAI subagents contract fetched 2026-08-09: custom agents are standalone TOML under `~/.codex/agents/` (personal) / `.codex/agents/` (project); file-level `model`/`model_reasoning_effort` take precedence; reasoning effort levels `low`/`medium`/`high` plus model-dependent `xhigh`/`max`/`ultra`.
- Discovery smoke (R2/R3): scratch `CODEX_HOME=$(mktemp -d)` with only the real `auth.json` symlinked and one `agents/zz_probe_agent.toml` (five shipped keys). Three child rollout `session_meta` records identified `thread_source: subagent`, `agent_role: zz_probe_agent`, `agent_path: /root/zz_probe`, `cli_version: 0.147.0`, and their matching parent thread IDs; each run returned `PONG`. The parent `--json` stream omitted the already-completed spawn event, so child-session metadata is the discovery proof and `PONG` only corroborates completion. Scratch symlink and directory removed afterward; real `~/.codex` untouched.
- `list_agents` is NOT a registry probe (enumerates threads) and no `[agents.<name>]` config was added.

**Focused verification (implement probes; full gates run in the pipeline test hop per bug-742):**
- `bun test packages/core/tests/pipeline/adapt-subagent.test.ts` → 37 pass / 0 fail (adapter 100% funcs/lines).
- `bun test apps/cli/tests/commands/install.test.ts` → 63 pass / 0 fail.
- No executable code changed — only comments and documentation; `bun run lint`, `bun run build`, and `bun run spur-check` are owned by the `test` hop immediately following this implement step.
### Testing
**Forced verification — 2026-08-09 (`--focus all --fix all --force`)**

- Verdict: PASS

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | Official OpenAI subagents documentation fetched 2026-08-09 confirms personal `~/.codex/agents/`, project `.codex/agents/`, and file-level `model` / `model_reasoning_effort` precedence; `codex --version` emitted `codex-cli 0.147.0`; `docs/00_ADR.md:458`. |
| R2 | MET | Fresh isolated `codex exec --json --sandbox read-only` smoke returned `PONG`; three child rollout `session_meta` records independently identify `thread_source: subagent`, `agent_role: zz_probe_agent`, `agent_path: /root/zz_probe`, `cli_version: 0.147.0`, and matching parent thread IDs. Parent stdout omitted the already-completed spawn event; child-session metadata is the authoritative discovery evidence. |
| R3 | MET | Official OpenAI subagents documentation states file-level `model` / `model_reasoning_effort` take precedence; `docs/tasks/0111_dispatch-plugin-subagents-natively-to-codex-as-agents-toml-d.md:124`. |
| R4 | MET | Named stale claims reconciled at `docs/00_ADR.md:458`, `packages/core/src/pipeline/adapt-subagent.ts:208`, `packages/core/src/pipeline/adapt-subagent.ts:233`, `apps/cli/src/commands/install.ts:669`, and `docs/tasks/0111_dispatch-plugin-subagents-natively-to-codex-as-agents-toml-d.md:121`; historical 0111 probe text remains explicitly historical. |
| R5 | MET | Current effort values at `plugins/cc/skills/cc-agents/references/platform-compatibility.md:175`; stable feature scenario at `docs/features/F3_superskill-install-command-marketplace-registration.md:87`. |
| R6 | MET | Scratch auth symlink was unlinked first; validated `/tmp/0112-codex-fix.9u87IP` was removed and absence checked. Focused tests: 100 pass / 0 fail. `bun run lint`: exit 0. `bun run build`: exit 0. `bun run spur-check`: 2008 pass / 0 fail; 32 pre-check + 3 post-check rules passed. |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
| --- | --- | --- | --- |
| Codex agent discovery and model-key honoring are live-verified and routed. | MET | command | Official precedence is verified and three isolated child rollout ledgers prove `codex-cli 0.147.0` discovered and spawned `zz_probe_agent`; all named repository surfaces are reconciled without production behavior changes. |

**Checks**

| Check | Status | Evidence |
| --- | --- | --- |
| strict-core | pass | All task checklists and evidence records are reconciled; final strict-core result is recorded after the section update. |
| design-conformance | pass | Evidence-only design preserved; no runtime behavior, model tier, registration, or adapter change was introduced. |
| discovery-smoke | pass | Three isolated child-session metadata records prove `zz_probe_agent` spawned under `codex-cli 0.147.0`; `PONG` corroborates completion. |
| secua-all | pass | No security, efficiency, correctness, usability, or architecture findings remain. |
| focused-tests | pass | 100 pass, 0 fail; `adapt-subagent.ts` 100% functions/lines. |
| lint-build-spur-check | pass | lint/typecheck and build exited 0; full suite 2008 pass, 0 fail; all 35 enabled pre/post rules passed. |

- Coverage: 98.99% lines / 99.60% functions aggregate (`bun run spur-check`).
- Fix-pass artifact: `.spur/run/0112-verdict.json:1-76` (final standalone verdict artifact).
- `--next`: no-op; task is already terminal (`done`) with verdict PASS.
### Review
| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | — | — | No P1–P3 findings; functional, SECUA, and architecture review PASS. The prior scratch-file finding is resolved. |

**Functional Traceability**

| Req | Status | Evidence |
| --- | --- | --- |
| R1 | MET | Official OpenAI subagents documentation fetched 2026-08-09 confirms personal `~/.codex/agents/`, project `.codex/agents/`, and file-level `model` / `model_reasoning_effort` precedence; `codex --version` emitted `codex-cli 0.147.0`; repository record at `docs/00_ADR.md:458`. |
| R2 | MET | Fresh isolated `codex exec --json --sandbox read-only` smoke returned `PONG`; three scratch child rollout `session_meta` records independently named `thread_source: subagent`, `agent_role: zz_probe_agent`, and `cli_version: 0.147.0`. Parent stdout omits the spawn event after the child completes, so the child rollout is the authoritative discovery evidence. |
| R3 | MET | Official OpenAI subagents documentation states file-level `model` / `model_reasoning_effort` take precedence; repository verdict at `docs/tasks/0111_dispatch-plugin-subagents-natively-to-codex-as-agents-toml-d.md:124`. |
| R4 | MET | Named stale claims reconciled at `docs/00_ADR.md:458`, `packages/core/src/pipeline/adapt-subagent.ts:208`, `packages/core/src/pipeline/adapt-subagent.ts:233`, `apps/cli/src/commands/install.ts:669`, and `docs/tasks/0111_dispatch-plugin-subagents-natively-to-codex-as-agents-toml-d.md:121`; historical 0111 probe text remains explicitly historical. |
| R5 | MET | Current effort values at `plugins/cc/skills/cc-agents/references/platform-compatibility.md:175`; stable feature scenario at `docs/features/F3_superskill-install-command-marketplace-registration.md:87`. |
| R6 | MET | Scratch auth symlink was unlinked first; validated `/tmp/0112-codex-fix.9u87IP` was removed and absence checked. No production behavior changed. Fresh focused and full verification commands are recorded in Testing. |

**SECUA**

- Security: no secret/auth content was copied or printed; the scratch home contained only an auth symlink, which was unlinked before directory cleanup.
- Efficiency: one bounded compatibility smoke; no runtime path added.
- Correctness: child session metadata proves the selected custom agent role; `PONG` is corroboration, not model-selection inference.
- Usability: official path/schema/effort guidance is aligned across the named repository surfaces.
- Architecture: adapter, tier mapping, install dispatch, package boundaries, and runtime behavior are unchanged.

**Architecture Depth**

No shallow-module, coupling, wrong-seam, locality, or test-surface candidate applies to this documentation/comment-only evidence reconciliation.
### References
- Official OpenAI subagents documentation: https://developers.openai.com/codex/subagents (verified 2026-08-09; custom-agent paths, schema, model/effort precedence, current reasoning guidance)
- ADR-033: `docs/00_ADR.md`
- Shipped implementation and stale comments: `packages/core/src/pipeline/adapt-subagent.ts`, `apps/cli/src/commands/install.ts`
- User-facing compatibility reference: `plugins/cc/skills/cc-agents/references/platform-compatibility.md`
- Historical implementation/probe record: task 0111 `Q&A` and `Review`
- Feature traceability edge: F3 scenario `Codex agent discovery and model-key honoring are live-verified and routed.`
### History
- 2026-08-10T00:19:40.639Z todo → wip (system)
- 2026-08-10T00:20:37.175Z wip → testing (system)
- 2026-08-10T00:30:39.140Z testing → done (system)
