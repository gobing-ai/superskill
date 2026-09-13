import { describe, expect, it } from 'bun:test';
import {
    aggregateUpdateExit,
    buildUpdateCheckResult,
    compareBundledVersion,
    compareMarketplaceManifest,
    diffChangedPaths,
    mergePluginUpdateRows,
} from '../../src/operations/update';

const snap = (files: Record<string, string>, canonicalHash: string) => ({ files, canonicalHash });

describe('update comparison', () => {
    it('diffs changed paths in UTF-8 byte order including added and removed files', () => {
        expect(diffChangedPaths({ 'z.md': '1', 'a.md': '1' }, { 'a.md': '2', 'b.md': '1' })).toEqual([
            'a.md',
            'b.md',
            'z.md',
        ]);
    });

    it('reports marketplace stale on version mismatch and names current changed paths once', () => {
        const result = compareMarketplaceManifest(
            'cc',
            '1.0.0',
            snap({ 'skills/a.md': 'aaa' }, 'h1'),
            '1.1.0',
            snap({ 'skills/a.md': 'bbb', 'skills/b.md': 'ccc' }, 'h2'),
            '/tmp/market',
        );
        expect(result.status).toBe('stale');
        expect(result.upstreamVersion).toBe('1.1.0');
        expect(result.changedPaths).toEqual(['skills/a.md', 'skills/b.md']);
        expect(result.locator).toBe('/tmp/market');
    });

    it('uses canonical hash as the equal-version tie-breaker', () => {
        const stale = compareMarketplaceManifest(
            'cc',
            '1.0.0',
            snap({ 'a.md': '1' }, 'old'),
            '1.0.0',
            snap({ 'a.md': '2' }, 'new'),
        );
        expect(stale.status).toBe('stale');
        const current = compareMarketplaceManifest(
            'cc',
            '1.0.0',
            snap({ 'a.md': '1' }, 'same'),
            '1.0.0',
            snap({ 'a.md': '1' }, 'same'),
        );
        expect(current.status).toBe('current');
        expect(current.changedPaths).toBeUndefined();
    });

    it('compares bundled versions without a path diff', () => {
        expect(compareBundledVersion('cc', '0.3.19', '0.4.0').status).toBe('stale');
        expect(compareBundledVersion('cc', '0.3.19', '0.3.19').status).toBe('current');
    });

    it('merges per-target rows into one plugin row preferring stale over current', () => {
        const merged = mergePluginUpdateRows([
            { kind: 'plugin', name: 'beta', status: 'current' },
            { kind: 'plugin', name: 'alpha', status: 'current', changedPaths: [] },
            { kind: 'plugin', name: 'alpha', status: 'stale', changedPaths: ['b.md'], upstreamVersion: '2' },
            { kind: 'plugin', name: 'alpha', status: 'stale', changedPaths: ['a.md'] },
        ]);
        expect(merged.map((row) => row.name)).toEqual(['alpha', 'beta']);
        expect(merged[0]?.status).toBe('stale');
        expect(merged[0]?.changedPaths).toEqual(['a.md', 'b.md']);
        expect(merged[0]?.upstreamVersion).toBe('2');
    });

    it('keeps a stale sibling when a bundled lookup is unavailable, and still exits 2', () => {
        const rows = [
            {
                kind: 'plugin' as const,
                name: 'cc',
                status: 'unavailable' as const,
                channel: 'bundled' as const,
                locator: '@gobing-ai/superskill',
            },
            {
                kind: 'plugin' as const,
                name: 'cc',
                status: 'stale' as const,
                channel: 'marketplace' as const,
                changedPaths: ['skills/a.md'],
                locator: '/tmp/market',
            },
        ];
        const merged = mergePluginUpdateRows(rows);
        expect(merged).toHaveLength(1);
        expect(merged[0]?.status).toBe('stale');
        expect(merged[0]?.channel).toBe('marketplace');
        expect(buildUpdateCheckResult(rows, true).exitCode).toBe(2);
    });

    it('derives staleTargets from contributing stale targets when only some targets are stale (R2)', () => {
        const merged = mergePluginUpdateRows([
            { kind: 'plugin', name: 'alpha', status: 'stale', target: 'claude', upstreamVersion: '2' },
            { kind: 'plugin', name: 'alpha', status: 'current', target: 'codex' },
        ]);
        expect(merged).toHaveLength(1);
        expect(merged[0]?.status).toBe('stale');
        expect(merged[0]?.staleTargets).toEqual(['claude']);
        // Rows that never went stale carry no target list; stale rows without a
        // per-target identity cannot name one.
        expect(
            mergePluginUpdateRows([{ kind: 'plugin', name: 'a', status: 'current', target: 'codex' }])[0]?.staleTargets,
        ).toBeUndefined();
        expect(
            mergePluginUpdateRows([{ kind: 'plugin', name: 'a', status: 'stale' }])[0]?.staleTargets,
        ).toBeUndefined();
    });

    it('selects exit 2 over stale 1, and 0 when only legacy/current rows exist', () => {
        expect(
            aggregateUpdateExit(
                [
                    { kind: 'plugin', name: 'a', status: 'stale' },
                    { kind: 'plugin', name: 'b', status: 'unavailable' },
                ],
                true,
            ),
        ).toBe(2);
        expect(aggregateUpdateExit([{ kind: 'plugin', name: 'a', status: 'stale' }], true)).toBe(1);
        expect(aggregateUpdateExit([{ kind: 'plugin', name: 'a', status: 'stale' }], false)).toBe(0);
        expect(
            aggregateUpdateExit(
                [
                    { kind: 'plugin', name: 'a', status: 'legacy' },
                    { kind: 'plugin', name: 'b', status: 'current' },
                ],
                true,
            ),
        ).toBe(0);
        expect(buildUpdateCheckResult([{ kind: 'plugin', name: 'z', status: 'stale' }], true).exitCode).toBe(1);
    });
});
