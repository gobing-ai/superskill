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
] as const;

/** Union type of all supported target agents. */
export type Target = (typeof TARGETS)[number];

/** Map superskill targets to rulesync `ToolTarget` strings. Claude Code, omp, and hermes are not in rulesync. */
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
 * absent here (claude/pi/omp/hermes) are handled outside rulesync (native install / surrogate
 * shims).
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
 * Bridge every superskill `Target` to a `@gobing-ai/ts-ai-runner` `AgentName`
 * for slash-command dialect translation via `translateSlashCommand`.
 *
 * Since ts-ai-runner 0.3.21, `AgentName` includes `omp`, `hermes`, and
 * `antigravity-cli` as canonical ids, so those targets map 1:1. Only
 * `antigravity-ide` (not in `AgentName`) still bridges to `opencode`
 * (falls to `translateSlashCommand`'s default `/plugin-command` dialect).
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
};
