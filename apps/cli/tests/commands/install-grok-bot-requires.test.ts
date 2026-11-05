import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    getEnvVar,
    installManifestPath,
    parseFrontmatter,
    readInstallManifest,
    removeEnvVar,
    setEnvVar,
} from '@gobing-ai/superskill-core';
import { executeInstall } from '../../src/commands/install';
import { executeUpdate } from '../../src/commands/update';

let tempDir: string;
let stdout = '';
let stdoutSpy: ReturnType<typeof spyOn> | undefined;
const saved: Record<string, string | undefined> = {};

const PLUGIN = 'demo';

function sandEnv(name: string): string {
    const sand = join(tempDir, name);
    if (saved.HOME_DIR === undefined) saved.HOME_DIR = getEnvVar('HOME_DIR');
    if (saved.SAND_DATA === undefined) saved.SAND_DATA = getEnvVar('SAND_DATA');
    setEnvVar('HOME_DIR', join(tempDir, 'home'));
    setEnvVar('SAND_DATA', sand);
    return sand;
}

/** Four entities: two servable, one requiring hooks, one requiring hooks-free but dispatch. */
function createRequiresPlugin(root: string, extraSkills: Record<string, string> = {}): string {
    const pluginRoot = join(root, 'plugins', PLUGIN);
    mkdirSync(join(pluginRoot, 'skills'), { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: PLUGIN, version: '1.0.0' }));
    const skills: Record<string, string> = {
        'a-cli': 'requires: [cli:spur]\n',
        'b-hooks': 'requires: [hooks]\n',
        'c-none': '',
        'd-both': 'requires: [cli:spur, subagents]\n',
        ...extraSkills,
    };
    for (const [name, requires] of Object.entries(skills)) {
        writeFileSync(
            join(pluginRoot, 'skills', `${name}.md`),
            `---\nname: ${name}\ndescription: Skill ${name} handles a demo workflow\n${requires}---\n\nBody of /skill:demo-${name}.\n`,
        );
    }
    return pluginRoot;
}

function readSkill(sand: string, id: string): string {
    return readFileSync(join(sand, 'workflows', id, 'SKILL.md'), 'utf-8');
}

function installOpts(pluginRoot: string, extra: Record<string, unknown> = {}) {
    // Full mode: the recipe itself lands in workflows/<id>/SKILL.md, so the assertions read
    // exactly the bytes the Bot would serve (bridge keeps a pointer there).
    return {
        pluginPath: pluginRoot,
        global: true,
        dryRun: false,
        verbose: false,
        prune: false,
        materialize: 'full' as const,
        ...extra,
    };
}

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-bot-requires-'));
    stdout = '';
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        stdout += String(chunk);
        return true;
    });
});

afterEach(() => {
    stdoutSpy?.mockRestore();
    stdoutSpy = undefined;
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) removeEnvVar(key);
        else setEnvVar(key, value);
        delete saved[key];
    }
    rmSync(tempDir, { recursive: true, force: true });
});

describe('grok-bot runtime-requires filtering (task 0162)', () => {
    it('AC3: excludes unmet entities by default, prints sorted decisions and leaves the rest unchanged', async () => {
        const sand = sandEnv('sand');
        const reference = sandEnv('sand-reference');
        const pluginRoot = createRequiresPlugin(tempDir);
        // Reference run declares everything provided, so nothing is filtered.
        await executeInstall(
            PLUGIN,
            ['grok-bot'],
            installOpts(pluginRoot, { botProvides: ['cli:spur', 'hooks', 'subagents'] }),
        );
        setEnvVar('SAND_DATA', sand);
        await executeInstall(PLUGIN, ['grok-bot'], installOpts(pluginRoot, { botProvides: ['cli:spur'] }));

        expect(existsSync(join(sand, 'workflows', 'demo-b-hooks'))).toBe(false);
        expect(existsSync(join(sand, 'workflows', 'demo-d-both'))).toBe(false);
        const decisions = stdout.split('\n').filter((line) => line.includes('grok-bot: excluded'));
        expect(decisions).toEqual([
            'grok-bot: excluded demo-b-hooks (needs hooks)',
            'grok-bot: excluded demo-d-both (needs subagents)',
        ]);
        // AC3's "installed unchanged": identical bytes to the unfiltered run.
        for (const id of ['demo-a-cli', 'demo-c-none']) expect(readSkill(sand, id)).toBe(readSkill(reference, id));
        // The key reaches the catalog verbatim; only the unmet entries are withheld.
        expect(readSkill(sand, 'demo-a-cli')).toContain('requires: [cli:spur]');
    });

    it('AC4: degrades instead of dropping, and the non-requiring entity stays byte-identical', async () => {
        const reference = sandEnv('sand-reference');
        const pluginRoot = createRequiresPlugin(tempDir);
        await executeInstall(
            PLUGIN,
            ['grok-bot'],
            installOpts(pluginRoot, { botProvides: ['cli:spur', 'hooks', 'subagents'] }),
        );
        const sand = sandEnv('sand-degrade');
        await executeInstall(PLUGIN, ['grok-bot'], installOpts(pluginRoot, { botUnmet: 'degrade' }));

        for (const id of ['demo-a-cli', 'demo-b-hooks', 'demo-d-both']) {
            const parsed = parseFrontmatter(readSkill(sand, id));
            expect(String(parsed.data.description)).toContain('[degraded on Grok Bot: needs ');
            expect(parsed.body.trimStart().split('\n')[0]).toStartWith('> **Grok Bot:** degraded — expects ');
        }
        expect(readSkill(sand, 'demo-c-none')).toBe(readSkill(reference, 'demo-c-none'));
        const decisions = stdout.split('\n').filter((line) => line.includes('grok-bot: degraded'));
        expect(decisions).toEqual([
            'grok-bot: degraded demo-a-cli (needs cli:spur)',
            'grok-bot: degraded demo-b-hooks (needs hooks)',
            'grok-bot: degraded demo-d-both (needs cli:spur, subagents)',
        ]);

        // Dry-run reports the same decisions and writes nothing.
        const drySand = join(tempDir, 'sand-dry');
        setEnvVar('SAND_DATA', drySand);
        stdout = '';
        await executeInstall(PLUGIN, ['grok-bot'], installOpts(pluginRoot, { botUnmet: 'degrade', dryRun: true }));
        expect(stdout).toContain('grok-bot: degraded demo-d-both (needs cli:spur, subagents)');
        expect(existsSync(drySand)).toBe(false);
    });

    it('AC3: fails install when the filter leaves zero entries, naming the filter', async () => {
        sandEnv('sand');
        const pluginRoot = createRequiresPlugin(tempDir, {
            'a-cli': 'requires: [hooks]\n',
            'b-hooks': 'requires: [hooks]\n',
        });
        rmSync(join(pluginRoot, 'skills', 'c-none.md'));
        rmSync(join(pluginRoot, 'skills', 'd-both.md'));
        await expect(executeInstall(PLUGIN, ['grok-bot'], installOpts(pluginRoot))).rejects.toThrow(
            /runtime-requires filter excluded every entry \(needs hooks\)/,
        );
        expect(existsSync(join(tempDir, 'sand', 'workflows'))).toBe(false);
    });

    it('AC2: an invalid requires token fails the grok-bot install before any write', async () => {
        sandEnv('sand');
        const pluginRoot = createRequiresPlugin(tempDir);
        writeFileSync(
            join(pluginRoot, 'skills', 'c-none.md'),
            '---\nname: c-none\ndescription: Skill c-none handles a demo workflow\nrequires: [bogus]\n---\n\nBody.\n',
        );
        await expect(executeInstall(PLUGIN, ['grok-bot'], installOpts(pluginRoot))).rejects.toThrow(
            /Skill 'demo-c-none' has invalid 'requires' entry 'bogus'/,
        );
        expect(existsSync(join(tempDir, 'sand', 'workflows'))).toBe(false);
    });

    it('AC4: applies the filter in plugin mode before the bundle lint and before any write', async () => {
        sandEnv('sand');
        const pluginRoot = createRequiresPlugin(tempDir);
        const pluginDir = join(tempDir, 'bundle');
        await executeInstall(
            PLUGIN,
            ['grok-bot'],
            installOpts(pluginRoot, { materialize: 'plugin', pluginDir, botProvides: ['cli:spur'] }),
        );
        expect(existsSync(join(pluginDir, 'skills', 'demo-b-hooks'))).toBe(false);
        expect(existsSync(join(pluginDir, 'skills', 'demo-a-cli'))).toBe(true);
        expect(stdout).toContain('grok-bot: excluded demo-b-hooks (needs hooks)');
    });

    it('AC5: records provides/unmet and reapplies them on update', async () => {
        const sand = sandEnv('sand');
        const pluginRoot = createRequiresPlugin(tempDir);
        const market = join(tempDir, 'marketplace.json');
        writeFileSync(market, JSON.stringify({ name: 'local', plugins: [{ name: PLUGIN, source: './plugins/demo' }] }));
        const opts = { ...installOpts(pluginRoot), marketplacePath: market };
        await executeInstall(PLUGIN, ['grok-bot'], { ...opts, botProvides: ['cli:spur'], botUnmet: 'degrade' });
        expect(readInstallManifest(installManifestPath(sand, 'grok-bot', PLUGIN)).grokBot).toEqual({
            materialize: 'full',
            provides: ['cli:spur'],
            unmet: 'degrade',
        });

        // Make the plugin stale, then let update reinstall it.
        writeFileSync(
            join(pluginRoot, 'skills', 'c-none.md'),
            `${readFileSync(join(pluginRoot, 'skills', 'c-none.md'), 'utf-8')}Updated recipe.\n`,
        );
        stdout = '';
        expect(await executeUpdate(PLUGIN, ['grok-bot'], { check: false, global: true, marketplacePath: market })).toBe(
            0,
        );
        // The recorded `provides: [cli:spur]` is reapplied, so only the dispatch need is unmet.
        expect(stdout).toContain('grok-bot: degraded demo-d-both (needs subagents)');
        expect(readSkill(sand, 'demo-b-hooks')).toContain('degraded on Grok Bot');

        // A receipt without the fields reinstalls with exclude and nothing provided.
        const plain = sandEnv('sand-plain');
        await executeInstall(PLUGIN, ['grok-bot'], opts);
        expect(readInstallManifest(installManifestPath(plain, 'grok-bot', PLUGIN)).grokBot).toEqual({
            materialize: 'full',
        });
        writeFileSync(
            join(pluginRoot, 'skills', 'c-none.md'),
            `${readFileSync(join(pluginRoot, 'skills', 'c-none.md'), 'utf-8')}Second update.\n`,
        );
        stdout = '';
        expect(await executeUpdate(PLUGIN, ['grok-bot'], { check: false, global: true, marketplacePath: market })).toBe(
            0,
        );
        expect(stdout).toContain('grok-bot: excluded demo-b-hooks (needs hooks)');
        expect(existsSync(join(plain, 'workflows', 'demo-b-hooks'))).toBe(false);
    });

    it('AC4: a degraded bridge install reinstalls cleanly — markers hash the delivered bytes', async () => {
        const sand = sandEnv('sand-bridge');
        const pluginRoot = createRequiresPlugin(tempDir);
        const bridge = { ...installOpts(pluginRoot, { botUnmet: 'degrade' }), materialize: 'bridge' as const };
        await executeInstall(PLUGIN, ['grok-bot'], bridge);
        await executeInstall(PLUGIN, ['grok-bot'], bridge);
        // The canonical recipe carries the degraded description; the pointer mirrors it.
        const canonical = readFileSync(
            join(sand, '.superskill', 'grok-bot', 'skills', 'demo-a-cli', 'SKILL.md'),
            'utf-8',
        );
        expect(parseFrontmatter(canonical).data.requires).toEqual(['cli:spur']);
        expect(canonical).toContain('[degraded on Grok Bot: needs cli:spur]');
        expect(readSkill(sand, 'demo-a-cli')).toContain('[degraded on Grok Bot: needs cli:spur]');
    });

    it('AC6: a non-Bot target treats `requires` like any other pass-through key', async () => {
        const pluginRoot = createRequiresPlugin(tempDir);
        // A rulesync target emits through the same staged tree as before this task; the
        // only claim under test is that `requires` gets no filter and no rewrite of ours.
        const withRequires = join(tempDir, 'out-requires');
        await executeInstall(PLUGIN, ['codex'], {
            pluginPath: pluginRoot,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: withRequires,
        });
        writeFileSync(
            join(pluginRoot, 'skills', 'a-cli.md'),
            '---\nname: a-cli\ndescription: Skill a-cli handles a demo workflow\ncustom: keep\n---\n\nBody of /skill:demo-a-cli.\n',
        );
        const withControlKey = join(tempDir, 'out-control');
        await executeInstall(PLUGIN, ['codex'], {
            pluginPath: pluginRoot,
            global: false,
            dryRun: false,
            verbose: false,
            outputRoot: withControlKey,
        });
        const rel = join('.agents', 'skills', 'demo-a-cli', 'SKILL.md');
        // Byte-identical to the same fixture carrying an unrelated key: no special handling.
        expect(readFileSync(join(withRequires, rel), 'utf-8')).toBe(readFileSync(join(withControlKey, rel), 'utf-8'));
        expect(stdout).not.toContain('grok-bot: excluded');
        expect(stdout).not.toContain('degraded on Grok Bot');
        expect(existsSync(installManifestPath(withRequires, 'codex', PLUGIN))).toBe(true);
    });

    it('AC5: flag misuse and invalid values exit 2 before any staging', async () => {
        sandEnv('sand');
        const { Command } = await import('commander');
        const { registerInstall } = await import('../../src/commands/install');
        const cases: Array<{ argv: string[]; message: RegExp }> = [
            {
                argv: ['install', PLUGIN, '--targets', 'grok-bot', '--bot-unmet', 'maybe'],
                message: /Invalid --bot-unmet 'maybe'/,
            },
            {
                argv: ['install', PLUGIN, '--targets', 'grok-bot', '--bot-provides', 'network'],
                message: /Invalid --bot-provides 'network'/,
            },
            {
                argv: ['install', PLUGIN, '--targets', 'codex', '--bot-provides', 'hooks'],
                message: /--bot-provides applies only to target 'grok-bot'/,
            },
            {
                argv: ['install', PLUGIN, '--targets', 'codex', '--bot-unmet', 'degrade'],
                message: /--bot-unmet applies only to target 'grok-bot'/,
            },
        ];
        const err = spyOn(process.stderr, 'write').mockImplementation(() => true);
        const exit = spyOn(process, 'exit').mockImplementation(() => undefined as never);
        try {
            for (const testCase of cases) {
                err.mockClear();
                const program = new Command();
                registerInstall(program);
                await program.parseAsync(testCase.argv, { from: 'user' });
                expect(exit).toHaveBeenCalledWith(2);
                expect(err.mock.calls.map((call) => String(call[0])).join('')).toMatch(testCase.message);
                exit.mockClear();
            }
        } finally {
            exit.mockRestore();
            err.mockRestore();
            process.exitCode = 0;
        }
        expect(existsSync(join(tempDir, 'sand'))).toBe(false);
    });
});
