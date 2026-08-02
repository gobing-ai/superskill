---
template: standard
schema_version: 1
name: "Live-confirm codex agent discovery and model-key honoring (post-2026-08-07 retry)"
description: ""
status: todo
type: task
profile: standard
feature_id: F3
parent_wbs: null
priority: P2
tags: []
dependencies: ["0111"]
created_at: "2026-08-02T22:19:02.164Z"
updated_at: "2026-08-02T22:22:24.346Z"
---

## 0112. Live-confirm codex agent discovery and model-key honoring (post-2026-08-07 retry)

### Background
**Type:** issue (verification follow-up — one short session once the codex account usage limit resets).

**Goal:** Close the two open premises from the codex native-agent dispatch work (ADR-033, verify task done as 0111) against codex-cli ≥ 0.146.0, in a scratch `CODEX_HOME` (never the operator's real home):

1. **Discovery:** does Codex auto-discover `<codex-home>/agents/*.toml` with zero config wiring, or does it require `[agents.<name>] config_file = "..."` entries in `config.toml`?
2. **Model keys:** are file-level `model` / `model_reasoning_effort` in the agent TOML honored at spawn time, silently ignored, or parse-rejected?

**Context:** the codex native subagent TOML emission shipped with both premises unverified — offline probes were inconclusive by construction (agent roster resolves at spawn time; `codex debug prompt-input` renders no roster; broken agent files parse silently offline) and the live probe was blocked by the account usage limit (reset: **Aug 7, 9:13 PM** — retry any time after). Emission is safe under every outcome: ignored keys → codex inherits per agent (harmless); registration needed → additive `[agents]` dispatch fallback (already spec'd in 0111 R9); parse-rejected → remove model-key emission per the 0111 R14 downgrade path. Full probe record: 0111 §Q&A.
### Requirements
- R1. **Live discovery probe:** scratch `CODEX_HOME=$(mktemp -d)` + symlinked `auth.json` + a hand-written `agents/zz-probe-agent.toml` (valid 5-key file); run `codex exec --sandbox read-only "Call the collaboration list_agents tool once and report its raw output verbatim. Do nothing else."` and record whether `zz-probe-agent` appears. If absent, add `[agents.zz-probe-agent] config_file = "..."` to the scratch `config.toml` and re-run once. Verdict: auto-discovery / registration-required / neither.
- R2. **Live model-key probe:** in the same scratch home, spawn the probe agent (`spawn_agent` with `agent_type`) with a distinctive instruction ("answer with the single word PONG") and record the child agent's actual model + reasoning effort (spawn output / `wait_agent` result / session log) vs the TOML-declared `gpt-5.6-luna`/`max` and vs a second agent TOML without model keys. Verdict: honored / silently-ignored / parse-rejected.
- R3. **Outcome routing:** auto-discovery+honored → update task 0111 Q&A + ADR-033 wording from "unverified" to "verified <date>", close this task. Registration-required → implement the additive `[agents]` config emission in `install.ts` (new sub-task) + ADR note. Parse-rejected → remove model-key emission per 0111 R14 downgrade + ADR note. Ignored → keep emission (harmless), note in ADR.
- R4. **Hygiene:** scratch dir removed afterward (contains an auth.json symlink — delete the symlink first); no writes to the operator's real `~/.codex`; all corpus updates via `spur` CLI.
### Acceptance Criteria
- [ ] Codex agent discovery and model-key honoring are live-verified and routed.

(Operational detail in Requirements R1–R4 and Design; this title is the DD-09 coverage layer matching the F3 scenario verbatim.)
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
**Approach:** single-session live probe, two instruments only.

1. Scratch `CODEX_HOME=$(mktemp -d)`; symlink `auth.json` in; write `agents/zz-probe-agent.toml` (valid 5-key file: name/description/model/model_reasoning_effort/developer_instructions).
2. **Discovery:** `codex exec --sandbox read-only "Call the collaboration list_agents tool once and report its raw output verbatim. Do nothing else."` — probe-agent present → auto-discovery; absent → add `[agents.zz-probe-agent] config_file = "..."` to scratch `config.toml`, re-run once; present-then → registration-required; still absent → deeper investigation (multi_agent_v2 flag, plugin-scoped roles).
3. **Model keys:** `codex exec --sandbox read-only` prompting a `spawn_agent` of `zz-probe-agent` with "answer with the single word PONG"; compare the child's reported/effective model + effort against the TOML (`gpt-5.6-luna`/`max`) and against a second no-model-keys control agent. Session logs under the scratch home are the evidence source if the tool output is ambiguous.
4. Route the outcome per R3, update ADR-033 + 0111 Q&A, clean up scratch (symlink first).

**Why not more:** offline instruments were exhausted in the 0111 verify session (prompt-input renders no roster; doctor lists no roles; broken files parse silently). Only a live spawn resolves the roster question, so this task is deliberately small.
### Plan

<!-- Ordered implementation checklist. Fill before moving to todo/wip. -->

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to features, docs, ADRs, related tasks, or external references. -->

### History
