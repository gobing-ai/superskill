import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as rulesyncModule from 'rulesync';
import { runRulesync } from '../src/rulesync';

describe('runRulesync', () => {
    let tmpDir: string | undefined;

    afterEach(() => {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    });

    it('maps superskill targets to rulesync ToolTarget strings', async () => {
        tmpDir = mkdtempSync('superskill-rulesync-');
        mkdirSync(join(tmpDir, '.rulesync'), { recursive: true });

        const result = await runRulesync(['codex', 'pi'], ['skills'], tmpDir, {
            global: false,
            dryRun: true,
            verbose: false,
        });
        expect(result.skillsCount).toBe(0);
    });

    it('skips targets without a rulesync mapping', async () => {
        const result = await runRulesync(['claude', 'omp', 'hermes'], ['skills'], '.', {
            global: false,
            dryRun: true,
            verbose: false,
        });
        expect(result.skillsCount).toBe(0);
        expect(result.hasDiff).toBe(false);
    });

    it('threads outputRoot into outputRoots when provided (R1)', async () => {
        tmpDir = mkdtempSync('superskill-rulesync-');
        mkdirSync(join(tmpDir, '.rulesync'), { recursive: true });
        const customRoot = '/custom/output/root';

        const spy = spyOn(rulesyncModule, 'generate').mockResolvedValue({
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

        // global:true here on purpose — the override must still win and force
        // rulesync global:false, because rulesync's global:true ignores outputRoots
        // and writes to $HOME (task 0045 R1 regression).
        await runRulesync(['codex'], ['skills'], tmpDir, {
            global: true,
            dryRun: true,
            verbose: false,
            outputRoot: customRoot,
        });

        const firstCall = spy.mock.calls[0];
        if (!firstCall) throw new Error('expected generate to have been called');
        const callArg = firstCall[0] as { outputRoots: string[]; global: boolean };
        expect(callArg.outputRoots).toEqual([customRoot]);
        // The override forces global:false so rulesync honors outputRoots.
        expect(callArg.global).toBe(false);
        spy.mockRestore();
    });

    it('falls back to global?homedir():cwd() when outputRoot omitted (R1)', async () => {
        tmpDir = mkdtempSync('superskill-rulesync-');
        mkdirSync(join(tmpDir, '.rulesync'), { recursive: true });

        const spy = spyOn(rulesyncModule, 'generate').mockResolvedValue({
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

        await runRulesync(['codex'], ['skills'], tmpDir, {
            global: false,
            dryRun: true,
            verbose: false,
        });

        const firstCall = spy.mock.calls[0];
        if (!firstCall) throw new Error('expected generate to have been called');
        const callArg = firstCall[0] as { outputRoots: string[] };
        // global=false → process.cwd() (the ADR-010 derivation)
        expect(callArg.outputRoots).toEqual([process.cwd()]);
        spy.mockRestore();
    });

    // Real (non-mocked) rulesync write. This is the regression guard the mocked
    // tests could not provide: it proves skills physically land under outputRoot
    // and NOT in $HOME, even when global:true is requested. Without the
    // global-coercion fix, rulesync's global:true ignores outputRoots and this
    // test would find zero files under the override root (task 0045 R1).
    it('actually writes skills under outputRoot (not $HOME) even with global:true (R1)', async () => {
        tmpDir = mkdtempSync('superskill-rulesync-real-');
        const inputRoot = join(tmpDir, 'in');
        const outRoot = join(tmpDir, 'out');
        mkdirSync(join(inputRoot, '.rulesync', 'skills', 'demo-foo'), { recursive: true });
        writeFileSync(
            join(inputRoot, '.rulesync', 'skills', 'demo-foo', 'SKILL.md'),
            '---\nname: demo-foo\ndescription: real write test\n---\nbody\n',
        );

        await runRulesync(['codex'], ['skills'], inputRoot, {
            global: true,
            dryRun: false,
            verbose: false,
            outputRoot: outRoot,
        });

        const found = walkForSkillFiles(outRoot);
        expect(found.length).toBeGreaterThan(0);
        expect(found.some((p) => p.includes('demo-foo'))).toBe(true);
    });
});

/** Recursively collect SKILL.md paths under a root (test helper). */
function walkForSkillFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walkForSkillFiles(full);
        return entry.name === 'SKILL.md' ? [full] : [];
    });
}
