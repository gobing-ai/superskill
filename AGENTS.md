# AGENTS.md

Guidance for AI coding agents working in this repository. `CLAUDE.md` and `GEMINI.md` symlink here.

## OpenWolf
@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.

## Project

Bun + TypeScript + Biome CLI built on Commander, with shared workspace packages. Turborepo + Bun-workspaces layout:

```
apps/
  cli/          # Commander-based CLI entry (the binary); imports @gobing-ai/superskill-core
packages/
  core/         # reusable domain logic and no-app operation APIs
plugins/
  cc/           # bundled Claude Code plugin (skills, commands, agents, hooks, scripts)
skills/         # top-level skill directories (distribution artifacts)
tooling/
  typescript/   # shared tsconfig presets
vendors/        # reference-only copies of upstream agent source code
turbo.json      # Turborepo task graph
```

Workspaces reference each other by the project scope (`@<scope>/*`), set during `bun run setup` from the root `package.json` name.

- **Runtime / package manager / test runner:** Bun `1.3.14`. Prefer `bun:*` APIs over `node:*` unless Bun lacks the API.
- **Lint + format:** Biome `2.4.16`. No ESLint, no Prettier.
- **Build orchestration:** Turborepo `^2.9`.
- **Tool versions:** pinned in `.prototools` via [proto](https://moonrepo.dev/proto). Run `proto use` to install.
- **Git hooks:** Lefthook. **Conventional commits:** cocogitto (`cog`).

Never introduce a new runtime, package manager, linter, or formatter.

## Documentation map

Each doc owns exactly **one question** about the system and is the single source of truth for it.
A fact lives in **one** doc; other docs link to it, never restate it. Read the doc that governs
your change before editing code; edit the **authoritative** doc for the topic, never patch a
symptom in a derived one.

**Conflict rule:** lower number wins. `00_ADR` is binding and overrides all others on *decisions*;
`01_PRD` is authoritative on *scope*. On conflict, fix the authoritative doc and flag the drift.
`docs/99_PROJECT_CONSTITUTION.md` is authoritative on *process* — how these files are
maintained (edit rules, sync triggers, drift audits, writing rules). It holds no project content,
so the two axes never collide. Read it before editing any doc below. Each numbered doc carries
its contract as YAML frontmatter (constitution §4.3).

| Doc | Owns the question | Authority | Read / edit when |
|-----|-------------------|-----------|------------------|
| `docs/00_ADR.md` | **WHY** — which cross-cutting decision was made, and the one-line reason | **Authoritative** (wins all) | Read before any structural change; add a dated entry before diverging from a decision |
| `docs/01_PRD.md` | **WHAT** — product vision, users, scope (in / out / deferred) | **Authoritative on scope** | Read before adding a command/feature; edit when scope changes |
| `docs/02_ROADMAP.md` | **WHEN** — phases, current vs deferred, sequencing | Derived | Read to place work in a phase; edit when phase status changes |
| `docs/03_ARCHITECTURE.md` | **HOW** — module boundaries, data flow, runtime model, invariants, the *rationale* behind a decision | Derived (ADR wins) | Read before cross-module/seam/schema work; edit when boundaries or mechanisms change |
| `docs/04_DESIGN.md` | **SURFACE** — concrete shapes: every CLI command, flag, config key, env var, table, DTO | Derived | Read/edit when changing a command, flag, env var, or schema |
| `docs/05_FEATURES.md` | **STATUS** — feature decomposition + state (✅ done / 🔶 partial / ⏳ planned / 💤 deferred) | Derived | Read to find a feature's state; edit when a feature's status changes |
| `docs/99_PROJECT_CONSTITUTION.md` | **PROCESS** — how the files above are maintained: edit rules, same-commit sync triggers, drift audits, lessons | **Authoritative on process** | Read before editing any doc above; lessons machine-appendable per its §8 |
| `AGENTS.md` (this file) | **ENTRY** — stack, commands, gates, conventions + this doc map | Derived (from 99 + 00/01/04) | Read first every session; factual blocks regenerated from code, never from memory |

**Routing — put each fact in its owning doc, link from the rest:**

- Decision + one-line reason → `00`. Rationale/consequences in depth → `03`.
- Scope (in/out/deferred) → `01`. Mechanism / data flow / invariants → `03`.
- Command/flag/config/schema/DTO shapes → `04`. Phase timing → `02`. Feature status → `05`.
- If you're writing *how it's built* or *why* inside `00`/`01`/`02`, it belongs in `03`/`04`.

A code change that contradicts `00_ADR.md` requires adding a new dated ADR entry that supersedes the
old one **first** — never silently diverge. Any new cross-cutting choice (new app/package, transport
swap, auth boundary, DB swap) gets a new ADR entry pointing to its `03`/`04` detail. A change that
touches a command/config/schema keeps `04_DESIGN.md` in sync in the **same commit**.

## Code style (enforced by `biome.json`)

- 4-space indent, `lineWidth` 120.
- **Single quotes**, semicolons always, trailing commas everywhere.
- `interface` for object shapes, `type` for unions/intersections.
- Imports/exports are auto-sorted by Biome — don't hand-order them.
- `any` is an **error** (`noExplicitAny`). Narrow the type; if unavoidable, justify with `// biome-ignore`.
- TS source imports use extensionless relative specifiers. Library builds patch emitted `dist/*.js` after `tsc`.
```bash
bun run lint       # biome check + typecheck  (the gate)
bun run format     # biome check --write       (autofix)
bun run autofix    # format then typecheck
bun run test       # bun test with coverage
bun run test:full  # bun test with lcov coverage + snapshots
bun run build      # compile to standalone binary
bun run dev        # watch mode (runs CLI from source)
bun run check      # lint + test (CI gate)
bun run spur-check # lint + pre-check rules + test + post-check rules
```

CLI binary: `apps/cli` exposes `bin: { cli: "./src/index.ts" }`. The `.ts` entry runs only under Bun — plain `node` cannot resolve it. After `bun run build`, the bundled binary lives at `apps/cli/dist/index.js`; if you intend to ship the CLI for Node consumers, repoint `bin` to `./dist/index.js` and run `bun run build` before publishing.

## Verification gate (all must pass before "done")

1. `bun run lint` clean — Biome and `turbo run typecheck`.
2. `bun run test` passes; no test skipped, `.skip`'d, or commented out to go green.
3. `bun run build` succeeds across all workspaces that declare a `build` script.
4. `git status` shows only intentional changes.
5. `bun run spur-check` — pre-check rules (22) + post-check rules (coverage-gate + tsdoc-export) all green.

## Testing

- Tests live in `tests/` next to the code (`<workspace>/tests/*.test.ts`), using `bun:test`.
- Coverage target is **line >= 90% and function >= 90% in aggregate** (`coverageThreshold` in `bunfig.toml`).
- Names describe behavior under a condition; assertions tie to the requirement, not the implementation.
- For CLI stdout assertions, spy on `process.stdout.write` (the CLI uses it directly so output is testable without log-format coupling).
- **Residual-proof negatives for heuristic/regex gates.** A negative fixture that claims "this rule does not fire on shape X" must carry every trigger half the production rule could fire on for the scenario under test, and still assert "does not fire." A negative that omits a half only locks the *bare-half baseline* — it cannot certify a compound residual is gone.
- Worked example (anti-hallucination `requiresExternalVerification`, keyword ∧ coupler gate): a coupler-free `"Added a helper function"` is a baseline bare-vocab regression (proves `function` alone does not fire); `"The function returns early when the list is empty."` is residual-proof (weak-name + `returns` coupler, still `false` after dropping `function`/`method` from the weak set). Intentional external positives (`api`/`library`/`endpoint` + coupler → `true`) stay asserting `true`.
- Label fixtures honestly: a `describe`/`it` name or comment must state whether it is a baseline (bare-half) or residual-proof (compound-carrying) negative. A structurally-powerless negative certified as "compound residual fixed" is a false green and will miss the next residual of the same class.

## Architecture decision record (binding)

`docs/00_ADR.md` is the **authoritative architecture decision record** for this project. It captures the decisions that define the CLI's shape — the Turborepo + Bun-workspaces layout, the `apps/cli` ⁄ `packages/*` split, Commander as the CLI framework, the `@<scope>/*` workspace-alias boundary, and `process.stdout.write` for testable output. Treat it as a constraint, not a suggestion:

- Read it before any non-trivial change to the workspace graph, the CLI command surface, or cross-package boundaries.
- Changes that contradict a recorded decision require updating the ADR first (add a new dated entry that supersedes the old one) — never silently diverge.
- New cross-cutting architectural choices (a new workspace package, a different CLI framework, a build/publish change) get a new ADR entry in the same file.

## Conventions & boundaries

- Conventional Commits required (`feat:`, `fix:`, `docs:`, `chore:`, ...). Breaking changes go in a `BREAKING CHANGE:` footer.
- Cross-workspace imports use `@<scope>/<pkg>` (workspace aliases), never `../../../packages/...`. One blessed exception (ADR-022): `apps/cli`'s hook dispatcher deep-imports the cc plugin's guard engine from `plugins/cc/scripts/` — plugin-owned code with the CLI as a second compile-time consumer.
- `vendors/` is reference-only — **never modify** files there.
- Never commit secrets, `.env*`, or credentials. Never edit `.github/workflows/` without approval.
- Surgical changes only: touch what the task needs; no drive-by refactors, no speculative abstractions, no comments that restate what the code already says.
