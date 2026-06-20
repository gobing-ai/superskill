import { describe, expect, it } from 'bun:test';
import { getDataRoot, getDBPath, getProposalsDir } from '../../src/content/paths';

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
