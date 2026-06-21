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
    codex: 'codexcli',
    pi: 'pi',
    opencode: 'opencode',
    'antigravity-cli': 'antigravity-cli',
    'antigravity-ide': 'antigravity-ide',
};

/**
 * Per-target relative skills output directory in PROJECT mode (global=false).
 * Used by `executeInstall` to pre-create parent dirs before rulesync writes,
 * preventing ENOENT on `install --no-global` from a clean cwd (task 0045 R2).
 *
 * Verified empirically against rulesync 8.29.0 (2026-06-21) by running
 * `generate({ features:['skills'], global:false })` per target. Global-mode
 * paths differ (e.g. pi→`.pi/agent/skills`, opencode→`.config/opencode/skills`)
 * but global installs land under `$HOME` where the parent typically exists.
 */
export const TARGET_SKILLS_RELDIR: Partial<Record<Target, string>> = {
    codex: '.agents/skills',
    pi: '.pi/skills',
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
