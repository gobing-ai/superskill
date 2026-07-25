/**
 * Tests for the GHE/github-host seam and the parser paths the vendor parity
 * fixtures do not exercise: GH_HOST enterprise handling, parseOwnerRepo,
 * and isRepoPrivate (fetch mocked — no network in tests).
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { getGitHubHost, isGitHubHost } from '../../src/skills-ecosystem/github-host';
import { isRepoPrivate, parseOwnerRepo, parseSource } from '../../src/skills-ecosystem/source-parser';

const ORIGINAL_GH_HOST = process.env.GH_HOST;
const originalFetch = globalThis.fetch;

// Bun's fetch type carries a `preconnect` property; a bare lambda can't be
// cast to it directly, so go through `unknown` (4 call sites).
function stubFetch(impl: () => Promise<Response>): void {
    globalThis.fetch = impl as unknown as typeof fetch;
}

afterEach(() => {
    if (ORIGINAL_GH_HOST === undefined) {
        delete process.env.GH_HOST;
    } else {
        process.env.GH_HOST = ORIGINAL_GH_HOST;
    }
    globalThis.fetch = originalFetch;
});

describe('getGitHubHost', () => {
    it('defaults to github.com when GH_HOST is unset', () => {
        delete process.env.GH_HOST;
        expect(getGitHubHost()).toBe('github.com');
    });

    it('returns the configured enterprise hostname', () => {
        process.env.GH_HOST = 'github.example.com';
        expect(getGitHubHost()).toBe('github.example.com');
        expect(isGitHubHost('GitHub.Example.COM')).toBe(true);
    });

    it('falls back to github.com for invalid GH_HOST values', () => {
        for (const bad of ['https://github.example.com', 'user:pass@host', 'host:8443', 'host/path', '   ']) {
            process.env.GH_HOST = bad;
            expect(getGitHubHost()).toBe('github.com');
        }
    });

    it('falls back to github.com when GH_HOST cannot parse as a URL host', () => {
        process.env.GH_HOST = 'host:notaport';
        expect(getGitHubHost()).toBe('github.com');
    });
});

describe('parseSource with GH_HOST (GitHub Enterprise)', () => {
    it('treats shorthand as a generic git source on the enterprise host', () => {
        process.env.GH_HOST = 'github.example.com';
        const result = parseSource('owner/repo');
        expect(result.type).toBe('git');
        expect(result.url).toBe('https://github.example.com/owner/repo.git');
    });

    it('parses an enterprise tree URL into a git source with ref and subpath', () => {
        process.env.GH_HOST = 'github.example.com';
        const result = parseSource('https://github.example.com/owner/repo/tree/main/skills/my-skill');
        expect(result.type).toBe('git');
        expect(result.url).toBe('https://github.example.com/owner/repo.git');
        expect(result.ref).toBe('main');
        expect(result.subpath).toBe('skills/my-skill');
    });

    it('parses an enterprise repo URL with a fragment ref', () => {
        process.env.GH_HOST = 'github.example.com';
        const result = parseSource('https://github.example.com/owner/repo.git#release');
        expect(result.type).toBe('git');
        expect(result.url).toBe('https://github.example.com/owner/repo.git');
        expect(result.ref).toBe('release');
    });

    it('normalizes traversal out of enterprise tree URLs (cannot escape the repo root)', () => {
        // Residual-proof negative: the full compound input (GHE host + /tree/
        // marker + `..` segments) reaches the parser, but the WHATWG URL
        // constructor normalizes `..` away before segments are extracted, so
        // no unsafe subpath can reach the clone path. Asserts the traversal
        // leaves no subpath at all — not merely that one half is absent.
        process.env.GH_HOST = 'github.example.com';
        const result = parseSource('https://github.example.com/owner/repo/tree/main/../../etc');
        expect(result.type).toBe('git');
        expect(result.url).toBe('https://github.example.com/owner/repo.git');
        expect(result.subpath).toBeUndefined();
    });

    it('does not reroute github.com URLs through the enterprise path', () => {
        process.env.GH_HOST = 'github.example.com';
        const result = parseSource('https://github.com/owner/repo');
        expect(result.type).toBe('github');
        expect(result.url).toBe('https://github.com/owner/repo.git');
    });
});

describe('parseOwnerRepo', () => {
    it('splits a valid owner/repo string', () => {
        expect(parseOwnerRepo('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('returns null for invalid formats', () => {
        expect(parseOwnerRepo('noslash')).toBeNull();
        expect(parseOwnerRepo('too/many/slashes')).toBeNull();
    });
});

describe('isRepoPrivate', () => {
    it('returns true when the API reports a private repo', async () => {
        stubFetch(() => Promise.resolve(new Response(JSON.stringify({ private: true }), { status: 200 })));
        expect(await isRepoPrivate('owner', 'repo')).toBe(true);
    });

    it('returns false when the API reports a public repo', async () => {
        stubFetch(() => Promise.resolve(new Response(JSON.stringify({ private: false }), { status: 200 })));
        expect(await isRepoPrivate('owner', 'repo')).toBe(false);
    });

    it('returns null when the repo is inaccessible', async () => {
        stubFetch(() => Promise.resolve(new Response('not found', { status: 404 })));
        expect(await isRepoPrivate('owner', 'repo')).toBeNull();
    });

    it('returns null when the request fails', async () => {
        stubFetch(() => Promise.reject(new Error('network down')));
        expect(await isRepoPrivate('owner', 'repo')).toBeNull();
    });
});
