import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { convertScriptToPortableTwin, findBunGlobals, registerScriptConvert } from '../../src/commands/script-convert';

describe('convertScriptToPortableTwin', () => {
    // WHY: `script convert` is the reusable build step for the dual install contract's standard
    // form — any plugin author ships a `.mjs` that runs under bare Node on staged targets. Assert the
    // shared engine produces a Node-runnable twin (no Bun, no type:module) and strips the
    // `import.meta.main` guard Bun mis-transforms.
    it('produces a Node-runnable .mjs with a node shebang (one-line main guard)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'convert-test-'));
        const src = join(dir, 'sample.ts');
        writeFileSync(
            src,
            [
                '#!/usr/bin/env bun',
                'function main() {',
                '  console.log(process.env.PAYLOAD ?? "empty");',
                '  return 0;',
                '}',
                'if (import.meta.main) process.exit(main());',
                '',
            ].join('\n'),
        );
        const out = join(dir, 'sample.mjs');

        await convertScriptToPortableTwin(src, out);

        expect(existsSync(out)).toBe(true);
        expect(readFileSync(out, 'utf-8').split('\n')[0]).toBe('#!/usr/bin/env node');
        const res = spawnSync('node', [out], { env: { ...process.env, PAYLOAD: 'hello' }, encoding: 'utf-8' });
        expect(res.status).toBe(0);
        expect(res.stdout.trim()).toBe('hello');
    });

    it('strips the braced main guard too (the validate_response.ts shape)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'convert-braced-'));
        const src = join(dir, 'b.ts');
        writeFileSync(
            src,
            [
                '#!/usr/bin/env bun',
                'function main() {',
                '  console.log("ran");',
                '  return 0;',
                '}',
                'if (import.meta.main) {',
                '  process.exit(main());',
                '}',
                '',
            ].join('\n'),
        );
        const out = join(dir, 'b.mjs');
        await convertScriptToPortableTwin(src, out);
        const res = spawnSync('node', [out], { encoding: 'utf-8' });
        expect(res.status).toBe(0);
        expect(res.stdout.trim()).toBe('ran');
    });

    it('throws with build logs when Bun.build returns success:false (defensive branch)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'convert-fail-'));
        const bad = join(dir, 'broken.ts');
        writeFileSync(bad, 'export const x = 1;\n');
        const out = join(dir, 'broken.mjs');
        // WHY: Bun 1.3.14's Bun.build always THROWS on failure — it never returns
        // { success: false }. The `if (!res.success)` branch is a defensive guard for Bun
        // versions that return instead of throw, so we mock Bun.build to exercise that contract:
        // the wrapper must surface a clear `bun build failed` error carrying the build logs.
        const buildSpy = spyOn(Bun, 'build').mockResolvedValue({
            success: false,
            logs: ['error: unexpected token'],
            outputs: [],
        } as unknown as Awaited<ReturnType<typeof Bun.build>>);
        try {
            await expect(convertScriptToPortableTwin(bad, out)).rejects.toThrow(/bun build failed/);
            await expect(convertScriptToPortableTwin(bad, out)).rejects.toThrow(/unexpected token/);
            expect(existsSync(out)).toBe(false);
        } finally {
            buildSpy.mockRestore();
        }
    });

    it('propagates a hard build failure (Bun.build throws)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'convert-fail-missing-'));
        const missing = join(dir, 'does-not-exist.ts');
        const out = join(dir, 'x.mjs');

        await expect(convertScriptToPortableTwin(missing, out)).rejects.toThrow();
        expect(existsSync(out)).toBe(false);
    });

    it('rejects a source using Bun globals and leaves no .mjs behind (R1 + R2)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'convert-bun-'));
        const src = join(dir, 'bunky.ts');
        writeFileSync(
            src,
            [
                '#!/usr/bin/env bun',
                'function mainCli(argv = Bun.argv.slice(2)) {',
                '  const f = Bun.file(argv[0] ?? "");',
                '  console.log(f);',
                '  return 0;',
                '}',
                'mainCli();',
                '',
            ].join('\n'),
        );
        const out = join(dir, 'bunky.mjs');

        // R1: convert rejects instead of silently emitting a broken artifact, and writes nothing.
        await expect(convertScriptToPortableTwin(src, out)).rejects.toThrow(/Bun globals survive/);
        expect(existsSync(out)).toBe(false);
        // R2: the failure names the offending global and its Node equivalent.
        await expect(convertScriptToPortableTwin(src, out)).rejects.toThrow('Bun.argv');
        await expect(convertScriptToPortableTwin(src, out)).rejects.toThrow('process.argv.slice(2)');
    });

    it('findBunGlobals reports each surviving Bun.* reference with its bundle line (R1 unit)', async () => {
        const bundled = 'function mainCli(argv = Bun.argv) {\n  return Bun.file(x);\n}\n';
        const uses = findBunGlobals(bundled);
        expect(uses.map((u) => u.prop)).toEqual(['argv', 'file']);
        expect(uses[0]?.line).toBe(1);
        expect(uses[1]?.line).toBe(2);
        expect(uses[1]?.text).toContain('Bun.file');
    });

    it('runs the shipped cc validate-response twin under node (R6 — twin-runnable proof)', async () => {
        const twin = join(import.meta.dir, '../../../../plugins/cc/scripts/anti-hallucination/validate_response.mjs');
        const res = spawnSync('node', [twin], {
            env: { ...process.env, RESPONSE_TEXT: '{"text":"hi"}' },
            encoding: 'utf-8',
        });
        expect(res.status).toBe(0);
        const parsed = JSON.parse(res.stdout) as { ok: boolean };
        expect(parsed.ok).toBe(true);
    });
});

describe('registerScriptConvert CLI', () => {
    const origProjectDir = process.env.CLAUDE_PROJECT_DIR;
    let projectDir: string;
    let stdoutSpy: ReturnType<typeof spyOn>;
    let stderrSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        projectDir = mkdtempSync(join(tmpdir(), 'convert-cli-'));
        process.env.CLAUDE_PROJECT_DIR = projectDir;
        // WHY: echo()/echoError() write directly to process streams — capture so assertions
        // tie to emitted text and nothing leaks into the dot reporter output.
        stdoutSpy = spyOnStream(process.stdout);
        stderrSpy = spyOnStream(process.stderr);
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        if (origProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
        else process.env.CLAUDE_PROJECT_DIR = origProjectDir;
        rmSync(projectDir, { recursive: true, force: true });
    });

    it('registers convert subcommand under the script group', () => {
        const program = new Command().name('superskill');
        registerScriptConvert(program);
        const scriptCmd = program.commands.find((c) => c.name() === 'script');
        const convertCmd = scriptCmd?.commands.find((c) => c.name() === 'convert');
        expect(convertCmd).toBeDefined();
        expect(convertCmd?.options.some((o) => o.long === '--dry-run')).toBe(true);
        expect(convertCmd?.options.some((o) => o.long === '--json')).toBe(true);
        expect(convertCmd?.options.some((o) => o.long === '--out')).toBe(true);
    });

    it('reuses an existing script group without conflict', () => {
        const program = new Command().name('superskill');
        program.command('script').description('Plugin script utilities');
        registerScriptConvert(program);
        const scriptCmd = program.commands.find((c) => c.name() === 'script');
        expect(scriptCmd?.commands.some((c) => c.name() === 'convert')).toBe(true);
    });

    it('rejects locator escapes before the existence probe (F3, task 0127 AC4)', async () => {
        const decoy = join(projectDir, 'outside.ts');
        writeFileSync(decoy, 'export const leaked = 1;\n');
        const cases: Array<[plugin: string, rel: string, message: RegExp]> = [
            ['cc', '../outside.ts', /Invalid relative path/],
            ['cc', 'a/../../outside.ts', /Invalid relative path/],
            ['cc', '../../../apps/cli/src/index.ts', /Invalid relative path/],
            ['cc', '/etc/passwd', /Invalid relative path/],
            ['cc', 'C:\\Windows\\notepad.exe', /Invalid relative path/],
            ['cc', 'a//b.ts', /Invalid relative path/],
            ['../cc', 'ok.ts', /single path segment/],
        ];
        for (const [plugin, rel, message] of cases) {
            const program = new Command().name('superskill');
            const exits: number[] = [];
            registerScriptConvert(program, {
                exit: (code) => {
                    exits.push(code);
                    throw new Error(`exit ${code}`);
                },
            });
            await expect(
                program.parseAsync(['node', 'superskill', 'script', 'convert', plugin, rel, '--dry-run']),
            ).rejects.toThrow(/exit 1/);
            expect(exits).toEqual([1]);
            expect(joined(stderrSpy)).toMatch(message);
            expect(joined(stdoutSpy)).toBe('');
            expect(existsSync(join(projectDir, 'plugins', plugin, 'scripts', rel.replace(/\.[^.]+$/, '.mjs')))).toBe(
                false,
            );
            stderrSpy.mockClear();
            stdoutSpy.mockClear();
        }
        expect(existsSync(decoy)).toBe(true);
        expect(existsSync(decoy.replace(/\.ts$/, '.mjs'))).toBe(false);
    });

    it('still converts a nested safe relative path and file..ts (F3, task 0127 AC4)', async () => {
        seedSource('nested/ok.ts');
        seedSource('file..ts');
        const program = new Command().name('superskill');
        registerScriptConvert(program);
        await program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'nested/ok.ts', '--dry-run']);
        expect(joined(stdoutSpy)).toContain('(dry-run)');
        expect(existsSync(join(projectDir, 'plugins', 'cc', 'scripts', 'nested', 'ok.mjs'))).toBe(false);
        stdoutSpy.mockClear();
        await program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'file..ts', '--dry-run']);
        expect(joined(stdoutSpy)).toContain('file..ts');
        expect(existsSync(join(projectDir, 'plugins', 'cc', 'scripts', 'file..mjs'))).toBe(false);
    });

    it('exits 1 when the source script does not exist', async () => {
        const program = new Command().name('superskill');
        const exits: number[] = [];
        registerScriptConvert(program, {
            exit: (code) => {
                exits.push(code);
                throw new Error(`exit ${code}`);
            },
        });
        await expect(program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'nope.ts'])).rejects.toThrow(
            /exit 1/,
        );
        expect(exits).toEqual([1]);
    });

    it('--dry-run reports the mapping and writes nothing', async () => {
        seedSource('demo.ts');
        const program = new Command().name('superskill');
        registerScriptConvert(program);
        await program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'demo.ts', '--dry-run']);
        expect(joined(stdoutSpy)).toContain('(dry-run)');
        expect(existsSync(join(projectDir, 'plugins', 'cc', 'scripts', 'demo.mjs'))).toBe(false);
    });

    it('--json emits a machine-readable converted record', async () => {
        seedSource('demo.ts');
        const program = new Command().name('superskill');
        registerScriptConvert(program);
        await program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'demo.ts', '--json']);
        const parsed = JSON.parse(joined(stdoutSpy)) as { converted: Array<{ out: string; bytes: number }> };
        expect(parsed.converted).toHaveLength(1);
        expect(parsed.converted[0]?.out.endsWith('demo.mjs')).toBe(true);
        expect(parsed.converted[0]?.bytes).toBeGreaterThan(0);
    });

    it('default output prints the check-mark success line', async () => {
        seedSource('demo.ts');
        const program = new Command().name('superskill');
        registerScriptConvert(program);
        await program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'demo.ts']);
        expect(joined(stdoutSpy)).toContain('bytes)');
        expect(existsSync(join(projectDir, 'plugins', 'cc', 'scripts', 'demo.mjs'))).toBe(true);
    });

    it('exits 1 and writes no .mjs when the source uses Bun globals (R1 + R2, CLI)', async () => {
        seedSource('bunky.ts', 'function main() { console.log(Bun.argv); }\nmain();\n');
        const program = new Command().name('superskill');
        const exits: number[] = [];
        registerScriptConvert(program, {
            exit: (code) => {
                exits.push(code);
                throw new Error(`exit ${code}`);
            },
        });
        await expect(program.parseAsync(['node', 'superskill', 'script', 'convert', 'cc', 'bunky.ts'])).rejects.toThrow(
            /exit 1/,
        );
        expect(exits).toEqual([1]);
        expect(joined(stderrSpy)).toContain('Bun globals survive');
        expect(existsSync(join(projectDir, 'plugins', 'cc', 'scripts', 'bunky.mjs'))).toBe(false);
    });

    /** Write a minimal entrypoint .ts under the temp projectRoot the CLI action resolves. */
    function seedSource(name: string, content?: string): string {
        const srcPath = join(projectDir, 'plugins', 'cc', 'scripts', name);
        mkdirSync(join(srcPath, '..'), { recursive: true });
        writeFileSync(
            srcPath,
            content ?? 'function main() { return 0; }\nif (import.meta.main) process.exit(main());\n',
        );
        return srcPath;
    }

    function spyOnStream(stream: typeof process.stdout | typeof process.stderr) {
        return spyOn(stream, 'write').mockImplementation(() => true);
    }

    function joined(spy: { mock: { calls: unknown[][] } }): string {
        return spy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    }
});
