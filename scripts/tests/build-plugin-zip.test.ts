import { afterEach, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPluginZip } from '../build-plugin-zip';

const roots: string[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('replaces a versioned Codex plugin ZIP without retaining removed files', () => {
    const root = mkdtempSync(join(tmpdir(), 'superskill-plugin-zip-'));
    roots.push(root);
    const plugin = join(root, 'plugins', 'cc');
    mkdirSync(join(root, 'apps', 'cli'), { recursive: true });
    mkdirSync(join(plugin, 'assets'), { recursive: true });
    mkdirSync(join(plugin, 'skills', 'example'), { recursive: true });
    writeFileSync(join(root, 'apps', 'cli', 'package.json'), '{"version":"1.2.3"}');
    writeFileSync(join(plugin, 'plugin.json'), '{"name":"cc","version":"1.2.3"}');
    writeFileSync(join(plugin, 'README.md'), '# cc\n');
    writeFileSync(join(plugin, 'assets', 'icon.svg'), '<svg/>');
    writeFileSync(join(plugin, 'skills', 'example', 'SKILL.md'), '# Example\n');
    const obsolete = join(plugin, 'skills', 'example', 'obsolete.txt');
    writeFileSync(obsolete, 'remove me');

    const archive = buildPluginZip(root);
    expect(archive).toBe(join(root, 'dist', 'superskill-codex-plugin-1.2.3.zip'));
    expect(existsSync(archive)).toBe(true);
    rmSync(obsolete);
    buildPluginZip(root);

    const result = Bun.spawnSync(['unzip', '-Z', '-1', archive], { stdout: 'pipe', stderr: 'pipe' });
    expect(result.exitCode).toBe(0);
    const entries = new TextDecoder().decode(result.stdout).trim().split('\n');
    expect(entries).toContain('cc/plugin.json');
    expect(entries).toContain('cc/skills/example/SKILL.md');
    expect(entries).toContain('cc/assets/icon.svg');
    expect(entries).toContain('cc/README.md');
    expect(entries).not.toContain('cc/skills/example/obsolete.txt');

    writeFileSync(join(plugin, 'plugin.json'), '{"name":"cc","version":"2.0.0"}');
    expect(() => buildPluginZip(root)).toThrow('differs from CLI version');
    expect(existsSync(archive)).toBe(true);
    writeFileSync(join(plugin, 'plugin.json'), '{"name":"cc","version":"../bad"}');
    expect(() => buildPluginZip(root)).toThrow('Invalid version');
    expect(existsSync(archive)).toBe(true);
});
