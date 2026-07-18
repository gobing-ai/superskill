# Changelog

All notable changes to `@gobing-ai/superskill` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/).


## [Unreleased]

## [0.3.5] - 2026-07-18

### New Features

- **Per-target prevent-stop profiles (`StopProfile: block | deny`).** A single `cc/anti-hallucination` engine now drives every host that can prevent a stop — Claude Code, Codex, and Hermes (`decision:"block"` via `Stop`), Gemini CLI / Antigravity (`decision:"deny"` via `AfterAgent`) — and `superskill install` emits the hook only to those targets. OpenCode / omp / pi / Grok cannot prevent stop and are gated out (no false-security no-op + no per-stop spawn). Antigravity targets automatically append `--profile deny` to the emitted hook command. A new `HOOK_TARGET_POLICY` / `applyHookTargetPolicy` filter in `apps/cli/src/hooks.ts` is wired into the Pi, Hermes, omp, and rulesync emit paths.
- **`superskill script convert <plugin> <rel>` — build portable `.mjs` twins.** Bundles a plugin-script `.ts` into a single Node-runnable ESM `.mjs` (Bun.build `target:node`), then post-processes Bun's output: forces `#!/usr/bin/env node` (replacing, not prepending — a `#!` on line 2 is a `SyntaxError` under Node) and strips the `import.meta.main` guard that Bun rewrites into a `__require` shape undefined under Node. The twin runs under bare Node on any install target — no Bun, no `type:module`. Reusable across plugins; superskill dogfoods it for its own `cc` plugin.

### Improvements

- **Block signal moved off exit 2 onto the stdout JSON `decision` field at exit 0.** Claude Code honors stdout JSON only at exit 0; exit 2 discards that JSON and surfaces stderr as a "blocking error" instead of clean feedback. The `cc/anti-hallucination` Stop hook and the `sp/task-write-guard` PreToolUse deny path (when Claude Code is the host) now emit `decision:"block"` / `permissionDecision:"deny"` JSON at exit 0. PreToolUse keeps the exit-2 + stderr fallback for non-Claude-Code hosts (no `CLAUDE_PROJECT_DIR`) that key off the exit code.
- **Repo dogfoods the public `script convert` CLI in `build:scripts`.** `package.json`'s `build:scripts` now runs `bun run apps/cli/src/index.ts script convert cc anti-hallucination/validate_response.ts` directly, and the private `scripts/build-plugin-scripts.ts` wrapper is deleted. The generated `validate_response.mjs` twin is committed and covered by a node-execution test that spawns it under bare `node`; `validate_response.ts` reads `process.env.RESPONSE_TEXT` (not `Bun.env`) so it runs under Node.

### Documentation

- **Scripts-and-install contract rewritten.** New `plugins/cc/skills/cc-skills/references/scripts-and-install.md` is the canonical reference for where skill executables live (`plugins/<plugin>/scripts/<feature>/`, never inside the skill folder) and how they reach install targets (dual contract: staged `.mjs` path vs. `script run` / `hook run` binary registry). The `cc-skills` family (SKILL.md + best-practices, platform-compatibility, quick-reference, security, skill-categories, skill-creation, skill-patterns, troubleshooting, workflows) is rewritten to make skill folders prose-only — `extensions/` is retired. The anti-hallucination docs and `plugins/cc/README.md` promote `superskill script run cc validate-response` to the primary non-hook form, with the portable `.mjs` twin as the secondary staged-path form. `cc-hooks/platform-limits.md` marks Codex and Antigravity Stop continuation as supported and documents the pi gating rationale.
- **`docs/help/how_to_organize_scripts_for_plugin_development.md`** documents the `script convert` workflow and the entrypoint-contract notes.
## [0.3.4] - 2026-07-17

### New Features

- **Marketplace registration source: ` --marketplace-source github`.** `superskill install` now supports registering marketplaces as GitHub repos (e.g. `claude plugin marketplace add gobing-ai/superskill`) instead of only local directory paths. Local directory mode remains the default for authoring/dogfood. Grok and OMP install helpers mirror the source-mode choice. Includes a migration runbook for operators moving from directory to github-backed registrations. (#0086)
- **`superskill script run <plugin> <script-id>` — portable non-hook plugin scripts.** Non-hook scripts under `plugins/<plugin>/scripts/` are now invocable on every install target through the CLI binary, mirroring `hook run` for hook scripts. First registered script: `cc/validate-response` (anti-hallucination answer validator, exit 0/1 validation semantics). The dispatcher deep-imports script engines at build time (ADR-022), so skill docs no longer depend on repo-relative `bun` paths that break on install targets. Unknown script ids fail open with a stderr warning (version-skew posture, same as `hook run`). (#0087)
- **Plugin-level scripts staged on install for rulesync targets.** `mapPluginToRulesync` now copies `plugins/<plugin>/scripts/` into `.rulesync/scripts/<plugin>/` (preserving tree shape, not flattening into skills). `superskill install` then dispatches these to `~/.agents/scripts/<plugin>/` (global) or `<cwd>/.agents/scripts/<plugin>/` (project) for rulesync+hermes targets — native targets (claude/omp/grok) already receive `scripts/` through their own plugin install CLIs. This is the staging half of the portable scripts redesign (feature A): downstream path-helper and guide tasks will resolve `$(superskill script path <p> <id>)` against these staged files. (#0090)
- **`superskill script path <plugin> <rel>` — resolve staged entrypoints.** Skill docs can now use `$(superskill script path cc validate-response)` to resolve staged plugin scripts to absolute filesystem paths, removing the last hard-coded-path anti-pattern. Resolution searches `.agents/scripts/<plugin>/<rel>` (project) then `~/.agents/scripts/<plugin>/<rel>` (global). `--json` outputs a machine-readable object. Missing files fail closed (exit 2) — unlike `script run`'s fail-open-on-skew posture, path resolution is not version-skew-tolerant. Path traversal (`..`) and absolute rels are rejected (exit 1). (#0091)
- **Multi-file magents with per-target assembly.** Plugins may now ship a magent as a directory of section files (`IDENTITY.md`, `SOUL.md`, `USER.md`, `AGENTS.md`) instead of a single concatenated blob, and `select-magent` assembles the final agent per target (target-specific `AGENTS.<target>.md` overrides still win). `superskill install --magent <name>` selects one magent when a plugin ships several. The `identity` package and `mapper` grew the per-file discovery + assembly path; `bundled_plugin.md` and `cmd_install.md` document the new shape. (#0080, #0081)
- **cc constraint rules: discipline, harness-first, safety, verification.** The cc plugin ships four constraint rules under `plugins/cc/rules/` (`01-discipline.md`, `02-harness-first.md`, `03-safety.md`, `04-verification.md`) plus a README index. The rules codify the operator's mandatory-rule discipline: think before coding, surgical changes, fail-loud verification, and harness-first tool routing. They install as part of the standard cc plugin tree.
- **team-stark-children persona.** A new reference magent under `magents/team-stark-children/` (IDENTITY / SOUL / USER / AGENTS / CLAUDE / README) with per-target overrides for codex and pi (`overrides/codexcli/AGENTS.md`, `overrides/pi/AGENTS.md`). Demonstrates the multi-file magent assembly + override-selection path end to end.
- **Quote-aware `SPUR_BIN` tokenizer and O(1) session totals.** `parseSpurBinSpec()` splits `SPUR_BIN` overrides with quote-awareness, so paths containing spaces work when single- or double-quoted (unquoted spaces still separate argv tokens). `spContextPostTool` now writes running totals (reads/writes/tokens) to `.session.json`, and `spContextSessionStop` reads them O(1) instead of scanning the full ledger — eliminating the per-session-end O(n) scan.

### Bug Fixes

- **Refuse path-escaping plugin names and destructive clean-before-write targets.** `pathsNestOrEqual()` in `content/paths` now guards recursive `rmSync` from wiping the source tree when `outputDir` nests with or equals `pluginPath` (same bug class as bug-038). `resolveForSafety()` in `mapper` resolves through `realpath` so a symlink to home/cwd/root can no longer bypass the protected-path check. `assertSafePathSegment()` is enforced at four `install.ts` sites (marketplace name, omp plugin, `stagePluginScripts` plugin name, `resolvePluginRoot`). Tests cover nest refusal, symlink bypass, and segment rejection across all helpers. (#0090)
- **Preserve CRLF terminators on injected frontmatter lines.** `walkFrontmatter` split on `\n`, leaving a trailing `\r` on CRLF content; the injected name line and closer-injection lines then carried no `\r`, mixing LF into an otherwise-CRLF frontmatter block. Injected lines now carry the preserved terminator. Regression test covers name + closer injection under CRLF input.
- **Close anti-hallucination TLD denylist gaps and short-external-claim smuggle.** The TLD denylist gains `.test`, `.xyz`, `.cloud`, `.ing` so non-file `host:port` strings stop passing as `file:line` citation anchors (code-extension anchors `.sh`/`.ts`/`.js` remain valid; the denylist is TLD-only by design). The `<50`-char length floor now applies only when `requiresExternalVerification` is false, so short external claims ("The API returns a list.") can no longer smuggle past without a citation. `guard-implementation.md` updated to reflect the floor semantics.
- **Harden script-path traversal check and require regular-file resolution.** Replaces the substring `..` check with segment-wise `isUnsafeRel()`: blocks `../x` and `a/../b` while still allowing filenames like `file..ts`; also rejects Windows drive-letter absolute paths and backslash paths. Candidates must be a regular file (`statSync().isFile()`) so a directory never wins resolution; stat races are treated as a miss. Tests: 22 pass / 0 fail (added `file..ts` substring + dir-vs-file cases). (#0091)
- **Gate plugin scripts staging on non-native targets.** Native-only installs (claude/omp/grok) no longer dual-write to `~/.agents/scripts/<plugin>/`; the host plugin CLI owns `scripts/` for native targets. Mixed native+rulesync installs still stage for the rulesync half. The `needsSharedScriptsRoot` gate in `executeInstall` emits a verbose note instead of staging when every target is native; `stagePluginScripts` now takes `mapResult.scripts` (removing an `install-local` `countFilesInDir()` duplicate). Four integration tests cover native-only skip, hermes stage, mixed native+rulesync, and re-install refresh. (#0090)
- **Restore test env by mutation to preserve the `Bun.env` alias.** `install-omp-helpers.test.ts` reassigned `process.env = {...originalEnv}` in `afterEach`, replacing the global binding. `Bun.env` keeps pointing at the original env object, so every later test file had a split `Bun.env`/`process.env` alias — writes via `process.env.X` were invisible to `Bun.env.X` (surfaced as order-dependent pollution in task 0087's AC3 parity test). Fix restores env by mutation (delete added keys, `Object.assign` original values) so the alias stays intact.
- **Prevent false-positive CLI-verb matches from YAML frontmatter.** The CLI-verb matcher was matching tokens inside YAML frontmatter, producing false-positive verb hits. Frontmatter is now excluded from the match scope.

### Documentation

- **Plugin-scripts guide rewritten for the dual contract.** `docs/help/how_to_organize_scripts_for_plugin_development.md` was rewritten to match the shipped install-staging + `script path` redesign (feature A): standard contract (staged path via `$(superskill script path <p> <rel>)` + portable Node/sh runner per Entrypoint Contract v1) vs optional contract (`script run` / `hook run` binary registry, ADR-022). Documents the install staging roots (native plugin tree for Claude/OMP/Grok; `~/.agents/scripts/<plugin>/` for rulesync/hermes), path-helper exit codes (0 found / 2 not-found fail-closed / 1 invalid), updated decision tree and anti-patterns (revised former "never copy scripts" row; bans hard-coded cache paths and assuming Bun on targets). Help index blu…
- **ADR chain syncs the plugin-scripts dual contract.** Added ADR-023 (plugin scripts dual contract — install staging + path invocation; optional CLI absorption; supersedes ADR-015's underspecified "copied on install" wording) and ADR-024 (amends ADR-022 to cover the **script dispatcher family** `hook-run.ts` + `script-run.ts` rather than the hook dispatcher alone). Surface docs aligned: `docs/04_DESIGN.md` plugin-scripts section, `AGENTS.md` ADR-022 exception note, `docs/help/bundled_plugin.md`. Grep drift gate clean for authoritative/surface docs. (#0095)
- **cc plugin README synced with current codebase.** `plugins/cc/README.md` had drifted from the shipped plugin: marketplace version bumped 0.3.0 → 0.3.3, three stray `</input>` corruption artifacts removed, Platform Compatibility rewritten to split native plugin installs (claude/omp/grok) from rulesync mapping (codex/gemini/pi/opencode/antigravity/hermes/openclaw), scripts row updated for the ADR-023 dual contract (`$(superskill script path …)` staging + `script run`/`hook run` binary registry), and a previously-undocumented `rules/` entity (four constraint rule files + README, emitted via `emitPluginRules`) added as section 6.

## [0.3.3] - 2026-07-15

### New Features

- **Harness-aware main agents (task 0080).** `cc-magents` promotes spur + superskill as first-class infrastructure: expanded platform-capability matrix and harness row (`references/platform-compatibility.md`), harness-usage workflow (`references/workflows.md`), SKILL.md rubric dimensions that reward harness positioning. Canonical magent template (`packages/core/src/templates/magent/default.md`) gains Harness & Infrastructure, Tool Discipline, Verification, and Platform Padding sections. Gold-master reference main agents for Claude Code, Codex, Pi, Omp, OpenClaw, Hermes, and Grok live under `plugins/cc/skills/cc-magents/references/main-agents/` and evaluate at Grade A under `superskill magent evaluate`.
- **First-class `magents/` install support (task 0081).** Plugins may now ship a top-level `magents/<kebab-name>/` directory with per-target variant files (`AGENTS.md`, `AGENTS.<target>.md`, `CLAUDE.md`, `CLAUDE.claude.md`). `superskill install` discovers and stages these during `.rulesync/` mapping, then for each target selects the best variant (target-specific override wins over the common `AGENTS.md` fallback; claude additionally accepts `CLAUDE.claude.md` / `CLAUDE.md`), shims plugin-scoped skill references via `rewriteSkillReferences`, and writes `AGENTS.md` (or `CLAUDE.md` for claude) to the project root or the target's per-user global config dir. A new `--magent <name>` CLI option selects a specific magent when a plugin ships several; a single magent auto-selects; an unknown name fails loudly. `MapResult` gains a `magents` count surfaced in `--verbose` output. New `selectMagentVariant` / `adaptMagentForTarget` / `magentOutputFilename` / `magentGlobalDir` exports in `@gobing-ai/superskill-core`. 18 unit tests + 9 integration tests cover all 8 acceptance scenarios. (`packages/core/src/mapper.ts`, `packages/core/src/pipeline/select-magent.ts`, `apps/cli/src/commands/install.ts`, `plugins/cc/skills/cc-magents/references/platform-compatibility.md`, `plugins/cc/skills/cc-magents/references/workflows.md`)

### Bug Fixes

- **Anti-hallucination guard no longer nags about your own code (0077 R1 residual).** `WEAK_KEYWORD_PATTERN` included `function` and `method`, and `CLAIM_COUPLER_PATTERN` cannot tell "the function returns early" (local code — needs nothing) from "the API returns a list" (external — needs a citation). Since the guard is live on every Stop, ordinary implementation talk — the most common sentence shape in a coding reply — demanded source citations plus a `Confidence:` line, costing one spurious block per stop. Task 0077 R1 added the coupler gate to stop *bare vocabulary* triggering but left this residual, and certified R1 MET using a coupler-free fixture (`"Added a helper function… refactored the method"`) that never exercised the gap. `function`/`method` dropped from the weak set; `api|library|framework|sdk|package|endpoint|documentation` retained, so every previously-pinned positive still blocks. New regression test carries a coupler and asserts no trigger — the shape the old fixtures structurally could not catch. (`plugins/cc/scripts/anti-hallucination/ah_guard.ts`, `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts`)
- **A hostname:port no longer passes as a `file:line` citation.** The 0079 anchor pattern `name.ext:digits` also matched `example.com:8080`, so mentioning a server address cleared the citation gate without any evidence. Now denylists common TLDs. Deliberately a TLD denylist rather than a code-extension allowlist: an unrecognized extension would *uncredit* a real anchor and block an evidenced reply (the exact 0079 failure mode), whereas no source file ends in `.com`/`.io`/`.dev`. All 16 real anchor forms verified still credited. (`plugins/cc/scripts/anti-hallucination/ah_guard.ts`)
- **`validate_response.ts` no longer hangs when run manually.** With nothing piped, `readStdinText` read `/dev/stdin` unconditionally; an interactive terminal never sends EOF, so the CLI blocked forever with no prompt (confirmed under a pty: `timeout` exit 124). Now short-circuits on a TTY, mirroring the guard already at `ah_guard.ts`'s entry point. The check is injectable, so the reader tests pin it explicitly instead of depending on whether the test runner has a terminal. (`plugins/cc/scripts/anti-hallucination/validate_response.ts`, `plugins/cc/scripts/anti-hallucination/tests/validate_response.test.ts`)
- **Install no longer corrupts CRLF files or binaries; manifest errors are actionable.** `applyFrontmatterChange` now preserves CRLF endings (yaml emits LF, so echoing LF delimiters into a CRLF file produced mixed endings — the exact bug the module exists to prevent). `isTextFile` handles dotless names (e.g. `Makefile`) and round-trips UTF-8 for undeclared extensions — a NUL-free binary would otherwise be silently corrupted by the rewrite. `resolvePlugin` wraps ZodError with the manifest path and offending field(s) so a raw ZodError dump is no longer the user-facing CLI error. (`packages/core/src/content/frontmatter.ts`, `packages/core/src/content/backup.ts`, `packages/core/src/mapper.ts`)
- **Dry-run message clarifies staging; empty omp hook names fall back to `hook`.** The dry-run banner now states that `.rulesync/` staging is always refreshed — dry-run suppresses writes to install targets, not to staging. `deriveHookName` falls back to `'hook'` when the stripped token is empty, so a trailing glob/redirect no longer writes a hidden `.js` module that omp's loader wouldn't pick up. (`apps/cli/src/commands/install.ts`, `apps/cli/src/omp-hooks.ts`)

### Documentation

- **Guard docs realigned with the shipped hook wiring.** `docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, and the `anti-hallucination` skill's `guard-implementation.md` still documented the Stop hook as `bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts` and described `main()` as reading `$ARGUMENTS`. The plugin actually ships a portable PATH command (`superskill hook run cc anti-hallucination`, dispatched by `apps/cli/src/commands/hook-run.ts`) and resolves payloads from stdin first (`transcript_path` / `agent_end`), with `$ARGUMENTS` as the legacy/test channel — `plugins/cc/README.md` documented the current design, but the design/help docs had drifted, so `guard-implementation.md` was instructing users to wire the path-based form that was rejected for portability. (`docs/04_DESIGN.md`, `docs/help/bundled_plugin.md`, `plugins/cc/skills/anti-hallucination/references/guard-implementation.md`)

## [0.3.2] - 2026-07-14

### New Features

- **Codex and Cursor plugin manifests added at the repo root.** The `cc` plugin now ships declarative manifests for the Codex and Cursor plugin marketplaces alongside the existing Claude Code marketplace config — `.codex-plugin/plugin.json` (metadata only) and `.cursor-plugin/plugin.json` (metadata + `skills` + `hooks`), mirroring the layout used by the Superpowers vendor sample. The Cursor manifest references a new `plugins/cc/hooks/hooks-cursor.json` that ports the anti-hallucination `stop` hook to Cursor's native hook schema (`version: 1`, lowercase event names), so the guard resolves on Cursor the same way `superskill hook run cc anti-hallucination` already resolves on Claude Code. (`.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `plugins/cc/hooks/hooks-cursor.json`)

### Bug Fixes

- **Anti-hallucination guard recognizes `Confidence: **HIGH**` (bold-on-value).** The `SOURCE_PATTERNS` confidence regex only allowed markdown bold around the label (`**Confidence:** HIGH`), not around the value. A turn ending `Confidence: **HIGH** — verified via endpoint` was missed, so the Stop hook blocked despite a present confidence level. The regex now accepts optional bold on either side (`Confidence: \**(?:HIGH|MEDIUM|LOW)\**`), covering both bold-on-label and bold-on-value forms. 2 new test cases cover the bold-on-value shape. (`plugins/cc/scripts/anti-hallucination/ah_guard.ts`, `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts`)

## [0.3.1] - 2026-07-13

### Bug Fixes

- **Anti-hallucination guard no longer false-positives on metrics and engineering citations (task 0079).** The guard's version-number regex `/\bv?\d+\.\d+(?:\.\d+)?\b/` treated every 2-part decimal as a software version, so coverage percentages (`94.87%`), ratios, durations, and pasted test output tripped `requiresExternalVerification` on exactly the most evidenced turns — a `/sp:dev-verify` verdict with `file:line` anchors and `1626 pass / 0 fail` was blocked. Replaced with cue-gated patterns: a decimal only counts as a version when a cue is present (`v2.0`, `version 2.0`, `release 1.4`, `semver 1.2.3`, or 3-part `1.2.3` not followed by `%`). `SOURCE_PATTERNS` now also recognizes `file:line` anchors, `exit 0`/`exit code 0` lines, and `N pass / M fail` test-result lines as valid source citations — coding agents cite via file anchors and pasted command output, not just `Source:` URLs. A bare fenced code block alone is intentionally not credited (too broad). The guard keeps its teeth: an uncited external claim that mentions a version is still blocked. 75 anti-hallucination tests pass (6 new). (`plugins/cc/scripts/anti-hallucination/ah_guard.ts`, `plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts`, `plugins/cc/skills/anti-hallucination/references/guard-implementation.md`)

## [0.3.0] - 2026-07-12

### New Features

- **`superskill install` supports Grok as a native Claude-format plugin target** (task 0078). Grok Build (xAI TUI ≥ 0.2.93) is a first-class target peer of Claude/OMP: `TARGETS` gains `'grok'` (no rulesync maps); `install.ts` registers the marketplace via `grok plugin marketplace add`, then installs the plugin directory with `grok plugin install <pluginRoot> --trust` (path form — Grok does not accept `plugin@marketplace`). Idempotent re-install best-effort uninstalls first; dual-path verbose warning when grok + rulesync skill targets share one install. No command→skill adapt and no slash-dialect rewrite (native `/plugin:command`). (`packages/core/src/targets.ts`, `apps/cli/src/commands/install.ts`)
- **Install hardening: marketplace-name path traversal blocked, spawn exit codes checked, OMP hook module generation hardened, evolve gate no longer ENOENTs on rejection** (task 0076). A bug-hunt found four attack/crash vectors in `superskill install`: (1) marketplace names flowed unchecked into a cache `rmSync` — a name like `../../etc` would delete the user's `$HOME` cache. Now `assertSafePathSegment` rejects anything that is not a single path segment before any filesystem operation. (2) `defaultRunClaudeInstall` / `defaultRunOmpInstall` discarded the spawned process exit code — a failed install silently reported success. New `runCheckedCommand()` wraps `Bun.spawn`, awaits `exited`, and throws on non-zero exit. (3) Generated OMP hook modules interpolated command tokens with template strings — a single quote or backtick in a hook command produced a syntax-error module. Now `JSON.stringify(p)` quote-escapes the token, and `oneLine()` scrubs newlines from comment interpolations so no command can break out of a `//` comment. (4) The interactive evolve gate rejected proposals by deleting their backup file, but a parallel rejection branch re-typed the consumed path and crashed with ENOENT. Extracted `finalizeApply()` shared tail so all 3 gate-rejection sites skip the consumed backup cleanly. (`apps/cli/src/commands/install.ts`, `apps/cli/src/omp-hooks.ts`, `apps/cli/src/operations/evolve.ts`)

### Bug Fixes

- **Core content parsing hardening: CRLF frontmatter, scoped name injection, source-delete guard in package, YAML scalar escaping** (tasks 0075 + residual review). Four classes of input-handling bugs in `packages/core`: (1) `parseFrontmatter` hardcoded the delimiter offset to `4`, but CRLF openers/closers are 5 chars — a Windows-edited SKILL.md had its body prefixed with a stray `-`. Now uses the matched delimiter's actual length. (2) `setSkillName` did a global string replace on the entire file — a fenced `name:` line inside a markdown example got rewritten to the canonical name. Now scopes the edit to the frontmatter block. (3) `packageSkill` computed `outputDir` from user input without checking it against the source skill dir — passing the parent of the skill dir (or `tmpDir` directly in the flat-`.md` layout) caused `rmSync` to delete the source before copying from it. Now refuses with an explicit error. (4) `quoteYaml` left `\n`, `\r`, `\t` raw inside quoted scalars — a multi-line agent description in a Claude Code `<example>` block broke the emitted YAML line and made the whole agent file unloadable. Now escapes all three. (`packages/core/src/content/frontmatter.ts`, `packages/core/src/mapper.ts`, `packages/core/src/operations/package.ts`, `packages/core/src/pipeline/yaml-utils.ts`)
- **Dev-review residuals: 18 findings across `packages/core` and `apps/cli` resolved** (tasks 0075 + 0076, full `/sp:dev-review --fix all`). Beyond the parsing/input bugs above, the full review surfaced and fixed: bare skill names now resolve to `skills/<name>/SKILL.md`; marketplace plugin roots anchored-validated against absolute paths; `checkBodyLinks` excludes fenced code blocks (`computeFencedLineSet`); `slashSyntax` regex anchored to line-start/whitespace (no path false-positives); canonical hook-event taxonomy consolidated into a single `content/hook-events.ts` module; templates moved from `apps/cli/src/templates` into `packages/core/src/templates` so core owns its assets natively (CLI `build:bundle` copies at build time); `findFrontmatterBounds()` extracted as a shared primitive consumed by `parseFrontmatter` + `extractBody` (CRLF-safe); dead `extractSkillsFromBody` deleted (zero prod callers); CLI residuals — `stepApply` frontmatter prepend guarded with try/catch, OMP install entry selection now matches `--global` scope, `--targets` parsing filters empty segments, `copyDirectory` uses `lstatSync` to skip symlinks, `hook-run` replaces inline `require('node:fs')` with the top-level import, empty evaluation history now echoes a message instead of silent output, `evalGate` context literal unified into `buildEvalGateContext()` across 3 duplicate sites, canonical-hooks walking collapsed into a single `flattenCanonicalHookEntries()` generator, `CANONICAL_TO_PI_EVENT` renamed to `CANONICAL_HOOK_EVENTS` and exported from `hooks.ts` as the single home for the event taxonomy. (`packages/core/src/*`, `apps/cli/src/*`)
- **Scaffold templates embedded directly in Bun bundles** (`scripts/builder.ts`, `apps/cli/build.ts`). Previously the Bun-bundled CLI required a `templates/` runtime asset on disk. Templates are now embedded as inline string imports during the build, so the standalone binary needs no asset sidecar.

## [0.2.19] - 2026-07-10

### Bug Fixes

- **Installing a second plugin no longer overwrites the first plugin's hooks** (pi + hermes targets). `emitPiStyleHooks` and `emitHermesHooks` previously wrote hooks.json with only the current plugin's entries, silently destroying hooks from any previously-installed plugin. Installing `sp` after `cc` wiped cc's `stop`/`agent_end` anti-hallucination hook from both `~/.pi/agent/hooks.json` and `~/.hermes/hooks.json`. Two new merge helpers — `mergePiHooks` (deduplicates by command string) and `mergeCanonicalHooks` (deduplicates by `(matcher, command)` signature) — read the existing file, concatenate per-event arrays, and skip duplicates so re-installing the same plugin is idempotent. Corrupt or unparseable hooks.json falls back to a fresh start instead of crashing. (`apps/cli/src/hooks.ts`)
- **OMP generated hook matcher guard now matches case-insensitively and supports regex semantics**. The generated `.js` hook modules used `event.toolName !== 'Write|Edit'` — a strict string comparison that never matched because OMP passes lowercase tool names (`"write"`, `"edit"`) while canonical matchers are PascalCase regex (`"Write|Edit"`). The alternation `|` was also treated as a literal character, not regex OR. Replaced with `!new RegExp("Write|Edit", 'i').test(event.toolName)` — case-insensitive regex test that correctly handles alternation, anchors, and the case gap. (`apps/cli/src/omp-hooks.ts`)
- **Hermes merge no longer drops existing entries for the same event key** (root cause of the hermes merge bug). `mergeCanonicalHooks`'s `signatureOf` function assumed the Claude Code nested format (`{ matcher, hooks: [...] }`) but the canonical format produced by the rulesync transform is flat (`{ type, command, matcher, timeout }` per entry). The signature function read `def.hooks` (undefined in flat format) → produced `*|` (empty) for every entry → all entries for the same event key deduped to the first one, dropping subsequent plugins' hooks. Fixed `signatureOf` to handle both formats: if `def.hooks` exists (nested), signature from inner hooks; otherwise signature from the flat entry's own `type`/`command`/`timeout` fields. (`apps/cli/src/hooks.ts`)

### Improvements

- **Merge test coverage added**: 8 new tests across `hooks.test.ts` covering pi-merge (overwrite→merge, idempotent re-install, same-event merge from different plugins, corrupt file recovery) and hermes-merge (flat canonical format dedup, nested format dedup, cross-plugin same-event merge, idempotency). OMP matcher guard tests updated for the new regex-based assertion format. Install-hooks and hook-emit test names updated from "copies" to "merges" to reflect the new behavior. 1321 tests pass, 0 fail. (`apps/cli/tests/hooks.test.ts`, `apps/cli/tests/omp-hooks.test.ts`, `apps/cli/tests/commands/install-hooks.test.ts`, `apps/cli/tests/commands/hook-emit.test.ts`)

## [0.2.15] - 2026-07-10

### New Features

- **`superskill install` supports OMP targets as native Claude Code plugins** (task 0073). OMP (`oh-my-pi`) was previously installed via a surrogate `pi-push` shim that copied skills into a static directory. OMP is now a first-class native target: a new `omp-hooks.ts` module (`generateOmpHookModules`) converts the canonical rulesync `hooks.json` into CommonJS `.js` hook modules under `hooks/pre` and `hooks/post`, mapping `preToolUse`→`tool_call`, `postToolUse`→`tool_result`, `stop`→`agent_end`, `sessionStart`→`session_start`, `sessionEnd`→`session_shutdown`, `preCompact`→`session_before_compact`. `install.ts` gains `runOmpInstall` dependency, `resolveOmpInstallPath`, and `postInstallOmp` helpers, wired into the omp dispatch branch so OMP installs as a real plugin while still skipping dry-run and echoing in verbose mode. (`47bff81`; `apps/cli/src/omp-hooks.ts`, `apps/cli/src/commands/install.ts`)

### Bug Fixes

- **Plugin/CLI hook version skew degrades gracefully instead of blocking** (ADR-020, task 0074). Unknown hook ids in `superskill hook run` previously returned the universal block signal (exit 2), causing blocked Stops and agent loops when a plugin shipped hooks the installed CLI didn't recognize. Unknown hooks now fail open: exit 0 + a stderr skew warning naming the installed CLI version. The 2026-07-10 incident — Claude Code sessions flooded `unknown hook` errors after a plugin added hooks ahead of the installed CLI — is resolved by this change. (`4e56334`; `apps/cli/src/commands/hook-run.ts`)
- **`minCliVersion` install gate prevents hook/skill mismatch** (ADR-021, task 0074). `superskill install` now honors an optional `minCliVersion` floor in the plugin's canonical `hooks.json`: below the floor it warns and skips all hook emission while skills, commands, and subagents still install normally. This prevents a plugin from emitting hooks that call command shapes the installed CLI doesn't understand. The CLI version itself is now compiled in via `src/version.ts` (JSON import, embedded by Bun into the compiled binary's virtual FS), replacing a runtime `readFileSync` probe that was broken in the compiled binary — `import.meta.dir` resolves to `/$bunfs/` which has no `package.json` on disk, making the version gate silently inert. The new approach works correctly across dev source, JS bundle, and compiled binary. (`4e56334`; `apps/cli/src/version.ts`, `apps/cli/src/commands/install.ts`, `apps/cli/src/commands/hook-run.ts`)
- **`hook-run` uses exit-code-based decisions for cross-agent compatibility**. Codex rejects Claude-canonical JSON with `unsupported permissionDecision: allow`. The hook runner now uses exit codes instead of JSON output: exit 0 + empty stdout = allow, exit 2 + stderr = deny (both Claude Code and Codex document exit 2 as block). Also registers the 3 sp context hooks (`session-start`, `post-tool`, `session-stop`) as inline runners so they resolve instead of producing `unknown hook`. (`418894e`; `apps/cli/src/commands/hook-run.ts`)
- **`install` honors `HOME_DIR` in per-target skill count and path resolution**. The per-target verbose echo computed the skills dir with `os.homedir()` (honors `HOME`), but rulesync resolves home with `process.env.HOME_DIR ?? os.homedir()`. In CI the runner's `~/.agents/skills/` was empty, so `countSkillsInDir` returned 0 and the regression test failed; locally it passed accidentally because the developer's real skills dir was populated. Added `resolveHomeDir()` helper mirroring rulesync's resolution; replaced three call sites. No behavior change for users who don't set `HOME_DIR`. (`c51c487`; `apps/cli/src/commands/install.ts`)

### Improvements

- **Workspace catalog centralizes `@gobing-ai/ts-*` versions** (following the spur-new pattern). Root `package.json` gains a Bun `catalog` block pinning `ts-ai-runner`, `ts-db`, and `ts-utils` at `^0.4.6`; `apps/cli` and `packages/core` dependencies reference `catalog:` instead of hardcoding versions. Adding/upgrading a shared package now means editing one line at the root instead of hunting across workspaces. (`acac4ee`; `package.json`, `apps/cli/package.json`, `packages/core/package.json`)
- **CLI `build` emits a compiled binary; npm bundle moves to `build:bundle`** (following the spur-new pattern). `bun run build` now produces `dist/superskill` — a standalone Mach-O 64-bit binary (64 MB, 804 modules, ~101 ms compile) via `bun build --compile`. The npm JS bundle (`dist/index.js` with embedded templates/rubrics) moves to `bun run build:bundle`, still run by `prepublishOnly` before npm publish. The compiled binary correctly reports its version in all three execution contexts (source, bundle, binary) thanks to the `version.ts` JSON-import fix. (`acac4ee`; `apps/cli/package.json`)
- **OMP install helpers covered to clear the 90/90 coverage gate**. Stubs `Bun.spawn` directly (env-PATH manipulation has no effect — Bun snapshots PATH at process start) and exercises `defaultRunOmpInstall`, `resolveOmpInstallPath`, and `postInstallOmp`. Each helper carries TSDoc to satisfy the `every-export-has-tsdoc` rule. `install.ts` coverage rose from 87.50% fn / 84.60% line to 96% fn / 98.93% line; full repo at 99.75% fn / 98.73% line. (`59195a8`; `apps/cli/tests/commands/install-omp-helpers.test.ts`)

### Documentation

- **ADR-020 (fail-open policy)** and **ADR-021 (`minCliVersion` compat contract)** recorded in `docs/00_ADR.md`; the canonical `hooks.json` `minCliVersion` config shape documented in `docs/04_DESIGN.md`. (`4e56334`; `docs/00_ADR.md`, `docs/04_DESIGN.md`)
- **Task 0073 refined** with R-numbered requirements, `file:line` Solution citations, and coverage claim to pass `spur task check`. (`758c708`; `docs/tasks/0073_*.md`)

## [0.2.12] - 2026-07-07

### Bug Fixes

- **`superskill install --verbose` reports actual on-disk skill count for each target** (regression test coverage added in `apps/cli/tests/commands/install.integration.test.ts:593-645`). The per-target verbose line previously printed `result.skillsCount` from rulesync — a diff count that decays to 0 on no-op re-installs. A user re-running `superskill install cc --verbose` against an already-populated `~/.gemini/antigravity-cli/skills/` saw `antigravity-cli: 0 skill(s) at /Users/robin/.gemini/antigravity-cli/skills` even though 65 skills were sitting there. The fix walks the target's skills dir after the rulesync run and reports the count of directories containing `SKILL.md` (the format every consumer reads); in dry-run mode the dir doesn't exist yet, so the code falls back to the diff count. The `packages/core/src/targets.ts` map gains a new `TARGET_GLOBAL_SKILLS_RELDIR` export (verified against rulesync 8.29.0 source and the task 0072 live smoke) so the install loop resolves each target's landing path consistently across global and project modes. The new helper `countSkillsInDir(skillsDir)` is added at the end of `apps/cli/src/commands/install.ts`. The same commit also fixes a separate double-echo bug: in `--verbose` mode the hook-emit line for each surrogate target (`pi` / `omp` / `hermes`) was printed twice — once at the dispatch site (`install.ts:290, 278, 246`) and once in the post-loop echo block. The post-loop echo at `install.ts:311-323` is now gated on `!options.verbose`; verbose mode already echoes each result at the dispatch site, non-verbose mode still surfaces the hook results for the user via the post-loop fallback (preserving the design §6 "no silent drop" invariant). The `apps/cli/tests/commands/install.integration.test.ts:490-547` regression tests were updated to distinguish the two semantically distinct `pi:` / `omp:` / `hermes:` lines (rulesync per-target vs hook-emit) so future regressions in either surface are caught independently. After fix, `superskill install cc --verbose` output shows e.g. `codex: 241 skill(s) at /Users/robin/.agents/skills`, `antigravity-cli: 65 skill(s) at /Users/robin/.gemini/antigravity-cli/skills`, `antigravity-ide: 219 skill(s) at /Users/robin/.config/skills` — each line now reflects the actual inventory the user can `ls` to verify, not a transient diff. (`c572efb`; `apps/cli/src/commands/install.ts`, `packages/core/src/targets.ts`, `apps/cli/tests/commands/install.integration.test.ts`)

## [0.2.11] - 2026-07-07

### Bug Fixes

- **`superskill install` routes Antigravity targets to their native rulesync generators** (task 0072, regression introduced in `eb183b4` 2026-06-23). `TARGET_TO_RULESYNC['antigravity-cli']` and `TARGET_TO_RULESYNC['antigravity-ide']` were mapped to `'codexcli'`, which writes global skills to `~/.agents/skills/` — a directory neither the Antigravity CLI (`agy`) nor the Antigravity IDE ever reads. After the rerouting, every `superskill install` against a plugin with more than a handful of entities silently dropped ~25 of ~60 skills from the agy `/skills` UI (e.g. `/sp-dev-brainstorm`, `/sp-super-coder`) and from the IDE's global skills picker. agy reads from `~/.gemini/antigravity-cli/skills/` and the IDE reads from `~/.gemini/config/skills/` — both confirmed by the rulesync source (`vendors/rulesync/src/features/skills/antigravity-{cli,ide}-skill.ts` + `constants/antigravity-paths.ts`) and the official Google Antigravity docs. The fix reverts the two Antigravity mappings to their native rulesync strings (`'antigravity-cli'` / `'antigravity-ide'`), so skills now land in the directory the consumer reads. The unification for `codex` / `pi` / `omp` (all reading `~/.agents/skills/` natively) is preserved; only the Antigravity rows are corrected. `TARGET_TO_RULESYNC_HOOKS` was already correct (per the 2026-06-23 amendment's own exception) and is unchanged. `TARGET_SKILLS_RELDIR` (project-mode path) was already correct and is unchanged. ADR-010 amendment 2026-07-07 added to `docs/00_ADR.md` superseding the 2026-06-23 amendment for the Antigravity targets only. Downstream docs and tests synced: `docs/03_ARCHITECTURE.md:297-298` (target table), `docs/help/cmd_install.md:48-49, 142-150` (output-location table + mermaid), `packages/core/tests/targets.test.ts:25-26` (assertion + comment), `apps/cli/src/commands/install.ts:248-249` (OMP dispatch comment), `apps/cli/tests/commands/install.integration.test.ts:299` (OMP test comment). Four new integration tests added in `apps/cli/tests/commands/install.integration.test.ts:397-488` (agy global, ide global, agy project, codex/pi regression guard) using `process.env.HOME_DIR` to isolate rulesync's `getHomeDirectory()` from the real `$HOME`. Bug logged as `bug-034` in `.wolf/buglog.json`. Affected users should re-run `superskill install <plugin> --targets antigravity-cli,antigravity-ide` after upgrading to populate the Antigravity dirs (their existing `~/.agents/skills/<plugin>-*` entries remain valid for Codex / Pi / OMP, unchanged behavior). (`superskill` working tree, pending commit; `packages/core/src/targets.ts:30-31` + 6 other files; cross-ref `docs/tasks/0072_*.md`)

## [0.2.10] - 2026-07-06

### New Features

- **Skill-engineering theory absorbed into the quality engine**: The `cc` meta-plugin now carries the absorbed theory as reference content, and the core engine turns it into deterministic proxies, rubric criteria, and scaffold/validate wiring. `references/skill-engineering-theory.md` codifies the root virtue (predictability), the two invocation loads (model- vs user-invoked), the information hierarchy, completion criteria, leading words, and the five failure modes (sprawl / sediment / duplication / no-op / premature completion); `references/glossary.md` gives the rubrics and scorers shared vocabulary. `packages/core/src/quality/heuristics.ts` adds `descriptionTriggerRichness` (branch delimiters, dispatch cues, length — distinguishes trigger-rich model-invoked descriptions from one-line human-facing ones), a `NO_OP_PHRASES` table + no-op density proxy (flags instructions that restate default model behavior), and completion-checkability + progressive-disclosure shape proxies. The per-type scorers (`quality/{skill,agent,command,magent}.ts`) consume them, with `skill.ts` gaining the largest surface (description budget, trigger-cluster, body/references shape). Rubrics bump: skill → v2, others v1→v2 where criteria moved; conciseness names description char budget / no-op density / duplication explicitly, completeness names progressive-disclosure shape, trigger-accuracy names the branch-collapse rule. (`4b32ff8`, `1be8376`; `plugins/cc/references/skill-engineering-theory.md`, `plugins/cc/references/glossary.md`, `packages/core/src/quality/heuristics.ts`, `packages/core/src/quality/{skill,agent,command,magent}.ts`, `packages/core/rubrics/*.yaml`)

### Improvements

- **`--invocation-mode` flag and failure-mode taxonomy on the CLI**: `commands/skill.ts` exposes `--invocation-mode {user|model}` with a strict `parseInvocationMode` validator (throws on any other value), plumbed through `skillScaffold` into the scaffold `invocationMode` option. `operations/evolve.ts` carries a `FAILURE_MODES` const `['sprawl','sediment','duplication','no-op','premature-completion']` and `ingestProposal` rejects an unknown `failure_mode`, keeping proposal history a clean failure-mode ledger. `operations/refine.ts` wires invocation-axis description guidance; skill templates prepend the three description rules (front-load identity phrase; one trigger per genuine branch; no identity restatement from body) so every scaffolded skill starts with the rule visible. (`fccb102`; `apps/cli/src/commands/skill.ts`, `apps/cli/src/operations/{evolve,refine}.ts`, `apps/cli/src/templates/skill/*.md`)
- **Lifecycle skills pruned for sprawl/sediment/duplication**: Applied the absorbed theory to the `cc` meta-plugin's own skill bodies — net `-271` lines with no information loss by moving duplicated content to its single home. `anti-hallucination` drops the citations table, benefits list, and prior-version sediment; the activation-triggers list collapses to a one-block decision tree. `cc-agents` / `cc-commands` / `cc-hooks` (`-329` combined) replace duplicated failure-mode and quality-dimension explanations with a "See `cc:cc-skills`" pointer and prune no-op imperative sentences; the canonical home is `cc-skills/references/skill-engineering-theory.md`. `cc-skills/SKILL.md` gains an Invocation Axis section (model- vs user-invoked, dispatch constraint, description-shape rule) and links to both reference files; `cc-skills/references/workflows.md` documents the invocation-axis scaffold/validate/evaluate/refine wiring. Progressive-disclosure targets: `cc-commands/references/command-examples.md`, `cc-hooks/references/{advanced,patterns}.md`. (`c113c1f`; `plugins/cc/skills/anti-hallucination/SKILL.md`, `plugins/cc/skills/cc-{agents,commands,hooks,skills}/**`)
- **Operation flow map and cc command docs synced**: The `cc` plugin README gains a "Which Operation When — the Flow Map" section listing every `commands/*.md` exactly once (structural-test enforced), so the human index for the 13 slash commands lives in one place. `commands/{skill,agent,command,magent}-{add,evolve,refine}.md` document the `--invocation-mode` flag on `add` and the `failure_mode` field on evolve/refine proposals, and point add commands at the grill-style discovery discipline. (`85efa3e`; `plugins/cc/README.md`, `plugins/cc/commands/*.md`)

### Documentation

- **Install example pointed at the `cc` plugin**: The root install example used a hypothetical `my-plugin`; switched to `cc` so the quickstart reflects the plugin actually shipped in this repo. (`afe071d`)
- **Task 0070/0071 records and dogfood findings captured**: Task 0070 (+201) records the implemented solution — heuristics, rubric v2, invocation-axis scaffold/validate, failure-mode taxonomy, cc skill-body pruning, structure test; task 0071 (+293) expands the followup from the 0070 dogfood run (AC boundary wording, `.spur` rule shadow, spur-new cross-repo handoff). A dogfood report for `/sp:dev-refine 0070 --auto --next` and the `.spur/run/0070-verdict.json` PASS record are committed alongside. (`4ed0484`; `docs/tasks/0070_*.md`, `docs/tasks/0071_*.md`, `docs/dogfood/2026-07-04-sp-dev-refine-0070-auto-next-dogfood.md`)

## [0.2.9] - 2026-06-30

### Bug Fixes

- **`resolveSpurTaskOwnership` hardened for custom binaries and the docs gate**: The task-write guard's ownership probe passed a possibly-`undefined` command to `spawnSync` under `noUncheckedIndexedAccess`, breaking the `typecheck` gate; and the exported function lacked a JSDoc, breaking the `every-export-has-tsdoc` post-check. The probe now honors a `SPUR_BIN` env override (space-separated, args allowed) with a `parts[0] ?? 'spur'` fallback, and carries a documenting JSDoc. `bun run autofix` and `bun run spur-check` now run clean end to end. (`e8a27c8`; `apps/cli/src/commands/hook-run.ts`)

## [0.2.6] - 2026-06-29

### New Features

- **Cross-agent hook runtime (`superskill hook run`)**: A new stable PATH-resolvable command lets installed hook configs invoke a portable dispatcher instead of a Claude-only plugin-root script path or a `${CLAUDE_PLUGIN_ROOT}/<script>` reference. `superskill hook run <plugin> <hook-id>` resolves a registered `HookRunner` from a registry, hands it stdin + the process env, writes the runner's Claude-canonical hook JSON (`permissionDecision` / `allowStop`) to stdout, and exits with the runner's code. The command resolves on every target that has `superskill` on PATH — not just Claude Code — and agents that cannot parse the canonical shape fail open (treat as allow), the intended cross-agent default. Unknown `<plugin>/<hook-id>` exits 2 and never fails open (a config bug, not a runtime payload). Two runners ship: `sp/task-write-guard` (PreToolUse) denies raw `Write`/`Edit` on paths owned by the Spur task corpus via `spur task resolve --strict`, failing open on every other condition and short-circuitable with `SPUR_WRITE_GUARD=off`; `cc/anti-hallucination` (Stop) blocks stop when the last assistant message claims external facts without source citations. (`bcb103e`, `d228516`; `apps/cli/src/commands/hook-run.ts`, `apps/cli/tests/commands/hook-run.test.ts`)
- **Two-pass hook routing in install (Antigravity native)**: `superskill install` no longer carries `hooks` in the main rulesync pass. The skills map (`TARGET_TO_RULESYNC`) collapses Antigravity onto `codexcli` so all `~/.agents/skills/` readers share one copy, but reusing that routing for hooks would make rulesync emit codex-style hook files at the wrong path. Hooks now ride a second hooks-only pass through `TARGET_TO_RULESYNC_HOOKS`, so Antigravity reaches its own native hook generator (`.agents/hooks.json` project for `antigravity-cli`, `.gemini/config/hooks.json` global for `antigravity-ide`). A hookless plugin makes a single skills-only pass; `pi`/`omp`/`hermes` are still handled by the surrogate shim. `RulesyncOptions` gains a `targetMap` override so callers can route a feature pass through a different Target→ToolTarget map. (`8f133ba`, `6abc9d7`; `packages/core/src/targets.ts`, `packages/core/src/rulesync.ts`, `apps/cli/src/commands/install.ts`)
- **Portable anti-hallucination Stop hook**: The `cc` plugin's Stop hook config now invokes `superskill hook run cc anti-hallucination` instead of `bun scripts/anti-hallucination/ah_guard.ts`, so the guard resolves on every target with `superskill` on PATH rather than failing silently everywhere except Claude Code. The `cc-hooks` skill documents the portable-runner pattern as the new cross-platform default (Safety Invariant #4), the `expert-hook` agent promotes Antigravity from "Tier 4 (docs only)" to a native-hook Tier 1 target, and `extractLastAssistantMessage` is now hardened against malformed `message.role` shapes so the Stop runner fails open on unexpected context. (`c302c13`; `plugins/cc/hooks/hooks.json`, `plugins/cc/scripts/anti-hallucination/ah_guard.ts`, `plugins/cc/skills/cc-hooks/SKILL.md`, `plugins/cc/skills/cc-hooks/references/cross-platform.md`, `plugins/cc/agents/expert-hook.md`)

### Improvements

- **Local rule override for happy-dom-teardown**: `superskill` is a CLI-only repo with no `apps/web` test tree, so the upstream rule's include set resolved to zero files and `rg` exited 2 — turning the pre-check into a misconfiguration. The local override anchors the evaluator on `package.json` so it stays empty-safe here while still catching direct `GlobalRegistrator.unregister()` calls if web tests are introduced later. (`78bb578`; `.spur/rules/typescript/happy-dom-teardown.yaml`)
- **Docs synced to the hook-run + two-pass reality**: The `cc` plugin README (marketplace version bumped to 0.2.5, new "Hook Runtime" section, relationship-diagram edge and anti-hallucination example routed through the dispatcher), `cmd_hook.md` (new `run` subcommand section with runner registry table), `cmd_install.md` (two-pass routing in Stage 4, split skills/hooks diagrams, design note), `entity_locations.md` (Antigravity native hook locations filled in), `index.md`, and `bundled_plugin.md` now match the code. (`faa9cf8`)

## [0.2.5] - 2026-06-25

### New Features

- **Empirical behavior gate for evolve (`--eval-gate`)**: The `evolve` operation now supports an opt-in empirical behavior gate that replays held-out eval cases against the candidate skill and accepts only when the candidate strictly outperforms the baseline. The gate is additive (layered on top of the existing form gate), skip-when-absent (no `eval/cases.yaml` → skipped, no flag → skipped), and uses only deterministic checkable references — exact-match + rule judge scorers — with no LLM judge in Phase 1. Eval cases are co-located with the skill as YAML (`skills/<name>/eval/cases.yaml`), separate from rubrics. (ADR-018; `packages/core/src/quality/eval-cases.ts`, `packages/core/src/quality/replay.ts`, `apps/cli/src/operations/replay-runner.ts`, `apps/cli/src/operations/evolve.ts`)
- **Pairwise rubric LLM judge for behavior gate (Phase 2)**: Extended the empirical gate with `reference_kind: "rubric"` for open-ended eval cases requiring LLM judgment. The judge scores candidate-vs-baseline pairwise in a single call per measured case (not two independent absolute scores), with seed-controlled output ordering across judge replays. A noise-floor estimation (N-replay signed-margin variance) ensures the gate rejects within-noise wins — the judge's non-determinism cannot be laundered as improvement. The judge runs as a spur-agent backed by `@gobing-ai/ts-ai-runner`, with a `ScriptedJudgeBackend` for deterministic CI testing at zero token cost. Budget guard fails loud on cap. (ADR-019; `apps/cli/src/operations/pairwise-judge.ts`, `apps/cli/src/operations/noise-floor.ts`, `apps/cli/src/operations/evolve.ts`)

### Bug Fixes

- **Destructive-delete guard in plugin mapping**: New `assertSafeOutputDir()` rejects `rmSync` on home directory, cwd, or filesystem root before the recursive delete in `mapPluginToRulesync`; `packageSkill` separately refuses an `--output` that overlaps the source skill directory, whose clean step would otherwise delete the source. A CLI bug or bad `--output` flag can no longer destroy user data irrecoverably. (`packages/core/src/mapper.ts`, `packages/core/src/operations/package.ts`)
- **Binary-safe directory copy**: `copyAndRewriteDirectory` now uses `lstatSync` to skip symlinks (preventing infinite recursion loops) and copies non-text files (images, fonts, archives) byte-for-byte instead of corrupting them through UTF-8 rewrite. A `isTextFile` heuristic detects text by extension or absence of NUL bytes in the first 8KB. (`packages/core/src/mapper.ts`)
- **Shared `quoteYaml` extracted to `pipeline/yaml-utils`**: Inline `quoteYaml` duplicates in `adapt-command.ts` and `adapt-subagent.ts` consolidated into a shared, tested utility. (`packages/core/src/pipeline/yaml-utils.ts`, `packages/core/src/pipeline/adapt-command.ts`, `packages/core/src/pipeline/adapt-subagent.ts`)
- **CRLF-tolerant frontmatter parsing**: Frontmatter parser now accepts `\r\n` line endings on both the opening `---` delimiter and the closing `---`. `hasFrontmatter` checks in `validate` and `magent` evaluators switched from `^---\s*$` regex to `startsWith('---\n')` for correctness. (`packages/core/src/content/frontmatter.ts`, `packages/core/src/operations/validate.ts`, `packages/core/src/quality/magent.ts`)
- **Insert missing `name:` field instead of no-op**: `setSkillName` in the mapper now inserts a `name:` field after the opening `---` when none exists, rather than silently returning content unchanged. (`packages/core/src/mapper.ts`)
- **Frontmatter walk fallback on missing closer**: When no closing `---` is found, `walkFrontmatter` falls back to the fallback block instead of absorbing the entire body as frontmatter and corrupting content. (`packages/core/src/pipeline/frontmatter-walk.ts`)
- **Path-segment safety extended to eval-cases and scaffold**: `assertSafePathSegment` now guards eval-cases skill name resolution and scaffold template tier names. Marketplace source validation handles backslash path separators (`\`) in addition to forward slashes. (`packages/core/src/quality/eval-cases.ts`, `packages/core/src/operations/scaffold.ts`, `packages/core/src/marketplace.ts`)
- **Validation strict checks refactored to single pass**: Deprecated-field detection, trailing-whitespace checking, and unknown-key warnings consolidated into one loop over frontmatter fields. `referenceChecker` is now injectable via options for testability. Hook event and model-alias membership checks use `readonly` array `.includes()` instead of type-cast indexing. (`packages/core/src/operations/validate.ts`)
- **Hook quality scorer accepts `prompt`-type entries**: The hook evaluator's validity counter now counts `prompt`-type hooks alongside `command`-type, fixing undercounting for plugins using prompt hooks. (`packages/core/src/quality/hook.ts`)
- **Quality scoring regex fixes**: `pi` platform detection uses `\bpi\b` word boundary (was matching inside other words); trigger-phrase detection now counts ordered lists (`1.` / `1)`); Claude model pattern accepts versioned model names (`claude-3-5-sonnet`). (`packages/core/src/quality/magent.ts`, `packages/core/src/quality/skill.ts`, `packages/core/src/quality/agent.ts`)
- **Backup collision fix**: `backupFile` now uses millisecond precision (was second precision) and appends a counter on collision, preventing same-minute backups from overwriting each other. `restoreFromBackup` throws an explicit error when the backup file is missing instead of a raw `ENOENT`. (`packages/core/src/content/backup.ts`)

## [0.2.4] - 2026-06-23

### New Features

- **Cross-Target Hook Installation**: Plugin hooks are now converted from Claude Code format to rulesync canonical format and distributed to all supported targets (codex, pi, opencode, omp, hermes, antigravity). Previously only pi/omp/hermes received hooks via a superskill shim. (`packages/core/src/mapper.ts`)
- **Skill Name Prefixing**: Native plugin skills now have their `name:` frontmatter prefixed with the plugin name (e.g., `spur-dev` → `sp-spur-dev`), matching adapted commands and subagents. Fixes skill lookup failures in agents that resolve skills by frontmatter name. (`packages/core/src/mapper.ts`)
- **Unified `~/.agents/skills/` Directory**: Pi, codex, and antigravity now all write skills to the shared `~/.agents/skills/` directory. Research confirmed Pi, OMP, and Antigravity 2.0 natively support this path. Eliminates duplicate skill copies when agents read from multiple directories. OMP's redundant copy step removed. (`packages/core/src/targets.ts`, `apps/cli/src/commands/install.ts`)

### Improvements

- **Clean `.rulesync/` Per Install**: The mapper now clears the `.rulesync/` staging directory before each mapping, preventing stale hooks and skills from previous plugin installs from polluting the current one. (`packages/core/src/mapper.ts`)
- **Structured Logger in Builder**: All `console.*` calls in `scripts/builder.ts` replaced with a `logger` seam (`logger.info/warn/error`), providing a single output surface for testing and integration. (`scripts/builder.ts`)

### Bug Fixes

- **CI False-Pass in Builder Tests**: A test calling `checkSkillCitations` without a safe glob would trigger `process.exit(1)` via `fail()`, silently killing `bun test` mid-run while the reporter showed all tests passing. Fixed with a file-level `process.exit` guard and a safe non-matching test glob. (`scripts/tests/builder.test.ts`)
- **Hooks Dead for Codex/OpenCode/Antigravity**: The mapper was writing hooks in Claude Code PascalCase format, which rulesync couldn't parse — hooks ended up empty for all rulesync-distributed targets. Fixed by converting to canonical format with `hooks` key, camelCase events, and flattened structure. (`packages/core/src/mapper.ts`)
- **Duplicate OMP Skills**: OMP received skills via a superskill copy step from Pi, creating duplicates since OMP also reads `~/.agents/skills/` natively. Removed the redundant copy. (`apps/cli/src/commands/install.ts`)

## [0.2.1] - 2026-06-23

### New Features

- **Citation-Resolution Gate**: A new Spur post-check rule (`skill-citations-resolve`) catches two documentation-drift defect classes that pure content heuristics miss — dead `path:line` and symbol citations in `SKILL.md` bodies, and rubric dimension-count claims that disagree with the actual rubric. Runs automatically in `spur-check`. (`.spur/rules/quality/skill-citations.yaml`, `scripts/builder.ts`)
- **Builder Script as Library**: The release builder script is now importable as a library with pure, testable exports (`bumpMarketplaceManifests`, `bumpPackageVersion`, `validateVersion`, `computeTag`, `checkSkillCitations`, `postbuild`) — enabling server-side and web application integration. (`scripts/builder.ts`)
- **Meta-Agent Skill Refresh**: All five meta-agent skills (cc-agents, cc-commands, cc-hooks, cc-magents, cc-skills) updated with improved content, platform compatibility references, higher evaluation scores, and a new Source-Grounding Discipline section in cc-skills. (`plugins/cc/skills/*/SKILL.md`)

### Improvements

- **Unified Script Surface**: The citation-resolution checker consolidated from a standalone `scripts/check-skill-citations.ts` into the `scripts/builder.ts` dispatcher, reducing the scripts directory to one entry point. (`93ae033`)
- **Builder Test Suite**: 524 new unit tests covering version bumping, marketplace manifest updates, and citation-resolution checking — both defect classes, across 10+ scenarios. (`scripts/tests/builder.test.ts`)

## [0.2.0] - 2026-06-22

### New Features

#### Scaffold Template Tiers — Agent, Command, and Skill

- **Agent template tiers**: `--template` flag now accepts `default`, `minimal`, `standard`, or `specialist` — each tier provides progressively richer system-prompt content and frontmatter. Agent scaffold also accepts `--skills <list>` and `--tools <list>` flags for direct frontmatter population. All four templates score PASS on `agent evaluate`. (`apps/cli/src/templates/agent/`)
- **Command template tiers**: `--template` flag now accepts `simple` (one-shot, no sub-steps), `workflow` (multi-step with gates), `plugin` (delegates to a plugin command), or `default`. (`apps/cli/src/templates/command/`)
- **Skill template tiers**: `--template` flag now accepts `technique` (narrow how-to), `pattern` (reusable design pattern), `reference` (canonical lookup), or `default`. (`apps/cli/src/templates/skill/`)
- **Directory-based skill scaffold**: `superskill skill scaffold <name>` now writes to `<name>/SKILL.md` (a skill directory) instead of a bare `<name>.md` file — matching the convention used by the rest of the ecosystem.

#### Evolve System Completion — Heuristic Proposals + Full Lifecycle Flags

- **Seeded heuristic proposals**: `evolve` no longer requires an external agent for basic improvements. The CLI now seeds proposals from evaluation history — suggesting concrete changes for low-scoring dimensions without any model call. The generation seam (`--propose-only --json` / `--ingest`) remains for model-driven refinement.
- **`--analyze` flag**: Compute trends and emit analysis without generating proposals — useful for reviewing quality history before committing to changes.
- **`--history` flag**: Display the evaluation timeline for a given entity — per-dimension scores over time with trend direction.
- **`--rollback` flag**: Revert the most recently accepted proposal, restoring the file from its pre-proposal backup.
- **`--confirm` flag**: Accept a `draft` proposal by ID without re-running the double-loop gate (for pre-vetted proposals).
- **Frontmatter-less magent support**: `magent evolve` now works on plain-markdown main-agent configs (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) — no YAML frontmatter required. Body-based anchor hashing and governance section detection handle the seed/validate/anchor paths.

#### Hook Command Surface — Settled Design

Three design decisions codified for the `hook` command, resolving the surface divergence from other types:

- **`hook scaffold` removed** (task 0066 decision B): Hooks are hand-authored JSON in `hooks.json` — a markdown scaffold template was the wrong artifact type and misleading.
- **`hook refine` locked to suggest-only** (task 0061 decision C): No `--auto` flag; `--dry-run` is the only mode. Hook `command` strings are security-critical shell code — automated mutation is too dangerous.
- **`hook evolve` locked to analyze-only** (task 0056 decision C): No `--history`/`--rollback`/`--confirm` or apply path. Hook quality trends can be analyzed but content changes remain manual.

`hook validate` and `hook evaluate` continue to work normally — scoring against correctness, event-coverage, safety, and pattern-match-quality dimensions.

### Improvements

#### Refine — Dry-Run and Structural-First Auto-Apply

- **`--dry-run` flag on all refine commands**: Agent, command, magent, and skill `refine` now support `--dry-run`, which classifies findings and projects the score delta in-memory without writing files or creating backups.
- **Structural auto-apply before validation exit**: `refine --auto` now applies structural fixes (missing required frontmatter fields, wrong model aliases) before the validation step — a missing-`description` agent is fixed in one pass instead of being refused with "validation failed." Missing-field defaults are schema-aware (`model`→`inherit`, `tools`→`[]`), never `TODO` placeholders.

#### CC Plugin Command Wrappers — Realigned

All 17 plugin slash commands (`plugins/cc/commands/*.md`) re-aligned to match the CLI's actual capabilities after v0.2.0 changes:

- `agent-add`: updated to reflect template tiers, `--skills`, `--tools` flags
- `agent-evolve` / `command-evolve` / `magent-evolve` / `skill-evolve`: updated to reflect `--analyze`/`--history`/`--rollback`/`--confirm` flags
- `agent-refine` / `command-refine` / `magent-refine` / `skill-refine`: updated to reflect `--dry-run` support
- `skill-add`: updated to reflect template tiers and directory-based output
- Fixed missing header row in `agent-evolve` Arguments table

#### Meta-Agent Skills Refreshed

All six `cc-*` skills (`anti-hallucination`, `cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills`) and the `expert-hook` agent refreshed to reflect the settled hook command surface and current CLI capabilities.

### Bug Fixes

- **Six correctness defects across core + CLI (F1-F6)**: Fixed issues including `resolveContentPath` doubling `.md` on bare names, command evaluator scoring wrong schema fields, `dedupeLines` content corruption across heading blocks, backtick token score inflation, slash-command colon swallowed before translation, and parity test normalization. Each fix has a dedicated regression test.
- **`handleCommandRefine` dryRun type contract**: Command refine's handler was missing the `dryRun` field in its type contract, causing a type error on the `--dry-run` path. Fixed and covered.
- **Pi subagent parser hardened**: Replaced hand-rolled `parseFrontmatter` with the canonical parser from `content/frontmatter.ts` (ADR-012), fixing block-style YAML array and nested-value matching in the pipeline.

## [0.1.8] - 2026-06-21

### New Features

#### Hook Evaluation — Safety-First Scoring for hooks.json

- **New `/cc:hook-evaluate` command**: Evaluates `hooks.json` directly against 4 quality dimensions: correctness (command/type/matcher validity), event-coverage (lifecycle event breadth across 9 canonical events), safety (dangerous-command pattern scan), and pattern-match-quality (matcher specificity, timeout presence, path portability). Safety is weighted highest (0.35) — hooks run arbitrary shell commands and deserve the most scrutiny. (`plugins/cc/commands/hook-evaluate.md`)
- **Dangerous command detection**: The safety dimension scans for `rm -rf`, `curl | sh`, `--no-verify` bypasses, `eval`, `sudo`, `chmod 777`, unquoted command substitution, and backtick execution. Each dangerous pattern is named in findings with the hook event and truncated command string.

### Improvements

#### Evaluate — Parity Polish Across All Content Types

- **Skill evaluator findings/recommendations** (task 0047): Low-scoring dimensions now emit specific, actionable `findings` and `recommendations` — not just a one-line note. The shared formatter renders them as `Findings:` and `Recommendations:` blocks in human output. Same enrichment applies to agent, command, magent, and hook evaluators.
- **Agent evaluator readiness** (task 0048): All 5 agent dimensions (completeness, role-clarity, tool-selection, skill-linkage, model-fit) emit findings and recommendations for sub-perfect scores. Command wrapper aligned (D1 flag boundary, `--save` description). Weighted-aggregate test added — agent rubric weights (role-clarity 0.25 dominant) confirmed to produce different aggregates from equal-weight mean.
- **Magent evaluator — plain-markdown configs supported** (task 0050): AGENTS.md / CLAUDE.md / GEMINI.md are plain markdown by design. The magent evaluator now detects governance sections (project, commands, verification, conventions, safety, docs) via flexible regex matching rather than requiring YAML frontmatter. Body-based platform detection fallback for frontmatter-less configs. No more "Frontmatter parse error" on valid main-agent configs.

### Bug Fixes

- **Command evaluator scored wrong schema** (P1, task 0049): The command evaluator required a fictional `name` frontmatter field and an `arguments[]` array that don't exist in Claude Code commands. Every valid command (16 `plugins/cc/commands/*.md`) scored 0.43 FAIL/Grade F. Fixed `REQUIRED_FIELDS.command` to `['description']`, rewrote `scoreArgumentHints` for the real `argument-hint` string convention, and made `scoreToolReferences` read `allowed-tools` from frontmatter. All 16 commands now score 0.88 PASS/Grade B.
- **Magent bare-name resolution doubled `.md` extension** (P1, task 0050): `magent evaluate AGENTS.md` looked for `AGENTS.md.md` and returned "File not found." Fixed `resolveContentPath` to check the name as-is before appending `.md`. Extension-less names (e.g. `my-config`) still fall through to the `.md` append.

### Security

- **Hook safety scanning in evaluate**: The new `hook evaluate` command scans every `command` string in `hooks.json` for dangerous shell patterns before hooks are deployed. This is defense-in-depth: `hook validate` already checks schema, but `hook evaluate` catches what the commands actually do.

## [0.1.7] - 2026-06-21

### Bug Fixes

- **Pi/omp hooks silently dropped on install**: Two issues in the canonical-to-Pi hook converter prevented hooks from being emitted for `pi` and `omp` targets. (1) Claude Code uses PascalCase event names (`Stop`, `PreToolUse`) while the canonical mapping expected camelCase (`stop`, `preToolUse`) — fixed by normalizing the first character to lowercase before lookup. (2) Claude Code wraps hooks in a nested matcher structure (`{matcher: "*", hooks: [{type, command, timeout}]}`) that the converter didn't flatten — fixed by walking `def.hooks[]` when present. Pi and omp now correctly receive hook configuration.

### Improvements

- **`bun run bump-ver` now keeps marketplace and plugin manifests in sync**: The version bump script previously only updated `apps/cli/package.json`, leaving `.claude-plugin/marketplace.json` and `plugins/cc/plugin.json` stale. This caused Claude Code to skip installs because the plugin version appeared unchanged. The script now iterates all marketplace plugin entries, updates their `version` field, then updates each plugin's own `plugin.json` via the `source` path. All files are committed together.

---

## [0.1.4] - 2026-06-20

### New Features

#### Quality System — Rubric-Driven Evaluation & Evolution

- **Rubric config format**: Define quality criteria in YAML with weights, anchors, and versioning. Ships with 5 package-default rubrics (`agent`, `skill`, `command`, `hook`, `magent`). Load-time validation catches weight-sum and naming errors early. (`evaluate --rubric <path>`)
- **Scorer seam**: `evaluate --rubric --json` emits a scoring brief for an external model; `evaluate --ingest <file> --save` ingests the scored result and persists it. Enables model-driven quality scoring without the CLI making any model calls.
- **Generation seam**: `evolve --propose-only --json` emits a generation brief (with verbatim goal anchor, rubric criteria, and constraints); `evolve --ingest <file>` ingests authored proposed changes and applies them through the verify loop.
- **Double-loop gate**: Four-gate quality control for `evolve --ingest` — (1) deterministic `validate` (0 errors), (2) Δ-margin (score must improve by ≥ `--margin`, default 0.05), (3) anchor hash (goal anchor unchanged), (4) skeptic review (regressive merge rejected and restored). Configurable via `--margin`.
- **Version-aware quality trends**: `evolve` trends partition by `rubric_version`, preventing false regression signals when rubrics are updated.

#### Skill Operations

- **`skill package`**: Bundle a skill and its companion files (references, templates) into a distributable archive.
- **`skill migrate`**: Merge one or more source skills into a destination skill. Deterministic merge core (frontmatter union, body concat+dedupe) works standalone; `--refine` routes through the generation seam for model-assisted refinement.

#### Install Pipeline

- **Hook counts in install summary**: The `install` command now reports the number of hooks emitted to each target in its summary output.
- **Hook enablement shim for pi/omp/hermes**: Canonical hook events map to `@vahor/pi-hooks` format for `pi` and `omp`; `hermes` reuses the `opencode` surrogate output. Hook command strings are written as JSON data, never evaluated by the CLI.

#### Plugin Content

- **5 meta-agent skills migrated**: `cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills` — each with SKILL.md, references, and platform compatibility docs.
- **5 expert personas**: `expert-agent`, `expert-command`, `expert-hook`, `expert-magent`, `expert-skill` — define Scorer/Author/Skeptic/Judge roles with exact I/O contracts for the two-call seam pattern.
- **Anti-hallucination skill + guard engine**: Migrated from Spur. Prose-only skill in `plugins/cc/skills/anti-hallucination/`, guard engine in `plugins/cc/scripts/anti-hallucination/`, Claude Code Stop-hook wired in `hooks.json`.
- **`validate` hidden**: The standalone `validate` command is now hidden behind the `evaluate`/`refine`/`evolve` gate. CLI surface is 16 commands.

#### CLI & Architecture

- **Binary on PATH verification**: Build output path fixed to `dist/index.js` (matching the `bin` target). `scripts/builder.ts` postbuild is now idempotent. Phase 3 exit gate passes all 7 blocks.
- **Core package extraction**: Reusable domain logic (content, quality, pipeline, rubrics, targets, marketplace, mapper, rulesync) moved from `apps/cli` to a new `@gobing-ai/superskill-core` workspace package at `packages/core`. CLI imports switched to the workspace alias. Package-boundary test enforces core never imports from app, never calls `process.exit`, and never writes to stdout/stderr. Enables independent reuse of the domain logic.
- **ts-libs 0.3.21**: Upgraded `@gobing-ai/ts-*` dependencies from 0.3.19 to 0.3.21. `omp`, `hermes`, and `antigravity-cli` are now canonical `AgentName` values — slash-command dialect translation maps 1:1 instead of proxying through `pi`/`opencode`. Only `antigravity-ide` still bridges through `opencode`.

### Improvements

- **Adapt gap audit closed**: Verified that the 4-stage install conversion pipeline (`rewriteColonRefs`, `translateSlashCommands`, `normalizeFrontmatter`, `convertToPiSubagent`) covers all transforms previously handled by the deleted `adapt.ts`/`adapters/` code. 15-test parity regression test (`adapt-parity.test.ts`) locks this in.
- **Pi-subagent parser hardened**: Replaced hand-rolled `parseFrontmatter` with the canonical parser from `content/frontmatter.ts` (ADR-012), fixing block-style YAML array and nested-value matching bugs.
- **Hook event dedup**: `KNOWN_HOOK_EVENTS` is now exported once from `quality/hook.ts` and imported by `operations/validate.ts` instead of being defined in both.
- **Plugin resolution dedup**: Extracted `resolvePluginRoot()` helper shared by `install` and `hook emit`, replacing duplicate 18-line blocks.
- **`refine --auto` mode fixed**: Was skipping all findings instead of applying auto-apply fixes. Now applies auto-classified findings via `applyAutoFixes()`, with trailing-whitespace handling and strict validation enabled.

### Bug Fixes

- **fix(skill)**: Use `echo()` over `stdout.write` in skill package handler to satisfy spur violations; renamed test file to `package.test.ts` for clarity.

---

## [0.1.6] - 2026-06-21

### New Features

#### Skills 2.0 — Unified Entity Distribution

- **Commands and subagents adapted as skills for non-Claude targets**: `superskill install` now converts Claude Code plugin commands and subagents into Skills 2.0 skill directories via `pipeline/adapt-command.ts` and `pipeline/adapt-subagent.ts`. Commands become non-invocable skill entries (`disable-model-invocation: true`); subagents remain model-invocable with preserved trigger examples, tools, skills, and color. Pi additionally receives native agent format via `pipeline/pi-subagent.ts`. Every target now receives a uniform skill-based layout — omp and hermes no longer receive zero commands/subagents.
- **Plugin-scoped colon reference rewriting**: Replaced the hardcoded `/(rd3|wt):/` allowlist with plugin-prefix-scoped `pluginPrefix:name` → `pluginPrefix-name` rewriting (`pipeline/rewrite-references.ts`). The rewriter threads the plugin name through the install pipeline, correctly handling `cc:`, `sp:`, and any other plugin prefix while preserving non-plugin colons (`node:fs`, `bun:test`, etc.).
- **Pi subagent discovery filtered to existing skills**: `convertToPiSubagent` now verifies the skill directory exists before emitting `skill:` entries, matching the old shell-script behavior. Eliminates phantom skill references.

#### Claude Code Native Plugin Install

- Claude Code targets now use the native `claude plugin marketplace add` + `claude plugin install` flow. Cache clearing is defensive and marketplace-name-scoped. Replaces the broken `--path` flag approach.

#### Meta Agent Skills

- All five meta-agent skills (`cc-agents`, `cc-commands`, `cc-hooks`, `cc-magents`, `cc-skills`) now ship with full `references/` documentation (workflows, platform compatibility, evaluation frameworks, troubleshooting), `metadata.openclaw` platform metadata, and `agents/openai.yaml` Codex platform config. Each skill is a self-contained knowledge module ready for multi-platform distribution.

### Improvements

#### Quality System

- **Shared keyword lists**: Imperative verb and vague-term lists extracted into shared constants — no more 4× duplication across command/skill evaluators.
- **Unified clarity scoring**: Command and skill evaluators now share one `scoreClarityFromDensities` formula, making quality scores comparable across entity types.
- **Tightened tool-reference heuristic**: Backtick token regex no longer matches arbitrary inline-code spans (`json`, `true`). Now matches actual tool names and `tool(s):` frontmatter.
- **Split `dimensions.ts`**: Registry (`types.ts`) separated from heuristics (`heuristics.ts`). Single `evaluate(type, ...)` dispatch replaces duplicated `evaluate<Agent>`, `evaluate<Command>`, etc. functions.
- **Documented `computeAggregate`**: Explicit doc-comment notes the unweighted-mean design for heuristic path (rubric weights apply only on `--ingest`).

#### Pipeline

- **Shared frontmatter walker**: `walkFrontmatter` extracted as a single implementation shared by `adapt-command` and `adapt-subagent`. Replaces two near-identical inline walkers.
- **Removed dead `ConversionPipeline`**: Unused class deleted; `docs/03` aligned.

#### Install Robustness

- **`outputRoot` threaded through rulesync**: Global-mode skills now land in correct directories. Project-mode parent directories pre-created to prevent ENOENT on fresh workspaces.
- **`..` traversal guard tightened**: Replaced substring `.includes('..')` check with path-segment regex matching actual `../` traversal patterns, fixing false rejections for legitimate paths like `./a..b/plugin`.

#### Documentation

- **Entity location tables**: Added verified global and project-level entity paths for all 9 target agents (Claude Code, Codex, Pi, omp, OpenCode, Antigravity IDE/CLI, Hermes, OpenClaw). Each path verified against the agent's source code in `vendors/`.
- **Help docs refreshed**: `cmd_install.md` updated with current pipeline modules and workspace-refactored source paths. Plugin README updated with Skills 2.0 adaptation design notes.

### Bug Fixes

- **`dedupeLines` content corruption** (P2): Merging two skills that shared a heading, list item, or code fence silently deleted later occurrences. Fixed to scope deduplication to heading blocks — content preservation confirmed across 843 tests.
- **Backtick token score inflation** (P3): Any inline-code span with ≥2 backtick tokens saturated the tool-reference score to 1.0. Now matches only known tool names.
- **Slash-command colon swallowed before translation** (P2, bug-081): `rewriteSkillReferences` was stripping the slash-command colon before the per-target slash translator ran, causing codex/pi dialect translation to silently no-op in real installs. Fixed: slash-command lines are now preserved for the translator. Integration assertion tightened to require the `$` prefix.
- **Parity test normalization bug**: Deleted dead `normalizeFrontmatter` function that was silently swallowing block-style YAML arrays. Reworked parity test to use the canonical frontmatter parser (ADR-012).

---

## [0.1.3] - 2026-06-17

_Initial tagged release. See git history for details._
