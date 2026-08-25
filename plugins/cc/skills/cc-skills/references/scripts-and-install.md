# Scripts and the Dual Install Contract

Where executable logic lives for a skill, and how it reaches every install target. Read this
before adding any executable helper, validator, or hook engine to a skill. Canonical sources:
ADR-015 / ADR-023 (`docs/00_ADR.md`) and
[How to organize scripts for plugin development](../../../../../docs/help/how_to_organize_scripts_for_plugin_development.md).
This reference mirrors them in skill form so create / evaluate / refine all apply one rule.

## The one rule: scripts are plugin-level, skills are prose-only

A skill folder is **prose-only** — `SKILL.md`, `references/*.md`, agent metadata. Executable code
(`.js`/`.mjs`/`.sh`/`.ts` source) does **not** live inside the skill folder. It lives at the
**plugin level**, shared and deduped across the plugin's skills:

```
plugins/<plugin>/
├── scripts/
│   └── <feature>/              # executable engine for one or more skills
│       ├── index.js            # portable entrypoint (Node .js/.mjs) or run.sh
│       ├── engine.ts           # TypeScript source (dev only — needs a runnable twin to ship)
│       └── tests/
│           └── engine.test.ts  # tests live beside the script, not in the skill
└── skills/
    └── <skill>/                # PROSE-ONLY: SKILL.md + references + agent metadata
        └── SKILL.md
```

- Plugin-level only: `plugins/<plugin>/scripts/<feature>/`. Source for every invocation contract
  lives here. (ADR-015)
- **Per-skill executables are a hard violation.** `plugins/<plugin>/skills/<name>/scripts/` — any
  executable subdir inside a skill folder (`scripts/`, the retired `extensions/`, …) — is **NOT
  supported**. ALL scripts centralize at `plugins/<plugin>/scripts/<feature>/` so prompts and scripts
  split cleanly and engines dedupe across the plugin's skills.
- **Validate gate (plugin skills only):** `superskill skill validate` errors (`field: _layout`) when
  a skill at `plugins/<plugin>/skills/<name>/SKILL.md` contains a `scripts/` or `extensions/`
  directory. `evaluate` does not walk the filesystem (it scores content). Create / refine checklists
  catch invocation-form mistakes; they do not auto-delete a banned directory.
- Repo-root `scripts/` is build/release tooling only — never part of a plugin payload, never installed.
- There is **no class SDK.** Engines are processes. `ScriptRunner` / `HookRunner` are CLI-internal
  adapters in `apps/cli/src/commands/script-run.ts` and `hook-run.ts`, not interfaces authors
  implement under `plugins/<plugin>/scripts/`.

> **`extensions/` is retired.** Earlier cc-skills guidance put executable helpers in
> `skills/<name>/extensions/`. That is superseded: the current agent-skills standard names the
> directory `scripts/`, and superskill goes further by hoisting it to the plugin level. When you see
> `extensions/` in an old skill, treat it as a finding — the code belongs in
> `plugins/<plugin>/scripts/<feature>/`.

### Standalone skills (not part of a superskill plugin)

A standalone skill distributed in the agent-skills format (e.g. `.claude/skills/<name>/`) keeps its
executable helper inside the skill at `<name>/scripts/` — the current Claude Code / agentskills.io
convention. The plugin-level rule above applies **only** to skills shipped inside a superskill
plugin (`plugins/<plugin>/skills/<name>/`), where dedup, install staging, and `superskill script …`
/ `superskill hook run …` resolution require the engine to live at plugin level.

## The dual contract (ADR-023)

Two ways a skill's script gets invoked. Pick by role.

| Contract | Form | Use when |
|---|---|---|
| **Standard — staged path** | `node "$(superskill script path <plugin> <feature>/<file>.mjs)" [args]` | **Default** for skill docs and non-hook callers. Portable; no CLI-release coupling. Convert emits `.mjs`; `.js`/`.sh` also satisfy Entrypoint Contract v1. |
| **Optional — binary registry** | `superskill script run <plugin> <id>` (non-hook) · `superskill hook run <plugin> <id>` (hook) | First-party pure engines the CLI already deep-imports, and you accept that a fix needs a CLI release. Never the default for a new plugin skill. |

Both share one engine and one source tree under `plugins/<plugin>/scripts/<feature>/`. They differ
only in delivery + invocation.

## Entrypoint Contract v1 (portable runtimes)

Staged entrypoints MUST run on a target host **without Bun**:

| Runtime | Extension | Notes |
|---|---|---|
| Node | `.js`, `.mjs` | Plain JS; no TypeScript source. CommonJS or ESM as the host Node supports. |
| POSIX shell | `.sh` | Portable `sh`; no Bash-isms. |

Exit-code classes by role (do not mix them):

| Role | Pass | Violation | Block (hook only) |
|---|---|---|---|
| Validation / utility CLI | `0` | `1` | — |
| Hook script | `0` | — | `2` |

A TypeScript-only entrypoint is fine in-repo but **fails closed after staging** until a portable
`.js`/`.sh` twin ships — staging is byte-for-byte, so `script path …/foo.js` exits 2 when only
`foo.ts` exists. Ship the twin (or compile) before depending on the standard form on install
targets.

### Forbidden invocation forms in skill docs and `hooks.json`

- `bun plugins/<plugin>/scripts/foo.ts` — repo-relative source; cwd ≠ plugin root on any install.
- `${CLAUDE_PLUGIN_ROOT}/scripts/foo.ts` — variable exists only inside Claude Code; retired for
  hooks in v0.3.3.
- Any hard-coded absolute path (cache dir, repo clone, a literal `~/.agents/scripts/...`).

**Canonical doc form:** `$(superskill script path <plugin> <rel>)` plus the runtime the entrypoint
requires. Resolve at runtime, never hardcode a path.

## Authoring recipe (create / evaluate / refine)

Use this whenever cc-skills create, evaluate, or refine a plugin skill that needs an executable.

1. Write the engine at `plugins/<plugin>/scripts/<feature>/` (TypeScript or portable `.js`/`.sh`). Put tests in `scripts/<feature>/tests/`.
2. If the source is TypeScript: `superskill script convert <plugin> <feature>/<file>.ts` — commit the `.mjs` twin. Run the twin under `node` before calling convert a success.
3. Document the **standard** form in SKILL.md:
   `node "$(superskill script path <plugin> <feature>/<file>.mjs)" [args]`
4. `superskill skill validate` the skill directory — a leftover `scripts/` or `extensions/` dir inside the skill is an error for plugin skills.
5. Only then consider the optional registry (`script run` / `hook run`) if the engine is a pure first-party validator or a host hook. External plugins cannot self-register a `ScriptRunner`.

Canonical example: `plugins/cc/scripts/anti-hallucination/`.

## Invoking from a skill doc

```bash
# Standard — staged path (default for every non-hook skill-doc caller)
node "$(superskill script path cc anti-hallucination/validate_response.mjs)"

# Optional — registry (first-party engines the CLI deep-imports; extra, not preferred)
printf '%s' "$FINAL_ANSWER" | superskill script run cc validate-response

# Shell twin
"$(superskill script path myplugin myfeat/run.sh)"

# Hook engine (never a staged FS path — hooks keep `superskill hook run`)
# wired in <plugin>/hooks/hooks.json as:  "superskill hook run cc anti-hallucination"
```

Use command substitution `$(superskill script path …)` — a skill doc that hardcodes any path is a
bug. `<rel>` must be a plain relative path under the plugin's scripts tree (`foo/bar.js`, not
`../sibling` or `/etc/passwd`); traversal is rejected server-side.

### Decision tree

- Skill doc / shell caller needs to run the engine? → **standard**: `script path` + `node`/shebang.
- Needs argv, async, FS, or lives in another repo? → **standard** (the registry cannot host it).
- Pure first-party engine, no FS, deterministic from input, and a fix may ship via CLI release? →
  **optional extra**: register a `ScriptRunner` in `apps/cli/src/commands/script-run.ts` *and* keep
  the staged twin. Do not implement a class in the plugin tree.
- Engine is a host hook (PreToolUse / Stop / …)? → **hook**: register a `HookRunner`
  (`apps/cli/src/commands/hook-run.ts`) and wire `superskill hook run <plugin> <id>` in
  `<plugin>/hooks/hooks.json`. Hooks do **not** resolve staged FS paths.

## `superskill script path` — resolve the staged entrypoint

Search order (`apps/cli/src/commands/script-path.ts`):

1. Project agents root: `<project>/.agents/scripts/<plugin>/<rel>`
2. Global agents root: `~/.agents/scripts/<plugin>/<rel>`

First existing **regular file** wins; directories never satisfy resolution. Flags `--project` and
`--global` narrow the search.

| Outcome | Exit | Notes |
|---|---|---|
| Found | `0` | Prints the absolute path (or JSON with `--json`). |
| Not found | `2` | **Fail-closed.** A missing staged script is a deployment/setup error, not graceful degradation. |
| Invalid args | `1` | Unknown flag, missing plugin/rel, or `rel` with `..` / absolute / Windows-drive segments. |

## Tests

Tests live **beside the script**, never in the skill folder:

```
plugins/<plugin>/scripts/<feature>/
├── engine.ts
└── tests/
    └── engine.test.ts
```

Canonical example: `plugins/cc/scripts/anti-hallucination/tests/{ah_guard,logger,validate_response}.test.ts`.
Run them with the repo's `bun test` (per-file line/function ≥ 90% aggregate). A skill that ships an
engine without co-located tests is an evaluation finding.

## How install delivers scripts

`superskill install` copies `plugins/<plugin>/scripts/` → `.rulesync/scripts/<plugin>/` (tree shape
preserved), then per target class:

- **Native targets** (`claude`, `omp`, `grok`) — install via each plugin CLI; receive the full plugin
  tree **including `scripts/`**. No shared-root staging.
- **Rulesync + hermes targets** (`codex`, `pi`, `opencode`, `antigravity-cli`, `antigravity-ide`,
  `hermes`) — `stagePluginScripts` writes the staged tree to `~/.agents/scripts/<plugin>/` (global)
  or `<project>/.agents/scripts/<plugin>/` (project) once per install. Re-install replaces only the
  `<plugin>/` subdir.

Only portable runtimes (Node `.js`/`.mjs`, POSIX `.sh`) are useful on staged targets.

## Worked example — the anti-hallucination skill

```
plugins/cc/scripts/anti-hallucination/
├── ah_guard.ts                # hook engine → `superskill hook run cc anti-hallucination`
├── validate_response.ts       # non-hook validator (source)
│   validate_response.mjs      # portable twin — standard form: script path + node
                               # optional extra: `superskill script run cc validate-response`
├── logger.ts                  # shared helper
└── tests/
    ├── ah_guard.test.ts
    ├── logger.test.ts
    └── validate_response.test.ts
```

The skill folder `plugins/cc/skills/anti-hallucination/` is prose-only — it documents the protocol
and points at the engine; it contains no executable code.

## Anti-patterns

- ❌ Executable code under `skills/<name>/` (any subdirectory — `scripts/`, `extensions/`, …).
- ❌ `extensions/` directory (retired; standard is `scripts/`, and superskill hoists to plugin level).
- ❌ `bun plugins/<plugin>/scripts/foo.ts` or `${CLAUDE_PLUGIN_ROOT}/…` in a skill doc.
- ❌ Hard-coded cache/repo/absolute paths.
- ❌ A TypeScript-only entrypoint depended on via `script path` before its portable twin ships.
- ❌ Wiring a non-hook validator into `hooks.json` (its exit 1 is a non-blocking error, not a block).
- ❌ An engine with no co-located `tests/`.
- ❌ A `class X implements ScriptRunner` (or any plugin-tree "public interface") expecting
  `script run` to discover it — the registry is a hardcoded first-party map.

## See also

- [How to organize scripts for plugin development](../../../../../docs/help/how_to_organize_scripts_for_plugin_development.md) — the authoritative guide.
- ADR-015, ADR-022, ADR-023, ADR-024 — `docs/00_ADR.md` (layout, deep-import exception, dual contract, dispatcher scope).
- `apps/cli/src/commands/script-path.ts` — `resolveScriptPath` + exit codes.
- `apps/cli/src/commands/script-run.ts` — optional `ScriptRunner` registry.
- `apps/cli/src/commands/hook-run.ts` — `HookRunner` registry.
- `plugins/cc/scripts/anti-hallucination/` — the canonical shipped example.
