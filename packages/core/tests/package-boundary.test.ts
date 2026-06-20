import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(import.meta.dir, '..', 'src');

/** Recursively collect every .ts file under a directory. */
function collectTsFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            collectTsFiles(full, acc);
        } else if (entry.endsWith('.ts')) {
            acc.push(full);
        }
    }
    return acc;
}

describe('package boundary: packages/core must not depend on apps/cli', () => {
    const files = collectTsFiles(SRC_DIR);

    it('core source tree is non-empty', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it('no core source imports from apps/cli (relative or alias)', () => {
        const violations: string[] = [];
        // apps/cli lives at ../../apps/cli relative to packages/core/src; any
        // relative import escaping the package, or an @gobing-ai/superskill
        // (the CLI package) alias, is a boundary violation.
        const forbiddenPatterns = [
            /from\s+['"]\.\..*\.\..*\bapps\b\/cli/,
            /from\s+['"]@gobing-ai\/superskill['"]/,
            /from\s+['"]@gobing-ai\/superskill\//,
        ];
        for (const file of files) {
            const text = readFileSync(file, 'utf-8');
            for (const pattern of forbiddenPatterns) {
                if (pattern.test(text)) {
                    violations.push(relative(SRC_DIR, file));
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('no core source uses process.exit or writes to stdout/stderr', () => {
        const violations: string[] = [];
        const forbiddenPatterns = [
            /\bprocess\.exit\s*\(/,
            /\bprocess\.stdout\.write\s*\(/,
            /\bprocess\.stderr\.write\s*\(/,
            /\bconsole\.(log|error|warn|info)\s*\(/,
        ];
        for (const file of files) {
            const text = readFileSync(file, 'utf-8');
            for (const pattern of forbiddenPatterns) {
                if (pattern.test(text)) {
                    violations.push(`${relative(SRC_DIR, file)}: ${pattern.source}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
