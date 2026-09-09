---
schema_version: 1
name: Run authorized Grok Bot VPS host smoke for the grok-bot install target (split from 0128 AC12)
status: backlog
template: standard
created_at: 2026-09-09T18:34:28.511Z
updated_at: "2026-09-09T18:35:11.903Z"

---

## 0129. Run authorized Grok Bot VPS host smoke for the grok-bot install target (split from 0128 AC12)

### Background

Task 0128 delivered the opt-in install-only `grok-bot` target (ADR-036) with all local verification green. Its AC12 host-discovery half — proving the published catalog actually surfaces and runs inside the Grok Bot runtime — requires an authorized session on the Grok Bot VPS and could not be performed from the development laptop. On 2026-09-09 the operator (Robin) decided to split that host smoke out of 0128 into this follow-up task so 0128's locally verifiable scope can close.

Host contract (supplied integration requirement, reported 2026-09-08; see 0128 Background): data root `SAND_DATA` (example `/home/box/sand-data`); chat slash catalog `<sandRoot>/workflows/<id>/SKILL.md` requiring YAML `name` + nonempty `description`; `managed-skills/` and `plugins/` are host-managed, never write targets.

**Authorization gate:** this task performs production/VPS mutations. It runs only after Robin explicitly authorizes the install on the VPS, and Robin performs (or observes) the Grok Bot GUI steps — slash discovery and invocation are runtime observations this CLI cannot self-certify.

### Requirements

- [ ] R1. Obtain explicit operator authorization for the VPS session, then run `superskill doctor --targets grok-bot --json` on the Bot host and record the resolved root.
- [ ] R2. Preview and install representative plugins (e.g. `cc`, `sp`, `kk`) with `--targets grok-bot` (bridge default; note or exercise `--materialize full`), capturing dry-run plans and install summaries.
- [ ] R3. Refresh the Bot catalog by its observed supported method and record that method.
- [ ] R4. Confirm in the Bot runtime that representative skill, degraded-command, and specialist-playbook IDs appear in slash discovery.
- [ ] R5. Invoke at least one installed workflow with arguments and confirm it reads a relative resource successfully.
- [ ] R6. Record host/runtime details, refresh method, observed results, and any unavailable evidence in Testing; never claim GUI acceptance from file listings alone.

### Acceptance Criteria

```gherkin
Scenario: AC1 Host smoke evidence is recorded from an authorized VPS session
  Given an operator-authorized session on the Grok Bot VPS
  When doctor, dry-run, and real install of representative plugins run against the resolved Sand root
  Then the install summaries and doctor output are recorded as evidence

Scenario: AC2 Bot runtime discovers and invokes installed workflows
  Given the catalog refreshed by its observed supported method
  When slash discovery is inspected in the Bot runtime
  Then representative skill, degraded-command, and specialist-playbook IDs appear
  And at least one invocation passes arguments and reads a relative resource successfully
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

<!-- Chosen approach, key tradeoffs, invariants, and impacted surfaces. Keep snippets short. -->

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
### Notes

Split from task 0128 (AC12) by operator decision on 2026-09-09. 0128 ships the target with local verification; this task is the remaining host-acceptance evidence. Deliberately not linked to feature D via `feature_id` so the feature shippable gate reflects the shipped, locally verified scope — the cross-reference to D and 0128 lives here in prose.

