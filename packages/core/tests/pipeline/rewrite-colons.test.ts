import { describe, expect, it } from 'bun:test';
import { rewriteColonRefs } from '../../src/pipeline/rewrite-colons';

describe('rewriteColonRefs', () => {
    it('replaces rd3:foo with rd3-foo', () => {
        expect(rewriteColonRefs('use rd3:dev-run to start')).toBe('use rd3-dev-run to start');
    });

    it('replaces wt:bar with wt-bar', () => {
        expect(rewriteColonRefs('install wt:publish-to-x')).toBe('install wt-publish-to-x');
    });

    it('handles multiple colon refs in one string', () => {
        expect(rewriteColonRefs('run rd3:dev-run then rd3:dev-review')).toBe('run rd3-dev-run then rd3-dev-review');
    });

    it('does not modify hyphenated refs', () => {
        expect(rewriteColonRefs('use rd3-dev-run')).toBe('use rd3-dev-run');
    });

    it('returns empty string unchanged', () => {
        expect(rewriteColonRefs('')).toBe('');
    });

    it('does not modify unrelated colons', () => {
        expect(rewriteColonRefs('foo:bar is not a plugin ref')).toBe('foo:bar is not a plugin ref');
    });

    it('matches case-insensitively', () => {
        expect(rewriteColonRefs('RD3:DEV-RUN')).toBe('RD3-DEV-RUN');
    });
});
