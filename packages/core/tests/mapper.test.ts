import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapPluginToRulesync } from '../src/mapper';

const FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'plugin-min');

describe('mapPluginToRulesync', () => {
    let tmpDir: string;

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('maps skills → .rulesync/skills/<plugin>-<name>/SKILL.md', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(FIXTURE_DIR, 'demo', outDir);

        expect(result.skills).toBe(2);
        expect(existsSync(join(outDir, 'skills', 'demo-a', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(outDir, 'skills', 'demo-b', 'SKILL.md'))).toBe(true);
    });

    it('maps commands → .rulesync/skills/<plugin>-<name>/SKILL.md (adapted as skill)', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(FIXTURE_DIR, 'demo', outDir);

        expect(result.commands).toBe(1);
        expect(existsSync(join(outDir, 'skills', 'demo-run', 'SKILL.md'))).toBe(true);
        // No separate commands/ directory
        expect(existsSync(join(outDir, 'commands'))).toBe(false);
    });

    it('maps agents → .rulesync/skills/<plugin>-<name>/SKILL.md (adapted as skill)', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(FIXTURE_DIR, 'demo', outDir);

        expect(result.subagents).toBe(1);
        expect(existsSync(join(outDir, 'skills', 'demo-coder', 'SKILL.md'))).toBe(true);
        // No separate subagents/ directory
        expect(existsSync(join(outDir, 'subagents'))).toBe(false);
    });

    it('returns zero counts for missing hooks.json and mcp.json', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(FIXTURE_DIR, 'demo', outDir);

        expect(result.hooks).toBe(false);
        expect(result.mcp).toBe(false);
    });

    it('copies hooks.json when present', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        // Create a plugin with hooks.json
        const pluginDir = join(tmpDir, 'plugin-with-hooks');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(join(pluginDir, 'hooks.json'), '{"hooks":{}}');
        writeFileSync(join(pluginDir, 'plugin.json'), '{"name":"with-hooks"}');

        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(pluginDir, 'has-hooks', outDir);

        expect(result.hooks).toBe(true);
        expect(existsSync(join(outDir, 'hooks.json'))).toBe(true);
    });

    it('deep-merges hooks.json with an existing output file', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin-with-hooks');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(
            join(pluginDir, 'hooks.json'),
            JSON.stringify({
                hooks: {
                    PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'plugin-hook' }] }],
                    Stop: [{ hooks: [{ type: 'command', command: 'plugin-stop' }] }],
                },
            }),
        );

        const outDir = join(tmpDir, '.rulesync');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
            join(outDir, 'hooks.json'),
            JSON.stringify({
                hooks: {
                    PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'existing-hook' }] }],
                    PostToolUse: [{ hooks: [{ type: 'command', command: 'existing-post' }] }],
                },
            }),
        );

        mapPluginToRulesync(pluginDir, 'has-hooks', outDir);

        const merged = JSON.parse(readFileSync(join(outDir, 'hooks.json'), 'utf-8'));
        expect(merged.hooks.PostToolUse[0].hooks[0].command).toBe('existing-post');
        expect(merged.hooks.Stop[0].hooks[0].command).toBe('plugin-stop');
        expect(merged.hooks.PreToolUse[0].matcher).toBe('Write');
    });

    it('copies mcp.json when present', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin-with-mcp');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(join(pluginDir, 'mcp.json'), '{"mcpServers":{}}');
        writeFileSync(join(pluginDir, 'plugin.json'), '{"name":"with-mcp"}');

        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(pluginDir, 'has-mcp', outDir);

        expect(result.mcp).toBe(true);
        expect(existsSync(join(outDir, 'mcp.json'))).toBe(true);
    });

    it('deep-merges mcp.json with an existing output file', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin-with-mcp');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(
            join(pluginDir, 'mcp.json'),
            JSON.stringify({
                mcpServers: {
                    plugin: { command: 'plugin-mcp' },
                    shared: { args: ['from-plugin'] },
                },
            }),
        );

        const outDir = join(tmpDir, '.rulesync');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
            join(outDir, 'mcp.json'),
            JSON.stringify({
                mcpServers: {
                    existing: { command: 'existing-mcp' },
                    shared: { command: 'existing-shared', args: ['from-existing'] },
                },
            }),
        );

        mapPluginToRulesync(pluginDir, 'has-mcp', outDir);

        const merged = JSON.parse(readFileSync(join(outDir, 'mcp.json'), 'utf-8'));
        expect(merged.mcpServers.existing.command).toBe('existing-mcp');
        expect(merged.mcpServers.plugin.command).toBe('plugin-mcp');
        expect(merged.mcpServers.shared.command).toBe('existing-shared');
        expect(merged.mcpServers.shared.args).toEqual(['from-plugin']);
    });

    it('handles missing optional directories gracefully', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        // Plugin with only a plugin.json, no skills/commands/agents dirs
        const pluginDir = join(tmpDir, 'bare-plugin');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(join(pluginDir, 'plugin.json'), '{"name":"bare"}');

        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(pluginDir, 'bare', outDir);

        expect(result.skills).toBe(0);
        expect(result.commands).toBe(0);
        expect(result.subagents).toBe(0);
        expect(result.hooks).toBe(false);
        expect(result.mcp).toBe(false);
    });

    it('preserves content of mapped files', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        mapPluginToRulesync(FIXTURE_DIR, 'demo', outDir);

        const skillA = readFileSync(join(outDir, 'skills', 'demo-a', 'SKILL.md'), 'utf-8');
        expect(skillA).toContain('# demo-a');
        expect(skillA).toContain('This is skill A.');

        // Commands are now adapted as skills — content preserved in skills/ dir
        const cmd = readFileSync(join(outDir, 'skills', 'demo-run', 'SKILL.md'), 'utf-8');
        expect(cmd).toContain('Run a task.');
    });
    it('preserves plugin prefix in canonical names', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        mapPluginToRulesync(FIXTURE_DIR, 'rd3', outDir);

        expect(existsSync(join(outDir, 'skills', 'rd3-a', 'SKILL.md'))).toBe(true);
        // Commands and agents now live in skills/ with adapted frontmatter
        expect(existsSync(join(outDir, 'skills', 'rd3-run', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(outDir, 'skills', 'rd3-coder', 'SKILL.md'))).toBe(true);
    });

    it('rejects plugin names that are not a single path segment', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');

        expect(() => mapPluginToRulesync(FIXTURE_DIR, '../escape', outDir)).toThrow('single path segment');
        expect(() => mapPluginToRulesync(FIXTURE_DIR, 'nested/name', outDir)).toThrow('single path segment');
    });

    // ── Directory layout (Claude Code standard) ──

    const DIR_FIXTURE_DIR = join(import.meta.dir, 'fixtures', 'plugin-dir');

    it('maps directory-layout skills (skills/<name>/SKILL.md)', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(DIR_FIXTURE_DIR, 'demo', outDir);

        expect(result.skills).toBe(2);
        expect(existsSync(join(outDir, 'skills', 'demo-alpha', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(outDir, 'skills', 'demo-beta', 'SKILL.md'))).toBe(true);

        const alpha = readFileSync(join(outDir, 'skills', 'demo-alpha', 'SKILL.md'), 'utf-8');
        expect(alpha).toContain('# alpha');
        expect(alpha).toContain('This is skill Alpha in directory layout.');
    });

    it('maps hooks from hooks/hooks.json subdirectory', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(DIR_FIXTURE_DIR, 'demo', outDir);

        expect(result.hooks).toBe(true);
        const hooks = JSON.parse(readFileSync(join(outDir, 'hooks.json'), 'utf-8'));
        expect(hooks.hooks.Stop).toBeDefined();
        expect(hooks.hooks.Stop[0].hooks[0].command).toBe('echo stop');
    });

    it('maps directory-layout commands and agents as skills', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(DIR_FIXTURE_DIR, 'demo', outDir);

        expect(result.commands).toBe(1);
        expect(result.subagents).toBe(1);
        // Commands and agents now adapted into skills/ directories
        expect(existsSync(join(outDir, 'skills', 'demo-run', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(outDir, 'skills', 'demo-coder', 'SKILL.md'))).toBe(true);
    });

    it('copies skill subdirectories (references/) with reference rewriting', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin');
        const skillDir = join(pluginDir, 'skills', 'my-skill');
        mkdirSync(join(skillDir, 'references'), { recursive: true });
        mkdirSync(join(skillDir, 'scripts', 'nested'), { recursive: true });
        writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: my-skill\n---\nUses cc:cc-skills here.');
        writeFileSync(join(skillDir, 'references', 'guide.md'), 'See cc:cc-agents for details.');
        writeFileSync(join(skillDir, 'scripts', 'nested', 'helper.ts'), 'console.log("cc:cc-hooks");');

        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(pluginDir, 'cc', outDir);

        expect(result.skills).toBe(1);
        // SKILL.md rewritten
        const skill = readFileSync(join(outDir, 'skills', 'cc-my-skill', 'SKILL.md'), 'utf-8');
        expect(skill).toContain('cc-cc-skills');
        // references/ subdir copied and rewritten
        const ref = readFileSync(join(outDir, 'skills', 'cc-my-skill', 'references', 'guide.md'), 'utf-8');
        expect(ref).toContain('cc-cc-agents');
        // scripts/ subdir (nested) copied and rewritten
        const script = readFileSync(join(outDir, 'skills', 'cc-my-skill', 'scripts', 'nested', 'helper.ts'), 'utf-8');
        expect(script).toContain('cc-cc-hooks');
    });
});
