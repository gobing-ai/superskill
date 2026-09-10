import { describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerDoctor } from '../../src/commands/doctor';

async function runDoctor(args: string[]): Promise<{ code: number; output: string }> {
    const chunks: string[] = [];
    const spyOut = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        chunks.push(String(chunk));
        return true;
    });
    const spyErr = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        chunks.push(String(chunk));
        return true;
    });
    const exits: number[] = [];
    const spyExit = spyOn(process, 'exit').mockImplementation(((code?: number) => {
        exits.push(code ?? 0);
        throw new Error(`exit:${code}`);
    }) as typeof process.exit);
    const program = new Command();
    registerDoctor(program);
    try {
        await program.parseAsync(['doctor', ...args], { from: 'user' });
    } catch {
        // The mocked process.exit throws to unwind; the exit code is already recorded.
    } finally {
        spyOut.mockRestore();
        spyErr.mockRestore();
        spyExit.mockRestore();
    }
    return { code: exits[0] ?? 0, output: chunks.join('') };
}

describe('doctor command (task 0128 / R6)', () => {
    it('exits 2 on usage errors and 1 when no root resolves, 0 when healthy', async () => {
        expect((await runDoctor([])).code).toBe(2);
        expect((await runDoctor(['--targets', 'codex'])).code).toBe(2);

        const home = mkdtempSync(join(tmpdir(), 'superskill-doctor-home-'));
        const savedHome = process.env.HOME_DIR;
        const savedSand = process.env.SAND_DATA;
        process.env.HOME_DIR = home;
        delete process.env.SAND_DATA;
        try {
            expect((await runDoctor(['--targets', 'grok-bot'])).code).toBe(1);
            const sand = join(home, 'sand-data');
            mkdirSync(sand, { recursive: true });
            const healthy = await runDoctor(['--targets', 'grok-bot', '--json']);
            expect(healthy.code).toBe(0);
            const report = JSON.parse(healthy.output) as { available: boolean; source: string; dataRoot: string };
            expect(report.available).toBe(true);
            expect(report.source).toBe('sand-data');
            expect(report.dataRoot).toBe(realpathSync(sand));
            const humanHealthy = await runDoctor(['--targets', 'grok-bot']);
            expect(humanHealthy.code).toBe(0);
            expect(humanHealthy.output).toContain('OK');
        } finally {
            if (savedHome === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = savedHome;
            if (savedSand === undefined) delete process.env.SAND_DATA;
            else process.env.SAND_DATA = savedSand;
            if (savedSand === undefined) delete process.env.SAND_DATA;
            else process.env.SAND_DATA = savedSand;
            rmSync(home, { recursive: true, force: true });
        }
    });

    it('reports issues for invalid workflows in the catalog', async () => {
        const home = mkdtempSync(join(tmpdir(), 'superskill-doctor-home2-'));
        const savedHome = process.env.HOME_DIR;
        const savedSand = process.env.SAND_DATA;
        process.env.HOME_DIR = home;
        delete process.env.SAND_DATA;
        try {
            const sand = join(home, 'sand-data');
            mkdirSync(join(sand, 'workflows', 'broken'), { recursive: true });
            writeFileSync(join(sand, 'workflows', 'broken', 'SKILL.md'), '---\nname: other\ndescription: d\n---\nx');
            const result = await runDoctor(['--targets', 'grok-bot', '--json']);
            expect(result.code).toBe(1);
            const report = JSON.parse(result.output) as { available: boolean; issues: { code: string }[] };
            expect(report.available).toBe(false);
            expect(report.issues.some((i) => i.code === 'frontmatter')).toBe(true);
            const human = await runDoctor(['--targets', 'grok-bot']);
            expect(human.code).toBe(1);
            expect(human.output).toContain('[frontmatter]');
        } finally {
            if (savedHome === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = savedHome;
            if (savedSand === undefined) delete process.env.SAND_DATA;
            else process.env.SAND_DATA = savedSand;
            rmSync(home, { recursive: true, force: true });
        }
    });

    it('reports slash registry unknown with handoff guidance without changing exit semantics (task 0130)', async () => {
        const home = mkdtempSync(join(tmpdir(), 'superskill-doctor-home3-'));
        const savedHome = process.env.HOME_DIR;
        const savedSand = process.env.SAND_DATA;
        process.env.HOME_DIR = home;
        delete process.env.SAND_DATA;
        try {
            const sand = join(home, 'sand-data');
            mkdirSync(sand, { recursive: true });
            const json = await runDoctor(['--targets', 'grok-bot', '--json']);
            expect(json.code).toBe(0); // guidance never breaks a healthy root
            const report = JSON.parse(json.output) as {
                slashRegistry: { status: string; handoffDir: string | null; guidance: string[] };
            };
            expect(report.slashRegistry.status).toBe('unknown');
            expect(report.slashRegistry.handoffDir).toBe(
                join(realpathSync(sand), '.superskill', 'grok-bot', 'register'),
            );
            expect(report.slashRegistry.guidance.join(' ')).toContain('Plugins > Yours');
            const human = await runDoctor(['--targets', 'grok-bot']);
            expect(human.code).toBe(0);
            expect(human.output).toContain('slash registry: unknown');
            expect(human.output).toContain('verified registration method');
            // Unresolved root still surfaces the caveat.
            delete process.env.SAND_DATA;
            process.env.HOME_DIR = join(home, 'missing-home');
            const unresolved = await runDoctor(['--targets', 'grok-bot']);
            expect(unresolved.output).toContain('slash registry: unknown');
        } finally {
            if (savedHome === undefined) delete process.env.HOME_DIR;
            else process.env.HOME_DIR = savedHome;
            if (savedSand === undefined) delete process.env.SAND_DATA;
            else process.env.SAND_DATA = savedSand;
            rmSync(home, { recursive: true, force: true });
        }
    });
});
