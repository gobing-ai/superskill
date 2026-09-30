---
schema_version: 1
name: Fix shared Stop hook JSON compatibility and Codex assistant input
status: done
template: issue
created_at: 2026-09-30T14:46:28.494Z
updated_at: "2026-09-30T14:54:20.031Z"
feature_id: H1

ac_altitude: task-local
---

## 0150. Fix shared Stop hook JSON compatibility and Codex assistant input

### Background

Installed Superskill 0.3.34 emits hookSpecificOutput on Stop; Codex 0.159.2 rejects that unknown field. Replay stdout is captured in /Users/robin/xprojects/spur-new/.spur/run/stop-hook-diagnosis.json. Current Codex and Claude assistant text is also ignored.

### Requirements

- [x] R1. Emit a shared valid block-profile Stop allow/block shape for Claude, Codex and Hermes.
- [x] R2. Resolve nonblank last_assistant_message after the loop guard, preserving legacy fallbacks.
- [x] R3. Preserve deny-profile outputs and install target gates.

### Acceptance Criteria

- [x] AC1 — Strict Stop outputs allow or block without unknown fields (req: R1).
- [x] AC2 — Current assistant claims block; loop guard allows; legacy channels remain compatible (req: R2).
- [x] AC3 — Gemini/Antigravity deny shapes and unsupported-target filtering stay unchanged (req: R3).

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

Use the existing block/deny profiles. Return {} or top-level decision/reason for block; retain AfterAgent envelopes for deny. Accept current assistant text before transcript fallback.

### Plan

1. Reproduce installed output and compare official host schemas.
2. Write regression checks before engine changes.
3. Apply minimal shared-engine fix and run repository gates.
4. Rebuild and update the authorized installed runtime; capture subprocess receipts.

### Root Cause

plugins/cc/scripts/anti-hallucination/ah_guard.ts buildStopOutput includes an unsupported Stop envelope; resolveStopContext lacks last_assistant_message handling.

### Solution

Change-map (auto-generated — implement step did not record a Solution).
Each entry cites the first changed line per file (`file:line`).

| Change (`file:line`) |
|----------------------|
| `apps/cli/src/commands/hook-run.ts:206` |
| `apps/cli/src/commands/hook-run.ts:27` |
| `apps/cli/tests/commands/hook-run.test.ts:364` |
| `apps/cli/tests/commands/hook-run.test.ts:370` |
| `apps/cli/tests/commands/hook-run.test.ts:393` |
| `apps/cli/tests/commands/hook-run.test.ts:422` |
| `apps/cli/tests/commands/hook-run.test.ts:427` |
| `apps/cli/tests/commands/hook-run.test.ts:431` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:12` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:123` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:130` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:137` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:23` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:286` |
| `plugins/cc/scripts/anti-hallucination/ah_guard.ts:304` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:378` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:382` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:385` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:388` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:406` |
| `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:535` |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:129` emits minimal shared block-profile objects; strict pinned Codex field check and installed subprocess replay in .spur/run/0150-runtime-receipt.json. Claude official Stop contract and Hermes upstream pre_verify accept decision/block/reason. |
| R2 | MET | `plugins/cc/scripts/anti-hallucination/ah_guard.ts:304` reads nonblank direct assistant text after loop guard; `apps/cli/tests/commands/hook-run.test.ts:431` verifies blocking and loop allow; resolver tests verify ARGUMENTS priority, invalid-field fallback and legacy transcript/messages. |
| R3 | MET | `apps/cli/tests/hooks.test.ts:45` pins unsupported-host filtering and block/deny selection; .spur/run/0150-runtime-receipt.json proves deny allow/block bytes match original runtime exactly. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 | MET | test | `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts:375` asserts exact shared Stop objects; installed runtime replay checks pinned Codex schema fields. |
| AC2 | MET | test | `apps/cli/tests/commands/hook-run.test.ts:431` direct assistant claim and loop guard; resolver compatibility tests. |
| AC3 | MET | test | `apps/cli/tests/hooks.test.ts:45` target gates; deny-profile regression tests and byte-for-byte installed runtime comparison. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

<!-- spur:record-review -->

**SECU findings** (pipeline verify step — verdict: PASS)

| Priority | Dimension | Location | Finding |
|----------|-----------|----------|----------|
| P4 | — | — | No findings (verify verdict PASS) |

### References

<!-- Links to failing logs, related issues, tasks, docs, or external references. -->

### History

- 2026-09-30T14:50:33.269Z todo → wip (system)
- 2026-09-30T14:54:19.826Z wip → testing (system)
- 2026-09-30T14:54:20.031Z testing → done (system)

