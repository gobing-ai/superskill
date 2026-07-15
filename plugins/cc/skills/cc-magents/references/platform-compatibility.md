# Platform Compatibility

This file is the source of the platform capability matrix, applied during
`superskill install` conversion.

Support levels are capability-based:

- **High confidence**: official documentation verified on 2026-04-30, or
  behavior exercised by the superskill/spur test suites.
- **Medium confidence**: official or semi-official docs exist but are
  fragmented, or behavior is inferred from adjacent, well-documented surfaces.
- **Low confidence**: community-only reports, no stable official documentation,
  or behavior extrapolated from a sibling platform. Must remain low until
  official docs or reproducible product tests exist.

Adapters must emit loss reports when source behavior cannot be represented
natively by the target platform.

---

## Main-Agent Capability Matrix

Which main-agent (workspace manifest) capabilities each platform supports.

| Capability | Claude Code | Codex | Pi | Omp | OpenCode | Antigravity | OpenClaw | Hermes | Grok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Workspace manifest file | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` / `CLAUDE.md` | Merges all of the above | `AGENTS.md` / `CLAUDE.md` / `CONTEXT.md` | Central projects DB | `AGENTS.md` / `IDENTITY.md` | Repo context files | `AGENTS.md` / `CLAUDE.md` |
| Global override | `~/.claude/CLAUDE.md` | `~/.codex/config.toml` | `~/.pi/agent/AGENTS.md` | Inherits Pi | `.opencode/config.json` `instructions` | `~/.gemini/antigravity-cli/settings.json` | Skills dir | `~/.hermes/config.yaml` / `SOUL.md` | Internal |
| Discovery order | Global → root → subdir | Repo root → CWD | CWD → walk up to root | Multi-format scan | Upward lookup to root | DB lookup | Parent routing / ACP | Session preload | Project root auto |
| Import/modularity | `@import` / progress disclosure | No (concat, 32 KiB cap) | No | No (merged in-memory) | `instructions` array | No | ACP delegation | `-s` skill preload | No |
| Confidence | HIGH | HIGH | MEDIUM | MEDIUM | MEDIUM | LOW | LOW | LOW | LOW |

### Plugin-Provided Magents (`magents/` install convention)

A Claude Code plugin may ship a top-level `magents/<kebab-name>/` directory
containing main-agent config variants. `superskill install` discovers these
during the `.rulesync/` mapping step and stages them at
`.rulesync/magents/<plugin>-<name>/`. Per target, it selects the best variant
(most-specific-first: `AGENTS.<target>.md` → `AGENTS.md`; claude also accepts
`CLAUDE.claude.md` / `CLAUDE.md`), rewrites plugin-scoped skill references
(`plugin:foo` → `foo` or `plugin-foo`), and writes the result to:
- **Project mode:** `AGENTS.md` at the repo root (or `CLAUDE.md` for claude).
- **Global mode:** the target's per-user config dir (`~/.codex/`,
  `~/.pi/agent/`, `~/.config/opencode/`, `~/.gemini/antigravity-cli/`,
  `~/.gemini/config/`, `~/.hermes/`); claude/omp/grok use their native
  installers' own layout.

When the plugin ships multiple magents, `--magent <name>` selects one; with no
selector, emission is skipped (verbose note). A single magent auto-selects.
An unknown `--magent` name fails loudly. This convention lets a plugin author
ship one source tree that fans out to every target's native manifest format
without hand-maintaining per-platform copies.

### Native Tool Surface

The native tool namespaces each platform exposes. A main agent that wants to
declare "use this tool first" must name a tool the target runtime actually
provides — declaring Claude Code's `Agent` on Grok (which uses
`spawn_subagent`) is a lossy mapping.

| Tool purpose | Claude Code | Codex | Pi | Omp | OpenCode | Antigravity | OpenClaw | Hermes | Grok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| File read | `Read` | `shell` | `Read` | `read` | `read` | `read_file` | (Codex `read`) | `terminal` | `read_file` |
| File edit | `Edit` | `shell` | `Edit` | `edit` / `ast_edit` | `edit` / `apply_patch` | `write_file` | (Codex `edit`) | `execute_code` | `search_replace` |
| Shell | `Bash` | `shell` | `Bash` | `bash` | `bash` | `command` | (Codex `exec`) | `terminal` | `run_terminal_command` |
| Search | `Grep` / `Glob` | `shell` | `Bash` | `grep` / `ast_grep` | `grep` / `glob` | `read_file` | `search_tools` | `web_search` | `read_file` |
| Subagent | `Agent` | — | extension | `task` | — | `mcp` | ACP | `background` | `spawn_subagent` |
| Plan/state | — | `update_plan` | — | `checkpoint` | `todowrite` | — | `sessions` | — | `update_plan` |
| Web | `WebFetch` | `web_search` | `Bash` | `web_search` / `browser` | `webfetch` / `websearch` | `read_url` / `execute_url` | `browser` | `web_search` / `web_extract` | — |
| Confidence | HIGH | HIGH | MEDIUM | HIGH | MEDIUM | LOW | LOW | LOW | LOW |

---

## Harness Row: spur + superskill

The **harness** is the spur + superskill toolchain layered over a coding
agent's native surface. A main agent should treat the harness as the
preferred tool surface whenever it is present, falling back to native tools
only for operations the harness does not cover.

| Harness surface | What it does | Native equivalent it replaces | Confidence |
| --- | --- | --- | --- |
| `spur task` | Create / update / list / check WBS-numbered task files in `docs/tasks/` | Ad-hoc `TODO.md` or in-prompt checklists | HIGH |
| `spur feature` | Hierarchical feature IDs with lifecycle (backlog → done) | Manual feature spreadsheets | HIGH |
| `spur rule` | Validate constraint rules over the working tree | Ad-hoc lint scripts | HIGH |
| `spur workflow` | Validate and run multi-phase DAG workflows | Hand-rolled orchestration prompts | HIGH |
| `superskill magent` | Scaffold / validate / evaluate / refine / evolve main-agent configs | Hand-authoring `AGENTS.md` / `CLAUDE.md` | HIGH |
| `superskill skill` | Scaffold / validate / evaluate / refine / evolve skills | Hand-authoring skill dirs | HIGH |
| `superskill agent` | Manage subagent definitions | Hand-authoring agent `.md` | HIGH |
| `superskill command` | Manage slash commands | Hand-authoring command `.md` | HIGH |
| `superskill hook` | Author + emit cross-platform hooks | Platform-native hook config | HIGH |
| `superskill install` | One-shot multi-target plugin install | Per-platform manual setup | HIGH |

### How main agents should declare preferred tool usage

When the harness is present (i.e., `spur` and `superskill` resolve on `PATH`),
a main agent manifest should include an explicit **preferred-tools** statement
so the coding agent reaches for the harness before the native surface. The
statement must:

1. Name the harness binaries (`spur`, `superskill`) and the verbs the project
   uses day-to-day (`spur task`, `spur feature`, `superskill magent`,
   `superskill skill`).
2. Pin the fallback: "fall back to native tools (`Read`/`Edit`/`Bash` or
   equivalents) only for operations the harness does not cover."
3. Declare the task surface as the single source of truth: "task state lives
   in `docs/tasks/` via `spur task`; do not track work in free-form
   checklists."

Example snippet for a Claude Code `CLAUDE.md`:

```markdown
## Preferred tools (harness present)

- **Tasks & features:** `spur task` and `spur feature` own work tracking.
  Use this first; do not maintain parallel TODO lists.
- **Main-agent config:** `superskill magent` (scaffold / evaluate / refine /
  evolve) owns `CLAUDE.md` and cross-platform siblings.
- **Skills:** `superskill skill` owns skill lifecycle.
- **Fallback:** native `Read` / `Edit` / `Bash` / `Agent` for anything the
  harness does not cover (ad-hoc reads, one-off shell, subagent dispatch).
```

---

## Lossy Mappings and Recommended Workarounds

When a harness-aware main agent is ported across platforms, some declarations
do not survive the translation. Adapters under `superskill install` report
each loss; the table below lists the recurring ones and the recommended
workaround.

| Source declaration | Lossy on target | What is lost | Recommended workaround |
| --- | --- | --- | --- |
| Claude Code `Agent` subagent dispatch | Codex, Pi, OpenCode, Grok (`spawn_subagent` only on Grok) | Native subagent spawning | Emit a `NOTE:` instructing the agent to inline the work or shell out to `superskill agent` / `spur` worktrees; lossy on all but Grok |
| Claude Code `WebFetch` | Pi, Grok | First-party web tool | Map to `Bash` + `curl` (Pi) or `run_terminal_command` (Grok); flag as sandboxed |
| Claude Code hooks (`PreToolUse` etc.) | All non-Claude | Prompt-based hook runtime | Author canonical hooks via `superskill hook`; `superskill install` emits the platform-native equivalent or reports `WARN` where none exists (Codex, OpenCode) |
| `spur task` WBS numbering | All native surfaces | None — `spur` is CLI, runs anywhere `node`/`bun` exists | No workaround needed; declare `spur task` as preferred in every target manifest |
| `superskill magent evaluate` two-call seam | Platforms without `--json` consumers | Offline scorer loop | The seam is CLI-only and platform-agnostic; the target manifest just needs to name `superskill magent` as the evaluator. No loss. |
| Skills delegation (`Skill()` / `cc:` namespace) | Codex, Pi, OpenCode, Antigravity, OpenClaw, Hermes, Grok | Model-invoked skill routing | `superskill install` flattens skills to platform-native entries; main agent should reference skills by name, not by `cc:` deep links |
| `ast_grep` / `ast_edit` (Omp) | All non-Omp | AST-aware edit | Fall back to text `Edit` / `search_replace`; flag higher regression risk |
| Omp `eval` persistent kernel | All non-Omp | Stateful Python/JS kernel | Replace with one-shot `Bash` script invocations; lossy for long sessions |
| Omp `checkpoint` | All non-Omp | Mid-task state snapshot | Replace with `spur task update` + commit; coarser-grained but durable |
| OpenClaw `search_tools` / `PI Tool Search` | All non-OpenClaw | Dynamic tool discovery | Preload all needed tools at session start; higher context cost |
| Antigravity lifecycle hooks (`PreToolUse` etc.) | Non-Antigravity | Tool-event hooks | Use `superskill hook` canonical authoring; lossy on platforms with no hook runtime |

### Confidence notes

- **HIGH** for spur/superskill rows: the CLI surface is exercised by the
  superskill and spur test suites and verified against `--help` output on
  2026-07-15.
- **HIGH** for Claude Code, Codex native-tool rows: verified against
  `docs/about_main_agent.md` (2026-04-30) and current CLI behavior.
- **MEDIUM** for Pi, Omp, OpenCode: official docs exist but the tool surface
  is extensible (Pi extensions, Omp's 32-tool set, OpenCode permissions); a
  manifest should not assume an extension is present without checking.
- **LOW** for Antigravity, OpenClaw, Hermes, Grok: no stable official docs
  for the main-agent surface as of 2026-04-30. Manifests targeting these
  platforms must be validated via `superskill magent validate` and re-scored
  after any platform update.

---

## Source Material

- `docs/about_main_agent.md` — nine-platform specification matrix (manifests,
  system prompts, native tools, sandbox boundaries), verified 2026-04-30.
- `spur --help`, `spur task --help`, `spur feature --help`, `spur rule --help`,
  `spur workflow --help` — CLI surface verified 2026-07-15.
- `superskill --help`, `superskill magent --help` — CLI surface verified
  2026-07-15.
