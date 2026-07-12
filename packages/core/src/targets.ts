import type { AgentName } from '@gobing-ai/ts-ai-runner';
import type { ToolTarget } from 'rulesync';

/** Canonical target agents supported by superskill. */
export const TARGETS = [
    'claude',
    'codex',
    'pi',
    'omp',
    'opencode',
    'antigravity-cli',
    'antigravity-ide',
    'hermes',
    'grok',
] as const;

/** Union type of all supported target agents. */
export type Target = (typeof TARGETS)[number];

/** Map superskill targets to rulesync `ToolTarget` strings. Claude Code, omp, hermes, and grok are not in rulesync. */
export const TARGET_TO_RULESYNC: Partial<Record<Target, ToolTarget>> = {
    // Codex, pi, and omp all share '~/.agents/skills/' natively (ADR-010 amendment 2026-06-23)
    // — collapsing them onto rulesync's 'codexcli' target writes one shared copy rather than
    // duplicating skills per agent. Antigravity targets do NOT share that directory: the
    // Antigravity CLI (agy) reads `~/.gemini/antigravity-cli/skills/` and the Antigravity IDE
    // reads `~/.gemini/config/skills/`, so each must reach its native rulesync generator
    // (verified against rulesync 8.28.1 — see vendors/rulesync/src/features/skills/).
    codex: 'codexcli',
    pi: 'codexcli',
    opencode: 'opencode',
    'antigravity-cli': 'antigravity-cli',
    'antigravity-ide': 'antigravity-ide',
};

/**
 * Hook-specific target map. Hooks always reach each target's native rulesync generator
 * (`.agents/hooks.json` project, `.gemini/config/hooks.json` global for Antigravity). Targets
 * absent here (claude/pi/omp/hermes/grok) are handled outside rulesync (native install /
 * surrogate shims / Claude-format plugin hooks).
 */
export const TARGET_TO_RULESYNC_HOOKS: Partial<Record<Target, ToolTarget>> = {
    codex: 'codexcli',
    opencode: 'opencode',
    'antigravity-cli': 'antigravity-cli',
    'antigravity-ide': 'antigravity-ide',
};

/**
 * Per-target relative skills output directory in PROJECT mode (global=false).
 * Used by `executeInstall` to pre-create parent dirs before rulesync writes,
 * Verified empirically against rulesync 8.28.1 (2026-07-07) by running
 * `generate({ features:['skills'], global:false })` per target. Global-mode
 * paths differ (e.g. codex/pi→`.agents/skills`, antigravity-cli→`.gemini/antigravity-cli/skills`,
 * antigravity-ide→`.gemini/config/skills`, opencode→`.config/opencode/skills`)
 */
export const TARGET_SKILLS_RELDIR: Partial<Record<Target, string>> = {
    codex: '.agents/skills',
    pi: '.agents/skills',
    opencode: '.opencode/skills',
    'antigravity-cli': '.agents/skills',
    'antigravity-ide': '.agents/skills',
};

/**
 * Per-target global skills output directory relative to `$HOME` (used when
 * `options.global === true`). The full landed path is
 * `homedir() + '/' + TARGET_GLOBAL_SKILLS_RELDIR[target]`.
 *
 * Verified against rulesync 8.29.0 by reading the per-target `getGlobalSubdir()` /
 * `getSettablePaths({ global: true })` source and confirming with a real install
 * against an isolated `$HOME` (task 0072 R3 live smoke, 2026-07-07). The
 * Codex/pi/omp/omitted reldirs are intentionally absent — those targets route
 * through the codexcli target's reldir (`.agents/skills`) which is a project-mode
 * invariant; their global landing is owned by rulesync and follows the codex
 * row.
 */
export const TARGET_GLOBAL_SKILLS_RELDIR: Partial<Record<Target, string>> = {
    codex: '.agents/skills',
    opencode: '.config/opencode/skills',
    'antigravity-cli': '.gemini/antigravity-cli/skills',
    'antigravity-ide': '.gemini/config/skills',
};

/**
 * Bridge every superskill `Target` to a `@gobing-ai/ts-ai-runner` `AgentName`
 * for slash-command dialect translation via `translateSlashCommand`.
 *
 * Since ts-ai-runner 0.3.21, `AgentName` includes `omp`, `hermes`, and
 * `antigravity-cli` as canonical ids, so those targets map 1:1. Only
 * `antigravity-ide` (not in `AgentName`) still bridges to `opencode`
 * (falls to `translateSlashCommand`'s default `/plugin-command` dialect).
 *
 * **Grok (ts-ai-runner ≥ 0.4.8):** maps 1:1 for type completeness, but
 * `translateSlashCommand('grok', …)` currently resolves through the "all
 * others" branch to `/plugin-command` (hyphen). Grok's **native plugin**
 * slash form is Claude-compatible `/plugin:command` (colon). The grok
 * install path therefore must **never** call `translateSlashCommands` on
 * installed plugin content (task 0078 R4/R8).
 */
export const TARGET_TO_AGENT_NAME: Record<Target, AgentName> = {
    claude: 'claude',
    codex: 'codex',
    pi: 'pi',
    omp: 'omp',
    opencode: 'opencode',
    'antigravity-cli': 'antigravity-cli',
    'antigravity-ide': 'opencode',
    hermes: 'hermes',
    grok: 'grok',
};
