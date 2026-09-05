# Platform compatibility

This reference keeps two contracts separate:

1. **Runtime targets** are the exact identifiers accepted by the current
   `superskill` CLI (`--target` and `--targets`).
2. **Registry and source formats** describe filenames, metadata, or a host
   family. A format label is not automatically a CLI target.

The source audit was performed against the repository on 2026-09-04. Source
emission is deterministic evidence. It does not prove that a vendor runtime
will discover the emitted file, load every imported layer, or enforce the
instructions during a task. Host loading and behavior require a separate smoke
test with the target version, configuration, and effective context visible.

The source links in this file are **source-checkout-only citations**. An
installed skill may not contain this repository's `packages/`, `apps/`, or
`docs/` paths; use the installed CLI and host documentation there.

## Runtime target IDs

The canonical install target list is defined by [`targets.ts`](../../../../../packages/core/src/targets.ts).
The current source contains these nine IDs. The help text describes the
operation surface but does not enumerate every accepted target; verify an ID
against the current source and target validation before using it:

| Runtime ID | Main-agent output in superskill | Installer's default global staging directory* | What is verified locally |
| --- | --- | --- | --- |
| `claude` | `CLAUDE.md` | `~/.claude/` | Source emission; native `@file` expansion is documented, but effective host context is not tested here |
| `codex` | `AGENTS.md` | `~/.codex/` | Source emission; configured-root behavior is not represented by the installer |
| `pi` | `AGENTS.md` | `~/.pi/agent/` | Source emission; current host configuration and enabled extensions remain runtime concerns |
| `omp` | `AGENTS.md` | No pinned global magent directory; global emission falls back to the install root | Source/native plugin paths are separate; effective main-agent discovery is not certified here |
| `opencode` | `AGENTS.md` | `~/.config/opencode/` | Source emission through the rulesync target; configured-root behavior is not represented |
| `antigravity-cli` | `AGENTS.md` | `~/.gemini/antigravity-cli/` | Source emission through its rulesync target; native main-agent loading requires a host check |
| `antigravity-ide` | `AGENTS.md` | `~/.gemini/config/` | Source emission through its rulesync target; native main-agent loading requires a host check |
| `hermes` | `AGENTS.md` | `~/.hermes/` | Source emission; Hermes context and identity loading are separate host concerns |
| `grok` | `AGENTS.md` | No pinned global magent directory; global emission falls back to the install root | Native plugin installation is source-audited; main-agent discovery requires a host check |

\* These are installer destinations from [`select-magent.ts`](../../../../../packages/core/src/pipeline/select-magent.ts), not a promise that the target runtime reads that directory. Project mode writes to the selected project root. Check the exact leaf `--help` output before using a target alias.

`openclaw`, `claude-code`, `agents-md`, `antigravity`, `codexcli`, `cursor`,
`aider`, and similar names may appear in registry entries, examples, or
rulesync adapters. They are source or host-family labels unless the current
CLI target list accepts them. In particular, `openclaw` is a reference format
in this skill, not one of the nine current superskill install IDs.

## Source formats and emission

The magent source pipeline accepts either a single manifest or a modular package:

| Source shape | Source behavior |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, or a target variant such as `AGENTS.codex.md` | Select the most specific candidate for the requested runtime ID |
| `IDENTITY.md`, `SOUL.md`, `AGENTS.md`, `USER.md` | Assemble existing layers in that order; a target override replaces a layer and must be inspected as a complete result |
| Claude import package (`CLAUDE.md` with `@IDENTITY.md`-style imports) | Copy the entry and referenced layer files for `claude`; other targets receive an assembled output |
| `plugins/<plugin>/rules/*.md` | Emit as a separate rules surface only when the target has a known rules directory; rules are not magent layers |

The implementation details are in [`select-magent.ts`](../../../../../packages/core/src/pipeline/select-magent.ts) and the install path in [`install.ts`](../../../../../apps/cli/src/commands/install.ts). `adaptMagentForTarget` rewrites plugin-scoped references and removes bare Claude `@file` import lines for Codex. That is a source conversion rule, not evidence of equivalent native behavior.

The source registry and the runtime target are therefore different axes:

| Label | Use it for | Do not infer |
| --- | --- | --- |
| `claude-code` | Claude host or documentation family | That `--target claude-code` is accepted; use `claude` when the CLI accepts it |
| `agents-md` | A portable Markdown manifest shape | A particular host's precedence, scope, or tool set |
| `openclaw` | OpenClaw reference material or a host-native adapter | That superskill currently installs it as a target |
| `antigravity` | A family label in source material | Whether to choose CLI or IDE; use the exact `antigravity-cli` or `antigravity-ide` ID |
| `codexcli` | A rulesync generator name used by some target mappings | That it is a magent target ID |

Do not add platform names to a manifest merely to improve the heuristic
`platform-coverage` score. Declare a target only when the file is intended for
it and the relevant semantics have been checked.

## Imports, scope, and loading

- Claude `@file` imports are a native package boundary. Claude expands the
  referenced files when the entry is loaded; this is eager loading of the
  declared package, not general-purpose lazy or progressive disclosure.
- For other targets, superskill assembles layers while installing. There is no
  portable runtime import syntax. A successful concatenation does not establish
  that the host loaded the resulting file.
- Scoped rules directories are separate from the main-agent file. The current
  emitter knows `.claude/rules/` and the Antigravity `.agents/rules/` paths;
  other current targets may receive no rule files. A rule being emitted is not
  proof that the host applied it.
- Skills, extensions, subagents, memory, and tool schemas are host-managed
  surfaces. Do not equate an on-disk skill or an installer receipt with a
  loaded capability. Discover live tools and enabled extensions at the point of
  use; do not assert that every target has or lacks delegation.
- Host precedence, imported files, scoped rules, environment-selected roots,
  and replacement overrides must be resolved into an effective context before
  semantic review. Keep the source path and target ID in the review record.

## Known installation boundaries

These are source-audited limitations of the current installer, not universal
vendor behavior:

| Boundary | Consequence |
| --- | --- |
| Claude and non-Claude project installs both use a root `AGENTS.md` path | Sequential or combined installs can overwrite or duplicate persona layers; use separate destinations and inspect the dry run |
| The global Claude rules path is currently joined twice | The emitted path can be `~/.claude/.claude/rules/`; a source test passing does not prove native global rule loading |
| OMP and Grok have no pinned global magent destination in the emitter | A global install can fall back to a shared `~/AGENTS.md`; separate personas need a host-verified destination |
| Codex, Pi, and OpenCode custom roots are not modeled | `CODEX_HOME`, a custom Pi agent directory, or a custom OpenCode config root may cause the emitted file to be missed |
| Antigravity and Hermes adapters have distinct native conventions | A rulesync or copied filename can be syntactically valid while remaining undiscovered by the host |
| Bundled package assets are refreshed by `build:bundle` / `prepack`, not every ordinary build | Source files, bundled assets, and installed output are separate verification boundaries |

Preview an installation when checking its plan:

```bash
superskill install cc --magent team-stark-children \
  --targets claude,codex,pi --dry-run --verbose
```

`--dry-run` does not write or emit inspectable target files. To inspect source
emission, use an already-authorized install in a fresh, isolated destination,
then compare the written files with their source provenance. Neither path
validates native host discovery.

## Tool declarations

This reference intentionally has no static native-tool inventory. Tool names,
delegation, permissions, extensions, and web access vary by target release,
configuration, and session. A main-agent file may preserve an operator's
preferred ordering, but it should name a tool only when the active runtime
provides it and should state a fallback when the task can continue without it.

Use the host's purpose-built file, search, edit, web, and delegation tools when
available. Use a shell or terminal for a real CLI, with bounded output, and
verify commands and flags with their current `--help`. An unavailable tool is a
capability limitation to report, not a reason to invent a namespace or to claim
that all subagents are absent.

## Verification boundary

Label repository emission as **source verified**, a target process and its
effective context as **host verified**, and representative task outcomes as
**behavior verified**. Keep unrun or inferred checks explicitly unverified;
the main workflow owns the review checklist and evidence report.

## Source map

- [`packages/core/src/targets.ts`](../../../../../packages/core/src/targets.ts) — canonical runtime IDs and rulesync mappings.
- [`packages/core/src/pipeline/select-magent.ts`](../../../../../packages/core/src/pipeline/select-magent.ts) — candidate selection, layer assembly, imports, output names, and installer destinations.
- [`apps/cli/src/commands/magent.ts`](../../../../../apps/cli/src/commands/magent.ts) — live magent command group and option wiring.
- [`apps/cli/src/commands/install.ts`](../../../../../apps/cli/src/commands/install.ts) — target emission, native dispatch, receipts, and dry-run behavior.
- [`magents/team-stark-children/README.md`](../../../../../magents/team-stark-children/README.md) — package-specific deployment findings and their verification limits.
- [`docs/about_main_agent.md`](../../../../../docs/about_main_agent.md) — repository design notes; treat vendor and rolling documentation as evidence to reverify, not as a universal host contract.
