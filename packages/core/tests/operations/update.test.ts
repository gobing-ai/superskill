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
            { plugin: 'beta', status: 'current' },
            { plugin: 'alpha', status: 'current', changedPaths: [] },
            { plugin: 'alpha', status: 'stale', changedPaths: ['b.md'], upstreamVersion: '2' },
            { plugin: 'alpha', status: 'stale', changedPaths: ['a.md'] },
        ]);
        expect(merged.map((row) => row.plugin)).toEqual(['alpha', 'beta']);
        expect(merged[0]?.status).toBe('stale');
        expect(merged[0]?.changedPaths).toEqual(['a.md', 'b.md']);
        expect(merged[0]?.upstreamVersion).toBe('2');
    });

    it('keeps a stale sibling when a bundled lookup is unavailable, and still exits 2', () => {
        const rows = [
            {
                plugin: 'cc',
                status: 'unavailable' as const,
                channel: 'bundled' as const,
                locator: '@gobing-ai/superskill',
            },
            {
                plugin: 'cc',
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

    it('selects exit 2 over stale 1, and 0 when only legacy/current rows exist', () => {
        expect(
            aggregateUpdateExit(
                [
                    { plugin: 'a', status: 'stale' },
                    { plugin: 'b', status: 'unavailable' },
                ],
                true,
            ),
        ).toBe(2);
        expect(aggregateUpdateExit([{ plugin: 'a', status: 'stale' }], true)).toBe(1);
        expect(aggregateUpdateExit([{ plugin: 'a', status: 'stale' }], false)).toBe(0);
        expect(
            aggregateUpdateExit(
                [
                    { plugin: 'a', status: 'legacy' },
                    { plugin: 'b', status: 'current' },
                ],
                true,
            ),
        ).toBe(0);
        expect(buildUpdateCheckResult([{ plugin: 'z', status: 'stale' }], true).exitCode).toBe(1);
    });
});
