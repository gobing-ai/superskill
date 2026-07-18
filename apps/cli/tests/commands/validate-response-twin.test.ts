import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Path to the committed portable twin (generated from validate_response.ts by build:scripts).
const TWIN = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    'plugins',
    'cc',
    'scripts',
    'anti-hallucination',
    'validate_response.mjs',
);

describe('validate_response.mjs portable twin', () => {
    // WHY: the .mjs twin is the cross-agent non-hook enforcement primitive — it must run under bare
    // Node (no Bun, no type:module) on any staged target, since pi/omp/grok/OpenCode have no
    // prevent-stop hook and rely on this path form. Guard that the generated artifact behaves.
    const run = (env: Record<string, string>): { status: number | null; stdout: string } => {
        const r = spawnSync('node', [TWIN], { env: { ...process.env, ...env }, encoding: 'utf-8' });
        return { status: r.status, stdout: r.stdout };
    };

    it('exits 1 + reports issues for an uncited external claim', () => {
        const { status, stdout } = run({
            RESPONSE_TEXT: 'The library returns a promise. Version 2.0 added this behavior.',
        });
        expect(status).toBe(1);
        const parsed = JSON.parse(stdout.trim());
        expect(parsed.ok).toBe(false);
        expect(parsed.issues).toContain('source citations for API/library claims');
    });

    it('exits 0 for a clean internal note', () => {
        const { status } = run({ RESPONSE_TEXT: 'Done. Refactored the helper; tests green.' });
        expect(status).toBe(0);
    });
});
