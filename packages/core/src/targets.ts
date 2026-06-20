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
 * Bridge every superskill `Target` to a `@gobing-ai/ts-ai-runner` `AgentName`
 * for slash-command dialect translation via `translateSlashCommand`.
 *
 * The two enums are disjoint on four new targets:
 * - `omp` → `pi` (speaks Pi's `/skill:` dialect)
 * - `antigravity-cli`, `antigravity-ide`, `hermes` → `opencode`
 *   (non-claude/codex/pi → falls to default `/plugin-command` dialect)
 */
export const TARGET_TO_AGENT_NAME: Record<Target, AgentName> = {
    claude: 'claude',
    codex: 'codex',
    pi: 'pi',
    omp: 'pi',
    opencode: 'opencode',
    'antigravity-cli': 'opencode',
    'antigravity-ide': 'opencode',
    hermes: 'opencode',
};
