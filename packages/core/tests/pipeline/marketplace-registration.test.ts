import { describe, expect, it } from 'bun:test';
import { KNOWN_GITHUB_REPOS, resolveMarketplaceRegistration } from '../../src/pipeline/marketplace-registration';

describe('resolveMarketplaceRegistration', () => {
    it('returns directory mode with absolute path when mode is directory', () => {
        const result = resolveMarketplaceRegistration('/abs/path/to/repo', 'superskill', 'directory');
        expect(result.mode).toBe('directory');
        expect(result.source).toBe('/abs/path/to/repo');
    });

    it('returns github slug for known marketplace name in github mode', () => {
        const result = resolveMarketplaceRegistration('/abs/path/to/repo', 'superskill', 'github');
        expect(result.mode).toBe('github');
        expect(result.source).toBe('gobing-ai/superskill');
    });

    it('returns github slug for spur in github mode', () => {
        const result = resolveMarketplaceRegistration('/abs/path/to/spur', 'spur', 'github');
        expect(result.mode).toBe('github');
        expect(result.source).toBe('gobing-ai/spur');
    });

    it('falls back to path for unknown marketplace name in github mode', () => {
        const result = resolveMarketplaceRegistration('/path/to/private-plugin', 'my-private-plugin', 'github');
        expect(result.mode).toBe('directory');
        expect(result.source).toBe('/path/to/private-plugin');
    });

    it('returns directory mode for known name when mode is directory (not github)', () => {
        const result = resolveMarketplaceRegistration('/path/to/repo', 'spur', 'directory');
        expect(result.mode).toBe('directory');
        expect(result.source).toBe('/path/to/repo');
    });

    it('handles empty marketplaceRoot in directory mode', () => {
        const result = resolveMarketplaceRegistration('', 'superskill', 'directory');
        expect(result.mode).toBe('directory');
        expect(result.source).toBe('');
    });

    it('handles empty marketplaceRoot in github mode with known name', () => {
        const result = resolveMarketplaceRegistration('', 'superskill', 'github');
        expect(result.mode).toBe('github');
        expect(result.source).toBe('gobing-ai/superskill');
    });
});

describe('KNOWN_GITHUB_REPOS', () => {
    it('maps superskill to gobing-ai/superskill', () => {
        expect(KNOWN_GITHUB_REPOS.superskill).toBe('gobing-ai/superskill');
    });

    it('maps spur to gobing-ai/spur', () => {
        expect(KNOWN_GITHUB_REPOS.spur).toBe('gobing-ai/spur');
    });

    // KNOWN_GITHUB_REPOS is typed `Readonly<>` — TS-level immutability.
    // No runtime Object.freeze() so the CLI can merge config overrides at startup.
});
