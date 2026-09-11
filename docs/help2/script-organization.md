# Plugin script organization

Where executable logic lives in a plugin, how install delivers it to every target, and how skills
invoke it — without depending on any particular host's plugin-root variable.

The short version: **script source lives under `plugins/<plugin>/scripts/<feature>/`; install
delivers it to every target; skills invoke it through a superskill-resolved path (standard), or,
for pure first-party engines, through the superskill binary registry (optional).**

## The two contracts

Every non-hook script is authored under the **standard** contract. A pure first-party engine may
*additionally* register on the optional contract. Hook scripts currently stay on `hook run`.

| Contract | How it ships | How skills invoke it | Choose when |
|----------|--------------|----------------------|-------------|
| Standard — staged path | `superskill install` copies `scripts/<feature>/` into each target's scripts root, or delivers the full tree via the host plugin installer | `node "$(superskill script path <plugin> <rel>)"` with a portable runtime | Default. The script must run from a real file path on the target host |
| Optional — binary registry | The engine is bundled into the `superskill` binary at build time; nothing is staged | `superskill script run <plugin> <id>` (non-hook) or `superskill hook run <plugin> <id>` (hook) | Pure stdin/env engines with no filesystem needs — and you accept a CLI release per fix |

## Physical layout

- `plugins/<plugin>/scripts/<feature>/` — plugin-level, shared across the plugin's skills, deduped.
  `<feature>` is the engine name (often the skill name; one engine may serve several skills).
- Skill folders are prose-only: `skills/<name>/` holds `SKILL.md`, references, and agent metadata —
  **no executable scripts**. `superskill skill validate` errors when a plugin skill directory
  contains a `scripts/` directory. Standalone skills outside a plugin may keep skill-local scripts
  (that is the broader skills convention, not the plugin layout).
- Repo-root `scripts/` (when present) is build/release tooling — never installed.
- There is **no class SDK** for plugin authors. Engines are ordinary processes: stdin, env, argv,
  exit codes.

## Authoring recipe (standard contract)

1. **Write the engine** at `plugins/<plugin>/scripts/<feature>/` as portable Node (`.js`/`.mjs`),
   POSIX shell (`.sh`), or TypeScript. Keep tests beside it in `scripts/<feature>/tests/`.
2. **If TypeScript**, build the portable twin with `superskill script convert` (shown below). It bundles a
   `#!/usr/bin/env node` `.mjs` beside the source and rejects `Bun.*` globals that would survive the
   bundle. Commit the `.mjs`.
3. **Teach invocation in the skill** with command substitution — never a hardcoded path:

   ```bash
   node "$(superskill script path myplugin myfeature/tool.mjs)"
   "$(superskill script path myplugin myfeature/run.sh)"
   ```

4. **Install delivers the tree.** Re-run install after changing the twin; never copy by hand.

```bash
# Build the portable .mjs twin from a TypeScript engine
superskill script convert myplugin myfeature/tool.ts

# Preview without writing
superskill script convert myplugin myfeature/tool.ts --dry-run
```

### Resolve the staged entrypoint — `script path`

```bash
superskill script path <plugin> <rel>           # absolute path, for command substitution
superskill script path <plugin> <rel> --json    # JSON object instead of a plain path
superskill script path <plugin> <rel> --global  # resolve only from the global scripts root
superskill script path <plugin> <rel> --project # resolve only from the project scripts root
```

Search order: project scripts root first, then the global scripts root; the first existing regular
file wins. Exit codes are fail-closed: `0` found, `2` not found (a deployment error, not a
graceful-degradation case), `1` invalid arguments (including any `rel` with traversal, absolute, or
drive-letter segments).

### Entrypoint contract (portable runtimes)

Staged entrypoints must run on a target host without Bun:

| Runtime | Extensions | Notes |
|---------|------------|-------|
| Node | `.js`, `.mjs` | Plain JavaScript; no TypeScript source. The `.mjs` twin is built by `script convert` |
| POSIX shell | `.sh` | Portable `sh`; no Bash-isms |

Exit-code classes: validation-style CLIs exit `0` pass / `1` violation; hook scripts use exit `2`
for a block decision.

Forbidden in skill docs and hook configs: repo-relative source invocations, host-specific plugin
root variables, and any hardcoded absolute path. A skill doc that hardcodes a path is a bug — paths
depend on the user's install mode and target class, so resolve at runtime with `script path`.

## Optional contract — binary registry

```bash
# Non-hook: validation-CLI semantics (exit 0 pass / 1 violation)
printf '%s' "$RESPONSE_TEXT" | superskill script run myplugin my-validator

# Hook: runtime dispatcher installed hook configs call
superskill hook run <plugin> <hook-id>
```

The registry is **first-party only**: runners are wired into the CLI itself, so external plugins
cannot self-register, and every fix ships with a superskill release. Runners are argv-less and
synchronous — flag-driven or async scripts belong on the standard contract. `hook run` dispatches
by `<plugin> <hook-id>`, hands the runner stdin plus the process environment, and writes the
runner's canonical hook JSON to stdout; unknown ids exit `2` (a config bug, never silently allowed).

## Delivery per target class

- **Native targets** (`claude`, `omp`, `grok`) — host plugin installers receive the full plugin
  tree, `scripts/` included.
- **Rulesync and surrogate targets** (`codex`, `pi`, `opencode`, `antigravity-cli`,
  `antigravity-ide`, `hermes`) — install stages the tree once to the shared agents scripts root
  (`~/.agents/scripts/<plugin>/` global, or the project equivalent), regardless of how many targets
  an install touches. Re-install replaces only that plugin's subtree.

## Anti-patterns

| Anti-pattern | Do instead |
|--------------|------------|
| Repo-relative invocation (`bun plugins/<plugin>/scripts/foo.ts`) | `node "$(superskill script path <plugin> <rel>)"` |
| Host-specific plugin root variables in hook configs | `superskill hook run <plugin> <id>` |
| Hardcoded absolute paths in skill docs | `$(superskill script path …)` — resolve at runtime |
| Per-skill executable directories inside a plugin | Plugin-level `scripts/<feature>/`, shared and deduped |
| Assuming Bun exists on a target host | Ship Node/`.sh` entrypoints; build `.mjs` twins with `script convert` |
| Treating `script convert` exit 0 as proof the twin works | Exit 0 means no `Bun.*` globals survived — run the twin under `node` to verify |

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: script.txt,
script_path.txt, script_convert.txt, script_run.txt, hook_run.txt, verbs/skill_validate.txt) >
docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
