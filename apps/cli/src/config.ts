import { existsSync, readFileSync } from 'node:fs';
import { TARGETS } from '@gobing-ai/superskill-core';
import { z } from 'zod';

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

/** Parse JSONC comments and trailing commas without altering string contents. */
export function parseJsonc(raw: string): unknown {
    let withoutComments = '';
    let inString = false;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    let blockCommentStart = -1;

    for (let i = 0; i < raw.length; i++) {
        const char = raw[i] ?? '';
        const next = raw[i + 1] ?? '';
        if (lineComment) {
            if (char === '\n' || char === '\r') {
                lineComment = false;
                withoutComments += char;
            } else {
                withoutComments += ' ';
            }
            continue;
        }
        if (blockComment) {
            if (char === '*' && next === '/') {
                blockComment = false;
                withoutComments += '  ';
                i++;
            } else {
                withoutComments += char === '\n' || char === '\r' ? char : ' ';
            }
            continue;
        }
        if (inString) {
            withoutComments += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            withoutComments += char;
        } else if (char === '/' && next === '/') {
            lineComment = true;
            withoutComments += '  ';
            i++;
        } else if (char === '/' && next === '*') {
            blockComment = true;
            blockCommentStart = i;
            withoutComments += '  ';
            i++;
        } else {
            withoutComments += char;
        }
    }

    // F8 (task 0127 R8): EOF inside a block comment is a truncated document, not a valid prefix.
    // Fail before trailing-comma normalization and JSON.parse can bless the partial bytes.
    if (blockComment) {
        const before = raw.slice(0, blockCommentStart);
        const line = (before.match(/\n/g) ?? []).length + 1;
        const column = blockCommentStart - before.lastIndexOf('\n');
        throw new SyntaxError(`Unterminated block comment starting at line ${line}, column ${column}`);
    }

    let normalized = '';
    inString = false;
    escaped = false;
    for (let i = 0; i < withoutComments.length; i++) {
        const char = withoutComments[i] ?? '';
        if (inString) {
            normalized += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            normalized += char;
            continue;
        }
        if (char === ',') {
            let cursor = i + 1;
            while (/\s/.test(withoutComments[cursor] ?? '')) cursor++;
            if (withoutComments[cursor] === '}' || withoutComments[cursor] === ']') continue;
        }
        normalized += char;
    }
    return JSON.parse(normalized) as unknown;
}

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
    const parsed = parseJsonc(raw);
    return configSchema.parse(parsed);
}
