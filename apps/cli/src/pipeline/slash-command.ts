import { translateSlashCommand as translateAgentSlashCommand } from '@gobing-ai/ts-ai-runner';
import type { Target } from '../targets';
import { TARGET_TO_AGENT_NAME } from '../targets';

/**
 * Translate standalone Claude-style slash command lines into the target agent dialect.
 */
export function translateSlashCommands(content: string, target: Target): string {
    const agentName = TARGET_TO_AGENT_NAME[target];

    return content
        .split('\n')
        .map((line) => translateAgentSlashCommand(agentName, line))
        .join('\n');
}
