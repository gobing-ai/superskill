import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RulesyncOptions, Target } from '@gobing-ai/superskill-core';
import { executeInstall } from '../../src/commands/install';

/**
 * Pi extensions are loaded as single files, so superskill must bundle each
 * declared extension entry — a raw copy drops sibling modules referenced via
 * relative imports (e.g. `../agent-hint`) and the import dangles at runtime.
 * This test pins the bundle behavior: the installed extension inlines the
 * relative-import sibling and keeps the declared basename + package.json ref.
 */
describe('executeInstall — pi extension bundling', () => {
    let tmpHome: string;
    let tmpPlugin: string;

    beforeEach(() => {
        tmpHome = mkdtempSync(join(tmpdir(), 'ss-pi-ext-'));
        tmpPlugin = mkdtempSync(join(tmpdir(), 'ss-pi-ext-plugin-'));
        // Plugin fixture: a pi extension that imports a sibling via ../sibling.
        mkdirSync(join(tmpPlugin, 'hooks', 'pi'), { recursive: true });
        writeFileSync(
            join(tmpPlugin, 'plugin.json'),
            JSON.stringify({
                name: 'demo',
                version: '0.0.1',
                extensions: { pi: ['./hooks/pi/entry.ts'] },
            }),
        );
        writeFileSync(join(tmpPlugin, 'hooks', 'sibling.ts'), `export const SHOUT = (s: string) => s.toUpperCase();\n`);
        writeFileSync(
            join(tmpPlugin, 'hooks', 'pi', 'entry.ts'),
            [
                `import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';`,
                `import { SHOUT } from '../sibling';`,
                `export default function (_pi: ExtensionAPI): void {`,
                `    const value: string = SHOUT('ok');`,
                `    void value;`,
                `}`,
                '',
            ].join('\n'),
        );
    });

    afterEach(() => {
        rmSync(tmpHome, { recursive: true, force: true });
        rmSync(tmpPlugin, { recursive: true, force: true });
    });

    it('bundles the pi extension so the relative-import sibling is inlined (no dangling import)', async () => {
        const mockRunRulesync = async (
            _targets: Target[],
            _features: string[],
            _inputRoot: string,
            _options: RulesyncOptions,
        ) => ({
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

        await executeInstall(
            'demo',
            ['pi'],
            { pluginPath: tmpPlugin, outputRoot: tmpHome, global: false, dryRun: false, verbose: false },
            { runRulesync: mockRunRulesync },
        );

        const extPath = join(tmpHome, '.pi', 'agent', 'plugins', 'demo', 'entry.ts');
        expect(existsSync(extPath)).toBe(true);

        const bundled = readFileSync(extPath, 'utf-8');
        // The relative sibling import must be gone (bundled, not copied verbatim).
        expect(bundled).not.toContain("from '../sibling'");
        // The sibling's body must be inlined (proof of bundling, not just import-stripping).
        expect(bundled).toContain('toUpperCase');

        // package.json references the bundled entry by its declared basename.
        const pkg = JSON.parse(
            readFileSync(join(tmpHome, '.pi', 'agent', 'plugins', 'demo', 'package.json'), 'utf-8'),
        ) as { pi?: { extensions?: string[] } };
        expect(pkg.pi?.extensions).toEqual(['./entry.ts']);
    });
});
