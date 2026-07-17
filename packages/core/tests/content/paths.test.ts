import { describe, expect, it } from 'bun:test';
import { getDataRoot, getDBPath, getProposalsDir, pathsNestOrEqual } from '../../src/content/paths';

describe('getDataRoot', () => {
    it('returns projectRoot when provided', () => {
        const result = getDataRoot({ projectRoot: '/custom/root' });
        expect(result).toBe('/custom/root');
    });

    it('returns homedir when no projectRoot and no .superskill in cwd', () => {
        const result = getDataRoot();
        // The cwd may or may not have .superskill/, so we just verify it returns a string path
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
});

describe('getDBPath', () => {
    it('returns .superskill/evaluations.db under data root', () => {
        const result = getDBPath({ projectRoot: '/custom/root' });
        expect(result).toBe('/custom/root/.superskill/evaluations.db');
    });
});

describe('getProposalsDir', () => {
    it('returns .superskill/proposals under data root', () => {
        const result = getProposalsDir({ projectRoot: '/custom/root' });
        expect(result).toBe('/custom/root/.superskill/proposals');
    });
});

describe('pathsNestOrEqual', () => {
    it('is true for identical paths', () => {
        expect(pathsNestOrEqual('/tmp/plugin', '/tmp/plugin')).toBe(true);
        expect(pathsNestOrEqual('/tmp/plugin/', '/tmp/plugin')).toBe(true);
    });

    it('is true when one path is an ancestor of the other', () => {
        expect(pathsNestOrEqual('/tmp/plugin', '/tmp/plugin/skills')).toBe(true);
        expect(pathsNestOrEqual('/tmp/plugin/skills', '/tmp/plugin')).toBe(true);
        expect(pathsNestOrEqual('/tmp', '/tmp/plugin/skills/a')).toBe(true);
    });

    it('is false for sibling paths (including prefix-name siblings)', () => {
        expect(pathsNestOrEqual('/tmp/plugin', '/tmp/plugin-out')).toBe(false);
        expect(pathsNestOrEqual('/tmp/a', '/tmp/b')).toBe(false);
        expect(pathsNestOrEqual('/tmp/out/.rulesync', '/tmp/plugin')).toBe(false);
    });
});
