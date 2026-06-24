---
doc: 04_DESIGN
owns: SURFACE — concrete shapes: every CLI command, flag, config key, env var, table, DTO
authority: derived
version: 2.2.0
derived_from: [00_ADR, 01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-06-23
read_before: changing a command, flag, env var, or schema
edit_rules: 99 §6.5
sync: [T3]
---

# Design — Surface Reference

- Phase 1 — Distribution: [design-doc-phase1.md](design/design-doc-phase1.md) — `superskill install` and supporting commands.
- Phase 2 — Authoring + quality: [design-doc-phase2.md](design/design-doc-phase2.md) — `superskill agent|skill|command|hook|magent` with scaffold, validate, evaluate, refine, evolve.

## Phase 2 command surface

| Command family | Lifecycle subcommands | Shared scaffold flags | Shared refine flags | Detail |
|----------------|-----------------------|-----------------------|---------------------|--------|
| `superskill agent|skill|command|hook|magent` | `scaffold`, `validate`, `evaluate`, `refine`, `evolve` | `--description <text>`, `--target <agent>`, `--output <dir>`, `--template <tier>`, `--skills <list>`, `--tools <list>`, `--force` | `--target <agent>`, `--auto`, `--save`, `--dry-run` | [design-doc-phase2.md §2.1](design/design-doc-phase2.md#21-scaffold--generate-from-template), [§2.4](design/design-doc-phase2.md#24-refine--evaluate-then-fix) |

`--dry-run` previews classified refine fixes and projected score delta without writing files or creating backups.

`agent|command|magent|skill evolve` share the evolve surface from phase 2, including `--eval-gate`.
When `--eval-gate` is set and `skills/<name>/eval/cases.yaml` exists, the evolve accept path runs
the empirical behavior gate after the form Δ-margin gate and before anchor/skeptic checks. The
`cases.yaml` artifact shape is:

```yaml
version: 1
cases:
  - id: unique-case-id
    split: train | holdout
    prompt: "case prompt"
    reference_kind: exact | rule | rubric
    reference: "exact reference text"
```

For `reference_kind: rule`, `reference` is `{ checks: [{ op: contains | regex | equals | not_contains | tool_called, arg: string }] }`.
For `reference_kind: rubric`, `reference` is `{ criterion: string, excellent?: string, poor?: string }`; the gate replays candidate and baseline outputs, judges them pairwise through `@gobing-ai/ts-ai-runner`, estimates a signed-margin noise floor from N judge replays, rejects within-noise wins, and persists `empirical.{hard,holdout_n,train_n,noise_floor,rubric_delta}` in the evaluation dimensions JSON.
The gate is opt-in and skip-when-absent: without the flag or without `cases.yaml`, no replay backend
is constructed and evolve behavior remains unchanged. If the configured model-call budget is exceeded during replay/judging, the empirical gate fails loud and restores the candidate file.

**Hook divergence (tasks 0061, 0066):** `hook` does NOT share the full surface above. Hooks are hand-authored in `hooks.json` (JSON, security-critical), so: (1) `hook scaffold` is removed — scaffold emits markdown, which is the wrong artifact type for JSON config; (2) `hook refine` is **suggest-only** — it registers only `--target`/`--dry-run` (no `--auto`/`--save`), and the engine forces the dry-run path so no fix is ever applied; (3) `hook evolve` is **analyze-only** (task 0056) — no `--history`/`--rollback`/`--confirm`. `hook validate` and `hook evaluate` work normally. `ContentType` retains `'hook'` for all lifecycle operations; only scaffold/refine/evolve diverge.

## Plugin-level scripts directory

Executable logic a skill invokes at the user's install site lives in `plugins/<plugin>/scripts/<skill>/` (shared across the plugin's skills, copied on install, deduped). NOT per-skill `scripts/` (reintroduces duplication); NOT `packages/*` (not part of the plugin install payload).

| Surface | Path | Purpose |
|---------|------|---------|
| Guard engine | `plugins/cc/scripts/anti-hallucination/ah_guard.ts` | Pure `verifyAntiHallucinationProtocol(text)` + Stop-hook `main()` reading `$ARGUMENTS` |
| Validate adapter | `plugins/cc/scripts/anti-hallucination/validate_response.ts` | Thin wrapper: `RESPONSE_TEXT`/stdin → verify → exit 0/1 |
| Shared logger | `plugins/cc/scripts/anti-hallucination/logger.ts` | Single shared copy (dedup'd from per-skill copies) |
| Stop-hook config | `plugins/cc/hooks/hooks.json` | `Stop` command hook → `bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts` |
| Engine tests | `plugins/cc/scripts/anti-hallucination/tests/` | 2 test files (ah_guard, validate_response); counted in coverage gate |

Skill folders are prose-only: `plugins/cc/skills/anti-hallucination/` holds `SKILL.md`, `references/*.md`, `agents/openai.yaml`, `metadata.openclaw` — no `.ts` runtime.

Phase 4 (pending): cross-agent enforcement re-developed as `spur workflow run anti-hallucination.yaml --vars '{"agent":"codex"}'`, replacing the 6 former per-agent launcher scripts. Blocked on Spur-side data-threading gap (see ADR-015).
