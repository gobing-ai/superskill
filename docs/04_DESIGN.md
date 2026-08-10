---
doc: 04_DESIGN
owns: SURFACE — concrete shapes: every CLI command, flag, config key, env var, table, DTO
authority: derived
version: 2.7.0
derived_from: [00_ADR, 01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-08-09
read_before: changing a command, flag, env var, or schema
edit_rules: 99 §6.5
sync: [T3]
---

# Design — Surface Reference

- Phase 1 — Distribution: [design-doc-phase1.md](design/design-doc-phase1.md) — `superskill install` and supporting commands.
- Phase 2 — Authoring + quality: [design-doc-phase2.md](design/design-doc-phase2.md) — `superskill agent|skill|command|hook|magent` with scaffold, validate, evaluate, refine, evolve.

## Phase 1 install surface

```text
superskill install <plugin> [--marketplace <locator>] [--targets <list>] [--no-global]
    [--magent <name>] [--marketplace-source <directory|github>] [--dry-run] [--verbose]
```

| Input | Shape and precedence |
|-------|----------------------|
| `<plugin>` | Required plugin name — a **bare segment** (`assertSafePathSegment`); never a URL/path |
| `--marketplace <locator>` | Marketplace locator (ADR-034). **Local-first disambiguation:** an existing local path is local; only a non-existent `^[\w.-]+/[\w.-]+$` is GitHub shorthand; `https://`/`git@` are always remote. Local probe: direct file (`.../marketplace.json`) → `<X>/marketplace.json` → `<X>/.claude-plugin/marketplace.json`. Remote content caches at `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>/`. Overrides configured plugin path and ambient discovery |
| `--marketplace-source <mode>` | **Deprecated** (ADR-034): warns to stderr, keeps behavior, removal planned. Prefer `--marketplace <locator>` |
| `--targets <list>` | Comma-separated target names or `all`; overrides configured targets |
| `superskill.jsonc` | Project-local JSONC; supports line/block comments and trailing commas |
| `version` | Literal `1` |
| `plugins` | `{ name: string, path: string }[]`; matching path is used when `--marketplace` is absent |
| `targets` | `Target[]`; an empty array means all targets |
| `features` | Any of `skills`, `commands`, `subagents`, `hooks`, `mcp`; defaults to all five |

Feature selection filters canonical mapper output. Native Claude/OMP/Grok installation rejects a
partial feature set because those host installers operate on the full plugin package.
Pi and Codex additionally receive native agent files at install time: Pi agents
at `~/.pi/agent/agents/<plugin>-<agent>.md` (YAML) and Codex agents at
`~/.codex/agents/<plugin>-<agent>.toml` (TOML). The Codex adapter reads a
platform-neutral `model-tier:` frontmatter field (`judgment` | `execution`,
default `execution`) and maps it to Codex per-agent `model` and
`model_reasoning_effort` keys via `CODEX_MODEL_TIERS` (ADR-033). Unknown tier
values throw at install time. The tier classification rubric lives at
`plugins/cc/skills/cc-agents/references/model-tiers.md`; the agent quality
rubric's `model-fit` dimension verifies the declared tier at authoring time.

## Phase 2 command surface

| Command family | Lifecycle subcommands | Shared scaffold flags | Shared refine flags | Detail |
|----------------|-----------------------|-----------------------|---------------------|--------|
| `superskill agent|skill|command|hook|magent` | `scaffold`, `validate`, `evaluate`, `refine`, `evolve` | `--description <text>`, `--target <agent>`, `--output <dir>`, `--template <tier>`, `--tools <list>`, `--force` | `--target <agent>`, `--auto`, `--save`, `--dry-run` | [design-doc-phase2.md §2.1](design/design-doc-phase2.md#21-scaffold--generate-from-template), [§2.4](design/design-doc-phase2.md#24-refine--evaluate-then-fix) |

`--dry-run` previews classified refine fixes and projected score delta without writing files or creating backups.
Only `skill scaffold` exposes `--invocation-mode <user|model>`; the other scaffold families do not
accept it because their output contracts have no invocation-mode field.

`agent|command|magent|skill evolve` share the evolve surface from phase 2, including `--eval-gate`.
`--margin` must be a finite number in `[0, 1]`; invalid `--from` dates and unsafe proposal IDs are
rejected. A saved evaluation result carries its exact `evaluationId`, which the evolve transaction
uses as the proposal's `verify_id`.
When `--eval-gate` is set and `skills/<name>/eval/cases.yaml` exists, the evolve accept path runs
the empirical behavior gate after the form Δ-margin gate and before anchor/skeptic checks. The
`cases.yaml` artifact shape is:

```yaml
version: 1
cases:
  - id: unique-case-id
    split: train | holdout
    prompt: "case prompt"
    reference_kind: exact | rule | rubric
    reference: "exact reference text"
```

For `reference_kind: rule`, `reference` is `{ checks: [{ op: contains | regex | equals | not_contains | tool_called, arg: string }] }`.
For `reference_kind: rubric`, `reference` is `{ criterion: string, excellent?: string, poor?: string }`; the gate replays candidate and baseline outputs, judges them pairwise through `@gobing-ai/ts-ai-runner`, estimates a signed-margin noise floor from N judge replays, rejects within-noise wins, and persists `empirical.{hard,holdout_n,train_n,noise_floor,rubric_delta}` in the evaluation dimensions JSON.
The gate is opt-in and skip-when-absent: without the flag or without `cases.yaml`, no replay backend
is constructed and evolve behavior remains unchanged. If the configured model-call budget is exceeded during replay/judging, the empirical gate fails loud and restores the candidate file.

**Hook divergence (tasks 0061, 0066):** `hook` does NOT share the full surface above. Hooks are hand-authored in `hooks.json` (JSON, security-critical), so: (1) `hook scaffold` is removed — scaffold emits markdown, which is the wrong artifact type for JSON config; (2) `hook refine` is **suggest-only** — it registers only `--target`/`--dry-run` (no `--auto`/`--save`), and the engine forces the dry-run path so no fix is ever applied; (3) `hook evolve` is **analyze-only** (task 0056) — no `--history`/`--rollback`/`--confirm`. `hook validate` and `hook evaluate` work normally. `ContentType` retains `'hook'` for all lifecycle operations; only scaffold/refine/evolve diverge.

Pi and Hermes hook emitters share owner-aware reconciliation: entries bearing the current plugin's
ownership marker are pruned across every event before desired hooks are added; unowned and
foreign-owned entries are retained. Empty desired hooks therefore remove stale owned entries.

Context hook sessions use `.session-<sha256-prefix>.json`, keyed by payload `session_id` or
`transcript_path`. Identity-free payloads reuse a session only when exactly one candidate exists.

## Plugin-level scripts directory

Executable logic a skill invokes at the user's install site lives in `plugins/<plugin>/scripts/<skill>/` (shared across the plugin's skills). NOT per-skill `scripts/` (reintroduces duplication); NOT `packages/*` (not part of the plugin install payload). Per ADR-023, delivery follows a **dual contract**:

- **Native marketplace installs** (Claude/OMP/Grok): full plugin tree ships in the cache, including `scripts/`.
- **Rulesync/Hermes class**: install stages scripts to `~/.agents/scripts/<plugin>/<feature>/` (tree shape preserved; fail-closed if absent). Staging entrypoint: `stagePluginScripts` in `apps/cli/src/commands/install.ts`; native-class skip gate: `needsSharedScriptsRoot`.

**Invocation standard** for skill docs and other non-hook callers is the Entrypoint Contract v1 form `node "$(superskill script path <plugin> <feature>/<file>.js)" [args]` (portable Node `.js`/`.mjs` + POSIX `.sh`, no Bun-on-target). **Optional invocation** for engines the CLI deep-imports: `superskill script run <plugin> <id>` / `superskill hook run <plugin> <id>` (ADR-022, amended by ADR-024). See the [plugin-scripts author guide](help/how_to_organize_scripts_for_plugin_development.md) for the dual contract.

| Surface | Path | Purpose |
|---------|------|---------|
| Guard engine | `plugins/cc/scripts/anti-hallucination/ah_guard.ts` | Pure `verifyAntiHallucinationProtocol(text)` + direct-invocation `main()`; payload resolved by `resolveStopContext` (stdin first — Claude Code `transcript_path` / omp `agent_end`; `$ARGUMENTS` is the legacy/test channel) |
| Validate adapter | `plugins/cc/scripts/anti-hallucination/validate_response.ts` | Thin wrapper: `RESPONSE_TEXT`/stdin → verify → exit 0/1 (CLI semantics, **not** the hook block signal) |
| Shared logger | `plugins/cc/scripts/anti-hallucination/logger.ts` | Single shared copy (dedup'd from per-skill copies) |
| Stop-hook config | `plugins/cc/hooks/hooks.json` | `Stop` command hook → `superskill hook run cc anti-hallucination` (portable PATH command; the dispatcher `apps/cli/src/commands/hook-run.ts` routes to the guard engine). Declares `minCliVersion` so an older CLI cannot install a contract it does not implement. |
| Engine tests | `plugins/cc/scripts/anti-hallucination/tests/` | 2 test files (ah_guard, validate_response); counted in coverage gate |
| Stdin reader | `apps/cli/src/stdin.ts` | `readStdinNonBlocking(firstByteMs, idleMs)` — the payload channel for `script run` / `hook run`. See the stdin contract below. |

### Stdin payload contract (`script run` / `hook run`)

Hook and script runners receive their payload on fd 0 from the spawning host. `readStdinNonBlocking`
(`apps/cli/src/stdin.ts`) reads it through stream events under a bounded budget, because a plain
`readFileSync(0)` blocks forever when a host opens the pipe but never writes and never closes it —
observed with Antigravity, and it hangs the agent mid-run.

| Condition | Result |
|-----------|--------|
| Interactive TTY | `undefined` — nothing was piped (manual invocation) |
| Data arrives, then `end` | full payload |
| Data streamed in several writes | full payload — the budget is re-armed per chunk, so a multi-write payload is **never** truncated |
| No byte within `firstByteMs` | `undefined` — bounded give-up, so a silent host cannot hang the process |
| Whitespace-only input | `undefined` |
| Stream error | `undefined` |

The budget is an **idle** timeout, never a deadline on the whole read. This is a correctness
requirement, not a tuning choice: every runner fails open on an unparseable payload
(`runSpTaskWriteGuard`, `runStopGuard`), so a truncated read silently converts a guard `deny` into an
`allow`. Default `250` ms, overridable with **`SUPERSKILL_STDIN_TIMEOUT_MS`** (positive integer;
invalid values fall back to the default).

Residual, by design: a host whose *first* byte arrives later than `firstByteMs` has its payload
dropped and the runner fails open. Real hosts write at spawn and the payload is already buffered by
the time the runtime boots, so the budget is generous in practice — raise
`SUPERSKILL_STDIN_TIMEOUT_MS` for a host that genuinely writes late. `plugins/cc/scripts/anti-hallucination/ah_guard.ts`
carries a deliberate duplicate (`readPipedStdin`) for its staged direct-invocation path, which may
not import from `apps/cli`; keep the two in sync.

Skill folders are prose-only: `plugins/cc/skills/anti-hallucination/` holds `SKILL.md`, `references/*.md`, `agents/openai.yaml`, `metadata.openclaw` — no `.ts` runtime.

Phase 4 (pending): cross-agent enforcement re-developed as `spur workflow run anti-hallucination.yaml --vars '{"agent":"codex"}'`, replacing the 6 former per-agent launcher scripts. Blocked on Spur-side data-threading gap (see ADR-015).

## Skills-ecosystem module surface (`packages/core/src/skills-ecosystem/`)

Ports of vercel-labs/skills (MIT) for `npx skills` interop (feature B, tasks 0098/0099). All modules re-exported from `packages/core/src/index.ts`; the ecosystem `parseFrontmatter` is exported as `parseSkillMdFrontmatter` to avoid the ambiguous-`export *` collision with `content/frontmatter`.

| Module | Surface | Purpose |
|--------|---------|---------|
| `source-parser.ts` | `parseSource`, `getOwnerRepo`, `sanitizeSubpath`, `isSubpathSafe`, `ParsedSource` | Full source grammar: `owner/repo[/subpath][@skill][#ref]`, `github:`/`gitlab:` prefixes, `/tree/` + `/-/tree/` URLs, git@/ssh/http(s), local paths, `SOURCE_ALIASES`, `..` rejection |
| `github-host.ts` | `getGitHubHost`, `isGitHubHost` | GHE host resolution; **`GH_HOST`** read per-call, never at module load |
| `sanitize.ts` | `sanitizeName`, `stripTerminalEscapes`, `sanitizeMetadata` | CWE-150 terminal-escape stripping; control bytes built via `String.fromCharCode` (no lint suppression) |
| `frontmatter.ts` | `parseFrontmatter` (as `parseSkillMdFrontmatter`), `parseSkillFrontmatter` | YAML-only SKILL.md frontmatter (no `---js` engine); name+description required strings |
| `agents.ts` | `TARGET_TIERS`, `TARGET_AGENTS`, `getTargetAgentConfig`, `detectInstalledTargetAgents`, `InstallTier` | 9-target registry with install tiers (`direct`/`symlink`/`translate`); env overrides **`CODEX_HOME`**, **`CLAUDE_CONFIG_DIR`**, **`HERMES_HOME`**, **`GROK_HOME`**, **`XDG_CONFIG_HOME`**; per-agent dirs vendor-faithful (interop data, not superskill's landing paths) |
| `locks.ts` | lock read/writers + `isCanonicalSkillPath`, `computeCanonicalSkillFolderHash`, `computeStructuredContentHash`, `computeContentHash` | Dual lock schemas below; version-mismatch preservation (never auto-wipe); atomic same-parent lock replacement; canonical-only, length-framed hash invariant |
| `fetch.ts` | `tryBlobInstall`, `fetchRepoTree`, `findSkillMdPaths`, `getSkillFolderHashFromTree`, `cloneRepo`, `cleanupTempDir`, `getGitHubToken`, `ghAuthTokenFromCli`, `spawnGit`/`spawnGh` (DI seams) | GitHub Trees/Blob fast path (clone-free, tree-SHA folder hash) + hardened `git clone --depth 1` fallback into mkdtemp (protocol allowlist `https:http:ssh:git:file`, `ext::` rejected, `GIT_TERMINAL_PROMPT=0`, LFS smudge off, 300 s timeout, https→gh→ssh auth fallback). Token resolution: **`GITHUB_TOKEN`**/**`GH_TOKEN`** env first, lazy `gh auth token` only after a 403/429 + `X-RateLimit-Remaining: 0` rate-limit. **`SKILLS_DOWNLOAD_URL`** overrides the skills.sh download base per call |
| `discovery.ts` | `discoverSkills`, `parseSkillMd`, `filterSkills`, `getSkillDisplayName`, `AGENT_PROJECT_SKILL_DIRS`, `SKIP_DIRS`, `isSubpathSafe` (re-export) | SKILL.md scan: searchPath, priority dirs (root, `skills/`, `.curated`/`.experimental`/`.system`, 26 agent dirs), catalog one-extra-level layout, depth-5 recursive fallback skipping `node_modules`/`.git`/`dist`/`build`/`__pycache__`; `metadata.internal` hidden unless **`INSTALL_INTERNAL_SKILLS=1`**; subpath safety enforced |
| `installer.ts` | `FilesystemTransaction`, `installSkillCanonical`, `sanitizeName`, `isPathSafe`, `pathsOverlap`, `getCanonicalSkillsDir`, `createSymlink`, `copyDir`, `writeBlobSkill` | Canonical copy to `<cwd\|~>/.agents/skills/<sanitizeName(name)>`; same-parent reversible replacement/removal; relative symlinks (win32 `junction`) with copy fallback; source-copy rejection of symlinks/special files; `isPathSafe` on every checked write target; `pathsOverlap` refusal (never install onto/inside the source) |
| `emit.ts` | `emitSkillForTargets`, `removeSkillFromTargets`, `resolveSkillsToRemove`, `EmitOptions` | Three-tier per-target emission: direct (canonical only), symlink from the agent's native skills dir, translated copy re-driving the install pipeline's primitives (`translateSlashCommands` → `rewriteSkillReferences` with the skill name as plugin prefix). Removal sweeps all tiers; lock-key-wins name resolution via `lockKeys` (exact key returned for lock removal). `EmitOptions.name` overrides the canonical dir name; optional `transaction` retains reversible mutations for the calling operation |
| `operations.ts` | `addSkills`, `listSkills`, `removeSkills`, `updateSkills` + option/result envelopes | Domain operations behind the CLI verbs. Add/update resolve exclusively through `parseSource`; `ParsedSource` controls blob/clone URL, ref, subpath, filter, and source type. Add/remove preflight lock versions, stage every canonical/target mutation in one `FilesystemTransaction`, write the scope lock once, then commit or roll back. Global local sources persist absolute paths. `listSkills`: scoped lock + canonical on-disk scan for BOTH scopes (unlocked dirs surface as `source: 'disk-scan'`). Update's source-hash pre-check keeps unchanged skills a true no-op; undecidable sources reinstall (never a false no-op) |

**CLI verbs (task 0102).** Registered under the existing `skill` group (`apps/cli/src/commands/skill.ts`); `superskill install` is untouched. Non-interactive by design (AI-first); `-y` accepted for vendor-parity scripts; `--json` emits the operation's result envelope. Handlers accept an injected `homeDir` (test seam, not a CLI flag).

| Verb | Flags | Behavior |
|------|-------|----------|
| `superskill skill add <source>` | `-s, --skill <name...>`, `-a, --agent <targets...>`, `-g, --global`, `--copy`, `-y, --yes`, `--list`, `--dry-run`, `--json` | Install from a local path or parsed GitHub/GitLab/git source (`@skill`, `#ref`, and subpaths honored). Project scope default; `-g` for user-level. `--list` discovers without installing; `--dry-run` previews with zero writes (no canonical copy, no lock) |
| `superskill skill list` | `-g, --global`, `--json` | Scoped lock entries + on-disk scan of the scope's canonical dir |
| `superskill skill remove <names...>` (alias `rm`) | `-g, --global`, `-y, --yes`, `--json` | Sweeps canonical + all target tiers, removes the scoped lock entry (lock-key-wins name resolution) |
| `superskill skill update [names...]` | `-g, --global`, `-y, --yes`, `--json` | Hash-based: no-op when the source hash equals the stored hash; reinstall + re-emit all tiers when changed. No names = every skill in the scope's lock |

**Local lock — `./skills-lock.json` (v1, `LOCAL_LOCK_VERSION = 1`).** Sorted keys, timestamp-free. Entry: `source`, `sourceType`, `computedHash` (SHA-256 over sorted, unsigned-64-bit-length-framed relative path/content pairs from the CANONICAL skill folder), optional `sourceUrl`, `ref`, `skillPath`, `subagents`.

**Global lock — `~/.agents/.skill-lock.json` (v3, `GLOBAL_LOCK_VERSION = 3`; `$XDG_STATE_HOME/skills/` when set).** Entry: `source`, `sourceType`, `sourceUrl`, `skillFolderHash` (same canonical length-framed SHA-256 as local), `installedAt`, `updatedAt`, optional `ref`, `skillPath`, `pluginName`; file also carries optional `dismissed` and `lastSelectedAgents`. Vendor-shaped locks in the wild may omit `sourceUrl`; reads tolerate it (no runtime validation). All global-lock accessors take an optional `homeDir` (test/seam injection; defaults to `os.homedir()`); `computeCanonicalSkillFolderHash` takes optional exclusion sets so a source directory hashes comparably to its canonical copy (update no-op check).

**Version-mismatch contract (R3).** Reads never wipe: newer or older versions return the parsed lock with a `warning` field; the vendor's wipe-on-bump is not ported. Writers refuse warned locks and throw when the on-disk version differs from the supported one — migration is always an explicit caller act.

## Canonical `hooks.json` config shape

A plugin's `hooks.json` is the canonical (abstract) hook definition consumed by `superskill install` and emitted to per-platform targets (rulesync, hermes, pi, OMP). Top-level shape (`CanonicalHooksConfig` at `apps/cli/src/hooks.ts`):

| Field | Type | Purpose |
|------|------|---------|
| `hooks` | `Record<string, HookEvent[]>` | Platform-agnostic hook entries keyed by event (`PreToolUse`, `PostToolUse`, `Stop`, …). The only required structural field. |
| `minCliVersion` | `string` (semver) | **Compat floor (task 0074, ADR-021).** When set, `superskill install` reads the installed CLI version and, if below the floor, warns + skips emitting this plugin's hooks (skills still install). Warn-and-skip only — Claude Code's marketplace sync bypasses `superskill install`, so the floor is early-warning, not enforcement; the load-bearing protection is the fail-open policy (ADR-020). Omitted/empty = no floor. |

Non-`hooks` top-level fields (including `minCliVersion`) survive round-trip conversion through `packages/core/src/mapper.ts` (`convertClaudeHooksToCanonical` preserves all non-hooks metadata).
