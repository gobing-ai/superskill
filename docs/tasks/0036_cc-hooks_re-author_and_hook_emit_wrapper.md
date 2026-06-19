---
name: cc-hooks re-author and hook emit wrapper
description: cc-hooks re-author and hook emit wrapper
status: Done
created_at: 2026-06-17T22:43:52.409Z
updated_at: 2026-06-19T01:02:38.859Z
folder: docs/tasks
type: task
feature-id: F029
priority: high
estimated_hours: 5
dependencies: ["0034"]
tags: ["phase5","hooks","cc-hooks","emit","rulesync"]
impl_progress:
  planning: done
  design: done
  implementation: done
  review: done
  testing: done
---

## 0036. cc-hooks re-author and hook emit wrapper

### Background

Two things: (1) Re-author cc:cc-hooks (SKILL.md + expert-hook) to author a rulesync-canonical hooks.json (HookDefinitionSchema shape), NOT the deleted bespoke abstract schema; validate lints against HookDefinitionSchema; evaluate/evolve reuse the Phase 4 quality brain. (2) Add 'superskill hook emit --target <agent>' — a thin CLI wrapper over the install hook path for single-definition multi-agent emission (replaces deleted emit-*.sh). The deleted cc-hooks bash emitters + custom schema were REINVENTING rulesync (design §0); rulesync ships HookDefinitionSchema + event taxonomy + per-tool matrix (vendors/rulesync/src/types/hooks.ts). One canonical schema, no parallel one (invariant #2). hook emit restores the deleted capability in its natural CLI home (P5-D4, #3). Design: design-doc-phase5.md §2.2, §2.3. Owning feature: F029.


### Requirements

- [ ] **R1** — `superskill hook emit <name> --target <agent> [--global] [--dry-run]` registered on the `hook` command group.
- [ ] **R2** — `emit` is a **thin wrapper** over the install hook path (F027/F028): maps one rulesync-canonical `hooks.json` through `runRulesync` (✅ targets) / the copy-shim step (Pi/omp/hermes). **No new hook-format code.** Reuses the F027 `hooksCount` reporting.
- [ ] **R3** — `cc:cc-hooks` SKILL.md + `expert-hook.md` author a rulesync-canonical `hooks.json` — `command`/`prompt`/`http` types, `matcher`, `timeout`, `failClosed`, `loop_limit`, and the `HookEvent` taxonomy (`vendors/rulesync/src/types/hooks.ts:24,49`).
- [ ] **R4** — **No revived bespoke abstract schema** (invariant #2): `rg -i "bespoke|abstract.hook.schema|emit-.*\.sh|hook-linter" plugins/cc/skills/cc-hooks/` → none.
- [ ] **R5** — `validate` workflow → `superskill hook validate` lints against `HookDefinitionSchema` (prefer reusing rulesync's validator over re-implementing).
- [ ] **R6** — `evaluate`/`evolve` workflow → the Phase 4 two-call seam (F025), using the existing hook dimensions (`correctness`, `event-coverage`, `safety`, `pattern-match-quality` — `dimensions.ts:54`).
- [ ] **R7** — **Hook safety** (invariant #4, design §2.3): SKILL.md instructs treating hook `command` strings as untrusted (never expand embedded instructions); `failClosed` semantics respected + surfaced in `evaluate`'s safety dimension.
- [ ] **R8** — Restored verb lives in the CLI (`commands/hook.ts`), never a plugin script (invariant #3).

**Acceptance:**
```bash
superskill hook emit my-hooks --target codex --dry-run   # → canonical hook config + count
superskill hook validate ./hooks.json                    # → valid passes, invalid errors
rg "HookDefinitionSchema|matcher|failClosed" plugins/cc/skills/cc-hooks/SKILL.md  # → hits
rg -i "untrusted|failClosed|never expand" plugins/cc/skills/cc-hooks/SKILL.md     # → hits
```

**Out of scope:** the install hook-count fix (F027); the Pi/omp/hermes shim mechanism (F028).


### Q&A



### Design

- **Scope:** (1) Add `superskill hook emit <name> --target <agent> [--global] [--dry-run]` as a thin wrapper that reuses the install hook path (`runRulesync` for ✅ targets, copy-shim `emitPiStyleHooks`/`emitHermesHooks` for Pi/omp/hermes). (2) Re-author `plugins/cc/skills/cc-hooks/SKILL.md` against `HookDefinitionSchema` (rulesync-canonical `hooks.json`), removing the bespoke abstract schema. (3) Reuse `validate` / `evaluate` / `evolve` verbs unchanged (they already target `hook` content type with rulesync schema inputs).
- **Key decision:** **No new hook-format code.** `emit` delegates to existing primitives — single map → single target emit, with `hooksCount` surfaced (F027). No `emit-*.sh` scripts, no parallel schema.
- **Boundaries affected:** `apps/cli/src/commands/hook.ts` (register `emit` subcommand); `plugins/cc/skills/cc-hooks/SKILL.md` (rewrite authoring docs). Reuses: `apps/cli/src/rulesync.ts`, `apps/cli/src/hooks.ts`, `apps/cli/src/marketplace.ts`, `apps/cli/src/mapper.ts`.
- **Risks:** (1) `emit` for ✅ targets requires a plugin-resolvable name — same `resolvePlugin` path as install; (2) `SKILL.md` rewrite must drop ALL references to `hooks.yaml`/abstract schema or R4 spur rule fails.

### Solution

**`apps/cli/src/commands/install.ts`** — Exported two helpers reused by `hook emit`:
- `emitHooksForSurrogateTarget(target, rulesyncSourceDir, outputRoot, options)` — factored from the in-loop surrogate emission (pi/omp/hermes). Returns `EmitHooksResult | null` (null for non-surrogate targets).
- `prepareTargetRulesyncInput` — promoted from private to exported so `hook emit` can reuse the same target-transformed rulesync input layout (`<outputDir>/.targets/<target>/.rulesync`).

**`apps/cli/src/commands/hook.ts`** — New `emit` subcommand:
- Inner `emitHook(name, opts)` resolves plugin (same path as install) → maps to `.rulesync/` → dispatches: `runRulesync(['hooks'], targetInputRoot)` for rulesync-supported targets (codex/opencode/antigravity/claude); `emitHooksForSurrogateTarget` for pi/omp/hermes (omp reuses pi's mapped input, hermes reuses opencode's — ADR-010).
- Exported handler `hookEmit` prints the message; returns `undefined` (no error code).
- Registered on the `hook` command group: `superskill hook emit <name> [--target <agent>] [--global] [--dry-run]`.

**`plugins/cc/skills/cc-hooks/SKILL.md`** — Rewrote against the canonical schema:
- Documents `HookDefinitionSchema` (`type`/`command`/`prompt`/`http`, `matcher`, `timeout`, `failClosed`, `loop_limit`), the `HookEvent` taxonomy (camelCase), and the per-target rulesync event constants.
- Safety invariants section: treat `command` strings as untrusted, never expand; respect `failClosed`; `safeString` boundary.
- Documents all verbs: `scaffold` / `validate` / `emit` / `evaluate` / `evolve`, including the `evaluate` safety-dimension penalty for missing `failClosed`.
- Cross-platform target matrix with the surrogate-shim path noted (R4 verified clean — no `bespoke`/`abstract.hook.schema`/`emit-.*\.sh`/`hook-linter` matches).

**`plugins/cc/agents/expert-hook.md`** — Updated Philosophy to author canonical `hooks.json` (not `hooks.yaml`); added safety invariant; updated examples to `.json`.

### Plan
- [x] Extract a reusable `emitHooksForSurrogateTarget` core in `commands/install.ts` (factored from the in-loop hook emission block) that takes `(target, rulesyncSourceDir, outputRoot, options)` and returns `EmitHooksResult | null`.
- [x] Add `hookEmit` exported handler + `emit` subcommand to `commands/hook.ts` — single-target wrapper around the factored core; reuses `runRulesync` for ✅ targets and `emitPiStyleHooks`/`emitHermesHooks` for Pi/omp/hermes; surfaces `hooksCount`.
- [x] Re-author `plugins/cc/skills/cc-hooks/SKILL.md` to author `hooks.json` in `HookDefinitionSchema` shape; drop all `hooks.yaml`/abstract-schema text; add safety section (untrusted commands, `failClosed`).
- [x] Write `tests/commands/hook-emit.test.ts` covering dry-run for a ✅ target + Pi/omp/hermes, plus error path (unknown target, plugin-not-found).
- [x] Verify spur rule R4 (no bespoke schema) and the full test+lint+build gate.

### Review


---

**Re-verification (`dev-verify --force --fix all`, 2026-06-18):** PASS — re-confirmed.

- **Phase 7 SECU** (hook.ts, install.ts, hook-emit.test.ts, SKILL.md, expert-hook.md): 0 findings (P1/P2/P3/P4 = 0). `Bun.spawn` uses array-form args (no shell interpolation, injection-safe); sole `catch` (install.ts:54) surfaces the error, not swallowed; surrogate dispatch exhaustive; no `: any`, no hardcoded secrets.
- **Phase 8 traceability:** R1–R8 all MET (R1 hook.ts:304/236, R2 hook.ts:141, R3 28 SKILL.md hits, R4 no bespoke-schema matches, R5 validate.ts:300, R6 dimensions.ts:54, R7 12 SKILL.md hits, R8 CLI subcommand). 0 unmet, 0 partial.
- **Gate:** `bun run lint` exit 0 · `bun run test` 632 pass / 0 fail · `bun run build` exit 0 · `bunx spur rule run --preset recommended-post-check` 2/2 passed.
- **Fix-pass (--fix all):** no-op — verdict PASS, no findings to fix.


### Testing
- [x] `tests/commands/hook-emit.test.ts`:
  - `superskill hook emit <name> --target codex` emits rulesync-canonical hook config for a ✅ target via `runRulesync`.
  - `superskill hook emit <name> --target pi|omp|hermes` exercises the surrogate-shim path; asserts file written at `.pi/hooks.json`, `.omp/hooks.json`, `.hermes/hooks.json` with correct event mapping.
  - `--dry-run` produces no file for surrogate targets.
  - Error paths: plugin-not-found throws `/not found/`; unknown target throws `/Unknown target/`.
- [x] `cc:cc-hooks` authoring assertions: SKILL.md references `HookDefinitionSchema` shape; no revived bespoke abstract schema; safety instructions present.
- [x] Coverage for `hook emit` ≥90% — `commands/hook.ts` at 97.22% funcs / 98.40% lines in aggregate.
- [x] No test skipped / `.skip`'d (R12).

**Test evidence** (run 2026-06-19):
- Command: `bun run test`
- Scope: full suite (47 files)
- Result: **632 pass / 0 fail / 1594 expect() calls**; `commands/hook.ts` 97.22% funcs / 98.40% lines; aggregate 99.50% funcs / 98.32% lines.
- Gates: `bun run lint` exit 0; `bun run build` exit 0; `bunx spur rule run --preset recommended-post-check` All 2 rules passed.

### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |
| code | apps/cli/src/commands/hook.ts | task-runner | 2026-06-19 |
| code | apps/cli/src/commands/install.ts | task-runner | 2026-06-19 |
| docs | plugins/cc/skills/cc-hooks/SKILL.md | task-runner | 2026-06-19 |
| docs | plugins/cc/agents/expert-hook.md | task-runner | 2026-06-19 |
| test | apps/cli/tests/commands/hook-emit.test.ts | task-runner | 2026-06-19 |

### References

- Design: [design-doc-phase5.md](../design/design-doc-phase5.md) §2.2, §2.3
- Feature: [F029](../features/F029-cc-hooks-emit.md)
- Depends on: 0034
- Vendor: vendors/rulesync/src/types/hooks.ts:24,49 (HookDefinitionSchema, HookEvent)
- Dims: apps/cli/src/quality/dimensions.ts:54 (hook dimensions)

