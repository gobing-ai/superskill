import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adaptCommandToSkill } from './pipeline/adapt-command';
import { adaptSubagentToSkill } from './pipeline/adapt-subagent';
import { rewriteSkillReferences } from './pipeline/rewrite-references';

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
 * Map a Claude Code plugin directory into the `.rulesync/skills/` canonical layout
 * for `rulesync.generate()`.
 *
 * All entities — skills, commands, and subagents — are mapped into skill
 * directories under `.rulesync/skills/<plugin>-<name>/SKILL.md`. Commands and
 * subagents are adapted (frontmatter injection, reference rewriting) before
 * writing. This "downgrade to skills" design is required because rulesync's
 * `commands`/`subagents` features have non-uniform target coverage (empirically
 * verified against rulesync 8.29.0), while `skills` emits uniformly.
 *
 * - Skills: `skills/<name>/SKILL.md` → `.rulesync/skills/<plugin>-<name>/SKILL.md` (+ subdirs)
 * - Commands: `commands/<name>.md` → `.rulesync/skills/<plugin>-<name>/SKILL.md` (adapted)
 * - Subagents: `agents/<name>.md` → `.rulesync/skills/<plugin>-<name>/SKILL.md` (adapted)
 * - hooks.json / mcp.json are deep-merged with existing output files
 *
 * Missing optional directories (e.g. no `agents/`, no `hooks.json`) are handled
 * gracefully — nothing is created for absent inputs.
 */
export function mapPluginToRulesync(pluginPath: string, pluginName: string, outputDir: string): MapResult {
    assertSafePathSegment(pluginName, 'plugin name');
    mkdirSync(outputDir, { recursive: true });

    const result: MapResult = { skills: 0, commands: 0, subagents: 0, hooks: false, mcp: false };

    // Skills: two layouts are supported — flat (`skills/<name>.md`) and the
    // Claude Code standard directory layout (`skills/<name>/SKILL.md`).
    // Support subdirs (scripts/, references/, templates/, assets/) are copied
    // and reference-rewritten alongside the SKILL.md.
    const skillsDir = join(pluginPath, 'skills');
    if (existsSync(skillsDir)) {
        const skillsOut = join(outputDir, 'skills');
        for (const entry of readdirSync(skillsDir)) {
            const flatPath = join(skillsDir, entry);
            const dirSkillPath = join(skillsDir, entry, 'SKILL.md');
            let skillName: string | null = null;
            let sourcePath: string | null = null;
            let sourceDir: string | null = null;

            if (entry.endsWith('.md')) {
                skillName = entry.replace(/\.md$/, '');
                sourcePath = flatPath;
            } else if (existsSync(dirSkillPath)) {
                skillName = entry;
                sourcePath = dirSkillPath;
                sourceDir = join(skillsDir, entry);
            }

            if (!skillName || !sourcePath) continue;

            const dir = join(skillsOut, `${pluginName}-${skillName}`);
            mkdirSync(dir, { recursive: true });
            const content = rewriteSkillReferences(readFileSync(sourcePath, 'utf-8'), pluginName);
            writeFileSync(join(dir, 'SKILL.md'), content);

            // Copy support subdirectories (scripts/, references/, templates/, assets/)
            if (sourceDir) {
                for (const subdir of ['scripts', 'references', 'templates', 'assets']) {
                    const subdirPath = join(sourceDir, subdir);
                    if (existsSync(subdirPath)) {
                        copyAndRewriteDirectory(subdirPath, join(dir, subdir), pluginName);
                    }
                }
            }
            result.skills++;
        }
    }

    // Commands: adapt each .md into a skill directory → skills/<plugin>-<cmd>/SKILL.md
    const commandsDir = join(pluginPath, 'commands');
    if (existsSync(commandsDir)) {
        const skillsOut = join(outputDir, 'skills');
        for (const entry of readdirSync(commandsDir)) {
            if (!entry.endsWith('.md')) continue;
            const cmdName = entry.replace(/\.md$/, '');
            const expectedName = `${pluginName}-${cmdName}`;
            const dir = join(skillsOut, expectedName);
            mkdirSync(dir, { recursive: true });
            const source = readFileSync(join(commandsDir, entry), 'utf-8');
            const adapted = adaptCommandToSkill(source, expectedName, pluginName);
            writeFileSync(join(dir, 'SKILL.md'), adapted);
            result.commands++;
        }
    }

    // Subagents: adapt each agent .md into a skill directory → skills/<plugin>-<agent>/SKILL.md
    const agentsDir = join(pluginPath, 'agents');
    if (existsSync(agentsDir)) {
        const skillsOut = join(outputDir, 'skills');
        for (const entry of readdirSync(agentsDir)) {
            if (!entry.endsWith('.md')) continue;
            const agentName = entry.replace(/\.md$/, '');
            const expectedName = `${pluginName}-${agentName}`;
            const dir = join(skillsOut, expectedName);
            mkdirSync(dir, { recursive: true });
            const source = readFileSync(join(agentsDir, entry), 'utf-8');
            const adapted = adaptSubagentToSkill(source, expectedName, pluginName);
            writeFileSync(join(dir, 'SKILL.md'), adapted);
            result.subagents++;
        }
    }

    // hooks.json — check both the plugin root and the Claude Code standard
    // `hooks/hooks.json` location.
    const hooksRootPath = join(pluginPath, 'hooks.json');
    const hooksSubdirPath = join(pluginPath, 'hooks', 'hooks.json');
    const hooksPath = existsSync(hooksRootPath) ? hooksRootPath : hooksSubdirPath;
    if (existsSync(hooksPath)) {
        deepMergeJsonFile(hooksPath, join(outputDir, 'hooks.json'));
        result.hooks = true;
    }

    // mcp.json — check both the plugin root and `mcp/mcp.json` for symmetry.
    const mcpRootPath = join(pluginPath, 'mcp.json');
    const mcpSubdirPath = join(pluginPath, 'mcp', 'mcp.json');
    const mcpPath = existsSync(mcpRootPath) ? mcpRootPath : mcpSubdirPath;
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

/** Recursively copy a directory, rewriting skill references in all text files. */
function copyAndRewriteDirectory(source: string, destination: string, pluginName: string): void {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source)) {
        const srcPath = join(source, entry);
        const destPath = join(destination, entry);
        if (statSync(srcPath).isDirectory()) {
            copyAndRewriteDirectory(srcPath, destPath, pluginName);
        } else {
            const content = readFileSync(srcPath, 'utf-8');
            writeFileSync(destPath, rewriteSkillReferences(content, pluginName));
        }
    }
}
