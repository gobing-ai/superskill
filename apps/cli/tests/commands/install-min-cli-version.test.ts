import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareSemver } from '../../src/commands/install';

describe('compareSemver', () => {
    it('returns 0 for equal versions', () => {
        expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
        expect(compareSemver('0.2.14', '0.2.14')).toBe(0);
    });

    it('returns negative when a < b (patch)', () => {
        expect(compareSemver('1.0.1', '1.0.2')).toBeLessThan(0);
    });

    it('returns negative when a < b (minor)', () => {
        expect(compareSemver('0.2.13', '0.3.0')).toBeLessThan(0);
    });

    it('returns negative when a < b (major)', () => {
        expect(compareSemver('0.99.99', '1.0.0')).toBeLessThan(0);
    });

    it('returns positive when a > b', () => {
        expect(compareSemver('1.2.0', '1.0.0')).toBeGreaterThan(0);
        expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    });

    it('treats missing segments as 0', () => {
        expect(compareSemver('1.0', '1.0.0')).toBe(0);
        expect(compareSemver('1', '1.0.0')).toBe(0);
        expect(compareSemver('1.0.0', '1.0')).toBe(0);
    });

    it('ranks a release above its own prerelease (1.0.0 > 1.0.0-beta)', () => {
        expect(compareSemver('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
        expect(compareSemver('1.0.0-beta', '1.0.0')).toBeLessThan(0);
    });

    it('orders numeric prerelease segments', () => {
        expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
        expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
    });

    it('handles non-numeric prerelease segments lexically', () => {
        expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
        expect(compareSemver('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0);
    });

    it('coerces non-numeric segments to 0 (malformed floor never blocks a real CLI version)', () => {
        // 'not-a-version' parses core as [NaN→0], effectively 0.0.0 — below 1.0.0
        expect(compareSemver('not-a-version', '1.0.0')).toBeLessThan(0);
        // 1.0.0 vs garbage(=0.0.0) → above
        expect(compareSemver('1.0.0', 'garbage')).toBeGreaterThan(0);
        // Two equally-malformed floors are "equal"
        expect(compareSemver('garbage', 'garbage')).toBe(0);
    });
});

// ── 0077 R4: the real cc plugin floor drives the compat gate ─────────────────────

describe('cc plugin minCliVersion floor gate', () => {
    // The install gate skips hook emission when `compareSemver(cliVersion, floor) < 0`.
    // The real CLI sits AT the floor (equal), so a below-floor CLI cannot be produced by
    // the real binary — this ties the REAL plugin floor to the gate's decision function
    // directly (the generic skip mechanism is proven in install-min-cli-version-behavior).
    const floor = JSON.parse(readFileSync(join(import.meta.dir, '../../../../plugins/cc/hooks/hooks.json'), 'utf-8'))
        .minCliVersion as string;

    it('the real floor is a valid semver the gate can compare', () => {
        expect(floor).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('a CLI one patch below the real floor is gated as below (hooks would skip)', () => {
        const [maj = 0, min = 0, pat = 0] = floor.split('.').map((n) => Number.parseInt(n, 10));
        const oneBelow = pat > 0 ? `${maj}.${min}.${pat - 1}` : `${maj}.${Math.max(0, min - 1)}.0`;
        expect(compareSemver(oneBelow, floor)).toBeLessThan(0);
    });

    it('a CLI at or above the real floor is not gated (hooks install)', () => {
        expect(compareSemver(floor, floor)).toBe(0);
        const [maj = 0, min = 0, pat = 0] = floor.split('.').map((n) => Number.parseInt(n, 10));
        expect(compareSemver(`${maj}.${min}.${pat + 1}`, floor)).toBeGreaterThan(0);
    });
});
