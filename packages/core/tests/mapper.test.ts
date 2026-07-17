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

    it('copies an extensionless binary asset verbatim instead of mangling it through UTF-8', () => {
        // A binary with no known extension and no NUL in the first 8KB reaches the text
        // heuristic; rewriting it decodes to UTF-8 and re-encodes, which is lossy. The copy
        // must be byte-identical or the installed plugin ships a corrupted asset.
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin');
        const assetsDir = join(pluginDir, 'skills', 'a', 'assets');
        mkdirSync(assetsDir, { recursive: true });
        writeFileSync(join(pluginDir, 'skills', 'a', 'SKILL.md'), '---\nname: a\n---\n# A\n');
        const binary = Buffer.from([0xff, 0xfe, 0x41, 0x80, 0x90, 0xc3, 0x28, 0xa0]);
        writeFileSync(join(assetsDir, 'helper'), binary);

        const outDir = join(tmpDir, '.rulesync');
        mapPluginToRulesync(pluginDir, 'demo', outDir);

        const copied = readFileSync(join(outDir, 'skills', 'demo-a', 'assets', 'helper'));
        expect(copied.equals(binary)).toBe(true);
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

    it('writes hooks in canonical format (no cross-plugin deep-merge)', () => {
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
        // Pre-existing hooks.json should be cleaned up, not merged
        mkdirSync(outDir, { recursive: true });
        writeFileSync(
            join(outDir, 'hooks.json'),
            JSON.stringify({ n: { preToolUse: [{ type: 'command', command: 'stale' }] } }),
        );

        mapPluginToRulesync(pluginDir, 'has-hooks', outDir);

        const written = JSON.parse(readFileSync(join(outDir, 'hooks.json'), 'utf-8'));
        // Only the plugin's hooks, converted to canonical format, not merged with stale
        expect(written.hooks.preToolUse[0].command).toBe('plugin-hook');
        expect(written.hooks.preToolUse[0].matcher).toBe('Write');
        expect(written.hooks.stop[0].command).toBe('plugin-stop');
        expect(written.hooks.stop[0].matcher).toBeUndefined();
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

    it('writes mcp.json directly (no cross-plugin deep-merge)', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin-with-mcp');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(
            join(pluginDir, 'mcp.json'),
            JSON.stringify({
                mcpServers: {
                    plugin: { command: 'plugin-mcp' },
                },
            }),
        );

        const outDir = join(tmpDir, '.rulesync');
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, 'mcp.json'), JSON.stringify({ mcpServers: { stale: { command: 'stale-mcp' } } }));

        mapPluginToRulesync(pluginDir, 'has-mcp', outDir);

        const written = JSON.parse(readFileSync(join(outDir, 'mcp.json'), 'utf-8'));
        // Only the plugin's mcp, not merged with stale
        expect(written.mcpServers.plugin.command).toBe('plugin-mcp');
        expect(written.mcpServers.stale).toBeUndefined();
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
        expect(skillA).toContain('name: demo-a');
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

    it('injects the canonical name without clobbering a body `name:` line (fenced example)', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin');
        const skillDir = join(pluginDir, 'skills', 'authoring');
        mkdirSync(skillDir, { recursive: true });
        // Frontmatter WITHOUT a name field; body contains a line-start `name:` inside
        // a fenced example — the canonical name must land in frontmatter, not there.
        writeFileSync(
            join(skillDir, 'SKILL.md'),
            [
                '---',
                'description: teaches skill authoring',
                '---',
                '',
                'Example frontmatter:',
                '',
                '```yaml',
                'name: my-example-skill',
                'description: example',
                '```',
            ].join('\n'),
        );

        const outDir = join(tmpDir, '.rulesync');
        mapPluginToRulesync(pluginDir, 'cc', outDir);

        const written = readFileSync(join(outDir, 'skills', 'cc-authoring', 'SKILL.md'), 'utf-8');
        expect(written).toContain('name: cc-authoring');
        expect(written).toContain('name: my-example-skill');
        expect(written.indexOf('name: cc-authoring')).toBeLessThan(written.indexOf('description: teaches'));
    });

    it('converts UserPromptSubmit (Claude Code native) to canonical beforeSubmitPrompt', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin-with-hooks');
        mkdirSync(pluginDir, { recursive: true });
        writeFileSync(
            join(pluginDir, 'hooks.json'),
            JSON.stringify({
                hooks: {
                    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'prompt-guard' }] }],
                },
            }),
        );

        const outDir = join(tmpDir, '.rulesync');
        mapPluginToRulesync(pluginDir, 'has-hooks', outDir);

        const written = JSON.parse(readFileSync(join(outDir, 'hooks.json'), 'utf-8'));
        // Un-normalized PascalCase would be silently dropped by rulesync generate.
        expect(written.hooks.beforeSubmitPrompt[0].command).toBe('prompt-guard');
        expect(written.hooks.UserPromptSubmit).toBeUndefined();
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
        expect(alpha).toContain('name: demo-alpha');
        expect(alpha).toContain('# alpha');
        expect(alpha).toContain('This is skill Alpha in directory layout.');
    });

    it('maps hooks from hooks/hooks.json subdirectory', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(DIR_FIXTURE_DIR, 'demo', outDir);

        expect(result.hooks).toBe(true);
        const hooks = JSON.parse(readFileSync(join(outDir, 'hooks.json'), 'utf-8'));
        expect(hooks.hooks.stop).toBeDefined();
        expect(hooks.hooks.stop[0].command).toBe('echo stop');
        expect(hooks.hooks.stop[0].timeout).toBe(5);
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

    // ── Plugin-level scripts staging (task 0090) ──

    it('stages plugin-level scripts/ into .rulesync/scripts/<plugin>/', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin');
        const scriptsDir = join(pluginDir, 'scripts', 'anti-hallucination');
        mkdirSync(scriptsDir, { recursive: true });
        writeFileSync(join(scriptsDir, 'validate.ts'), '// validation logic');
        writeFileSync(join(scriptsDir, 'check.sh'), '#!/usr/bin/env bash\necho ok');

        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(pluginDir, 'cc', outDir);

        expect(result.scripts).toBe(2);
        const staged = join(outDir, 'scripts', 'cc', 'anti-hallucination');
        expect(readFileSync(join(staged, 'validate.ts'), 'utf-8')).toBe('// validation logic');
        expect(readFileSync(join(staged, 'check.sh'), 'utf-8')).toBe('#!/usr/bin/env bash\necho ok');
        // Tree shape preserved — not flattened into skill dirs
        expect(existsSync(join(outDir, 'scripts', 'cc', 'anti-hallucination', 'validate.ts'))).toBe(true);
        // No per-skill duplication
        expect(existsSync(join(outDir, 'skills', 'cc-anti-hallucination'))).toBe(false);
    });

    it('returns scripts: 0 when plugin has no scripts/ directory', () => {
        tmpDir = mkdtempSync('superskill-mapper-');
        const pluginDir = join(tmpDir, 'plugin');
        mkdirSync(join(pluginDir, 'skills', 'a'), { recursive: true });
        writeFileSync(join(pluginDir, 'skills', 'a', 'SKILL.md'), '---\nname: a\n---\nok');

        const outDir = join(tmpDir, '.rulesync');
        const result = mapPluginToRulesync(pluginDir, 'cc', outDir);

        expect(result.scripts).toBe(0);
        // No scripts/ dir created in output
        expect(existsSync(join(outDir, 'scripts'))).toBe(false);
    });
});
