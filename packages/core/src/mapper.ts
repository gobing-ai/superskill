import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSafePathSegment } from './content/identity';
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

/** Claude Code PascalCase → rulesync canonical camelCase event names. */
const CLAUDE_TO_CANONICAL_EVENT: Record<string, string> = {
    SessionStart: 'sessionStart',
    SessionEnd: 'sessionEnd',
    PreToolUse: 'preToolUse',
    PostToolUse: 'postToolUse',
    PreModelInvocation: 'preModelInvocation',
    PostModelInvocation: 'postModelInvocation',
    BeforeSubmitPrompt: 'beforeSubmitPrompt',
    Stop: 'stop',
    SubagentStop: 'subagentStop',
    PreCompact: 'preCompact',
    Notification: 'notification',
    WorktreeCreate: 'worktreeCreate',
    WorktreeRemove: 'worktreeRemove',
    MessageDisplay: 'messageDisplay',
};

/**
 * Convert a Claude Code-format hooks object to the rulesync canonical format.
 *
 * Claude Code wraps hooks in `{ hooks: { PascalCase: [{ matcher, hooks: [...] }] } }`.
 * Rulesync expects `{ n: { camelCase: [{ type, command, matcher, timeout }] } }`.
 */
function convertClaudeHooksToCanonical(claudeJson: JsonObject): JsonObject {
    const claudeHooks = claudeJson.hooks as JsonObject | undefined;
    if (!claudeHooks || typeof claudeHooks !== 'object') return claudeJson;

    const canonical: Record<string, unknown[]> = {};
    for (const [claudeEvent, matcherEntries] of Object.entries(claudeHooks)) {
        const canonicalEvent = CLAUDE_TO_CANONICAL_EVENT[claudeEvent] ?? claudeEvent;
        if (!Array.isArray(matcherEntries)) continue;

        const defs: unknown[] = [];
        for (const entry of matcherEntries) {
            if (typeof entry !== 'object' || entry === null) continue;
            const e = entry as JsonObject;
            const hookList = e.hooks;
            if (Array.isArray(hookList)) {
                // Claude Code format: nested { matcher, hooks: [...] }
                const matcher = e.matcher;
                for (const hook of hookList) {
                    if (typeof hook !== 'object' || hook === null) continue;
                    const h = hook as JsonObject;
                    const def: JsonObject = { ...h };
                    if (matcher !== undefined && matcher !== '*') {
                        def.matcher = matcher;
                    }
                    defs.push(def);
                }
            } else {
                // Already-canonical flat format: { type, command, matcher } directly
                defs.push({ ...e });
            }
        }
        if (defs.length > 0) {
            canonical[canonicalEvent] = defs;
        }
    }
    return { hooks: canonical };
}

/** Update the `name:` frontmatter field to the prefixed canonical name. */
function setSkillName(content: string, newName: string): string {
    return content.replace(/^name:\s*.+$/m, `name: ${newName}`);
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
 * - hooks.json is converted from Claude Code format to rulesync canonical format and
 *   written directly (no cross-plugin merge — output dir is cleaned before mapping)
 * - mcp.json is deep-merged with existing output files (if any remain after cleanup)
 *
 * Missing optional directories (e.g. no `agents/`, no `hooks.json`) are handled
 * gracefully — nothing is created for absent inputs.
 */
export function mapPluginToRulesync(pluginPath: string, pluginName: string, outputDir: string): MapResult {
    assertSafePathSegment(pluginName, 'plugin name');
    // Clean the output directory to prevent stale data from previous installs
    // leaking into this plugin's mapping.
    if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
    }
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

            const expectedName = `${pluginName}-${skillName}`;
            const dir = join(skillsOut, expectedName);
            mkdirSync(dir, { recursive: true });
            const rawContent = readFileSync(sourcePath, 'utf-8');
            const content = rewriteSkillReferences(setSkillName(rawContent, expectedName), pluginName);
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

    // hooks.json — convert from Claude Code format to rulesync canonical format.
    const hooksRootPath = join(pluginPath, 'hooks.json');
    const hooksSubdirPath = join(pluginPath, 'hooks', 'hooks.json');
    const hooksPath = existsSync(hooksRootPath) ? hooksRootPath : hooksSubdirPath;
    if (existsSync(hooksPath)) {
        const claudeHooks = readJsonObject(hooksPath);
        const canonical = convertClaudeHooksToCanonical(claudeHooks);
        writeFileSync(join(outputDir, 'hooks.json'), `${JSON.stringify(canonical, null, 4)}\n`);
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
