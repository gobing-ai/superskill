---
name: Make cc magent-evaluate ready to replace rd3 magent-evaluate
description: Make cc magent-evaluate ready to replace rd3 magent-evaluate
status: Backlog
created_at: 2026-06-21T18:17:40.675Z
updated_at: 2026-06-21T18:17:40.675Z
folder: docs/tasks
type: task
feature-id: ""
priority: high
tags: ["cc-magents","evaluate","dogfood","migration","rd3-parity","schema-bug","resolver-bug"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0050. Make cc magent-evaluate ready to replace rd3 magent-evaluate

### Background

Dogfood pair-run on target AGENTS.md: /cc:magent-evaluate scored 0.28 FAIL/Grade F while /rd3:magent-evaluate scored 99% Grade A. TWO P1 bugs found. (1) RESOLVER: 'magent evaluate AGENTS.md' (bare name) errors 'File not found' because resolveContentPath appends .md -> looks for AGENTS.md.md; only './AGENTS.md' (path form) resolves. (2) SCHEMA MISMATCH: the cc magent evaluator requires YAML frontmatter (completeness 0.00 'Frontmatter parse error: content must start with ---'), but main-agent configs AGENTS.md/CLAUDE.md/GEMINI.md are PLAIN MARKDOWN with NO frontmatter by design. cc penalizes them to 0.28; rd3 (dims coverage/scoping/safety/portability/evidence/maintainability) scores 99%. Magents are file-based (.md), so skill B1 dir fix does not apply, but the bare-name resolution bug is its own issue.


### Requirements

Fix (1) bare-name resolution so 'magent evaluate AGENTS.md' resolves the cwd file without appending .md, and (2) the schema model so frontmatter-less main-agent configs (AGENTS.md/CLAUDE.md/GEMINI.md) are scored on body content, not penalized for missing frontmatter. After fixes, AGENTS.md should score PASS comparable to rd3 99%. Apply D1 + --save description on the wrapper. Gates: bun run lint, bun run test (no skips, add regression tests), bun run build, git clean. Do NOT flip /magent-evaluate alias until both bugs fixed AND global binary ships.


### Q&A



### Design

Pair-run maturity assessment + fix plan for `/cc:magent-evaluate` → `/rd3:magent-evaluate`. Verified
2026-06-21. **Two P1 bugs**: a bare-name resolver bug and a frontmatter-assumption schema mismatch.

---

## Pair-run evidence (executed both, same target)

Target: `AGENTS.md` (a real main-agent config — plain markdown, NO YAML frontmatter, by design).

**cc bare name** (`magent evaluate AGENTS.md`): `Error: File not found: AGENTS.md` (BUG 1)
**cc path form** (`magent evaluate ./AGENTS.md`):
```
completeness       0.00  Frontmatter parse error: Missing frontmatter: content must start with ---
platform-coverage  0.00  0 platforms covered
conciseness        0.94  Body length: 8494 chars
tone-consistency   0.60  Mixed tone signals
safety             0.14  2 safety markers found
AGGREGATE          0.28   Verdict: FAIL  Grade: F
```

**rd3** (`bun <rd3-cache>/skills/cc-magents/scripts/evaluate.ts <abs-path> --scope full`):
```
score 99  grade A
coverage 100 · scoping 100 · safety 100 · portability 95 · evidence 100 · maintainability 95
findings: ["path-scoped rules detected", "source evidence available"]
```

**Read:** a valid main-agent config scores 0.28 FAIL on cc vs 99% A on rd3. cc is wrong on two axes:
it can't even resolve the bare filename, and once resolved it penalizes the config for not having
frontmatter that this format legitimately omits.

---

## Root causes (both verified against source)

### BUG 1 — bare-name resolution appends `.md`
`packages/core/src/content/identity.ts:64`: `const direct = join(base, '${name}.md');`. For a bare name
`AGENTS.md` (no `/`), the resolver builds `AGENTS.md.md`, which doesn't exist, then tries `magents/AGENTS.md.md`,
then returns null → "File not found". Only the path form `./AGENTS.md` (has `/`) hits the early
`existsSync(name)` branch and resolves. A bare filename that exists in cwd should resolve.

### BUG 2 — frontmatter assumed; plain-markdown magents penalized
- `packages/core/src/quality/magent.ts:86` `parseFrontmatterSafe(content)` returns `null` for AGENTS.md
  (no `---`), so `data = {}`.
- `:92` `scoreCompleteness(body)` greps `MAGENT_SECTIONS` headings → found 0 → score 0.00 (AGENTS.md uses
  different heading structure than the hardcoded section list).
- `:93` `scorePlatformCoverage(data)` with `data = {}` → 0.00 ("0 platforms covered") — platforms can only
  come from frontmatter `data.platforms`, which a plain-markdown magent never has.
- `:100-105` the frontmatter parse-error note OVERWRITES `completeness`'s note, producing the misleading
  "Frontmatter parse error" message even though the real 0.00 came from section-matching.

**Net:** the magent model assumes a frontmatter-carrying config. Real main-agent configs (AGENTS.md,
CLAUDE.md, GEMINI.md) are plain markdown. Two of five dimensions are structurally guaranteed to be ~0.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Engine | `skills/cc-magents/scripts/evaluate.ts` | `superskill magent evaluate` → `packages/core/src/quality/magent.ts` |
| Dims | coverage, scoping, safety, portability, evidence, maintainability (weighted /100) | completeness, platform-coverage, conciseness, tone-consistency, safety |
| Input | file `.md` (incl. AGENTS.md/CLAUDE.md, frontmatter-optional) | file `.md` but resolver + scorer assume frontmatter |

Canonical files:
- Resolver: `packages/core/src/content/identity.ts:47-74`
- Scorer: `packages/core/src/quality/magent.ts`
- Rubric: `packages/core/src/rubrics/magent.yaml` (completeness, platform-coverage, conciseness, tone-consistency, safety)
- Registry: `packages/core/src/quality/types.ts` (`DIMENSION_REGISTRY.magent`, `REQUIRED_FIELDS.magent=['name','description']`)
- Command wrapper: `plugins/cc/commands/magent-evaluate.md`

---

## Work Items

### M1 [BLOCKER/P1] — Bare-name resolution should not append `.md` to a name already ending `.md`

**File:** `packages/core/src/content/identity.ts:resolveContentPath`.

**Fix:** before the `${name}.md` join, if `name` ends in `.md` (or another known content extension), check
`existsSync(join(base, name))` directly first. More robust: also check `existsSync(join(base, name))`
(no extension append) for bare names, so `AGENTS.md` / `CLAUDE.md` in cwd resolve. Keep the existing
`${name}.md` fallback for extension-less names (e.g. `magent evaluate my-config`).
```ts
// after `if (name.includes('/') ...)` block, before the `.md`-append:
const asIs = join(base, name);
if (existsSync(asIs) && statSync(asIs).isFile()) return asIs;
```

**Acceptance:** `magent evaluate AGENTS.md` (bare) resolves the cwd file; no "File not found".
**Scope note:** this resolver is shared by all types. Adding a "name as-is" check is safe (it only adds a
resolution candidate); verify no test asserts that a bare existing filename should FAIL to resolve.

### M2 [BLOCKER/P1] — Score frontmatter-less main-agent configs on body content, not missing frontmatter

**File:** `packages/core/src/quality/magent.ts`.

**Fix:**
- Do NOT treat absent frontmatter as a parse error for magents. A magent with no `---` is VALID
  (AGENTS.md/CLAUDE.md). Distinguish "no frontmatter" (valid, score body) from "malformed frontmatter"
  (a real error). `parseFrontmatterSafe` returns null for both — separate the cases (e.g. check whether
  content starts with `---` at all; if not, it's frontmatter-less and valid).
- `scoreCompleteness`: the `MAGENT_SECTIONS` heading list must match real main-agent config structure
  (verify against AGENTS.md/CLAUDE.md headings). rd3 found 100% coverage — align the section detection so
  a real config isn't 0/N. Consider scoring on presence of key governance sections (rules, safety,
  conventions, tooling) using flexible matching, not exact heading strings.
- `scorePlatformCoverage`: platforms may be declared in frontmatter `data.platforms` OR inferred from the
  body (a magent that documents claude-code/codex/gemini). For frontmatter-less configs, fall back to body
  keyword detection rather than hard 0.
- Remove/relax the `fmNote` overwrite so a frontmatter-less magent does not show "Frontmatter parse error".

**Acceptance:** `magent evaluate ./AGENTS.md` → completeness > 0 (real sections detected), platform-coverage
reflects body content, no "Frontmatter parse error", overall PASS comparable to rd3 99%.

### M3 [MAJOR] — Align `magent.yaml` rubric + `REQUIRED_FIELDS.magent`

**Files:** `packages/core/src/rubrics/magent.yaml`, `packages/core/src/quality/types.ts:77`.

**Fix:**
- `REQUIRED_FIELDS.magent = ['name','description']` is wrong for plain-markdown magents (no frontmatter).
  Either drop the requirement for magents or make completeness body-section-based (M2 already does this for
  the scorer; ensure the rubric criterion text and any validate path agree).
- Update `magent.yaml` criterion text to describe frontmatter-OPTIONAL main-agent configs.

**Acceptance:** rubric + required-fields reflect frontmatter-optional magents; validate does not flag a
valid frontmatter-less AGENTS.md.

### M4 [MAJOR] — Command wrapper: D1 flag boundary + --save description

**File:** `plugins/cc/commands/magent-evaluate.md` (current: `argument-hint` line 3 has `--json`; `--save`
line 24 says "to file"; examples use `./CLAUDE.md --json --save`).

**Fix:** remove `--json` (D1); fix `--save` → "evaluation store"; update examples to drop `--json`; keep
`config-path | Path to the main-agent config (.md)` (file-based). Sync `argument-hint`.

**Acceptance:** wrapper has no `--json`; `--save` describes the store; examples updated.

### M5 [MINOR] — Emit dimension findings/recommendations for magents

**File:** `packages/core/src/quality/magent.ts`. Like the skill scorer (0047), emit actionable findings
(rd3 surfaces "path-scoped rules detected", "source evidence available"). Additive/optional.

---

## Regression tests (REQUIRED)

In `packages/core/tests/`:
- `resolveContentPath('magent', 'AGENTS.md')` with cwd containing AGENTS.md → resolves (M1).
- A frontmatter-less magent (plain markdown with governance sections) scores completeness > 0,
  no "Frontmatter parse error", overall PASS (M2).
- A magent WITH frontmatter still scores correctly (no regression).
- A magent with MALFORMED frontmatter (`---` opener, no closer) still flags an error (don't mask real errors).

---

## Policy decisions (inherited from 0047)

- **D1** `--json` CLI-only. **D2** rubric centralized in `magent.yaml`. **D3** enrich in code, no template engine.
- **Shared P1 (deployment):** global `superskill` stale (0.1.7); do not flip alias until binary ships.

## Do-not-drift guardrails

- Magents are frontmatter-OPTIONAL. Do NOT require frontmatter; AGENTS.md/CLAUDE.md/GEMINI.md are valid plain markdown.
- M1 resolver change adds a candidate; do not remove the existing `${name}.md` fallback (extension-less names rely on it).
- Distinguish "no frontmatter" (valid) from "malformed frontmatter" (error) — don't mask the latter.
- Additive type changes; no per-skill scripts; no 10-dim model. Coordinate alias flip with the 0047 release.


### Solution



### Plan

Two P1 bugs (resolver + frontmatter assumption). Fix both, then parity polish.

### Phase 1 — Fix the two P1 bugs (blockers)
1. **M1 bare-name resolution** (`packages/core/src/content/identity.ts`): add a "name as-is" file check
   before the `${name}.md` append so `AGENTS.md`/`CLAUDE.md` in cwd resolve. Keep the `.md` fallback for
   extension-less names. Regression test: `resolveContentPath('magent','AGENTS.md')` resolves.
2. **M2 frontmatter-less scoring** (`packages/core/src/quality/magent.ts`): distinguish "no frontmatter"
   (valid) from "malformed" (error); make `scoreCompleteness` detect real main-agent sections (verify vs
   AGENTS.md/CLAUDE.md); body-fallback for `scorePlatformCoverage`; remove misleading fmNote overwrite.
   Regression tests: frontmatter-less PASS; with-frontmatter no regression; malformed still errors.
3. **M3 rubric + required-fields** (`magent.yaml`, `types.ts:77`): make magent frontmatter-optional; align
   criterion text.

### Phase 2 — Wrapper + findings
4. **M4 command wrapper** (`plugins/cc/commands/magent-evaluate.md`): remove `--json` (D1); fix `--save`;
   update examples; keep ".md config" arg.
5. **M5 dimension findings** (`magent.ts`): emit findings/recommendations. Additive.

### Verification gate
- `bun run lint` clean; `bun run test` pass (no skips); `bun run build` PASS; `git status` clean.
- Functional: `bun apps/cli/src/index.ts magent evaluate AGENTS.md` (BARE) → resolves + PASS,
  completeness > 0, no "Frontmatter parse error", aggregate comparable to rd3 99%.
- Also test `./CLAUDE.md` and a frontmatter-carrying magent (no regression).
- Atomic commits: `fix(core): resolve bare existing filenames without .md append`,
  `fix(quality): score frontmatter-optional main-agent configs`, `fix(cc-commands): align magent-evaluate wrapper`.

### Do-not-drift
- Frontmatter-OPTIONAL magents. Resolver: add candidate, keep fallback. Distinguish no-fm vs malformed-fm.
- Additive type changes; no per-skill scripts; no 10-dim model. Coordinate alias flip with the 0047 release.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


