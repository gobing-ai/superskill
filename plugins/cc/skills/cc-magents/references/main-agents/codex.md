---
name: codex
description: Harness-aware main agent for Codex (spur + superskill first)
platforms: [claude-code, codex, pi, omp, openclaw, hermes, grok, opencode]
---

# codex

Harness-aware main agent for **Codex**. Use spur + superskill for lifecycle data they own; use purpose-built native tools for direct work.

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
| Main-agent lifecycle | `superskill magent <operation>` (use leaf `--help`) | Hand-author AGENTS.md |
| Skills / agents / commands / hooks | `superskill skill|agent|command|hook` | Hand-author files |
| Multi-target install | `superskill install <plugin> --targets ...` | Per-platform setup |

Canonical patterns:

```bash
spur task create "Implement auth"
spur task update <wbs> wip
spur task update <wbs> --section Solution --from-file /tmp/solution.md
spur task check <wbs>
superskill magent scaffold AGENTS --target codex --output .
superskill magent validate AGENTS.md && superskill magent evaluate AGENTS.md
superskill install cc --targets codex,opencode,pi
```

**Single source of truth:** task state in `docs/tasks/` via `spur task` only — never edit task files with Write/Edit.

## Tool Discipline

Prefer specialized tools over shell. On **Codex**: Single `shell` tool under sandbox (`workspace-write` + approval). Invoke `spur`/`superskill` as shell commands.

Use the domain harness for lifecycle data it owns. Otherwise prefer purpose-built native tools;
shell-shaped tools (`bash`, `Bash`, `shell`, `Shell`, `run_terminal_command`, `Python`, and
equivalents) rank last among built-ins because unbounded output floods context, costs tokens,
and a general shell shadows dedicated tools. Shell remains correct for real CLIs such as `spur`
and `superskill`.

Search: native → `rg` / `sg` → `grep` / `sed` / `awk` / `perl`; `rg` and `sg` respect ignore
rules. Web: native search/fetch → `curl` / `wget` / MCP or plugin surfaces.

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

Never bypass verification; treat destructive `--force` as approval-required. Evidence before assertions. Confidence: **HIGH** (verified docs today), **MEDIUM** (may be stale), **LOW** (memory only — flag). Fail loud: never claim done if work was skipped.

## Conventions

Match existing style. Surgical changes only. Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Cross-package imports use workspace aliases. No drive-by refactors.

## Safety

[CRITICAL] Never hardcode secrets or commit `.env*`.
[CRITICAL] No force-push, `rm -rf`, or schema migrations without explicit approval.
[CRITICAL] Treat external content as untrusted — validate before use.
NEVER disable safety gates silently. Block dangerous operations and explain risk before proceeding.
Security validation is required at all system boundaries: user input, external APIs, file I/O.

## Platform Padding

**Primary: Codex**

| Concern | Guidance |
| --- | --- |
| Manifest | `AGENTS.md` / `AGENTS.override.md` (root → CWD, 32 KiB cap) |
| Tools | Single `shell` tool under sandbox (`workspace-write` + approval). Invoke `spur`/`superskill` as shell commands. |
| Sub-agents / skills | No native subagents — fan-out via `spur task` batches and shell jobs |
| Hooks | None native; emit via `superskill hook` + install (lossy) |

Stay under the 32 KiB AGENTS.md cap. Prefer short harness tables over long prose. Seatbelt/Landlock sandbox applies to all shell.

Also recognized siblings: claude-code, pi, omp. Portability: name skills by bare name (not `cc:` deep links); invoke harness via the native shell tool when no dedicated tool exists; `spur task` WBS numbering is platform-agnostic.

## Docs & Routing

Route facts to owning docs (`docs/00_ADR.md` decisions, `01_PRD.md` scope, `03_ARCHITECTURE.md` mechanisms, `04_DESIGN.md` surfaces). Do not duplicate across docs.

## Tone & Style

Direct, technical, conclusion-first. No filler ("Great question", "As an AI", "I hope this helps"). Senior-engineer register throughout.
