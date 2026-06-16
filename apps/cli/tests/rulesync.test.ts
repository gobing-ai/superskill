import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
});
