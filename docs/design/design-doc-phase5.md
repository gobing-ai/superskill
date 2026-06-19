# Phase 5 Design — Universal Hooks & Deterministic Verb Restoration

> **One-line goal.** Deliver one canonical hook definition that installs correctly across every
> supported coding agent, and restore the deterministic verbs deleted in Phase 3 — **leveraging
> `rulesync`'s native hook feature instead of rebuilding a hook abstraction.**

## 0. Headline Finding — rulesync already owns canonical hooks

The Phase 3/4 docs assumed Phase 5 would *build* a universal hook abstraction (abstract schema +
per-agent emitter shims). A check of `vendors/rulesync/` shows **that abstraction already exists
upstream** and we already partially wire it:

| Evidence | Location |
|----------|----------|
| Canonical `HookDefinitionSchema` (zod) — `command`/`prompt`/`http` types, `matcher`, `timeout`, `failClosed`, `loop_limit` | `vendors/rulesync/src/types/hooks.ts:24` |
| Full `HookEvent` taxonomy — `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `preModelInvocation`, `beforeSubmitPrompt`, `stop`, `subagentStop`, `preCompact`, `contextOffload`, … | `vendors/rulesync/src/types/hooks.ts` |
| Hooks feature module + e2e tests | `vendors/rulesync/src/features/hooks/`, `src/e2e/e2e-hooks.spec.ts` |
| Per-tool hooks **support matrix** (Claude Code, Codex, Cursor, OpenCode, Antigravity IDE/CLI, Copilot, Gemini, Kiro, Junie, …) | `vendors/rulesync/README.md` support table |
| `superskill install` **already lists `hooks`** in `rulesyncFeatures`, maps `hooks.json` into `.rulesync/`, **and already passes `hooks` to `generate()`** | `install.ts:130,151`; `mapper.ts:72–76`; `rulesync.ts:60–69` |

**Implication.** The deleted `cc-hooks` bash emitters + custom abstract-hook schema were
**reinventing rulesync.** Phase 5's hook work shrinks from "design a new universal system" to
"adopt rulesync's canonical hook format, surface the hook counts install already emits, and
re-author `cc:cc-hooks` against it."

> [!IMPORTANT]
> **Correction to the prior draft.** An earlier version claimed `rulesync.ts:51` *hardcodes*
> `hooksCount: 0` so hooks "are mapped but not emitted." That is a misread. Line 51 sits inside the
> `mappedTargets.length === 0` **early return** (the zero-result object when no target maps); the
> real `generate()` call (`rulesync.ts:60`) already forwards `features` — which include `'hooks'`
> (`install.ts:130,151`). **Hooks already emit today** for every rulesync target whose hook column is
> ✅ (codex, opencode, antigravity-cli, antigravity-ide — see §1 table). The genuine stub is in the
> **install reporting path**: `InstallResultCounts` (`install.ts:72`) has no `hooksCount` field, and
> the aggregation loop (`install.ts:159–161`) sums only `skills/commands/subagents`, **silently
> dropping `result.hooksCount`**. That is why install "reports 0 hooks." See §2.1.

### Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| **P5-D1** | **Reuse rulesync's canonical hook format** (`.rulesync/hooks.json` + `HookDefinitionSchema`) as superskill's single source of truth. Do **not** revive a bespoke abstract-hook schema. | rulesync already does it, with a maintained per-tool matrix and e2e coverage. DRY; one fewer thing to maintain. |
| **P5-D2** | **The web research is a *validation* pass, not a discovery pass.** Confirm rulesync's hook coverage/event-mapping against our 8 targets and current agent docs; only build superskill-side shims for the gaps rulesync can't cover (Pi, `omp`, `hermes`). | The "universal library" question is already answered by the vendor; research now de-risks coverage, not architecture. |
| **P5-D3** | **`cc:cc-hooks` authors the rulesync-canonical `hooks.json`,** validates/lints against `HookDefinitionSchema`, and reuses the Phase 4 quality brain for evaluate/evolve. | Aligns the skill with the actual install path; no parallel schema. |
| **P5-D4** | **Restore deleted verbs as their natural CLI home,** not as a revived plugin script. | Keeps the "no embedded execution" invariant from Phase 3. |

---

## 1. Coverage — already answered by the vendor (P5-D2)

The "universal hook library" question is **not open** — `vendors/rulesync/README.md:77–107` already
publishes the per-tool support matrix, and our `TARGET_TO_RULESYNC` map (`targets.ts:20–26`) tells us
exactly which of our 8 targets reach `generate()`. The table below is derived directly from those two
sources (verified 2026-06-17); it is **not** a research deliverable, it is the design input.

| Target | rulesync target | Hooks in rulesync matrix | Reaches `generate()`? | Disposition |
|--------|-----------------|--------------------------|-----------------------|-------------|
| `claude` | — (direct install) | ✅ (Claude Code) | no (plugin marketplace path) | native, outside rulesync |
| `codex` | `codexcli` | ✅ | yes | **emits today** |
| `opencode` | `opencode` | ✅ | yes | **emits today** |
| `antigravity-cli` | `antigravity-cli` | ✅ | yes | **emits today** |
| `antigravity-ide` | `antigravity-ide` | ✅ | yes | **emits today** |
| `pi` | `pi` | ⬜ blank | yes (but no hook output) | **shim needed** (§2.1) |
| `omp` | — (copy-step) | ⬜ absent from tool set | no | **shim/copy needed** |
| `hermes` | — (copy-step) | ⬜ absent from tool set | no | **copy-step** |

> [!IMPORTANT]
> The four ✅ targets need **no superskill hook code** — `generate()` already writes their native hook
> config. Phase 5's only hook *coverage* gap is Pi/omp/hermes.

### 1.1 Validation checklist (not a discovery pass)

Confirm at implementation time; none of these reopens an architecture decision:

- [ ] **Event-name fidelity.** Spot-check that rulesync's `HookEvent` → native event mapping is lossless
  for the four ✅ targets (e.g. Claude `SessionStart`/`PreToolUse`/`Stop`). Flag any lossy mapping in a
  test fixture; do not redesign around it.
- [ ] **rulesync API shape.** Confirm the pinned rulesync version accepts `hooks` in
  `generate({ features: [...] })` and the expected `.rulesync/hooks.json` shape (already wired —
  `rulesync.ts:60`, `install.ts:151`).

### 1.2 The one genuinely open question — Pi/omp hook enablement

This is the *only* item warranting research, and it is a **mechanism** question, not a coverage one:
can Pi / omp be given a Claude-Code-like hook lifecycle via an installable extension/shim?

- Does Pi / omp expose any extension, plugin, wrapper, or middleware point that can intercept the
  hook-relevant lifecycle events (session start, pre/post tool use, stop)?
- Is there an existing open-source bridge, or would superskill ship a small shim (installed alongside
  the agent config) that maps the rulesync-canonical `hooks.json` onto that extension point?
- Fallback ladder: (a) native extension if one exists → (b) superskill-installed shim → (c) the
  existing copy-step that hand-emits config for omp/hermes skills → (d) document as unsupported.
  Prefer the highest rung the agent actually supports. For `hermes`, the copy-step fallback is the
  ceiling (no extension research required).

> Deliverable for §1.2 only: a short note (chosen rung + source + date, per the anti-hallucination
> rule). §1's coverage table is already complete above.

#### Research note (2026-06-18)

**Pi** — Pi exposes a full extension system: TypeScript modules at `~/.pi/agent/extensions/*.ts`
(global) or `.pi/extensions/*.ts` (project) that subscribe to lifecycle events via `pi.on(eventName, handler)`.
Lifecycle events include `session_start`, `session_shutdown`, `agent_start`, `agent_end`, `tool_call`,
`tool_result`, `turn_start`, `turn_end`, `message_start/update/end`, and more.

- **Chosen rung: (b) superskill-installed shim.** The `@vahor/pi-hooks` package (v0.0.11, npm, MIT,
  681 downloads/mo, published 2026-05-23) provides a declarative `.pi/hooks.json` config that runs shell
  commands on Pi lifecycle events. superskill converts the rulesync-canonical `hooks.json` to
  `@vahor/pi-hooks` format and writes it to `.pi/hooks.json` (project) or `~/.pi/agent/hooks.json` (global).
  The user installs `@vahor/pi-hooks` (`pi install npm:@vahor/pi-hooks`) as the shim; superskill emits
  the config. Install output documents this dependency (no silent drop).

- **Event mapping** (canonical camelCase → Pi snake_case):
  `sessionStart`→`session_start`, `sessionEnd`→`session_shutdown`, `preToolUse`→`tool_call`,
  `postToolUse`→`tool_result`, `stop`→`agent_end`, `preCompact`→`session_before_compact`.
  Events without a Pi equivalent (e.g. `subagentStop`) are skipped.

- **Limitation:** `@vahor/pi-hooks` fires `tool_call`/`tool_result` for all tools without matcher
  filtering. Matchers from the canonical format are dropped. Full matcher enforcement requires
  `@hsingjui/pi-hooks` (Claude Code-compatible format with matchers) or a superskill-shipped extension.
  This is an acceptable trade-off for the initial implementation; the config is inert without the
  extension, so no silent execution occurs.

- **Sources:**
  - https://pi.dev/packages/@vahor/pi-hooks (v0.0.11, accessed 2026-06-18)
  - https://pt-act-pi-mono.mintlify.app/api/coding-agent/hooks (Pi hooks API, accessed 2026-06-18)
  - https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md (Pi extensions, accessed 2026-06-18)

**omp** — Pi variant ("Oh My Pi"). Uses `.omp/` paths and Pi's slash dialect. Inherits Pi's extension
system; hooks config at `.omp/hooks.json` (project) or `~/.omp/agent/hooks.json` (global).

- **Chosen rung: (b) superskill-installed shim.** Same mechanism as Pi — superskill emits
  `.omp/hooks.json` in `@vahor/pi-hooks` format. The `@vahor/pi-hooks` extension (installed at the Pi
  level) reads from `.omp/hooks.json` when omp is the active agent.

**hermes** — Custom agent, absent from rulesync's tool set. Uses opencode as a rulesync surrogate.

- **Chosen rung: (c) copy-step.** No extension research required (design §1.2: "the copy-step
  fallback is the ceiling"). superskill copies the canonical `.rulesync/hooks.json` to
  `.hermes/hooks.json` (project) or `~/.hermes/hooks.json` (global). The canonical format is preserved
  verbatim — hermes or its users can interpret it as needed.

---

## 2. Hook Work Breakdown

### 2.1 Surface the hook counts install already emits (CLI)

Hooks **already generate** for the four rulesync-hook-supported targets (§0 correction, §1 table) —
`runRulesync` forwards `'hooks'` to `generate()`. What's missing is *reporting*: install drops the
emitted count on the floor. Two small changes:

1. **Add `hooksCount` to `InstallResultCounts`** (`install.ts:72`) and accumulate `result.hooksCount`
   in the aggregation loop (`install.ts:159–161`, alongside skills/commands/subagents).
2. **Surface it** in the verbose summary line (`install.ts:165`) and the non-verbose result so
   install reports real hook counts (Exit #3).

No change to `rulesync.ts` is needed for the ✅ targets — its `generate()` call already emits and
returns `hooksCount`/`hooksPaths`. The remaining work is the uncovered targets:

- For rulesync-supported targets: `generate()` writes native hook config (no superskill format code).
  Confirm hook output appears for codex/opencode/antigravity-cli/antigravity-ide from fixtures.
- For **Pi / omp**: emit hooks via the enablement path chosen by §1.2 (native extension →
  superskill-installed shim → copy-step → unsupported). Goal is parity with Claude Code's hook
  lifecycle, not a documented gap.
- For **hermes**: superskill copies/derives the hook config via the existing post-generate copy step.

### 2.2 Re-author `cc:cc-hooks` against the canonical format (skill)

- Rewrite the SKILL.md authoring workflow to produce a rulesync-canonical `hooks.json`
  (`HookDefinitionSchema` shape), not the deleted bespoke abstract schema.
- `validate`: lint the definition against `HookDefinitionSchema` (the CLI `hook validate` verb can
  shell to rulesync's validator or re-implement the zod check — decide at impl time, prefer reuse).
- `evaluate`/`evolve`: reuse the Phase 4 quality brain (hook dimensions already exist:
  `correctness`, `event-coverage`, `safety`, `pattern-match-quality` — `dimensions.ts:54`).
- `emit`: expose `superskill hook emit --target <agent>` as a thin wrapper over the install hook
  path for single-definition multi-agent emission (replaces the deleted `emit-*.sh`).

### 2.3 Hook safety invariants (carried, since hooks run code)

- Treat hook `command` strings as **untrusted** when authored from external content; never expand
  embedded instructions (project safety rules).
- Respect `failClosed` semantics where the target supports it; default `failOpen` otherwise, and
  surface the difference in `evaluate` (safety dimension).

---

## 3. Deterministic Verb Restoration (P5-D4)

Restore the capabilities deleted in Phase 3 §2.1, each in its natural CLI home. None return as
plugin scripts.

| Verb | Restored as | Notes |
|------|-------------|-------|
| `adapt` (cross-platform companion generation) | **Folded into `superskill install`** conversion pipeline (already the documented home — Phase 3 §2 note, ADR). | No separate `adapt` verb; the pipeline (`pipeline/convert.ts`) already does slash/colon/frontmatter/Pi conversion. Confirm gap vs. the deleted adapters; add only what's missing. |
| `skill package` | `superskill skill package <name>` | Bundle a skill + companions for distribution. Re-spec the deleted `cc-skills/scripts/package.ts` behavior against the current content-IO layer. |
| `skill migrate` | `superskill skill migrate <sources...> <dest>` | Merge/migrate skills with LLM-powered content refinement → routes through the Phase 4 generation seam (agent-authored, not deterministic merge alone). |
| hook `emit` | `superskill hook emit` | Covered in §2.2 (rulesync-backed). |

> [!NOTE]
> `skill migrate`'s "content refinement" is non-deterministic → it **depends on Phase 4** (the
> quality brain). Sequence Phase 4 before this verb, or ship a deterministic merge first and layer
> refinement after.

---

## 4. Scope

### 4.1 In scope (Phase 5)

- [ ] Validation checklist (§1.1): confirm event-name fidelity + rulesync API shape for the four ✅ targets (coverage table in §1 is already complete — no discovery pass).
- [ ] Surface hook counts in install (§2.1): add `hooksCount` to `InstallResultCounts`, accumulate `result.hooksCount`, print it. (No `rulesync.ts` change for ✅ targets.)
- [ ] Pi/omp hook enablement (§1.2): research the mechanism + implement the chosen rung (native extension → installed shim → copy-step) for Claude-Code-like hook parity; hermes via copy-step.
- [ ] Re-author `cc:cc-hooks` SKILL.md + expert-hook agent against the rulesync-canonical format.
- [ ] `superskill hook emit --target` wrapper.
- [ ] Restore `skill package`; restore `skill migrate` (deterministic core; refinement via Phase 4).
- [ ] Confirm/close the `adapt` gap inside `superskill install`.
- [ ] Tests: hook emission per target (fixtures), verb restoration; ≥90% coverage; gates green.

### 4.2 Out of scope (→ Phase 6: Distribution hardening, §5)

The PRD's remaining deferred items are install/CLI ergonomics, not hook/verb work — keep them in a
separate cohesive phase.

---

## 5. Phase 6 Preview — Distribution Hardening & Ergonomics (PRD-deferred items)

Recorded so the "anything else remaining?" inventory is complete. From `01_PRD.md` §Deferred:

| Item | PRD condition |
|------|---------------|
| Remote marketplace sources (`github`, `url`, `git-subdir`, `npm`) | Needs fetch + cache layer; Phase 1 was local-relative only. |
| Thin commands: `superskill list`, `doctor`, `init` | Read config + check paths; small, high-utility. |

### Continuously deferred (no target phase until `superskill` matures)

These stay deferred until the authoring + distribution core is mature — **not** scheduled into a phase:

| Item | Why it waits |
|------|--------------|
| Import from non-Claude formats (Codex, Pi → canonical) | Reverse-direction mapper; only worth building once the forward (Claude → all) path is proven and stable. |
| `rulesync` upstream contribution for Hermes/omp | The local copy-step is sufficient; upstreaming costs maintenance and only pays off at real adoption. |

**Permanently out of scope** (PRD §Out of scope, not a phase): runtime agent orchestration
(`@gobing-ai/ts-ai-runner`), GUI/TUI, cloud sync/registry.

---

## 6. Verification & Exit Criteria

1. One `hooks.json` authored via `cc:cc-hooks` installs correct native hook config for **every
   rulesync-supported target** (verified per target from fixtures).
2. Targets rulesync can't cover are either shimmed (Pi/omp/hermes) or documented as unsupported — no
   silent drop.
3. Install reports **real hook counts** — `InstallResultCounts` carries `hooksCount` and the verbose
   summary prints it (no longer drops `result.hooksCount`). The four ✅ targets show non-zero hook
   output from fixtures.
4. `cc:cc-hooks` validates against `HookDefinitionSchema`; no bespoke abstract schema reintroduced.
5. `skill package` and `skill migrate` restored and passing; `adapt` gap confirmed closed in `install`.
6. Root gate green: `bun run lint`, `bun run test`, `bun run build`; ≥90% coverage; `git status` clean.

---

## 7. Invariants

1. **rulesync owns hook format knowledge.** superskill never hardcodes a target's hook file format;
   it delegates to rulesync and only copy-shims the targets rulesync lacks (mirrors the Phase 1
   skills/commands invariant).
2. **One canonical hook definition.** `.rulesync/hooks.json` (`HookDefinitionSchema`) is the single
   source; no parallel abstract schema in the plugin.
3. **No embedded execution.** Restored verbs live in the CLI, never as plugin scripts (Phase 3 carry).
4. **Hook content is untrusted.** Externally-sourced hook commands are never expanded as instructions.
5. **Coverage is evidenced from the vendor, not researched.** Which targets rulesync covers is read
   from `vendors/rulesync/README.md` + `TARGET_TO_RULESYNC` (§1 table), never assumed. A superskill-side
   shim is added only for a target that table shows uncovered (Pi/omp/hermes); the §1.2 research is
   strictly about the *mechanism* for those three, not about coverage.
