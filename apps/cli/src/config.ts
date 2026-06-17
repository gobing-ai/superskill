import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { TARGETS } from './targets';

const pluginSchema = z.object({
    name: z.string().min(1),
    path: z.string().min(1),
});

const featureSchema = z.enum(['skills', 'commands', 'subagents', 'hooks', 'mcp']);

/** Zod schema for `superskill.jsonc` configuration file. */
export const configSchema = z.object({
    version: z.literal(1),
    plugins: z.array(pluginSchema).default([]),
    targets: z.array(z.enum(TARGETS)).default([]),
    features: z.array(featureSchema).default(['skills', 'commands', 'subagents', 'hooks', 'mcp']),
});

/** Parsed superskill configuration. */
export type SuperskillConfig = z.infer<typeof configSchema>;

const DEFAULT_CONFIG: SuperskillConfig = {
    version: 1,
    plugins: [],
    targets: [],
    features: ['skills', 'commands', 'subagents', 'hooks', 'mcp'],
};

/**
 * Load and validate a `superskill.jsonc` config file.
 * Returns defaults when the file does not exist.
 * Throws on parse or validation errors.
 */
export function loadConfig(configPath?: string): SuperskillConfig {
    const path = configPath ?? 'superskill.jsonc';

    if (!existsSync(path)) {
        return { ...DEFAULT_CONFIG };
    }

    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return configSchema.parse(parsed);
}
