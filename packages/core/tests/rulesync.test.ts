import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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

        await runRulesync(['codex'], ['skills'], tmpDir, {
            global: false,
            dryRun: true,
            verbose: false,
            outputRoot: customRoot,
        });

        const firstCall = spy.mock.calls[0];
        if (!firstCall) throw new Error('expected generate to have been called');
        const callArg = firstCall[0] as { outputRoots: string[] };
        expect(callArg.outputRoots).toEqual([customRoot]);
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
});
