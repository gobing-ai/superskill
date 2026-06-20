import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonObject = Record<string, unknown>;

/** Result summary from mapping a plugin to the canonical .rulesync/ layout. */
export interface MapResult {
    skills: number;
    commands: number;
    subagents: number;
    hooks: boolean;
    mcp: boolean;
}

/**
 * Map a Claude Code plugin directory into the `.rulesync/` canonical layout
 * that `rulesync.generate()` expects.
 *
 * - Skills: `skills/*.md` → `.rulesync/skills/<plugin>-<name>/SKILL.md`
 * - Commands: `commands/*.md` → `.rulesync/commands/<plugin>-<name>.md`
 * - Subagents: `agents/*.md` → `.rulesync/subagents/<plugin>-<name>.md`
 * - hooks.json / mcp.json are deep-merged with existing output files
 *
 * Missing optional directories (e.g. no `agents/`, no `hooks.json`) are handled
 * gracefully — nothing is created for absent inputs.
 */
export function mapPluginToRulesync(pluginPath: string, pluginName: string, outputDir: string): MapResult {
    assertSafePathSegment(pluginName, 'plugin name');
    mkdirSync(outputDir, { recursive: true });

    const result: MapResult = { skills: 0, commands: 0, subagents: 0, hooks: false, mcp: false };

    // Skills: each .md → skills/<plugin>-<name>/SKILL.md
    const skillsDir = join(pluginPath, 'skills');
    if (existsSync(skillsDir)) {
        const skillsOut = join(outputDir, 'skills');
        for (const entry of readdirSync(skillsDir)) {
            if (!entry.endsWith('.md')) continue;
            const skillName = entry.replace(/\.md$/, '');
            const dir = join(skillsOut, `${pluginName}-${skillName}`);
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, 'SKILL.md'), readFileSync(join(skillsDir, entry)));
            result.skills++;
        }
    }

    // Commands: each .md → commands/<plugin>-<name>.md
    const commandsDir = join(pluginPath, 'commands');
    if (existsSync(commandsDir)) {
        const commandsOut = join(outputDir, 'commands');
        mkdirSync(commandsOut, { recursive: true });
        for (const entry of readdirSync(commandsDir)) {
            if (!entry.endsWith('.md')) continue;
            const cmdName = entry.replace(/\.md$/, '');
            writeFileSync(join(commandsOut, `${pluginName}-${cmdName}.md`), readFileSync(join(commandsDir, entry)));
            result.commands++;
        }
    }

    // Subagents: agents/*.md → subagents/<plugin>-<name>.md
    const agentsDir = join(pluginPath, 'agents');
    if (existsSync(agentsDir)) {
        const subagentsOut = join(outputDir, 'subagents');
        mkdirSync(subagentsOut, { recursive: true });
        for (const entry of readdirSync(agentsDir)) {
            if (!entry.endsWith('.md')) continue;
            const agentName = entry.replace(/\.md$/, '');
            writeFileSync(join(subagentsOut, `${pluginName}-${agentName}.md`), readFileSync(join(agentsDir, entry)));
            result.subagents++;
        }
    }

    // hooks.json
    const hooksPath = join(pluginPath, 'hooks.json');
    if (existsSync(hooksPath)) {
        deepMergeJsonFile(hooksPath, join(outputDir, 'hooks.json'));
        result.hooks = true;
    }

    // mcp.json
    const mcpPath = join(pluginPath, 'mcp.json');
    if (existsSync(mcpPath)) {
        deepMergeJsonFile(mcpPath, join(outputDir, 'mcp.json'));
        result.mcp = true;
    }

    return result;
}

function assertSafePathSegment(value: string, label: string): void {
    if (
        !value ||
        value === '.' ||
        value === '..' ||
        value.includes('/') ||
        value.includes('\\') ||
        value.includes('\0')
    ) {
        throw new Error(`Invalid ${label} '${value}': must be a single path segment`);
    }
}

function deepMergeJsonFile(sourcePath: string, targetPath: string): void {
    const source = readJsonObject(sourcePath);
    const target = existsSync(targetPath) ? readJsonObject(targetPath) : {};
    const merged = deepMerge(target, source);

    writeFileSync(targetPath, `${JSON.stringify(merged, null, 4)}\n`);
}

function readJsonObject(path: string): JsonObject {
    const value = JSON.parse(readFileSync(path, 'utf-8')) as unknown;

    if (!isJsonObject(value)) {
        throw new Error(`Expected JSON object in ${path}`);
    }

    return value;
}

function deepMerge(target: JsonObject, source: JsonObject): JsonObject {
    const merged: JsonObject = { ...target };

    for (const [key, value] of Object.entries(source)) {
        const existing = merged[key];
        merged[key] = isJsonObject(existing) && isJsonObject(value) ? deepMerge(existing, value) : value;
    }

    return merged;
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
