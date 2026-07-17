---
template: standard
schema_version: 1
name: "Define portable entrypoint contract for staged plugin scripts"
description: ""
status: done
type: task
profile: standard
feature_id: A
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-07-17T06:13:55.464Z"
updated_at: "2026-07-17T07:24:20.634Z"
---

## 0089. Define portable entrypoint contract for staged plugin scripts

### Background
**Type:** `wayfinder:grilling`

**Sharp question.** What is the portable entrypoint contract for staged plugin scripts (allowed runtimes, shebang/node policy, forbidden invocation forms, and how skill docs must invoke them)?

**Why this ticket exists.** Feature **A** chose install-time staging (C) plus a portable runner contract (R2-B), path helper in docs (R4-B), and dual surface with optional `script run` (R5-B). Downstream work (**0090** staging shape, **0091** `script path` CLI, **0092** guide rewrite, **0093** validate-response migration, **0094** hook-path design) needs a written contract so they do not invent incompatible entrypoint rules. This ticket **decides and records** the contract; it does not implement staging or the path helper.

**Locked inputs from discovery (do not re-open unless Solution explicitly supersedes with rationale).**
| ID | Constraint on this contract |
|----|-----------------------------|
| R2-B | No Bun-required-on-targets as the portable story |
| R3-B | Files land at native plugin `scripts/` and/or `~/.agents/scripts/<plugin>/` (exact roots: research ticket) |
| R4-B | Skill docs use superskill-resolved paths — never repo-relative `bun plugins/...` or hard-coded cache paths |
| R5-B | Path-based invocation is **standard**; `superskill script run` registry remains **optional** for absorbed pure engines |
| R6-B | Hooks are in scope for the *eventual* path model, but **hook command rewrites** are owned by the hook-design ticket — this ticket only defines the entrypoint file contract hooks would call |

**In scope.**
- Classify files under `plugins/<plugin>/scripts/**`: **entrypoint** vs **library** (shared modules).
- Allowed runtimes / shebangs for staged entrypoints on install targets.
- Forbidden invocation patterns in skill docs, hooks.json, and guides.
- Canonical doc invocation form using the path helper (shape only; CLI flags owned by path-helper task).
- Exit-code semantics by class (validation CLI vs hook block — do not collapse them).
- Dual-contract rule: when to use path invocation vs optional `script run`.
- Anti-patterns table suitable for the guide rewrite.

**Out of scope.**
- Implementing install staging or copying files (staging task).
- Implementing `superskill script path` flags/JSON (path-helper task).
- Full hooks.json migration and emitter rewrites (hook-design task).
- Rewriting production skill docs (migrate task) or ADRs (ADR task) — only define the contract they must follow.
- Changing existing `script run` / `hook run` code in this WBS.

**Done when.** Solution holds a numbered **Entrypoint Contract v1** (normative bullets + anti-patterns + dual-contract decision table) that sibling tickets can cite; feature **A** `## Decisions so far` gets one gist line.
### Requirements
- [x] R1. **Entrypoint vs library.** Define how plugin authors mark or recognize an install-target **entrypoint** vs a shared library file under `plugins/<plugin>/scripts/<feature>/` (naming, shebang, or convention). Libraries must not be documented as direct agent invocations.
- [x] R2. **Allowed runtimes.** Specify which runtimes are portable on install targets for staged entrypoints (e.g. `node` with `.js` / `.mjs`, POSIX `sh`/`bash`, or install-emitted JS). Explicitly state that **requiring Bun on the target** is non-portable and not part of the standard contract (R2-B). Dev-repo-only `bun <source.ts>` may remain a developer convenience, never a skill-doc form.
- [x] R3. **Shebang / file shape.** Specify required or recommended shebang and file extensions for staged entrypoints; what install may rewrite vs leave as-is (decision recorded even if "install does not rewrite" is the answer).
- [x] R4. **Forbidden invocation forms.** Enumerate banned patterns for skill docs and cross-target hooks, including at least: repo-relative `bun plugins/...`; bare relative `scripts/foo.ts` without path resolution; `${CLAUDE_PLUGIN_ROOT}` as the *only* portable form for non-Claude targets. Note Claude-only exceptions if any (must be labeled non-portable).
- [x] R5. **Canonical doc form.** Specify how skill docs must invoke staged entrypoints once the path helper exists (e.g. command substitution / documented env / fixed CLI shape). Reference path-helper task for CLI details; this task owns the **author-facing contract**, not the implementation.
- [x] R6. **Exit-code classes.** Separate validation-CLI semantics (0 pass / 1 fail) from hook-block semantics (exit 2). Contract must forbid wiring a validation entrypoint into `hooks.json` as if it were a hook blocker.
- [x] R7. **Dual contract (path vs script run).** Decision table: when authors use staged path invocation (default) vs optional `superskill script run <plugin> <id>` (registry absorption). State that adding a registry entry requires a CLI release (existing ADR-022 coupling) and is not required for every script.
- [x] R8. **Deliverable placement.** Write **Entrypoint Contract v1** into Solution; append one gist line to feature **A** `## Decisions so far`. No product code changes under this WBS.
### Acceptance Criteria
**AC1 — Normative contract exists.** Solution contains a clearly titled Entrypoint Contract v1 with MUST/MUST NOT (or equivalent normative language) covering runtimes, forbidden forms, and doc invocation.

**AC2 — R2-B honored.** Contract does not make Bun a required target runtime for the standard path; if Bun is mentioned, it is explicitly dev-repo-only or optional.

**AC3 — Dual contract table.** Solution includes a short table or bullets: path-based (standard) vs `script run` (optional), with at least one concrete example each (e.g. future staged validator vs current `cc/validate-response` registry entry).

**AC4 — Exit-code separation.** Validation CLI vs hook-block exit codes are distinguished; contract states validation entrypoints must not be used as hook block signals.

**AC5 — Downstream-citable.** Contract is specific enough that staging, path-helper, and guide tasks can implement without re-grilling the same questions (or lists open sub-questions deferred with owners).

**AC6 — Map updated.** Feature A `## Decisions so far` gets a gist line for this ticket after Solution is written (execution session — not part of refine).
### Q&A
**Auto-refine synthesis (session)**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Ticket type | Keep `wayfinder:grilling` — decision artifact only | Contract unblocks siblings; no code in this WBS |
| Structural check | PASS with empty sections → synthesize content | Same as inventory ticket: check gates presence, refine fills content |
| Relationship to inventory | Parallel frontier; may provisional-note path roots | Runner policy does not require finished path table |
| Bun | Explicitly non-portable for standard target contract | Locked R2-B |
| Hooks | Entrypoint file rules only; command migration separate | Hook-design ticket owns R6-B emitters |
| Dual contract | Path standard; `script run` optional | Locked R5-B |
### Design
**Method (grilling / decision — no product code).**

1. **Anchor on locked discovery.** Treat R2-B / R4-B / R5-B as constraints. Prefer the dual-contract model already locked over inventing a third surface.
2. **Ground in existing anti-patterns.** Reuse lessons from:
   - `docs/help/how_to_organize_scripts_for_plugin_development.md` (two-class model, anti-patterns)
   - anti-hallucination path failures (`bun plugins/cc/scripts/...`, `${CLAUDE_PLUGIN_ROOT}`)
   - `script run` / `hook run` exit-code semantics already shipped
3. **Decide, do not implement.** For each R-item, pick one normative rule. If a detail depends on path inventory research, write a provisional rule + "depends on path inventory" rather than blocking entirely — path roots and runner policy can be specified independently of exact cache paths.
4. **Output shape (Solution).**
   - Entrypoint Contract v1 (numbered MUST/MUST NOT)
   - Dual-contract decision table
   - Anti-patterns table (pattern / why wrong / do instead)
   - Deferred items (owned by staging / path-helper / hook-design) if any
5. **Do not** rewrite the guide or skill docs here — only define what they must later say.

**Recommended lean default (seed for execution; may adjust with evidence).**
- Standard: staged entrypoint is **Node-runnable JS** or **POSIX shell** with shebang; skill docs invoke via path helper output.
- Libraries: plain modules next to entrypoints; no direct doc invocation.
- Optional: pure TS engines may stay deep-imported via `script run` / `hook run` without being the doc-facing path for new scripts.
- Forbidden: `bun plugins/...` and cache-hardcoded paths in docs.
### Plan
1. [ ] Claim ticket: `spur task update 0089 wip`.
2. [ ] Re-read feature A locked decisions + current guide anti-patterns section.
3. [ ] Skim `script-run.ts` / `hook-run.ts` exit-code and fail-open notes for dual-contract language.
4. [ ] Draft Entrypoint Contract v1 answering R1–R7; mark any path-root-dependent clauses provisional.
5. [ ] Write dual-contract table + anti-patterns; fill Solution; tick Requirements.
6. [ ] Append gist to feature A `## Decisions so far`; set this ticket `done`.
7. [ ] Stop (wayfinder: one ticket per session) — do not implement staging or path helper here.
### Solution
## Entrypoint Contract v1

> **Contract grounded in:** `apps/cli/src/commands/hook-run.ts:20-25` (hook exit-code contract — exit 0 allow, exit 2 deny, exit 1 fail-open); `apps/cli/src/commands/script-run.ts:7-20` (script dispatcher fail-open + exit-code contract); `docs/help/how_to_organize_scripts_for_plugin_development.md:68-78` (current anti-patterns table); `docs/00_ADR.md:199-208` (ADR-015 — plugin-level scripts, prose-only skills); `docs/00_ADR.md:283-292` (ADR-022 — CLI deep-import blessed exception).

Normative rules for staged plugin entrypoints under `plugins/<plugin>/scripts/<feature>/`. Sibling tickets (0090 staging, 0091 path helper, 0092 guide rewrite, 0093 migration, 0094 hook-path design) MUST implement to this contract.

**1. Entrypoint vs library (R1).** A staged file is exactly one of two classes, distinguishable by convention:

| Class | Markers | Invocable from skill docs? |
|---|---|---|
| **Entrypoint** | Shebang at line 1; verb-prefixed name (e.g. `validate_response.js`, `check-tags.sh`); declared in the plugin's `scripts-map.json` (future — see Deferred items) | **Yes** — via path helper |
| **Library** | NO shebang; named as a noun (e.g. `ah_guard.ts`, `logger.ts`, `parse_tool_payload.js`); imported by an entrypoint or hook-run adapter | **Never** — non-entrypoint files in skill docs are an anti-pattern |

MUST: a file with a shebang is an entrypoint. MUST NOT: document a library as a direct agent invocation. A plugin MAY ship shared libraries next to entrypoints — they are imported, never invoked.

**2. Allowed runtimes (R2).**

**Portable (standard contract):**
- **Node.js** — `.js` / `.mjs` entrypoints with `#!/usr/bin/env node` shebang. Node is present on every supported target OS (macOS bundled, Linux standard, not blocking any install path).
- **POSIX shell** — `.sh` entrypoints with `#!/usr/bin/env bash` shebang (bash, not sh — dash on some Linux distros lacks useful features; bash is universal on macOS and standard on Linux).

**Non-portable (dev-repo only):**
- **Bun** (`.ts` source or `bun` shebang). Bun is NOT a required target runtime (R2-B locked). Source `.ts` files MAY live in the plugin tree for dev workflows, but MUST NOT be staged as portable entrypoints. A `.ts` file with a shebang calling `bun` is an anti-pattern for staging.

**Bridge pattern.** If a script engine is written in TypeScript and must run on targets without Bun, the author compiles to a standalone Node `.js`/`.mjs` entrypoint (or a thin shell wrapper) and ships that alongside the source `.ts`. The `.js` entrypoint is the staged contract; the `.ts` source stays dev-repo. Build tooling for this is out of scope for the contract (plugin authors own their build steps).

**Optional absorption.** Scripts already absorbed into the CLI binary via `ScriptRunner` (ADR-022 deep-import → `bun build --compile` bundle) remain valid. They use `superskill script run <plugin> <id>`, not the path helper. This is the legacy surface kept for scripts that must atomically deploy with the CLI.

**3. Shebang and file shape (R3).**

MUST:
- Node entrypoints: `#!/usr/bin/env node` at line 1. Extension `.js` or `.mjs`.
- Shell entrypoints: `#!/usr/bin/env bash` at line 1. Extension `.sh`.
- File is `chmod +x` in the plugin tree (install preserves permissions).

MUST NOT:
- `.ts` extension for staged entrypoints (reserved for dev-repo source).
- `#!/usr/bin/env bun` (non-portable).
- Shebang calling `superskill` itself (circular — the entrypoint IS the installed artifact).

**Install does not rewrite shebangs.** Staged entrypoints are copied as-is; the shebang the author writes is the shebang that runs. Install MAY validate that the shebang matches a portable runtime and warn on mismatch (owned by staging task, not this contract).

**4. Forbidden invocation forms (R4).** The following patterns are **banned** in all skill docs, hooks.json commands, and plugin guides:

| Pattern | Class | Why banned |
|---|---|---|
| `bun plugins/<p>/scripts/<path>` | ❌ Repo-relative Bun | cwd ≠ plugin root on Claude; Bun missing on most targets; file absent on non-Claude installs |
| `./scripts/foo.sh` / `scripts/foo.sh` | ❌ Bare relative | Unpredictable agent cwd; breaks in monorepo checkouts and non-file-targets |
| `${CLAUDE_PLUGIN_ROOT}/scripts/<path>` | ❌ Claude-only variable | Variable undefined on codex/pi/opencode/omp/grok/antigravity/hermes |
| `~/.omp/plugins/cache/…/scripts/<path>` | ❌ Hard-coded cache path | Target-specific; breaks on codex/grok/pi etc |
| `node ~/.agents/scripts/<p>/<path>` | ❌ Hard-coded rulesync path | Bypasses path resolution; breaks when `--no-global` changes root |
| `superskill script run <p> <id>` for unregistered scripts | ❌ Missing registry entry | Fail-open (exit 0) silently succeeds — no error, no validation |

The canonical portable forms:
- **Path (standard):** `$(superskill script path <plugin> <script-id>)` — resolves to the absolute staged entrypoint path for the current target + install mode (global/project).
- **Script run (optional):** `superskill script run <plugin> <script-id>` — only for registered `ScriptRunner` entries.

**5. Canonical doc form (R5).** Skill docs invoke staged entrypoints through the path helper subcommand (`superskill script path <plugin> <script-id>` — CLI flags owned by task 0091). The author-facing contract:

```
Standard form (pipe):
  <input> | $(superskill script path cc validate-response)

Standard form (args):
  $(superskill script path cc check-tags) --strict --json < input.json
```

Rules:
- MUST use `$(superskill script path ...)` — the subcommand outputs an absolute path; the shell executes it.
- MUST NOT inline a hard-coded path, repo-relative path, or env-var-only path.
- The path helper is the ONE indirection point: if staging roots change, only the helper updates.
- Skill docs SHOULD show the complete pipeline, including input redirection where the entrypoint reads stdin.

**Pre-staging fallback.** For scripts already in the `ScriptRunner` registry (e.g., `cc/validate-response`), docs MAY show `superskill script run cc validate-response` as an alternate form until staging lands. After staging ships (0090), skill docs migrate to the path form (0093).

**Input contract.** Entrypoints declare their input channel in the plugin's `scripts-map.json` (deferred). Convention:
- `stdin` — text piped in (most common)
- `args` — CLI arguments
- `env` — environment variables (e.g., `RESPONSE_TEXT=...` for backward compat)
- Precedence when multiple channels: env → args → stdin (consumer normalizes; entrypoint documents what it reads)

**6. Exit-code classes (R6).** Two surfaces, two exit-code contracts. MUST NOT conflate them:

| Surface | Exit 0 | Exit 1 | Exit 2 |
|---|---|---|---|
| **Validation CLI** (path or `script run`) | Pass / OK | Violation / failure | **(reserved)** |
| **Hook block** (`hook run`) | Allow (PreToolUse) / OK (Stop) | Non-blocking error (fail open) | Deny / block |

MUST:
- A validation entrypoint (`script run` or staged path) returns 0 on pass, non-zero on failure. 1 is the conventional failure code.
- A hook guard returns 0 on allow, 2 on deny. Exit 1 from a hook guard is a non-blocking error (hosts treat it as allow).

MUST NOT:
- Wire a validation entrypoint into `hooks.json` commands expecting hook-block semantics. Exit 1 IS NOT a block signal — Claude Code treats exit 1 as a non-blocking error; the agent proceeds as if the hook allowed.
- Use exit 2 in a validation CLI — exit 2 is part of the hook-block contract; validation CLIs don't block.

**Dual-use engine pattern.** If the same logic (e.g., anti-hallucination check) must serve both surfaces:
1. The core library returns a structured result (never an exit code).
2. A thin **validation adapter** wraps it: 0 on pass, 1 on violation. Registered as a staged entrypoint (path) or ScriptRunner.
3. A thin **hook adapter** wraps it: 0 on pass, 2 on violation. Registered as a HookRunner.
Both adapters live in the same plugin scripts directory; the adapters are the boundary where exit codes are assigned.

**7. Dual contract — path vs script run (R7).**

| Dimension | Path (standard) | Script run (optional) |
|---|---|---|
| **Invocation** | `$(superskill script path <p> <id>)` | `superskill script run <p> <id>` |
| **What runs** | Staged entrypoint file (shebang-resolved) | In-binary `ScriptRunner` (ADR-022 deep-import bundle) |
| **Registry required?** | No — staging + path helper maps names to files | Yes — `SCRIPT_RUNNERS` entry in `script-run.ts` |
| **CLI release required?** | No — new script = plugin release only | Yes — new runner = CLI release (ADR-022) |
| **Exit code contract** | Validation CLI: 0 pass, non-zero fail | Validation CLI: 0 pass, non-zero fail |
| **Input channels** | stdin / args / env (declared per script) | `ScriptRunInput` interface (env-first + stdin fallback) |
| **Target coverage** | All targets with install staging | All targets (binary travels with CLI) |
| **When to use** | Default for all new non-hook scripts | Scripts absorbed before staging existed; scripts needing atomic CLI+plugin deploy |

Path is the **standard** surface. `script run` is kept for backward compatibility and for scripts whose deploy must be atomic with the CLI binary (e.g., a validator that reads a new config format added in the same CLI release). Adding a `ScriptRunner` entry is an intentional ADR-022 coupling — only do it when the registry absorption provides clear value over staging.

**Anti-patterns table (for guide rewrite).**

| Anti-pattern | Why wrong | Do instead |
|---|---|---|
| `bun plugins/cc/scripts/foo.ts` in skill doc | Repo-relative Bun path — missing on Claude installs, absent on non-Claude targets, Bun not guaranteed | `$(superskill script path cc foo)` |
| `${CLAUDE_PLUGIN_ROOT}/scripts/foo.sh` in hooks.json | Claude-only env var; undefined everywhere else | `$(superskill script path cc foo)` for non-hook; `superskill hook run cc foo` for hooks |
| Per-skill `skills/<name>/scripts/` executables | Duplication (ADR-015); skill folders are prose-only | Plugin-level `scripts/<feature>/` shared entrypoint |
| Staging a `.ts` file as a portable entrypoint | Requires Bun on target (violates R2-B) | Compile to `.js`/`.mjs` or write a `.sh` wrapper |
| `$(superskill script path cc foo)` for unknown id | Path helper fails (exit 1 + stderr) — agent workflow breaks | Register in `scripts-map.json` before documenting |
| Wiring `validate-response` into hooks.json | Exit 1 is NOT a block signal — agent proceeds past violation | Wrap in hook adapter returning exit 2; keep validation CLI under `script run`/path |
| Hard-coded `~/.agents/scripts/cc/validate_response.js` | Bypasses path resolution; breaks on project-mode (`--no-global`) | `$(superskill script path cc validate-response)` |

**Deferred items (owned by sibling tickets).**

| Item | Owner | Notes |
|---|---|---|
| `scripts-map.json` schema + enforcement | 0090 (staging) | Declares entrypoint ids, input channels, and runtime requirements; install MAY validate |
| `superskill script path` CLI flags + resolution order | 0091 (path helper) | `--global` / `--project` / `--json` flags; resolve native-plugin-first then rulesync |
| Guide rewrite applying this contract | 0092 (guide) | Replace current "never copied" prose with staging model + this contract |
| Skill doc migration to path form | 0093 (migration) | Replace `superskill script run` invocations with path form after staging ships |
| Hook-path unification | 0094 (hook design) | Whether hooks.json commands switch from `superskill hook run` to staged paths |
| ADR/doc supersession | 0095 (ADR) | ADR-015 "copied on install" wording; extend ADR-022 scope for path helper |
| Input-channel normalization across entrypoints | Future | Pattern for env → args → stdin precedence; `scripts-map.json` declares per-script |
| Build step tooling for TS → JS compilation | Future | Plugin authors own their build; superskill MAY offer `bun build` conventions |
| Interactive stdin (`--non-tty-input` semantics) | Future | Currently `readStdinGuarded()` returns undefined on TTY; staged entrypoints inherit OS TTY behavior |
### Testing
**Task type:** `wayfinder:grilling` — decision artifact only; no production code (R8). Coverage: N/A (documentation/design-only; no runtime code path added).

**Re-verify session:** 2026-07-17 `/sp-dev-verify 0089 --auto --next --force --focus all --fix all`.

**Per-requirement traceability**

| Req | Status | Evidence type | Evidence |
|-----|--------|---------------|----------|
| R1 entrypoint vs library | MET | static-ref | Solution §1 shebang/name table; MUST/MUST NOT |
| R2 allowed runtimes | MET | static-ref | Solution §2 Node+bash portable; Bun dev-only (R2-B); bridge TS→JS |
| R3 shebang/shape | MET | static-ref | Solution §3 `#!/usr/bin/env node|bash`; install does not rewrite |
| R4 forbidden forms | MET | static-ref | Solution §4 six banned patterns + canonical forms |
| R5 canonical doc form | MET | static-ref | Solution §5 `$(superskill script path …)` pipe/args; 0091 owns flags |
| R6 exit-code classes | MET | static-ref | Solution §6 dual table; grounded in `hook-run.ts` exit 0/2 comments + `script-run.ts` 0/1 validation |
| R7 dual contract | MET | static-ref | Solution §7 path-vs-script-run table; `cc/validate-response` example |
| R8 deliverable + map | MET | static-ref | Solution filled; feature A Decisions so far line 73 (0089 gist) |

**Acceptance Criteria Verification**

| AC | Status | Evidence type | Evidence |
|----|--------|---------------|----------|
| AC1 Normative contract | MET | static-ref | Titled **Entrypoint Contract v1** with MUST/MUST NOT throughout |
| AC2 R2-B honored | MET | static-ref | Bun under "Non-portable (dev-repo only)" §2 |
| AC3 Dual contract table | MET | static-ref | §7 eight-dimension table + path vs `script run` examples |
| AC4 Exit-code separation | MET | static-ref | §6 validation 0/1 vs hook 0/2; MUST NOT wire validation into hooks.json |
| AC5 Downstream-citable | MET | static-ref | Deferred items → 0090–0095 owners; contract specific for implementers |
| AC6 Map updated | MET | static-ref | `docs/features/A_…md:73` 0089 gist present (re-checked this session) |

**Design conformance**

| Claim | Status | Evidence |
|-------|--------|----------|
| Anchor R2-B/R4-B/R5-B | DONE | Dual path standard; Bun non-portable; path helper form |
| Ground in anti-patterns + shipped exit codes | DONE | Guide + hook-run/script-run comments cited |
| Decision only, no code | DONE | R8; no apps/cli changes for this WBS |
| Output shape complete | DONE | Contract + dual table + anti-patterns + deferred |

**SECUA (decision artifact)**

| Dim | Finding | Severity |
|-----|---------|----------|
| S | N/A — no code | — |
| E | N/A | — |
| C | Exit-code and anti-pattern claims match shipped hook/script-run docs; line cites slightly drifted from file churn (semantic match holds) | minor |
| C | `scripts-map.json` is both a recognition marker and deferred to 0090 — intentional deferred | advisory |
| U | Contract is implementable by 0090–0093 | — |
| A | Correctly keeps hook.json migration out of scope (0094) | — |

**Residual**

- Plan checklist still shows unchecked `[ ]` despite History `done` — process hygiene only.
- Testing was empty before this re-verify; filled now.

**Gates this session**

- `spur task check 0089` — PASS
- `spur task check 0089 --strict-core` — PASS
- Feature A gist line 73 present; OMP-independent contract re-read against hook-run/script-run headers

**Coverage:** N/A (documentation/design-only; no runtime code path added).

**Fix pass (`--fix all`):** no UNMET/PARTIAL core rows; no code repair required.
### Review
**Verdict:** PASS — all 8 requirements and 6 acceptance criteria satisfied. No code changes (decision artifact only).


| Severity | Finding | Status |
|---|---|---|
| P4 | Deferred items table lists 3 future items (input-channel normalization, build tooling, interactive stdin) — no blocking impact on downstream tickets | Noted — owners recorded |


| R# | Requirement | Evidence | Verdict |
|---|---|---|---|
| R1 | Entrypoint vs library | Sol §1: shebang-based classification, two-class table, MUST normative language | DONE |
| R2 | Allowed runtimes | Sol §2: Node + POSIX shell portable; Bun explicitly non-portable (R2-B); bridge pattern for TS→JS | DONE |
| R3 | Shebang / file shape | Sol §3: `#!/usr/bin/env node` + `#!/usr/bin/env bash`; `.js`/`.mjs`/`.sh`; install does NOT rewrite | DONE |
| R4 | Forbidden invocation forms | Sol §4: 6 banned patterns in table; no Claude-only exceptions; canonical forms listed | DONE |
| R5 | Canonical doc form | Sol §5: `$(superskill script path <p> <id>)` with pipe/args examples; MUST/MUST NOT rules; input contract | DONE |
| R6 | Exit-code classes | Sol §6: dual-surface table (exit 0/1 vs exit 0/2); dual-use engine pattern with separate adapters | DONE |
| R7 | Dual contract | Sol §7: 8-dimension path-vs-script-run table; path=standard, script-run=optional; CLI-release coupling noted | DONE |
| R8 | Deliverable placement | Solution written + feature A `## Decisions so far` has 0089 gist line; no product code changes | DONE |


| AC | Requirement | Evidence | Verdict |
|---|---|---|---|
| AC1 | Normative contract | Entrypoint Contract v1 uses MUST/MUST NOT throughout all 7 sections | PASS |
| AC2 | R2-B honored | Bun labeled "Non-portable (dev-repo only)" in Sol §2; never the standard path | PASS |
| AC3 | Dual contract table | Sol §7: 8-dimension comparison table; concrete examples (staged validator path + `cc/validate-response` registry) | PASS |
| AC4 | Exit-code separation | Sol §6: validation CLI 0/1 vs hook-block 0/2; "MUST NOT wire validation into hooks.json" | PASS |
| AC5 | Downstream-citable | Deferred items table maps 6 items to owning 0090–0095 tickets; 3 future items documented; contract specific enough for implementation | PASS |
| AC6 | Map updated | Feature A line 73: `[0089 Define portable entrypoint contract](…) — Entrypoint Contract v1: …` | PASS |


- **None.** This is a decision artifact — no runtime behavior, no test surface. The contract becomes binding when downstream tickets implement to it; the risk is in those implementations diverging, not in the contract itself.
- The 3 deferred future items (input-channel normalization, build tooling, interactive stdin) may surface during 0090/0091 implementation but are not blocking for the contract — the deferred items table names them explicitly so downstream tickets can decide.
### References
- Feature map: `docs/features/A_portable-plugin-scripts-via-install-time-staging.md` (R2-B, R4-B, R5-B)
- Guide (to be rewritten later): `docs/help/how_to_organize_scripts_for_plugin_development.md`
- Optional run surface: `apps/cli/src/commands/script-run.ts`
- Hook run surface: `apps/cli/src/commands/hook-run.ts`
- ADR-015 / ADR-022: `docs/00_ADR.md`
- Sibling inventory: path research ticket under feature A
- Downstream: staging, path helper, guide rewrite, non-hook migrate, hook-path design
### History
- 2026-07-17T07:18:48.065Z todo → wip (system)
- 2026-07-17T07:19:39.579Z wip → testing (system)
- 2026-07-17T07:20:29.332Z testing → done (system)
