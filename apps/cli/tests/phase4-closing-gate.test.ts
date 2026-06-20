import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 4 Closing Gate — Invariant #1: CLI makes zero model API calls.
 *
 * Task 0032 owns the Phase 4 closing gate. This test asserts that no model
 * provider call (Anthropic, OpenAI, fetch, http) is reachable from the
 * CLI's operations and quality modules — the intelligence enters as
 * ingested data, never as a live API call (design §1, invariant #1).
 */
describe('phase 4 closing gate — zero model API calls', () => {
    const OPS_DIR = join(import.meta.dir, '../src/operations');
    const QUALITY_DIR = join(import.meta.dir, '../../../packages/core/src/quality');

    /** Collect all .ts source files from a directory (non-recursive). */
    function collectTsFiles(dir: string): string[] {
        return readdirSync(dir)
            .filter((f) => f.endsWith('.ts'))
            .map((f) => join(dir, f));
    }

    const sourceFiles = [...collectTsFiles(OPS_DIR), ...collectTsFiles(QUALITY_DIR)];

    // Patterns that indicate a model API call — invariant #1 violation
    const FORBIDDEN_PATTERNS: RegExp[] = [
        /anthropic/i,
        /openai/i,
        /\bfetch\s*\(/, // fetch() — network call
        /\bhttp\b/i, // http module or URL
        /XMLHttpRequest/,
        /WebSocket/,
        /\.createCompletion\b/,
        /\.chat\.completions\b/,
        /@anthropic-ai\//,
        /from\s+['"]openai['"]/,
        /from\s+['"]@anthropic-ai\/sdk['"]/,
    ];

    it('has source files to check', () => {
        expect(sourceFiles.length).toBeGreaterThan(0);
    });

    it.each(sourceFiles)('%s makes no model API calls', (filePath) => {
        const content = readFileSync(filePath, 'utf-8');
        // relPath unused — kept for debugging; file path shown in test name via it.each

        for (const pattern of FORBIDDEN_PATTERNS) {
            // Allow the pattern in comments — strip single-line comments before checking
            const stripped = content.replace(/\/\/.*$/gm, '');
            expect(stripped).not.toMatch(pattern);
        }
    });
});
