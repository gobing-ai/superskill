import { describe, expect, it } from 'bun:test';
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
