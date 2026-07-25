---
doc: 04_DESIGN
owns: SURFACE — concrete shapes: every CLI command, flag, config key, env var, table, DTO
authority: derived
version: 2.3.0
derived_from: [00_ADR, 01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-07-10
read_before: changing a command, flag, env var, or schema
edit_rules: 99 §6.5
sync: [T3]
---

# Design — Surface Reference

- Phase 1 — Distribution: [design-doc-phase1.md](design/design-doc-phase1.md) — `superskill install` and supporting commands.
- Phase 2 — Authoring + quality: [design-doc-phase2.md](design/design-doc-phase2.md) — `superskill agent|skill|command|hook|magent` with scaffold, validate, evaluate, refine, evolve.

## Phase 2 command surface

| Command family | Lifecycle subcommands | Shared scaffold flags | Shared refine flags | Detail |
|----------------|-----------------------|-----------------------|---------------------|--------|
| `superskill agent|skill|command|hook|magent` | `scaffold`, `validate`, `evaluate`, `refine`, `evolve` | `--description <text>`, `--target <agent>`, `--output <dir>`, `--template <tier>`, `--skills <list>`, `--tools <list>`, `--force` | `--target <agent>`, `--auto`, `--save`, `--dry-run` | [design-doc-phase2.md §2.1](design/design-doc-phase2.md#21-scaffold--generate-from-template), [§2.4](design/design-doc-phase2.md#24-refine--evaluate-then-fix) |

`--dry-run` previews classified refine fixes and projected score delta without writing files or creating backups.

`agent|command|magent|skill evolve` share the evolve surface from phase 2, including `--eval-gate`.
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
| `locks.ts` | lock read/writers + `isCanonicalSkillPath`, `computeCanonicalSkillFolderHash`, `computeContentHash` | Dual lock schemas below; version-mismatch preservation (never auto-wipe); canonical-only hash invariant |

**Local lock — `./skills-lock.json` (v1, `LOCAL_LOCK_VERSION = 1`).** Sorted keys, timestamp-free. Entry: `source`, `sourceType`, `computedHash` (SHA-256 over sorted relpath+content of the CANONICAL skill folder), optional `sourceUrl`, `ref`, `skillPath`, `subagents`.

**Global lock — `~/.agents/.skill-lock.json` (v3, `GLOBAL_LOCK_VERSION = 3`; `$XDG_STATE_HOME/skills/` when set).** Entry: `source`, `sourceType`, `sourceUrl`, `skillFolderHash` (GitHub tree SHA), `installedAt`, `updatedAt`, optional `ref`, `skillPath`, `pluginName`; file also carries optional `dismissed` and `lastSelectedAgents`. Vendor-shaped locks in the wild may omit `sourceUrl`; reads tolerate it (no runtime validation), matching the vendor.

**Version-mismatch contract (R3).** Reads never wipe: newer or older versions return the parsed lock with a `warning` field; the vendor's wipe-on-bump is not ported. Writers refuse warned locks and throw when the on-disk version differs from the supported one — migration is always an explicit caller act.

## Canonical `hooks.json` config shape

A plugin's `hooks.json` is the canonical (abstract) hook definition consumed by `superskill install` and emitted to per-platform targets (rulesync, hermes, pi, OMP). Top-level shape (`CanonicalHooksConfig` at `apps/cli/src/hooks.ts`):

| Field | Type | Purpose |
|------|------|---------|
| `hooks` | `Record<string, HookEvent[]>` | Platform-agnostic hook entries keyed by event (`PreToolUse`, `PostToolUse`, `Stop`, …). The only required structural field. |
| `minCliVersion` | `string` (semver) | **Compat floor (task 0074, ADR-021).** When set, `superskill install` reads the installed CLI version and, if below the floor, warns + skips emitting this plugin's hooks (skills still install). Warn-and-skip only — Claude Code's marketplace sync bypasses `superskill install`, so the floor is early-warning, not enforcement; the load-bearing protection is the fail-open policy (ADR-020). Omitted/empty = no floor. |

Non-`hooks` top-level fields (including `minCliVersion`) survive round-trip conversion through `packages/core/src/mapper.ts` (`convertClaudeHooksToCanonical` preserves all non-hooks metadata).