/**
 * Behavior tests for the acquisition primitives split out of fetch.ts (task 0146 R12):
 * bounded fan-out (`mapWithConcurrency`), bounded reads (`readBodyBounded`), and the
 * commit-SHA probe (`fetchRepoCommitSha`). Tree/blob/materialize flows stay covered in
 * fetch.test.ts through the re-exported surface; this file owns the moved primitives
 * themselves.
 */
import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    AcquisitionLimitError,
    fetchRepoCommitSha,
    ghAuthTokenFromCli,
    mapWithConcurrency,
    materializeRepoSubdir,
    readBodyBounded,
} from '../../src/skills-ecosystem/github-api';

describe('mapWithConcurrency', () => {
    it('keeps at most `limit` workers in flight and returns results in input order', async () => {
        const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let inFlight = 0;
        let maxInFlight = 0;
        const results = await mapWithConcurrency(items, 3, async (n) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, (n % 3) * 5));
            inFlight--;
            return n * 2;
        });
        expect(results).toEqual(items.map((n) => n * 2));
        expect(maxInFlight).toBe(3);
    });

    it('lets every already-launched worker finish before the first rejection propagates', async () => {
        const finished: number[] = [];
        await expect(
            mapWithConcurrency([0, 1, 2, 3, 4], 2, async (n) => {
                if (n === 0) throw new Error('boom');
                await new Promise((resolve) => setTimeout(resolve, 20));
                finished.push(n);
                return n;
            }),
        ).rejects.toThrow('boom');
        // No stragglers: callers may clean up the output directory without racing writers.
        expect(finished.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    });

    it('handles an empty item list and a limit larger than the item count', async () => {
        expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
        expect(await mapWithConcurrency([1, 2], 8, async (n) => n * 3)).toEqual([3, 6]);
    });
});

describe('readBodyBounded', () => {
    it('round-trips a streamed body under the cap and the no-body fallback path', async () => {
        const payload = 'skill-body-text';
        expect(await readBodyBounded(new Response(payload), 1024, 'raw file')).toBe(payload);
        const bodyless = { body: null, text: async () => payload } as unknown as Response;
        expect(await readBodyBounded(bodyless, 1024, 'raw file')).toBe(payload);
    });

    it('rejects a streamed body over the cap, naming the label and the byte limit', async () => {
        const error = await readBodyBounded(new Response('y'.repeat(64)), 32, 'tree payload').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AcquisitionLimitError);
        expect((error as Error).message).toMatch(/tree payload exceeds the 32-byte read cap/);
    });

    it('enforces the cap on the no-stream fallback path when response.body is null', async () => {
        const bodyless = { body: null, text: async () => 'z'.repeat(64) } as unknown as Response;
        await expect(readBodyBounded(bodyless, 32, 'manifest')).rejects.toThrow(
            /manifest exceeds the 32-byte read cap/,
        );
    });

    it('cancels the stream reader mid-read when a real stream body exceeds the cap', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('x'.repeat(64)));
                controller.close();
            },
        });
        await expect(readBodyBounded(new Response(stream), 32, 'streamed payload')).rejects.toThrow(
            /streamed payload exceeds the 32-byte read cap/,
        );
    });
});

describe('fetchRepoCommitSha', () => {
    it('walks HEAD -> main -> master default candidates on 404 and resolves on the first hit', async () => {
        const seen: string[] = [];
        const sha = 'a'.repeat(40);
        let call = 0;
        const fetchFn = (async (url: string | URL | Request) => {
            seen.push(String(url));
            call++;
            if (call <= 2) return new Response('not found', { status: 404 });
            return new Response(sha, { status: 200 });
        }) as unknown as typeof fetch;
        expect(await fetchRepoCommitSha('owner/repo', undefined, () => null, fetchFn)).toBe(sha);
        expect(seen[0]).toContain('/commits/HEAD');
        expect(seen[1]).toContain('/commits/main');
        expect(seen[2]).toContain('/commits/master');
    });

    it('rejects naming every tried default ref when none resolves', async () => {
        const fetchFn = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
        await expect(fetchRepoCommitSha('owner/repo', undefined, () => null, fetchFn)).rejects.toThrow(
            /tried HEAD, main, master/,
        );
    });

    it('stops the candidate walk immediately on a non-404 failure', async () => {
        let calls = 0;
        const fetchFn = (async () => {
            calls++;
            return new Response('rate limited', { status: 403 });
        }) as unknown as typeof fetch;
        await expect(fetchRepoCommitSha('owner/repo', undefined, () => null, fetchFn)).rejects.toThrow(/HTTP 403/);
        expect(calls).toBe(1);
    });

    it('rejects a response body that is not a 40-hex SHA', async () => {
        const fetchFn = (async () => new Response('not-a-sha', { status: 200 })) as unknown as typeof fetch;
        await expect(fetchRepoCommitSha('owner/repo', 'main', () => null, fetchFn)).rejects.toThrow(/malformed SHA/);
    });
});

describe('materializeRepoSubdir streaming write', () => {
    it('streams a real stream-body blob, caps it mid-stream, and removes the partial file', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [{ path: 'big.bin', type: 'blob' as const, sha: 'b1' }],
        };
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                // ponytail: single 64 MiB + 1 chunk — the cheapest way to trip the cap mid-stream.
                controller.enqueue(new Uint8Array(64 * 1024 * 1024 + 1));
                controller.close();
            },
        });
        const fetchFn = (async (url: string | URL | Request) => {
            if (String(url).includes('/git/trees/')) {
                return new Response(JSON.stringify(tree), { status: 200 });
            }
            return new Response(stream, { status: 200 });
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-'));
        try {
            await expect(materializeRepoSubdir('owner/repo', '', destDir, { fetchFn })).rejects.toThrow(
                /blob big\.bin in owner\/repo.*exceeds the .*-byte read cap/,
            );
            expect(existsSync(join(destDir, 'big.bin'))).toBe(false);
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });

    it('writes a null-body blob via the arrayBuffer fallback and caps an oversized one', async () => {
        const tree = {
            sha: 'abc',
            branch: 'main',
            tree: [
                { path: 'small.txt', type: 'blob' as const, sha: 's1' },
                { path: 'huge.bin', type: 'blob' as const, sha: 'h1' },
            ],
        };
        // Some fetch implementations resolve with a null body + buffered content.
        const fetchFn = (async (url: string | URL | Request) => {
            if (String(url).includes('/git/trees/')) {
                return new Response(JSON.stringify(tree), { status: 200 });
            }
            const text = '0'.repeat(String(url).endsWith('/huge.bin') ? 64 * 1024 * 1024 + 1 : 64);
            return {
                ok: true,
                body: null,
                arrayBuffer: async () => new TextEncoder().encode(text).buffer,
            } as unknown as Response;
        }) as unknown as typeof fetch;

        const destDir = await mkdtemp(join(tmpdir(), 'superskill-materialize-'));
        try {
            await expect(materializeRepoSubdir('owner/repo', '', destDir, { fetchFn })).rejects.toThrow(
                /blob huge\.bin in owner\/repo.*exceeds the .*-byte read cap/,
            );
            // The small blob still landed before the oversized one aborted the run.
            expect(await Bun.file(join(destDir, 'small.txt')).text()).toBe('0'.repeat(64));
            expect(existsSync(join(destDir, 'huge.bin'))).toBe(false);
        } finally {
            await rm(destDir, { recursive: true, force: true });
        }
    });
});

describe('ghAuthTokenFromCli', () => {
    it('returns null when the executor throws (gh missing) and normalizes empty stdout', async () => {
        const throwing = {
            run: async () => {
                throw new Error('spawn gh ENOENT');
            },
        } as unknown as Parameters<typeof ghAuthTokenFromCli>[0];
        expect(await ghAuthTokenFromCli(throwing)).toBeNull();
        const emptyStdout = {
            run: async () => ({ exitCode: 0, stdout: '   \n', stderr: '' }),
        } as unknown as Parameters<typeof ghAuthTokenFromCli>[0];
        expect(await ghAuthTokenFromCli(emptyStdout)).toBeNull();
    });
});
