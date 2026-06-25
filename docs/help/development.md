# Development

Guide for contributors and internal developers. Covers stack, workspace layout, build commands, verification gate, and code style.

## Stack

| Concern | Tool |
|---------|------|
| Runtime / package manager | Bun 1.3.14 |
| Language | TypeScript 5.x |
| CLI framework | Commander.js |
| Lint + format | Biome 2.4.16 |
| Test runner | `bun:test` |
| Format conversion | rulesync (npm) |
| Quality store | SQLite via `@gobing-ai/ts-db` |
| Constraint rules | Spur (`spur rule run`) |
| Git hooks | Lefthook |
| Conventional commits | cocogitto (`cog`) |
| Tool versions | proto (`.prototools`) |

## Workspace layout

```
apps/cli/           # Commander-based CLI entry (the binary); imports @gobing-ai/superskill-core
packages/core/      # reusable domain logic and no-app operation APIs
tooling/typescript/ # shared tsconfig presets
plugins/cc/         # bundled Claude Code plugin
skills/             # top-level skill directories (distribution artifacts)
vendors/            # reference-only copies of upstream agent source code
turbo.json          # Turborepo task graph
```

Workspaces reference each other by the project scope (`@gobing-ai/*`), set during `bun run setup` from the root `package.json` name.

### Key boundaries

- **`apps/cli`** — the binary. Commander command registration, CLI-specific handlers, templates, rubrics. Imports `@gobing-ai/superskill-core`.
- **`packages/core`** — reusable domain logic. Content parsing, quality heuristics, pipeline transforms, marketplace resolution, rulesync wrapper. Never imports from `apps/cli`, never calls `process.exit`, never writes to stdout/stderr.
- **`vendors/`** — reference-only copies of upstream agent source code. **Never modify** files there.
- **`plugins/cc/`** — the bundled Claude Code plugin that demonstrates the full authoring lifecycle.

## Build commands

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

CLI binary: `apps/cli` exposes `bin: { superskill: "./dist/index.js" }`. After `bun run build`, the bundled binary lives at `apps/cli/dist/index.js`.

## Verification gate

All must pass before a change is considered done:

1. `bun run lint` — Biome and `turbo run typecheck` clean.
2. `bun run test` — all tests pass, no `.skip` or commented-out tests. Coverage ≥ 90% lines + functions.
3. `bun run build` — standalone binary compiles across all workspaces that declare a `build` script.
4. `git status` — only intentional changes.
5. `bun run spur-check` — pre-check rules (22) + post-check rules (coverage-gate + tsdoc-export) all green.

## Code style

Enforced by [biome.json](../../biome.json): 4-space indent, 120-char width, single quotes, semicolons, trailing commas. `interface` for object shapes, `type` for unions. `any` is an error (`noExplicitAny`) — narrow the type, or justify with `// biome-ignore` if unavoidable.

TS source imports use extensionless relative specifiers. Library builds patch emitted `dist/*.js` after `tsc`.

Cross-workspace imports use `@gobing-ai/<pkg>` (workspace aliases), never `../../../packages/...`.

## Testing

- Tests live in `tests/` next to the code (`<workspace>/tests/*.test.ts`), using `bun:test`.
- Coverage target is **line >= 90% and function >= 90% in aggregate** (`coverageThreshold` in `bunfig.toml`).
- Names describe behavior under a condition; assertions tie to the requirement, not the implementation.
- For CLI stdout assertions, spy on `process.stdout.write` (the CLI uses it directly so output is testable without log-format coupling).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) enforced by cocogitto: `feat:`, `fix:`, `docs:`, `chore:`, etc. Breaking changes go in a `BREAKING CHANGE:` footer.

## Documentation map

The project maintains authoritative docs in `docs/`. Each doc owns exactly one question:

| Doc | Owns | Authority |
|-----|------|-----------|
| [00_ADR](../00_ADR.md) | **WHY** — which cross-cutting decision was made | **Authoritative** (wins all) |
| [01_PRD](../01_PRD.md) | **WHAT** — product vision, users, scope | **Authoritative on scope** |
| [02_ROADMAP](../02_ROADMAP.md) | **WHEN** — phases, sequencing | Derived |
| [03_ARCHITECTURE](../03_ARCHITECTURE.md) | **HOW** — module boundaries, data flow, invariants | Derived (ADR wins) |
| [04_DESIGN](../04_DESIGN.md) | **SURFACE** — CLI commands, flags, schemas | Derived |
| [05_FEATURES](../05_FEATURES.md) | **STATUS** — feature decomposition + state | Derived |
| [99_PROJECT_CONSTITUTION](../99_PROJECT_CONSTITUTION.md) | **PROCESS** — how docs are maintained | **Authoritative on process** |

Read the governing doc before editing code; edit the **authoritative** doc for the topic, never patch a symptom in a derived one. Conflict rule: lower number wins.
