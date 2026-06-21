---
name: Make cc hook-evaluate ready (no rd3 equivalent exists)
description: Make cc hook-evaluate ready (no rd3 equivalent exists)
status: Backlog
created_at: 2026-06-21T18:20:51.691Z
updated_at: 2026-06-21T18:20:51.691Z
folder: docs/tasks
type: task
feature-id: ""
priority: medium
tags: ["cc-hooks","evaluate","dogfood","design-decision","schema-bug","missing-command"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0051. Make cc hook-evaluate ready (no rd3 equivalent exists)

### Background

Dogfood pair-run goal was /cc:hook-evaluate vs /rd3:hook-evaluate, but NEITHER EXISTS as a slash command. Findings: (1) cc has NO hook commands at all in plugins/cc/commands/ (only agent/command/magent evaluate wrappers). (2) rd3 has hook-emit/hook-list/hook-setup/hook-validate but NO hook-evaluate. (3) The cc CLI DOES expose 'superskill hook evaluate' (engine exists: packages/core/src/quality/hook.ts, 4 dims correctness/event-coverage/safety/pattern-match-quality), but it expects an .md file with name/description/event frontmatter. (4) REAL hooks are hooks.json (event->matcher->command structure), NOT .md definitions. Running 'hook evaluate plugins/cc/hooks/hooks.json' scores 0.03 ('Frontmatter parse error: content must start with ---') because it reads JSON as markdown. CONCLUSION: this is not a replacement task — it is a design+build task to decide whether/how to evaluate hooks at all, given the hooks.json reality.


### Requirements

Decide the hook-evaluation strategy (DESIGN DECISION REQUIRED, see Q&A), then either (a) make 'superskill hook evaluate' accept hooks.json and score the real structure, and create a /cc:hook-evaluate wrapper, or (b) explicitly de-scope hook evaluation and document why. Whichever path: no false 0.03 scores on real hooks; align hook.ts + hook.yaml + REQUIRED_FIELDS.hook with the chosen input format. Gates: bun run lint, bun run test (no skips), bun run build, git clean. This task is LOWER priority than 0048-0050 (no user-facing command exists to break).


### Q&A

**DESIGN DECISION REQUIRED before implementation** — what should `hook evaluate` consume, and should a
`/cc:hook-evaluate` slash command exist at all?

**Context:** real hooks are `hooks.json` (event→matcher→command), but the cc hook evaluator
(`packages/core/src/quality/hook.ts`) expects an `.md` file with `name`/`description`/`event` frontmatter.
There is no `.md` hook artifact in the codebase. rd3 never had hook-evaluate either.

**Option A (recommended) — Evaluate `hooks.json` directly.**
Make `superskill hook evaluate` accept a `hooks.json`, parse the event/matcher/command structure, and score
on real signals: event coverage (which lifecycle events are hooked), matcher correctness, command safety
(no `rm -rf`, pipe-to-shell, `--no-verify`), timeout presence, `${CLAUDE_PLUGIN_ROOT}` portability. Create
a thin `/cc:hook-evaluate` wrapper. Pro: evaluates the artifact users actually ship. Con: most engine
rework; hook scorer must read JSON, not markdown.

**Option B — Keep `.md` hook definitions as the eval input.**
Treat hooks as `.md` definitions (name/description/event frontmatter) that GENERATE `hooks.json`. Evaluate
the `.md`; document that `hooks.json` is a build artifact. Pro: minimal engine change, fits the existing
5-dim model. Con: no such `.md` files exist today; would require authoring hook definitions and a
generation step — large new surface, and diverges from how Claude Code actually consumes hooks.

**Option C — De-scope hook evaluation.**
Remove `superskill hook evaluate` (or mark experimental), do NOT create a slash command, and rely on
`hook validate` (schema check) only. Pro: honest — hooks are config, not prose; evaluation may add little.
Con: loses quality signal; inconsistent with the other 4 types having evaluate.

**Recommendation:** Option A. It evaluates the real artifact and gives the safety scan genuine value
(hooks run arbitrary commands — a security-focused evaluate is worth more here than for any other type).
Operator to confirm A/B/C before implementation.


### Design

Pair-run maturity assessment for `/cc:hook-evaluate` → `/rd3:hook-evaluate`. Verified 2026-06-21.
**This is not a like-for-like replacement** — neither slash command exists, and the cc hook engine
evaluates a format that doesn't match real hooks. Implementation is gated on the Q&A design decision.

---

## Pair-run evidence (attempted both)

- `/cc:hook-evaluate` — **does not exist.** No hook commands in `plugins/cc/commands/` at all
  (only agent-evaluate, command-evaluate, magent-evaluate).
- `/rd3:hook-evaluate` — **does not exist.** rd3 has `hook-emit`, `hook-list`, `hook-setup`,
  `hook-validate` only. No evaluate, no `evaluate.ts` in `skills/cc-hooks/scripts/`.
- `superskill hook evaluate plugins/cc/hooks/hooks.json` (the CLI engine DOES exist):
  ```
  correctness            0.10  Frontmatter parse error: content must start with ---
  event-coverage         0.00  Frontmatter parse error: content must start with ---
  safety                 0.00  Frontmatter parse error: content must start with ---
  pattern-match-quality  0.00  Frontmatter parse error: content must start with ---
  AGGREGATE              0.03
  ```
  → reads JSON as markdown, finds no `---`, scores 0.03. Meaningless.

**Read:** there is no command to replace and no valid evaluation path for real hooks. The cc engine
(`hook.ts`, 4 dims) assumes an `.md` definition with `name/description/event` frontmatter that doesn't
exist in practice.

---

## Reality of hooks (verified)

`plugins/cc/hooks/hooks.json`:
```json
{ "hooks": { "Stop": [ { "matcher": "*", "hooks": [
  { "type": "command", "command": "bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts", "timeout": 10 }
] } ] } }
```
Hooks are event→matcher→command config. The meaningful quality signals are: which lifecycle events are
covered, matcher correctness, command SAFETY (these run arbitrary shell), timeout presence, and path
portability (`${CLAUDE_PLUGIN_ROOT}`). None of these are markdown-frontmatter signals.

---

## Architecture context

| | rd3 | cc |
|--|-----|-----|
| Command | none (emit/list/setup/validate only) | none |
| Engine | `validate-hook-schema.sh` (schema only, no scoring) | `superskill hook evaluate` → `packages/core/src/quality/hook.ts` (4 dims, .md-frontmatter model) |
| Rubric | n/a | `packages/core/src/rubrics/hook.yaml` (correctness, event-coverage, safety, pattern-match-quality) |
| Input | `hooks.json` (validate) | expects `.md` w/ `name/description/event` (mismatch) |

Canonical files:
- Scorer: `packages/core/src/quality/hook.ts`
- Rubric: `packages/core/src/rubrics/hook.yaml`
- Registry: `packages/core/src/quality/types.ts` (`DIMENSION_REGISTRY.hook`, `REQUIRED_FIELDS.hook=['name','description','event']`)
- Real hook artifact: `plugins/cc/hooks/hooks.json`
- Command wrapper: DOES NOT EXIST — would be new `plugins/cc/commands/hook-evaluate.md`

---

## Work Items (assume Option A from Q&A; adjust if B/C chosen)

### H0 [GATE] — Resolve the Q&A design decision (A/B/C) before any code
Do not implement until the operator confirms. The work items below assume **Option A** (evaluate
`hooks.json` directly). If B → author `.md` hook definitions + generation; if C → de-scope and stop.

### H1 [BLOCKER/P1] — `hook evaluate` must accept and parse `hooks.json`

**File:** `packages/core/src/quality/hook.ts` + the evaluate dispatch.

**Fix:** detect JSON input (extension `.json` or content starts with `{`); parse the hooks structure
instead of `parseFrontmatterSafe`. Build an internal model: list of `{event, matcher, command, timeout}`.
Do not run the markdown-frontmatter path on JSON.

**Acceptance:** `hook evaluate plugins/cc/hooks/hooks.json` parses without "Frontmatter parse error".

### H2 [BLOCKER/P1] — Re-define the 4 dimensions for the `hooks.json` structure

**File:** `packages/core/src/quality/hook.ts`, `packages/core/src/rubrics/hook.yaml`.

**Fix (map dims to real signals):**
- **event-coverage:** which lifecycle events are hooked (PreToolUse/PostToolUse/Stop/etc.) vs the known set
  in `hook.ts:6` (canonical event names). Score breadth/appropriateness.
- **safety:** scan each `command` string for dangerous patterns (`rm -rf`, `curl|sh`, `--no-verify`,
  `eval`, unquoted interpolation). This is the HIGH-VALUE dimension — hooks run arbitrary shell.
- **correctness:** matcher validity (valid glob/regex), `type: command` present, command non-empty.
- **pattern-match-quality:** matcher specificity (overly-broad `*` on destructive events) + timeout
  presence + `${CLAUDE_PLUGIN_ROOT}` portability (no absolute/user-specific paths).

**Acceptance:** `hooks.json` scores on real structure; the anti-hallucination Stop hook scores reasonably
(safe command, has timeout, portable path).

### H3 [MAJOR] — Fix `REQUIRED_FIELDS.hook` + rubric criteria for JSON

**File:** `packages/core/src/quality/types.ts:76`, `hook.yaml`.

**Fix:** `REQUIRED_FIELDS.hook = ['name','description','event']` is markdown-frontmatter thinking. For
`hooks.json`, "required" means: at least one event, each entry has a `command`. Re-express. Align
`hook.yaml` criterion text to the JSON structure.

**Acceptance:** required-fields + rubric describe the JSON shape; validate agrees.

### H4 [MAJOR] — Create the `/cc:hook-evaluate` slash command (new)

**File:** new `plugins/cc/commands/hook-evaluate.md`.

**Fix:** thin wrapper mirroring the other evaluate commands but file-arg = `hooks.json` path; apply D1
from the start (NO `--json` on the command; keep `--save`, `--target`). Delegate to `cc:cc-hooks` skill /
`superskill hook evaluate`.

**Acceptance:** `/cc:hook-evaluate plugins/cc/hooks/hooks.json` runs and prints a verdict.

### H5 [MINOR] — Findings/recommendations + verdict

The shared `evaluate.ts` already adds verdict/grade/findings (task 0047). Ensure the hook scorer emits
per-dimension findings (esp. safety: name the dangerous pattern + line). Additive.

---

## Regression tests (REQUIRED)

In `packages/core/tests/quality/`:
- A valid `hooks.json` (event + command + timeout + portable path) scores PASS, no "Frontmatter parse error".
- A `hooks.json` with a dangerous command (`rm -rf`) scores low safety with a finding naming the pattern.
- A `hooks.json` missing timeout / using an absolute path → pattern-match-quality penalized.

---

## Policy decisions (inherited from 0047)

- **D1** `--json` CLI-only (apply from the start to the NEW command). **D2** rubric centralized in `hook.yaml`.
  **D3** enrich in code, no template engine.
- **Shared P1 (deployment):** global `superskill` stale; the new command calls it — coordinate with the release.

## Do-not-drift guardrails

- Real hooks are `hooks.json`, NOT `.md`. Do not build the eval around a markdown definition unless Option B
  is explicitly chosen in the Q&A.
- safety is the highest-value hook dimension — do not water it down; hooks execute arbitrary commands.
- This task is GATED on H0 (the design decision). Do not implement before the operator confirms A/B/C.
- Lower priority than 0048-0050 (no user-facing command exists to break today).
- Additive type changes; no per-skill scripts; no 10-dim model.


### Solution



### Plan

GATED on the Q&A design decision (Option A/B/C). Plan below assumes Option A (evaluate hooks.json directly).
Lower priority than 0048-0050 — no user-facing hook command exists today, so nothing is broken for users.

### Phase 0 — Decision gate
0. **H0:** operator confirms A (evaluate hooks.json) / B (.md definitions) / C (de-scope). STOP until confirmed.

### Phase 1 — (Option A) Make the engine evaluate hooks.json
1. **H1 JSON input** (`packages/core/src/quality/hook.ts` + evaluate dispatch): detect `.json`/`{`; parse
   event→matcher→command model; skip the markdown-frontmatter path.
2. **H2 redefine dims** (`hook.ts`, `hook.yaml`): event-coverage (lifecycle breadth), safety (dangerous-command
   scan — highest value), correctness (matcher/command validity), pattern-match-quality (specificity +
   timeout + `${CLAUDE_PLUGIN_ROOT}` portability).
3. **H3 required-fields + rubric** (`types.ts:76`, `hook.yaml`): re-express for JSON (≥1 event; each entry
   has a command). Align criterion text.
4. **Regression tests** (`packages/core/tests/quality/`): valid hooks.json PASS; dangerous command → low
   safety + finding; missing timeout / absolute path → pattern-match-quality penalized.

### Phase 2 — Surface
5. **H4 new command** (`plugins/cc/commands/hook-evaluate.md`): thin wrapper, file-arg = hooks.json,
   D1 applied from the start (no `--json`; keep `--save`/`--target`).
6. **H5 findings + verdict**: hook scorer emits per-dimension findings (safety names the pattern). Additive.

### Verification gate
- `bun run lint` clean; `bun run test` pass (no skips); `bun run build` PASS; `git status` clean.
- Functional: `bun apps/cli/src/index.ts hook evaluate plugins/cc/hooks/hooks.json` → parses, scores on real
  structure, PASS for the safe anti-hallucination Stop hook; no "Frontmatter parse error".
- Atomic commits: `feat(quality): evaluate hooks.json structure`, `feat(cc-commands): add hook-evaluate command`.

### Do-not-drift
- hooks.json is the real artifact (Option A). safety dimension stays strict (hooks run arbitrary shell).
- Gated on H0; do not implement before the A/B/C decision. Additive type changes; no per-skill scripts; no 10-dim model.


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


