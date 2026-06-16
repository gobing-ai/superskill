---
feature_id: F012
title: Refine operation
phase: 2
status: planned
depends_on: [F007, F010, F011]
deliverables:
  - apps/cli/src/operations/refine.ts
created: 2026-06-16
---

# F012 — Refine operation

## What

Evaluate → fix pipeline per design doc §2.4. Runs `evaluate` (F011), then classifies each finding into a fix strategy bucket and applies corrections. Three fix strategies: **Auto-apply** (structural fixes: add missing frontmatter field, normalize array syntax, fix indentation), **Suggest** (content improvements: rewrite ambiguous descriptions, de-duplicate trigger phrases), and **Flag** (requires human judgment: architecture-level changes, scope decisions). `--auto` mode applies only auto-apply fixes silently. Interactive mode (default) lets the user review each suggestion. After refinements, re-evaluates and shows the score delta (pre-refine vs post-refine). `--save` persists the post-refine evaluation.

## Why

The fast feedback loop. Instead of evaluate → manually fix → re-evaluate in multiple steps, `refine` does it in one step with smart auto-fixes for structural issues. This tightens the authoring iteration cycle and makes the quality pipeline self-correcting for mechanical problems.

## Change

### `operations/refine.ts`

- Export `refine(type: ContentType, path: string, opts?: RefineOptions): Promise<RefineResult>`
  - `RefineOptions`: `{ target?: Target, auto?: boolean, save?: boolean }`
  - `--auto` applies only auto-apply category fixes without user interaction
  - `--save` persists the post-refine evaluation via F011's `--save` path
  - `--target` forwards to both validate and evaluate
- Export `RefineResult`: `{ preScore: number, postScore: number, delta: number, fixesApplied: FixRecord[], fixesSkipped: FixRecord[] }`
- Export `FixRecord`: `{ severity: string, field: string, message: string, strategy: 'auto-apply' | 'suggest' | 'flag', applied: boolean }`
- Pipeline:
  1. Call `validate()` from F010 — exit early with findings if validation errors exist (structural problems block evaluation)
  2. Call `evaluate()` from F011 to get baseline scores
  3. Classify each dimension note/finding into a fix strategy:
     - **Auto-apply**: structural frontmatter fixes (missing field → add with default, wrong type → correct syntax), whitespace/indentation normalization, YAML array syntax normalization
     - **Suggest**: content rewriting (ambiguous descriptions → prompt for clarification), trigger phrase deduplication, section reordering recommendations
     - **Flag**: architecture-level changes (e.g. "merge this skill with sibling"), scope expansions, decisions requiring domain context
  4. In `--auto` mode: apply all auto-apply fixes via `applyChange` (F007) with `{ kind: 'frontmatter', … }` changes. Skip suggest and flag strategies silently (recorded in `fixesSkipped`).
  5. In interactive mode (default): present each auto-apply and suggest finding to user for accept/reject. Flag findings are always shown but never auto-applied.
  6. After fixes applied: re-run `evaluate()` to compute post-refine score
  7. Display score delta `0.72 → 0.85 (+0.13)` via `process.stdout.write`
  8. If `--save`: persist the post-refine evaluation by calling `evaluate(type, path, { target, save: true })` **with `operation: 'refine'`** — the `operation` value is passed through to `insertEvaluation`, not hard-coded as `'evaluate'`. (F011's evaluate accepts an `operation` override for exactly this; the store never defaults it — see F008.)
- **Edit mechanism**: refine mutates content **only** through `applyChange` from `content/edit.ts` (F007) — the same primitive evolve (F013) uses. Frontmatter fixes are `kind: 'frontmatter'` (round-trip via `yaml.parseDocument`, comments preserved); no bespoke parser lives in `refine.ts`.
- Score delta calculation: `postScore - preScore`

## Acceptance

```
# Auto mode — structural fixes only
superskill skill refine my-skill --auto --save
# → [AUTO] Added missing 'description' field
# → [AUTO] Normalized 'allowed-tools' to array syntax
# → Re-evaluating…
# → Delta: 0.72 → 0.85 (+0.13)
# → exit 0

# Interactive mode — user reviews each change
superskill skill refine my-skill
# → Finding 1/3 [AUTO-APPLY] Missing 'description' field → Apply? [Y/n]
# → Finding 2/3 [SUGGEST] Description too short → Apply? [Y/n]
# → Finding 3/3 [FLAG] Consider merging with rd3-code-review → (requires manual review)
# → Re-evaluating…
# → Delta: 0.72 → 0.85 (+0.13)
# → exit 0

# Validation errors block refine
superskill skill refine broken-skill.md
# → Validation failed: 2 errors found
# → [ERROR] frontmatter: YAML parse error at line 3
# → Fix validation errors before refining → exit 1

# Refine with target
superskill agent refine my-agent --target codex --auto
# → Applies codex-specific structural fixes → shows delta → exit 0
```
