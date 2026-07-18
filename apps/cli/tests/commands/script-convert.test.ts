import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { convertScriptToPortableTwin, registerScriptConvert } from '../../src/commands/script-convert';

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

    /** Write a minimal entrypoint .ts under the temp projectRoot the CLI action resolves. */
    function seedSource(name: string): string {
        const srcPath = join(projectDir, 'plugins', 'cc', 'scripts', name);
        mkdirSync(join(projectDir, 'plugins', 'cc', 'scripts'), { recursive: true });
        writeFileSync(srcPath, 'function main() { return 0; }\nif (import.meta.main) process.exit(main());\n');
        return srcPath;
    }

    function spyOnStream(stream: typeof process.stdout | typeof process.stderr) {
        return spyOn(stream, 'write').mockImplementation(() => true);
    }

    function joined(spy: { mock: { calls: unknown[][] } }): string {
        return spy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    }
});
