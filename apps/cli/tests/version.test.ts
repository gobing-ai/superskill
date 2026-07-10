import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliVersion } from '../src/version';

describe('cliVersion', () => {
    it('matches the real package.json version (single source of truth)', () => {
        // WHY: cliVersion is embedded via JSON import and consumed by cli.ts (program version),
        // install.ts (minCliVersion gate), and hook-run.ts (unknown-hook warning). A stale or
        // empty value silently disables the version gate and makes skew warnings useless.
        const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf-8')) as {
            version: string;
        };
        expect(cliVersion).toBe(pkg.version);
        expect(cliVersion.length).toBeGreaterThan(0);
    });
});
