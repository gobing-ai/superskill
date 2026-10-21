import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RulesyncOptions, Target } from '@gobing-ai/superskill-core';
import { executeInstall, reconcileOwnedPiPackage } from '../../src/commands/install';
import { PI_HOOK_BANNER } from '../../src/pi-hooks';

/**
 * Reinstall reconciles Pi package entries and extension files superskill owns
 * for the plugin. Entries and files it does not own stay.
 */

let root: string;

function layout(plugin = 'demo'): { agent: string; dir: string; settings: string } {
    const agent = join(root, '.pi', 'agent');
    const dir = join(agent, 'plugins', plugin);
    return { agent, dir, settings: join(agent, 'settings.json') };
}

function writeOwnedPackage(basenames: string[], extra: Record<string, unknown> = {}): void {
    const { dir } = layout();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'package.json'),
        `${JSON.stringify(
            {
                name: 'demo',
                private: true,
                pi: { extensions: basenames.map((name) => `./${name}`) },
                ...extra,
            },
            null,
            2,
        )}\n`,
    );
}

function readPackages(): unknown[] {
    const { settings } = layout();
    const parsed = JSON.parse(readFileSync(settings, 'utf-8')) as { packages: unknown[] };
    return parsed.packages;
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-pkg-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('reconcileOwnedPiPackage', () => {
    it('removes an owned package, its dropped extension, and only its settings entries', () => {
        const { dir, settings, agent } = layout();
        writeOwnedPackage(['guard-extension.ts', '../outside.ts']);
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
            pi: { extensions: unknown[] };
        };
        pkg.pi.extensions.push(3);
        writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg)}\n`);
        writeFileSync(join(dir, 'guard-extension.ts'), 'export {}\n');
        writeFileSync(join(dir, 'user-notes.txt'), 'keep\n');
        mkdirSync(join(dir, 'guard-dir'));
        writeFileSync(join(agent, '..', 'outside.ts'), 'do not delete\n');
        const absolute = dir;
        writeFileSync(
            settings,
            `${JSON.stringify(
                {
                    theme: 'dark',
                    packages: [
                        'plugins/demo',
                        './plugins/demo',
                        'plugins/demo/',
                        absolute,
                        'plugins/demo/guard-extension.ts',
                        'plugins/demo-extra',
                        'npm:@user/keep',
                        'plugins/other',
                        7,
                    ],
                },
                null,
                2,
            )}\n`,
        );

        reconcileOwnedPiPackage(root, 'demo', [], { dryRun: false, verbose: false });

        expect(existsSync(join(dir, 'guard-extension.ts'))).toBe(false);
        expect(existsSync(join(dir, 'package.json'))).toBe(false);
        expect(existsSync(join(dir, 'user-notes.txt'))).toBe(true);
        expect(existsSync(join(dir, 'guard-dir'))).toBe(true);
        expect(existsSync(join(agent, '..', 'outside.ts'))).toBe(true);
        expect(readPackages()).toEqual(['plugins/demo-extra', 'npm:@user/keep', 'plugins/other', 7]);
        const parsed = JSON.parse(readFileSync(settings, 'utf-8')) as { theme: string };
        expect(parsed.theme).toBe('dark');
    });

    it('drops a stale owned extension file but keeps the package when the plugin still provides one', () => {
        const { dir, settings } = layout();
        writeOwnedPackage(['guard-extension.ts', 'entry.ts']);
        writeFileSync(join(dir, 'guard-extension.ts'), 'old\n');
        writeFileSync(join(dir, 'entry.ts'), 'new\n');
        writeFileSync(
            settings,
            `${JSON.stringify(
                { packages: ['plugins/demo', 'plugins/demo/guard-extension.ts', 'npm:@user/keep'] },
                null,
                2,
            )}\n`,
        );

        reconcileOwnedPiPackage(root, 'demo', ['entry.ts'], { dryRun: false, verbose: false });

        expect(existsSync(join(dir, 'guard-extension.ts'))).toBe(false);
        expect(existsSync(join(dir, 'entry.ts'))).toBe(true);
        expect(existsSync(join(dir, 'package.json'))).toBe(true);
        expect(readPackages()).toEqual(['plugins/demo', 'npm:@user/keep']);
    });

    it('does not touch a package.json or settings entry it does not own', () => {
        const { dir, settings } = layout();
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'package.json'),
            `${JSON.stringify({ name: 'user-pack', pi: { extensions: ['./guard-extension.ts'] } })}\n`,
        );
        writeFileSync(join(dir, 'guard-extension.ts'), 'user\n');
        const before = `${JSON.stringify({ packages: ['plugins/demo', 'npm:@user/keep'] }, null, 2)}\n`;
        writeFileSync(settings, before);

        reconcileOwnedPiPackage(root, 'demo', [], { dryRun: false, verbose: false });

        expect(readFileSync(join(dir, 'guard-extension.ts'), 'utf-8')).toBe('user\n');
        expect(readFileSync(settings, 'utf-8')).toBe(before);
    });

    it('dry-run reports the removal and writes nothing', () => {
        const { dir, settings } = layout();
        writeOwnedPackage(['guard-extension.ts']);
        writeFileSync(join(dir, 'guard-extension.ts'), 'old\n');
        writeFileSync(settings, `${JSON.stringify({ packages: ['plugins/demo'] }, null, 2)}\n`);
        const chunks: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });

        reconcileOwnedPiPackage(root, 'demo', [], { dryRun: true, verbose: true });
        spy.mockRestore();

        expect(existsSync(join(dir, 'guard-extension.ts'))).toBe(true);
        expect(existsSync(join(dir, 'package.json'))).toBe(true);
        expect(readPackages()).toEqual(['plugins/demo']);
        expect(chunks.join('')).toContain('would remove');
    });

    it('leaves unparseable settings and a non-file extension alone, and ignores a symlinked plugin dir', () => {
        const { dir, settings } = layout();
        writeOwnedPackage(['guard-extension.ts']);
        rmSync(join(dir, 'guard-extension.ts'), { force: true });
        mkdirSync(join(dir, 'guard-extension.ts'));
        writeFileSync(settings, '{ this is not json');
        const chunks: string[] = [];
        const spy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
            chunks.push(String(chunk));
            return true;
        });
        reconcileOwnedPiPackage(root, 'demo', [], { dryRun: false, verbose: true });
        spy.mockRestore();
        expect(existsSync(join(dir, 'guard-extension.ts'))).toBe(true);
        expect(lstatSync(join(dir, 'guard-extension.ts')).isDirectory()).toBe(true);
        expect(readFileSync(settings, 'utf-8')).toBe('{ this is not json');
        expect(chunks.join('')).toContain('not a regular file');

        const real = join(root, 'real-plugin');
        mkdirSync(real, { recursive: true });
        writeFileSync(
            join(real, 'package.json'),
            `${JSON.stringify({ name: 'demo', pi: { extensions: ['./keep.ts'] } })}\n`,
        );
        writeFileSync(join(real, 'keep.ts'), 'keep\n');
        const link = join(root, '.pi', 'agent', 'plugins', 'linked');
        symlinkSync(real, link);
        reconcileOwnedPiPackage(root, 'linked', [], { dryRun: false, verbose: false });
        expect(existsSync(join(real, 'keep.ts'))).toBe(true);
        expect(existsSync(join(real, 'package.json'))).toBe(true);
    });

    it('ignores an unparseable package.json', () => {
        const { dir } = layout();
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'package.json'), '{');
        writeFileSync(join(dir, 'guard-extension.ts'), 'old\n');
        reconcileOwnedPiPackage(root, 'demo', [], { dryRun: false, verbose: false });
        expect(existsSync(join(dir, 'guard-extension.ts'))).toBe(true);
    });

    it('leaves settings unchanged when packages is not an array', () => {
        const { dir, settings } = layout();
        writeOwnedPackage(['guard-extension.ts']);
        writeFileSync(join(dir, 'guard-extension.ts'), 'old\n');
        const before = `${JSON.stringify({ packages: { nope: true }, theme: 'dark' }, null, 2)}\n`;
        writeFileSync(settings, before);
        reconcileOwnedPiPackage(root, 'demo', [], { dryRun: false, verbose: false });
        expect(existsSync(join(dir, 'guard-extension.ts'))).toBe(false);
        expect(readFileSync(settings, 'utf-8')).toBe(before);
    });
});

describe('executeInstall pi package reconciliation', () => {
    function mockRulesync() {
        return async (_targets: Target[], _features: string[], _inputRoot: string, _options: RulesyncOptions) => ({
            rulesCount: 0,
            rulesPaths: [],
            ignoreCount: 0,
            ignorePaths: [],
            mcpCount: 0,
            mcpPaths: [],
            commandsCount: 0,
            commandsPaths: [],
            subagentsCount: 0,
            subagentsPaths: [],
            skillsCount: 0,
            skillsPaths: [],
            hooksCount: 0,
            hooksPaths: [],
            permissionsCount: 0,
            permissionsPaths: [],
            skills: [],
            hasDiff: false,
        });
    }

    function seedPlugin(pluginRoot: string, manifest: Record<string, unknown>, withHook: boolean): void {
        mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify(manifest));
        writeFileSync(join(pluginRoot, 'skills', 'a.md'), '---\nname: a\ndescription: Skill a\n---\n# a\n');
        if (withHook) {
            mkdirSync(join(pluginRoot, 'hooks'), { recursive: true });
            writeFileSync(
                join(pluginRoot, 'hooks', 'hooks.json'),
                JSON.stringify({
                    ...(typeof manifest.minCliVersion === 'string' ? { minCliVersion: manifest.minCliVersion } : {}),
                    hooks: {
                        Stop: [
                            {
                                matcher: '*',
                                hooks: [{ type: 'command', command: 'superskill hook run demo guard', timeout: 5 }],
                            },
                        ],
                    },
                }),
            );
        }
    }

    function seedStalePackage(home: string): void {
        const dir = join(home, '.pi', 'agent', 'plugins', 'demo');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
            join(dir, 'package.json'),
            `${JSON.stringify({ name: 'demo', pi: { extensions: ['./guard-extension.ts'] } }, null, 2)}\n`,
        );
        writeFileSync(join(dir, 'guard-extension.ts'), 'export const old = true;\n');
        writeFileSync(join(dir, 'user-notes.txt'), 'keep\n');
        writeFileSync(
            join(home, '.pi', 'agent', 'settings.json'),
            `${JSON.stringify(
                {
                    packages: ['plugins/demo', 'plugins/demo/guard-extension.ts', 'npm:@user/keep', 'plugins/other'],
                },
                null,
                2,
            )}\n`,
        );
    }

    it('drops a stale Pi package when the plugin now ships native hook modules', async () => {
        const home = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-inst-'));
        const pluginRoot = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-src-'));
        seedPlugin(pluginRoot, { name: 'demo', version: '0.0.1' }, true);
        seedStalePackage(home);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            await executeInstall(
                'demo',
                ['pi'],
                { pluginPath: pluginRoot, outputRoot: home, global: false, dryRun: false, verbose: false },
                { runRulesync: mockRulesync() },
            );
            const out = stdout.mock.calls.map((call) => String(call[0])).join('');
            expect(out).toContain('removed superseded package install');
            expect(existsSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'guard-extension.ts'))).toBe(false);
            expect(existsSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'package.json'))).toBe(false);
            expect(existsSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'user-notes.txt'))).toBe(true);
            const packages = JSON.parse(readFileSync(join(home, '.pi', 'agent', 'settings.json'), 'utf-8')) as {
                packages: string[];
            };
            expect(packages.packages).toEqual(['npm:@user/keep', 'plugins/other']);
            expect(existsSync(join(home, '.pi', 'extensions', 'superskill-demo-guard.ts'))).toBe(true);
        } finally {
            stdout.mockRestore();
            rmSync(home, { recursive: true, force: true });
            rmSync(pluginRoot, { recursive: true, force: true });
        }
    });

    it('replaces dropped package extensions and prunes generated modules when extensions.pi is declared', async () => {
        const home = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-ext-'));
        const pluginRoot = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-extsrc-'));
        mkdirSync(join(pluginRoot, 'hooks', 'pi'), { recursive: true });
        seedPlugin(
            pluginRoot,
            { name: 'demo', version: '0.0.1', extensions: { pi: ['./hooks/pi/entry.ts', './hooks/pi/missing.ts'] } },
            false,
        );
        writeFileSync(
            join(pluginRoot, 'hooks', 'pi', 'entry.ts'),
            [
                `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';`,
                `export default function (_pi: ExtensionAPI): void {}`,
                '',
            ].join('\n'),
        );
        seedStalePackage(home);
        const native = join(home, '.pi', 'extensions', 'superskill-demo-old.ts');
        mkdirSync(join(home, '.pi', 'extensions'), { recursive: true });
        writeFileSync(native, `${PI_HOOK_BANNER}\n// Plugin: demo\nexport {}\n`);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            await executeInstall(
                'demo',
                ['pi'],
                { pluginPath: pluginRoot, outputRoot: home, global: false, dryRun: false, verbose: false },
                { runRulesync: mockRulesync() },
            );
            expect(existsSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'guard-extension.ts'))).toBe(false);
            expect(existsSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'entry.ts'))).toBe(true);
            expect(existsSync(native)).toBe(false);
            const pkg = JSON.parse(
                readFileSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'package.json'), 'utf-8'),
            ) as { pi: { extensions: string[] } };
            expect(pkg.pi.extensions).toEqual(['./entry.ts']);
            const packages = JSON.parse(readFileSync(join(home, '.pi', 'agent', 'settings.json'), 'utf-8')) as {
                packages: string[];
            };
            expect(packages.packages).toContain('plugins/demo');
            expect(packages.packages).not.toContain('plugins/demo/guard-extension.ts');
            expect(packages.packages).toContain('npm:@user/keep');
        } finally {
            stdout.mockRestore();
            rmSync(home, { recursive: true, force: true });
            rmSync(pluginRoot, { recursive: true, force: true });
        }
    });

    it('still removes an owned Pi package when hook emission is blocked by minCliVersion', async () => {
        const home = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-block-'));
        const pluginRoot = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-blocksrc-'));
        seedPlugin(pluginRoot, { name: 'demo', version: '0.0.1', minCliVersion: '99.0.0' }, true);
        seedStalePackage(home);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        try {
            await executeInstall(
                'demo',
                ['pi'],
                { pluginPath: pluginRoot, outputRoot: home, global: false, dryRun: false, verbose: true },
                { runRulesync: mockRulesync() },
            );
            const out = stdout.mock.calls.map((call) => String(call[0])).join('');
            expect(out).toContain('Pi hooks: skipped (CLI below plugin minCliVersion)');
            expect(existsSync(join(home, '.pi', 'agent', 'plugins', 'demo', 'guard-extension.ts'))).toBe(false);
            expect(existsSync(join(home, '.pi', 'extensions', 'superskill-demo-guard.ts'))).toBe(false);
        } finally {
            stdout.mockRestore();
            rmSync(home, { recursive: true, force: true });
            rmSync(pluginRoot, { recursive: true, force: true });
        }
    });
});
