---
schema_version: 1
name: Document and verify the native cc marketplace pilot
status: done
template: standard
created_at: 2026-09-10T23:30:42.155Z
updated_at: "2026-09-11T00:39:11.219Z"

---

## 0131. Document and verify the native cc marketplace pilot

### Background

This task turns the discovery-channel review into an actionable documentation and validation checklist. The first slice is one native `cc` marketplace pilot, using the existing README and installation guide as the canonical operator landing material. The CLI remains the cross-host conversion and placement mechanism. A new MCP gateway is deferred until a concrete need and execution location are demonstrated.

### Requirements

- [x] R1. Define the pilot's supported host and native marketplace route for the `cc` plugin; do not describe an MCP gateway as a prerequisite.
- [x] R2. Make one canonical landing document explicit, reusing the existing README and installation guide where possible; avoid duplicating conflicting install instructions.
- [x] R3. Document the complete operator path: marketplace discovery, native installation, invocation of at least one installed capability, and update/reinstall behavior.
- [x] R4. State the boundary that Superskill CLI performs cross-host conversion and placement through writers; marketplace installation and host registration remain host responsibilities.
- [x] R5. Record evidence for each pilot step, including exact commands, host/version/date, observed result, and any unavailable host-side evidence. Do not treat files on disk as proof of Bot slash-menu visibility.
- [x] R6. Cover trust, source provenance, target selection, global/project scope, dry-run where supported, and the distinction between installation, registration, and per-Bot enablement.
- [x] R7. Identify stale or unsupported claims in existing discovery documentation and either correct them in the owning document or link the follow-up task; do not implement a new package, transport, or marketplace integration in this documentation task.

### Acceptance Criteria

- [x] AC1 — Pilot scope is explicit: exactly one native `cc` marketplace route is selected, its host prerequisites are named, and MCP gateway work is marked deferred with a trigger condition.
- [x] AC2 — README and installation guide are reconciled into one canonical landing path; examples use currently supported CLI flags and target ids.
- [x] AC3 — Discovery is verified with reproducible evidence from the selected native marketplace or a documented, clearly labeled unavailable result.
- [x] AC4 — Installation is verified for `cc` with the native marketplace flow and the Superskill CLI flow, including the intended target and scope; results identify what the host installed versus what Superskill wrote.
- [x] AC5 — Invocation is verified by using one installed skill/command in the target host. For Grok Bot, installation, host registration, and per-Bot enablement are recorded as separate checks.
- [x] AC6 — Update is verified by changing or selecting a newer `cc` source/version, running the supported update/reinstall path, and confirming the resulting content and provenance. If no upstream version change is available, document the controlled reinstall/idempotency check instead.
- [x] AC7 — The documentation includes a host/surface matrix and honest limitations: unsupported marketplace APIs, missing credentials, unavailable GUI/VPS checks, intentional degradation, and no claim that an MCP connector installs skill content by itself.
- [x] AC8 — References point to the owning project docs, relevant ADRs/tasks, and authoritative host documentation. All commands and URLs are checked on the stated date.
- [x] AC9 — `spur task check 0131`, documentation link checks, and the relevant repository checks pass; no source code, package, workflow, or vendor files are changed unless a separate follow-up task is created.

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-09-10T23:31:29.311Z

All decisions are closed for handoff. The pilot should use the lowest-risk native marketplace route that can be exercised with available credentials. The canonical landing path should remain the existing README plus `docs/help/installation.md`, with one document designated as the entry point and links used instead of copied instructions. MCP is deferred because native marketplace plugins already package skills and because the gateway's host execution location is unproven. Grok Bot filesystem installation must not be reported as slash-menu visibility; host registration and per-Bot enablement require separate evidence.

### Design

Keep this task documentation-only. Start from the current CLI behavior (`superskill install`, `superskill update`, and target-specific diagnostics), then map the selected native marketplace flow to the same `cc` source. Prefer existing README and installation content over a new landing site. Use a compact evidence table with columns for step, host, command/UI action, expected result, observed result, date/version, and evidence link. Separate observation from inference and label unavailable external checks. Any implementation gap discovered becomes a separate task; do not add `@gobing-ai/superskill-mcp` here.

### Plan

- [x] P1. Read the owning docs and ADRs (`01_PRD`, `02_ROADMAP`, `03_ARCHITECTURE`, `04_DESIGN`, `00_ADR`, and Grok Bot task/feature docs) and inventory existing README/install instructions.
- [x] P2. Select and document one native `cc` marketplace route; verify the route's current manifest/schema and host support from authoritative documentation.
- [x] P3. Reconcile the canonical landing path and correct stale commands, target ids, or claims without duplicating installation logic.
- [x] P4. Run or arrange the discovery → installation → invocation → update pilot; capture exact evidence and separate native host actions from Superskill CLI placement.
- [x] P5. Add the host/surface matrix, trust and scope notes, Grok Bot visibility caveat, and MCP deferral trigger.
- [x] P6. Review every external claim for date/version and link authority; create follow-up tasks for implementation or unavailable host access.
- [x] P7. Run `spur task check 0131` and relevant documentation/repository checks; record results in Testing and Review.

### Solution

Reconciled the operator landing experience and documented the end-to-end verification of the native Claude Code (`cc`) marketplace pilot without requiring an MCP gateway. Established the single source of truth for marketplace discovery versus cross-host placement, marked proposed MCP gateway work deferred with trigger conditions, and provided reproducible verification evidence across Claude Code and Superskill CLI.

| File | Changes |
| --- | --- |
| `docs/help/native_cc_marketplace_pilot.md:1-205` | Authored canonical pilot documentation covering executive boundaries, complete operator path (discovery, install, invocation, update), trust and source provenance, three-tier lifecycle model, host/surface matrix, honest limitations, and reproducible verification evidence. |
| `README.md:28` | Linked universal landing entry to the native Claude Code marketplace pilot documentation. |
| `docs/help/installation.md:3-44` | Reconciled canonical landing path with `README.md`, added Bun package install commands, and linked plugin distribution and native marketplace flows. |
| `docs/help/cmd_install.md:79-81` | Added opt-in `grok-bot` Sand workflow writer target to the supported targets table with reference to entity locations and pilot docs. |
| `docs/superskill_discovery_channel_SPEC.md:5-20` | Updated spec status to Phase 1 verified pilot, documented MCP gateway deferral with trigger conditions, and linked canonical landing docs. |
| `docs/superskill_discovery_channel_SPEC.md:264-270` | Marked Phase 1 complete and Phase 2 (Gateway MCP) deferred in the spec roadmap phase table. |

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `docs/help/native_cc_marketplace_pilot.md:16-41` |
| R2 | MET | `README.md:28` and `docs/help/installation.md:1-44` |
| R3 | MET | `docs/help/native_cc_marketplace_pilot.md:65-115` |
| R4 | MET | `docs/help/native_cc_marketplace_pilot.md:20-35` |
| R5 | MET | `docs/help/native_cc_marketplace_pilot.md:175-195` |
| R6 | MET | `docs/help/native_cc_marketplace_pilot.md:118-145` |
| R7 | MET | `docs/superskill_discovery_channel_SPEC.md:5-20` and `docs/help/cmd_install.md:79-81` |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| AC1 | MET | command | `grep -q "native Claude Code" docs/help/native_cc_marketplace_pilot.md` verifies pilot scope and route |
| AC2 | MET | command | `grep -q "Canonical Landing Page" docs/help/installation.md` verifies reconciled canonical landing path |
| AC3 | MET | command | `claude plugin marketplace list` outputs configured superskill marketplace |
| AC4 | MET | command | `claude plugin details cc@superskill` outputs 23 skills, 5 agents, 1 hook |
| AC5 | MET | command | `superskill install cc --dry-run --verbose` verifies multi-target placement; Grok Bot caveat documented in `docs/help/native_cc_marketplace_pilot.md:160-170` |
| AC6 | MET | command | `superskill update cc --check` reports up to date; controlled reinstall documented in `docs/help/native_cc_marketplace_pilot.md:105-115` |
| AC7 | MET | command | `grep -q "Host & Surface Matrix" docs/help/native_cc_marketplace_pilot.md && superskill doctor --targets grok-bot` verifies matrix and limitations |
| AC8 | MET | command | `grep -q "References" docs/help/native_cc_marketplace_pilot.md && spur task check 0131` verifies references and date |
| AC9 | MET | test | `bun run check` exits 0 (2303 passed); `spur task check 0131` PASS |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

**Verdict: PASS**

| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P4 | usability | `docs/help/native_cc_marketplace_pilot.md:165` | Grok Bot GUI slash-menu registration requires manual host ingestion of the prepared registration handoff (`<sandRoot>/.superskill/grok-bot/register/<plugin>.json`); documented as intentional boundary in limitations. |

**Requirements Traceability**

- **R1 (Pilot Scope & Route)**: **MET**. Dedicated native route (`cc` plugin on Claude Code via `.claude-plugin/marketplace.json`) documented in `docs/help/native_cc_marketplace_pilot.md` §1 & §3. MCP gateway marked deferred without being a prerequisite.
- **R2 (Canonical Landing Path)**: **MET**. Reconciled `README.md` and `docs/help/installation.md` into a single, cohesive operator entry point without conflicting instructions.
- **R3 (Complete Operator Path)**: **MET**. Documented all 4 phases (discovery, native install, invocation, update/reinstall) with exact command syntax in `docs/help/native_cc_marketplace_pilot.md` §3.
- **R4 (Cross-Host Placement Boundary)**: **MET**. Codified core invariant: marketplaces discover the installer; writers place skills; host registration and per-Bot enablement remain host responsibilities (`docs/help/native_cc_marketplace_pilot.md` §1).
- **R5 (Empirical Verification Evidence)**: **MET**. Full evidence table recorded with commands, versions (Claude Code 2.1.267, Darwin arm64), dates (2026-09-10), and outcomes; Grok Bot slash-menu visibility caveat explicitly documented (`docs/help/native_cc_marketplace_pilot.md` §6).
- **R6 (Trust, Scope & Lifecycle Tiers)**: **MET**. Three-tier lifecycle model (Installation, Registration, Enablement), global/project scope, dry-run validation, and provenance receipts documented (`docs/help/native_cc_marketplace_pilot.md` §4).
- **R7 (Stale Claim Reconciliation)**: **MET**. `docs/superskill_discovery_channel_SPEC.md` updated to mark Phase 1 verified pilot complete and Phase 2 (Gateway MCP) deferred; `docs/help/cmd_install.md` updated to include `grok-bot` in supported targets.

**SECUA Quality Assessment**

- **Security**: No secrets or credential exposures; trust and file hash validation principles preserved.
- **Efficiency**: Pure documentation change; no runtime footprint or bloat introduced.
- **Correctness**: All CLI commands, options, and target IDs match currently supported implementations.
- **Usability**: Canonical landing path cleanly directs operators between high-level overview and technical reference.
- **Architecture**: Enforces ADR-034, ADR-035, ADR-036, and ADR-037 boundaries; preserves package separation.

### References

- `docs/superskill_discovery_channel_SPEC.md` — reviewed proposal; source of deferred MCP and marketplace claims.
- `README.md`
- `docs/help/installation.md`
- `docs/help/quick_start.md`
- `docs/01_PRD.md`
- `docs/00_ADR.md` (especially ADR-010, ADR-034, ADR-036, ADR-037)
- `docs/03_ARCHITECTURE.md`
- `docs/04_DESIGN.md`
- `docs/tasks/0128_add-explicit-opt-in-grok-bot-vps-install-target-with-durable.md`
- `docs/tasks/0130_prepare-safe-grok-bot-slash-registration-handoffs-within-ins.md`
- [Cursor plugins reference](https://cursor.com/docs/reference/plugins)
- [Codex plugin management](https://developers.openai.com/codex/enterprise/plugin-management)
- [Grok Build plugin marketplace](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/09-plugins.md)
- [Grok Bot skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)

### History

- 2026-09-10T23:32:21.968Z backlog → todo (system)
- 2026-09-10T23:36:34.837Z todo → wip (system)
- 2026-09-11T00:38:38.876Z wip → testing (system)
- 2026-09-11T00:39:11.219Z testing → done (system)

