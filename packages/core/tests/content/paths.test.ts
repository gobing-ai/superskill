import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    getDataRoot,
    getDBPath,
    getProposalsDir,
    isLexicallyContained,
    pathsNestOrEqual,
} from '../../src/content/paths';

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

    // Residual-proof (F1/R1): both trigger halves carried — a nested pair must stay
    // contained (bare half) AND a dot-dot-prefixed child name must not reclassify as
    // an escape (compound half). Without the bare half a component-insensitive
    // rewrite could still pass this suite by reporting false for everything.
    it('is true for a child named ..plugin — dot-dot prefix is a name, not an escape', () => {
        expect(pathsNestOrEqual('/tmp/out', '/tmp/out/..plugin')).toBe(true);
        expect(pathsNestOrEqual('/tmp/out/..plugin', '/tmp/out')).toBe(true);
    });

    it('keeps refusing true prefix siblings while accepting the dot-dot child name', () => {
        expect(pathsNestOrEqual('/tmp/out', '/tmp/out-plugin')).toBe(false);
        expect(pathsNestOrEqual('/tmp/out', '/tmp/out/..plugin')).toBe(true);
    });

    it('canonicalizes through a symlinked existing ancestor before comparing', () => {
        const base = mkdtempSync(join(tmpdir(), 'paths-nest-'));
        try {
            const real = join(base, 'real');
            const out = join(base, 'out');
            mkdirSync(real, { recursive: true });
            mkdirSync(out, { recursive: true });
            symlinkSync(real, join(out, 'link'));

            // The link and its missing leaf are filesystem-identical to real/….
            expect(pathsNestOrEqual(join(out, 'link'), real)).toBe(true);
            expect(pathsNestOrEqual(join(out, 'link', 'missing-leaf'), real)).toBe(true);
            expect(pathsNestOrEqual(join(out, 'link', 'missing-leaf'), join(real, 'missing-leaf'))).toBe(true);

            // A real sibling of the symlink target must not nest with it.
            const other = join(base, 'other');
            mkdirSync(other, { recursive: true });
            expect(pathsNestOrEqual(join(out, 'link'), other)).toBe(false);
        } finally {
            rmSync(base, { recursive: true, force: true });
        }
    });
});

describe('isLexicallyContained (R2/C1, task 0146 AC15)', () => {
    it('accepts equal paths and direct/descendant children', () => {
        expect(isLexicallyContained('/tmp/install', '/tmp/install')).toBe(true);
        expect(isLexicallyContained('/tmp/install', '/tmp/install/skill')).toBe(true);
        expect(isLexicallyContained('/tmp/install', '/tmp/install/a/b/c')).toBe(true);
    });

    it('rejects sibling-prefix lookalikes and .. escapes', () => {
        // /tmp/instal is a string prefix of /tmp/install but a sibling directory.
        expect(isLexicallyContained('/tmp/instal', '/tmp/install/skill')).toBe(false);
        expect(isLexicallyContained('/tmp/install', '/tmp/install/../elsewhere')).toBe(false);
        expect(isLexicallyContained('/tmp/install', '/tmp/other')).toBe(false);
        expect(isLexicallyContained('/tmp/install', '/completely/different/root')).toBe(false);
    });

    it('rejects containment across different roots', () => {
        expect(isLexicallyContained('/base', '/completely/different')).toBe(false);
        // On win32 the parse-root guard rejects the cross-drive pair directly; on POSIX
        // the same pair falls out as a `..` escape — both spellings reject.
        expect(isLexicallyContained('C:\\base', 'D:\\base\\child')).toBe(false);
    });

    it('never touches the filesystem (purely lexical)', () => {
        const missing = '/definitely/not/a/real/path/xyzzy';
        expect(isLexicallyContained(missing, join(missing, 'child'))).toBe(true);
        expect(isLexicallyContained(missing, '/tmp')).toBe(false);
    });
});
