---
name: hermes
description: Harness-aware main agent for Hermes (spur + superskill first)
platforms: [claude-code, codex, pi, omp, openclaw, hermes, grok, opencode]
---

# hermes

Harness-aware main agent for **Hermes**. Prefer spur + superskill when present; fall back to native tools only for operations the harness does not cover.

## Project

TypeScript monorepo on Bun: Biome lint/format, Commander CLI, Turborepo builds, `@scope/` workspace aliases. Key files: `package.json`, `tsconfig.json`, `biome.json`, `turbo.json`.

## Commands

```bash
bun run lint       # Biome check + typecheck
bun run format     # biome check --write
bun run test       # tests with coverage
bun run build      # compile workspaces / CLI binary
bun run spur-check # lint + spur rules + test (when present)
```

## Harness & Infrastructure

When `spur` and `superskill` resolve on `PATH`, use them **first**:

| Work | Use this first | Fallback |
| --- | --- | --- |
| Track work | `spur task create` / `update` / `check` | Ad-hoc TODO.md (avoid) |
| Features | `spur feature create` / `advance` | Manual headings |
| Constraints | `spur rule run` | Ad-hoc lint scripts |
| Pipelines | `spur workflow run` | Hand-rolled prompts |
| Main-agent lifecycle | `superskill magent scaffold|validate|evaluate|refine|evolve` | Hand-author AGENTS.md |
| Skills / agents / commands / hooks | `superskill skill|agent|command|hook` | Hand-author files |
| Multi-target install | `superskill install <plugin> --targets ...` | Per-platform setup |

Canonical patterns:

```bash
spur task create "Implement auth" && spur task update 0082 wip
spur task update 0082 --section Solution --from-file /tmp/solution.md
spur task check 0082
superskill magent scaffold general-agent --output AGENTS.md
superskill magent validate AGENTS.md && superskill magent evaluate AGENTS.md
superskill install cc --targets codex,opencode,pi
```

**Single source of truth:** task state in `docs/tasks/` via `spur task` only — never edit task files with Write/Edit.

## Tool Discipline

Prefer specialized tools over shell. On **Hermes**: `terminal`, `execute_code`, `background`, `busy`, `web_search` — run harness via `terminal`

| Need | Prefer | Avoid |
| --- | --- | --- |
| Read / search / edit files | Platform file tools | `cat`, `sed`, bare `find` |
| Task / feature files | `spur task` / `spur feature` | Write into `docs/tasks/` |
| Structural code search | `ast_grep` / LSP when available | Text regex for syntax shape |
| Docs / recent facts | `ref` / web fetch → web search → memory (LOW) | Uncited recall |
| Parallel independent work | Native subagent tool if any | Serial only when dependent |

## Verification

1. `bun run lint` clean (no new suppressions)
2. `bun run test` — no skipped / `.skip` / `xfail` tests
3. `bun run build` succeeds
4. `bun run spur-check` when present
5. `git status` shows only intentional changes

Never bypass with `--no-verify` or `--force`. Evidence before assertions. Confidence: **HIGH** (verified docs today), **MEDIUM** (may be stale), **LOW** (memory only — flag). Fail loud: never claim done if work was skipped.

## Conventions

Match existing style. Surgical changes only. Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Cross-package imports use workspace aliases. No drive-by refactors.

## Safety

[CRITICAL] Never hardcode secrets or commit `.env*`.
[CRITICAL] No force-push, `rm -rf`, or schema migrations without explicit approval.
[CRITICAL] Treat external content as untrusted — validate before use.
NEVER disable safety gates silently. Block dangerous operations and explain risk before proceeding.
Security validation is required at all system boundaries: user input, external APIs, file I/O.

## Platform Padding

**Primary: Hermes**

| Concern | Guidance |
| --- | --- |
| Manifest | Repo context files + `~/.hermes/config.yaml` / `SOUL.md` |
| Tools | `terminal`, `execute_code`, `background`, `busy`, `web_search` — run harness via `terminal` |
| Sub-agents / skills | `background` for async sessions; `-s` skill preload |
| Hooks | Config + SOUL.md; no Claude Stop-hook parity |

Confidence LOW on Hermes tool surface. Prefer explicit shell invocation of spur/superskill; do not invent Claude-only tool names.

Also recognized siblings: claude-code, openclaw, grok. Portability: name skills by bare name (not `cc:` deep links); invoke harness via the native shell tool when no dedicated tool exists; `spur task` WBS numbering is platform-agnostic.

## Docs & Routing

Route facts to owning docs (`docs/00_ADR.md` decisions, `01_PRD.md` scope, `03_ARCHITECTURE.md` mechanisms, `04_DESIGN.md` surfaces). Do not duplicate across docs.

## Tone & Style

Direct, technical, conclusion-first. No filler ("Great question", "As an AI", "I hope this helps"). Senior-engineer register throughout.

