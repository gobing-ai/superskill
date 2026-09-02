import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Target } from '@gobing-ai/superskill-core';
import { computeContentHash, installManifestPath, readInstallManifest } from '@gobing-ai/superskill-core';
import type { GenerateResult } from 'rulesync';
import { executeInstall } from '../../src/commands/install';
import { cliVersion } from '../../src/version';

const originalCwd = process.cwd();
const savedHomeDir = process.env.HOME_DIR;
const savedFetch = globalThis.fetch;
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-install-manifest-'));
    process.chdir(tempDir);
    return tempDir;
}

function createPlugin(root: string, pluginName: string, version = '1.2.3'): string {
    const pluginRoot = join(root, 'plugins', pluginName);
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: pluginName, version }));
    writeFileSync(
        join(pluginRoot, 'skills', 'a.md'),
        `---\nname: a\ndescription: Skill a\n---\n# skill ${pluginName}\n`,
    );
    return pluginRoot;
}

function writeMarketplace(root: string, pluginName: string, version = '9.9.9'): string {
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
    writeFileSync(
        marketplacePath,
        JSON.stringify({
            name: 'superskill',
            plugins: [{ name: pluginName, source: `./plugins/${pluginName}`, version }],
        }),
    );
    return marketplacePath;
}

function emptyRulesync(): GenerateResult {
    return {
        rulesCount: 0,
        rulesPaths: [] as string[],
        ignoreCount: 0,
        ignorePaths: [] as string[],
        mcpCount: 0,
        mcpPaths: [] as string[],
        commandsCount: 0,
        commandsPaths: [] as string[],
        subagentsCount: 0,
        subagentsPaths: [] as string[],
        skillsCount: 1,
        skillsPaths: [] as string[],
        hooksCount: 0,
        hooksPaths: [] as string[],
        permissionsCount: 0,
        permissionsPaths: [] as string[],
        skills: [],
        hasDiff: false,
    };
}

function seedInstalledSkill(scopeRoot: string, plugin: string): string {
    const dest = join(scopeRoot, '.agents', 'skills', `${plugin}-a`, 'SKILL.md');
    mkdirSync(join(scopeRoot, '.agents', 'skills', `${plugin}-a`), { recursive: true });
    writeFileSync(dest, `# ${plugin} skill\n`);
    return dest;
}

afterEach(() => {
    mock.restore();
    globalThis.fetch = savedFetch;
    if (savedHomeDir === undefined) delete process.env.HOME_DIR;
    else process.env.HOME_DIR = savedHomeDir;
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('executeInstall provenance manifest', () => {
    it('writes distinct per-target manifests with marketplace metadata and matching hashes', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo', '0.1.0');
        const marketplacePath = writeMarketplace(workspace, 'demo', '4.5.6');
        seedInstalledSkill(workspace, 'demo');
        seedInstalledSkill(workspace, 'demo-old');
        seedInstalledSkill(workspace, 'other');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['codex', 'pi'],
            {
                marketplacePath,
                global: false,
                dryRun: false,
                verbose: false,
                outputRoot: workspace,
            },
            { runRulesync: async () => emptyRulesync(), nowIso: '2026-08-31T18:00:00.000Z' },
        );

        const codex = readInstallManifest(installManifestPath(workspace, 'codex', 'demo'));
        const pi = readInstallManifest(installManifestPath(workspace, 'pi', 'demo'));
        expect(codex.target).toBe('codex');
        expect(pi.target).toBe('pi');
        expect(codex.plugin).toBe('demo');
        expect(codex.channel).toBe('marketplace');
        expect(codex.upstreamVersion).toBe('4.5.6');
        expect(codex.marketplaceLocator).toBe(marketplacePath);
        expect(codex.installedAt).toBe('2026-08-31T18:00:00.000Z');
        const skillRel = '.agents/skills/demo-a/SKILL.md';
        const skillHash = computeContentHash(readFileSync(join(workspace, skillRel)));
        expect(codex.installed.files[skillRel]).toBe(skillHash);
        expect(pi.installed.files[skillRel]).toBe(skillHash);
        expect(Object.keys(codex.installed.files)).toEqual([skillRel]);
        expect(Object.keys(pi.installed.files)).toEqual([skillRel]);
        expect(codex.upstream.files['plugin.json']).toBe(
            computeContentHash(readFileSync(join(workspace, 'plugins', 'demo', 'plugin.json'))),
        );
        expect(codex.upstream.canonicalHash).toBe(pi.upstream.canonicalHash);
        expect(codex.superskillVersion).toBe(cliVersion);
        expect(existsSync(installManifestPath(workspace, 'codex', 'demo'))).toBe(true);
    });

    it('preserves the first plugin manifest when a second plugin is installed to the same target', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'alpha', '1.0.0');
        createPlugin(workspace, 'beta', '2.0.0');
        writeMarketplace(workspace, 'alpha', '1.0.0');
        const betaMarket = join(workspace, '.claude-plugin', 'marketplace.json');
        writeFileSync(
            betaMarket,
            JSON.stringify({
                name: 'superskill',
                plugins: [
                    { name: 'alpha', source: './plugins/alpha', version: '1.0.0' },
                    { name: 'beta', source: './plugins/beta', version: '2.0.0' },
                ],
            }),
        );
        seedInstalledSkill(workspace, 'alpha');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'alpha',
            ['codex'],
            { marketplacePath: betaMarket, global: false, dryRun: false, verbose: false, outputRoot: workspace },
            { runRulesync: async () => emptyRulesync() },
        );
        seedInstalledSkill(workspace, 'beta');
        await executeInstall(
            'beta',
            ['codex'],
            { marketplacePath: betaMarket, global: false, dryRun: false, verbose: false, outputRoot: workspace },
            { runRulesync: async () => emptyRulesync() },
        );

        expect(readInstallManifest(installManifestPath(workspace, 'codex', 'alpha')).plugin).toBe('alpha');
        expect(readInstallManifest(installManifestPath(workspace, 'codex', 'beta')).plugin).toBe('beta');
    });

    it('does not write a manifest on dry-run even when dest files already exist', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo');
        const marketplacePath = writeMarketplace(workspace, 'demo');
        seedInstalledSkill(workspace, 'demo');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: true, verbose: false, outputRoot: workspace },
            { runRulesync: async () => emptyRulesync() },
        );

        expect(existsSync(installManifestPath(workspace, 'codex', 'demo'))).toBe(false);
    });

    it('propagates a manifest-write failure through executeInstall and does not print success', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo');
        const marketplacePath = writeMarketplace(workspace, 'demo');
        seedInstalledSkill(workspace, 'demo');
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);

        await expect(
            executeInstall(
                'demo',
                ['codex'] as Target[],
                { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
                {
                    runRulesync: async () => emptyRulesync(),
                    writeInstallManifest: () => {
                        throw new Error('atomic write failed');
                    },
                },
            ),
        ).rejects.toThrow('atomic write failed');

        const output = stdout.mock.calls.map((call) => String(call[0])).join('');
        expect(output).not.toContain("Installed 'demo'");
    });

    it('uses a configured plugin path as a re-resolvable marketplace locator', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo', '3.1.4');
        seedInstalledSkill(workspace, 'demo');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['codex'],
            {
                pluginPath: pluginRoot,
                global: false,
                dryRun: false,
                verbose: false,
                outputRoot: workspace,
            },
            { runRulesync: async () => emptyRulesync() },
        );

        const manifest = readInstallManifest(installManifestPath(workspace, 'codex', 'demo'));
        expect(manifest.channel).toBe('marketplace');
        expect(manifest.marketplaceLocator).toBe(pluginRoot);
        expect(manifest.upstreamVersion).toBe('3.1.4');
    });

    it('fails the install when a requested target has no installed files', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo');
        const marketplacePath = writeMarketplace(workspace, 'demo');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await expect(
            executeInstall(
                'demo',
                ['codex'],
                { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
                { runRulesync: async () => emptyRulesync() },
            ),
        ).rejects.toThrow(/did not resolve any installed files for plugin 'demo' target 'codex'/);

        expect(existsSync(installManifestPath(workspace, 'codex', 'demo'))).toBe(false);
    });

    it('fails the install when the upstream plugin root has no regular files', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = join(workspace, 'empty-plugin');
        mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await expect(
            executeInstall(
                'demo',
                ['codex'],
                {
                    pluginPath: pluginRoot,
                    global: false,
                    dryRun: false,
                    verbose: false,
                    outputRoot: workspace,
                },
                { runRulesync: async () => emptyRulesync() },
            ),
        ).rejects.toThrow(/Install provenance inventory is empty/);
        expect(existsSync(installManifestPath(workspace, 'codex', 'demo'))).toBe(false);
    });

    it('records plugin-owned hermes dests, scripts, and skips symlink dests', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo', '1.0.0');
        const marketplacePath = writeMarketplace(workspace, 'demo', '1.0.0');
        const hermesSkill = join(workspace, '.hermes', 'skills', 'demo-a', 'SKILL.md');
        mkdirSync(join(workspace, '.hermes', 'skills', 'demo-a'), { recursive: true });
        writeFileSync(hermesSkill, '# hermes skill\n');
        mkdirSync(join(workspace, '.agents', 'scripts', 'demo'), { recursive: true });
        writeFileSync(join(workspace, '.agents', 'scripts', 'demo', 'run.sh'), 'echo hi\n');
        writeFileSync(join(workspace, '.hermes', 'skills', 'demo-notes.md'), 'notes\n');
        symlinkSync(hermesSkill, join(workspace, '.hermes', 'skills', 'demo-link.md'));
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['hermes'],
            { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
            { runRulesync: async () => emptyRulesync() },
        );

        const manifest = readInstallManifest(installManifestPath(workspace, 'hermes', 'demo'));
        expect(manifest.installed.files['.hermes/skills/demo-a/SKILL.md']).toBe(
            computeContentHash(readFileSync(hermesSkill)),
        );
        expect(manifest.installed.files['.hermes/skills/demo-notes.md']).toBeDefined();
        expect(manifest.installed.files['.agents/scripts/demo/run.sh']).toBeDefined();
        expect(manifest.installed.files['.hermes/skills/demo-link.md']).toBeUndefined();
    });

    it('expands rulesync receipt directories and ignores missing or symlink paths', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo');
        const marketplacePath = writeMarketplace(workspace, 'demo');
        const skillDir = join(workspace, '.agents', 'skills', 'demo-a');
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(join(skillDir, 'SKILL.md'), '# skill\n');
        symlinkSync(join(skillDir, 'SKILL.md'), join(workspace, 'skill-link.md'));
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['codex'],
            { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
            {
                runRulesync: async () => ({
                    ...emptyRulesync(),
                    skillsPaths: [
                        skillDir,
                        join('.agents', 'skills', 'demo-a', 'SKILL.md'),
                        join(workspace, 'missing.md'),
                        join(workspace, 'skill-link.md'),
                    ],
                }),
            },
        );

        const manifest = readInstallManifest(installManifestPath(workspace, 'codex', 'demo'));
        expect(manifest.installed.files['.agents/skills/demo-a/SKILL.md']).toBe(
            computeContentHash(readFileSync(join(skillDir, 'SKILL.md'))),
        );
        expect(manifest.installed.files['skill-link.md']).toBeUndefined();
    });

    it('records the remote tree SHA and verbatim marketplace locator on a cold-cache install', async () => {
        const workspace = createTempWorkspace();
        process.env.HOME_DIR = workspace;
        seedInstalledSkill(workspace, 'demo');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        const tree = {
            sha: 'cafebabedeadbeefcafebabedeadbeefcafebabe',
            tree: [
                { path: '.claude-plugin/marketplace.json', type: 'blob' as const, sha: 'm1' },
                { path: 'plugins/demo/plugin.json', type: 'blob' as const, sha: 'p1' },
                { path: 'plugins/demo/skills/a.md', type: 'blob' as const, sha: 's1' },
            ],
        };
        const contentByPath: Record<string, string> = {
            '.claude-plugin/marketplace.json': JSON.stringify({
                name: 'superskill',
                plugins: [{ name: 'demo', source: './plugins/demo', version: '8.8.8' }],
            }),
            'plugins/demo/plugin.json': JSON.stringify({ name: 'demo', version: '0.0.1' }),
            'plugins/demo/skills/a.md': '---\nname: a\ndescription: Skill a\n---\n# skill a\n',
        };
        globalThis.fetch = (async (url: string) => {
            if (url.includes('/git/trees/')) {
                return new Response(JSON.stringify(tree), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            for (const [path, content] of Object.entries(contentByPath)) {
                if (url.endsWith(`/${path}`)) return new Response(content, { status: 200 });
            }
            return new Response('not found', { status: 404 });
        }) as typeof fetch;

        const locator = 'gobing-ai/0123-manifest-fixture';
        await executeInstall(
            'demo',
            ['codex'],
            {
                marketplacePath: locator,
                global: false,
                dryRun: false,
                verbose: true,
                outputRoot: workspace,
            },
            { runRulesync: async () => emptyRulesync() },
        );

        const manifest = readInstallManifest(installManifestPath(workspace, 'codex', 'demo'));
        expect(manifest.marketplaceLocator).toBe(locator);
        expect(manifest.resolvedRef).toBe(tree.sha);
        expect(manifest.upstreamVersion).toBe('8.8.8');
        expect(manifest.channel).toBe('marketplace');
    });

    it('writes a claude provenance manifest from in-scope native dests', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'demo', '1.0.0');
        const marketplacePath = writeMarketplace(workspace, 'demo', '1.0.0');
        const dest = join(workspace, '.claude', 'plugins', 'cache', 'superskill', 'demo', 'plugin.json');
        mkdirSync(join(dest, '..'), { recursive: true });
        writeFileSync(dest, '{}\n');
        const sibling = join(workspace, '.claude', 'plugins', 'cache', 'superskill', 'other', 'plugin.json');
        mkdirSync(join(sibling, '..'), { recursive: true });
        writeFileSync(sibling, '{}\n');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['claude'],
            { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
            { runRulesync: async () => emptyRulesync(), runClaudeInstall: async () => {} },
        );

        const manifest = readInstallManifest(installManifestPath(workspace, 'claude', 'demo'));
        expect(manifest.target).toBe('claude');
        expect(manifest.installed.files['.claude/plugins/cache/superskill/demo/plugin.json']).toBe(
            computeContentHash(readFileSync(dest)),
        );
        expect(manifest.installed.files['.claude/plugins/cache/superskill/other/plugin.json']).toBeUndefined();
    });

    it('drops out-of-scope HOME claude cache files and still writes an in-scope manifest', async () => {
        const workspace = createTempWorkspace();
        const fakeHome = mkdtempSync(join(tmpdir(), 'superskill-claude-home-'));
        process.env.HOME_DIR = fakeHome;
        createPlugin(workspace, 'demo', '1.0.0');
        const marketplacePath = writeMarketplace(workspace, 'demo', '1.0.0');
        const scopedDest = join(workspace, '.claude', 'plugins', 'demo', 'plugin.json');
        mkdirSync(join(scopedDest, '..'), { recursive: true });
        writeFileSync(scopedDest, '{"scope":true}\n');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        try {
            await executeInstall(
                'demo',
                ['claude'],
                { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
                {
                    runRulesync: async () => emptyRulesync(),
                    runClaudeInstall: async () => {
                        const homeCache = join(
                            fakeHome,
                            '.claude',
                            'plugins',
                            'cache',
                            'superskill',
                            'demo',
                            'plugin.json',
                        );
                        mkdirSync(join(homeCache, '..'), { recursive: true });
                        writeFileSync(homeCache, '{"home":true}\n');
                    },
                },
            );

            const manifest = readInstallManifest(installManifestPath(workspace, 'claude', 'demo'));
            expect(manifest.installed.files['.claude/plugins/demo/plugin.json']).toBe(
                computeContentHash(readFileSync(scopedDest)),
            );
            expect(Object.keys(manifest.installed.files).some((path) => path.includes('cache/superskill'))).toBe(false);
        } finally {
            rmSync(fakeHome, { recursive: true, force: true });
        }
    });

    it('includes plugin rules written for a target that has a rules directory', async () => {
        const workspace = createTempWorkspace();
        const pluginRoot = createPlugin(workspace, 'demo', '1.0.0');
        mkdirSync(join(pluginRoot, 'rules'), { recursive: true });
        writeFileSync(join(pluginRoot, 'rules', 'style.md'), '# style\n');
        const marketplacePath = writeMarketplace(workspace, 'demo', '1.0.0');
        seedInstalledSkill(workspace, 'demo');
        spyOn(process.stdout, 'write').mockImplementation(() => true);

        await executeInstall(
            'demo',
            ['antigravity-cli'],
            { marketplacePath, global: false, dryRun: false, verbose: false, outputRoot: workspace },
            { runRulesync: async () => emptyRulesync() },
        );

        const manifest = readInstallManifest(installManifestPath(workspace, 'antigravity-cli', 'demo'));
        expect(manifest.installed.files['.agents/rules/style.md']).toBe(
            computeContentHash(readFileSync(join(workspace, '.agents', 'rules', 'style.md'))),
        );
    });
});
