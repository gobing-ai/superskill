---
schema_version: 1
name: Add bounded native Pi anti-hallucination continuation guard
status: done
template: issue
created_at: 2026-09-30T15:14:04.350Z
updated_at: "2026-09-30T15:28:18.679Z"
feature_id: H1

ac_altitude: task-local
---

## 0151. Add bounded native Pi anti-hallucination continuation guard

### Background

Pi 0.99.1 is installed. The command-hook policy excludes Pi because agent_end return values cannot prevent settlement. Installed native SDK supports agent_before_settle with draft custom messages and continue:true. Implement bounded continuation through the existing native extension installer without changing other hosts.

### Requirements

- [x] R1. Reuse the shared anti-hallucination engine in a native Pi extension.
- [x] R2. Continue at most once per user input with actionable feedback; never resume abort/error or interrupt pending input.
- [x] R3. Install through existing Superskill platformExtensions.pi support and preserve other host policies.

### Acceptance Criteria

- [x] AC1 — Unsupported assistant claims produce native feedback and continuation (req: R1).
- [x] AC2 — Loop cap, new-input reset, abort/error and queued-input guards hold (req: R2).
- [x] AC3 — Self-contained Pi extension installs while shared Stop/AfterAgent contracts stay unchanged (req: R3).

### Q&A

<!-- Clarifications and triage decisions. Keep empty if none. -->

### Design

Pi 0.99.1+ native agent_before_settle checks projected llmMessages through runStopGuard. Append custom_message feedback to existing drafts and request continue:true once per user input. Skip abort/error and pending messages; reset on session_start and non-extension input. The initial canContinue flag is false after assistant text, so Pi validates continuation after feedback is added. Use the existing extensions.pi installer; keep command-hook exclusion.

### Plan

1. Write adapter regression before source implementation.
2. Add minimal native extension and manifest entry.
3. Test emitted bundle against installed Pi boundary runtime.
4. Run repository gates and install locally through Superskill.

### Root Cause

apps/cli/src/hooks.ts:145 deliberately excludes Pi command hooks; Pi 0.99.1 agent_before_settle provides a separate native continuation contract not used by the cc plugin.

### Solution

`plugins/cc/scripts/anti-hallucination/pi-stop.ts:22` installs the native settlement guard, reuses runStopGuard, appends feedback and caps continuation. `plugins/cc/scripts/anti-hallucination/tests/pi-stop.test.ts:5` covers manifest and boundary behavior. `plugins/cc/plugin.json:16` declares the native extension; `docs/04_DESIGN.md:323` defines Pi 0.99.1+ behavior. Host-policy comments clarify the separate native transport; other host runtime outputs are unchanged. Superskill installed the self-contained bundle at /Users/robin/.pi/agent/plugins/cc/pi-stop.ts and registered plugins/cc in Pi settings. Repeatable real-runtime check and receipts: .spur/run/0151-pi-e2e.ts, .spur/run/0151-pi-e2e-receipt.json, .spur/run/0151-pi-cli.jsonl and .spur/run/0151-pi-cli-receipt.json. All are local gitignored evidence artifacts.

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `plugins/cc/scripts/anti-hallucination/pi-stop.ts:30` calls the shared runStopGuard; actual installed Pi CLI receipt .spur/run/0151-pi-cli-receipt.json proves one feedback entry and corrective response. |
| R2 | MET | `plugins/cc/scripts/anti-hallucination/tests/pi-stop.test.ts:12` exercises loop cap, input/session reset, aborted/error outcomes, pending messages and preservation of other extension drafts. Real Pi session check .spur/run/0151-pi-e2e.ts verifies five provider calls across three inputs and capped repeated failure. |
| R3 | MET | `plugins/cc/plugin.json:16` registers extensions.pi through the existing installer; .spur/run/0151-install.log records native installation and settings registration; the installed bundled extension passes real session and CLI checks. Existing command-target policy and Stop/AfterAgent output tests pass unchanged. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 | MET | test | `plugins/cc/scripts/anti-hallucination/tests/pi-stop.test.ts:12`; actual Pi CLI and session receipts. |
| AC2 | MET | test | `plugins/cc/scripts/anti-hallucination/tests/pi-stop.test.ts:12`; installed native Pi session proves once-per-input cap and new-input reset. |
| AC3 | MET | test | `plugins/cc/scripts/anti-hallucination/tests/pi-stop.test.ts:5` checks manifest; actual Superskill installer emitted self-contained bundle and registered plugins/cc; installed bundle E2E passed. |
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

- 2026-09-30T15:16:31.824Z todo → wip (system)
- 2026-09-30T15:28:18.470Z wip → testing (system)
- 2026-09-30T15:28:18.679Z testing → done (system)

