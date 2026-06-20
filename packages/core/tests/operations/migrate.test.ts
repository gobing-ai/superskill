import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chdir, cwd } from 'node:process';
import type { ParsedFrontmatter } from '../../src/content/frontmatter';
import {
    dedupeArray,
    dedupeLines,
    loadSkillSources,
    mergeSkillBodies,
    mergeSkillFrontmatter,
    migrateSkillsDeterministic,
    serializeSkill,
} from '../../src/operations/migrate';

/** Build a ParsedFrontmatter fixture without going through the parser. */
function pf(data: Record<string, unknown>, body = ''): ParsedFrontmatter {
    return { data, body, raw: '' };
}

/** Set up a temp cwd with flat `skills/<name>.md` files (resolveContentPath layout). */
function withSkillDir(skillFiles: Record<string, string>): { dir: string; restore: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'superskill-migrate-core-'));
    mkdirSync(join(dir, 'skills'), { recursive: true });
    for (const [name, content] of Object.entries(skillFiles)) {
        writeFileSync(join(dir, 'skills', `${name}.md`), content);
    }
    const prevCwd = cwd();
    chdir(dir);
    return {
        dir,
        restore: () => {
            chdir(prevCwd);
            rmSync(dir, { recursive: true, force: true });
        },
    };
}

describe('dedupeArray', () => {
    it('preserves first-occurrence order and drops later duplicates', () => {
        expect(dedupeArray(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
    });

    it('returns a new array for empty input', () => {
        expect(dedupeArray([])).toEqual([]);
    });

    it('dedupes numbers and mixed primitives', () => {
        expect(dedupeArray([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
    });
});

describe('dedupeLines', () => {
    it('collapses exact-duplicate lines keeping first occurrence', () => {
        expect(dedupeLines('a\nb\na\nc')).toBe('a\nb\nc');
    });

    it('collapses consecutive blank lines into one', () => {
        expect(dedupeLines('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('trims trailing blank lines', () => {
        expect(dedupeLines('a\n\n')).toBe('a');
    });

    it('returns empty string for all-blank input', () => {
        expect(dedupeLines('\n\n')).toBe('');
    });
});

describe('mergeSkillFrontmatter', () => {
    it('takes the destination name and unions array values with dedup', () => {
        const sources = [
            pf({ name: 'src-a', tags: ['x', 'y'], version: '1.0.0' }),
            pf({ name: 'src-b', tags: ['y', 'z'], description: 'd' }),
        ];
        const merged = mergeSkillFrontmatter(sources, 'dest-skill');
        expect(merged.name).toBe('dest-skill');
        expect(merged.tags).toEqual(['x', 'y', 'z']);
        expect(merged.version).toBe('1.0.0');
        expect(merged.description).toBe('d');
    });

    it('first source wins on scalar conflicts', () => {
        const sources = [pf({ version: '1.0.0' }), pf({ version: '2.0.0' })];
        expect(mergeSkillFrontmatter(sources, 'dest').version).toBe('1.0.0');
    });

    it('includes all keys from all sources', () => {
        const sources = [pf({ a: 1 }), pf({ b: 2 })];
        const merged = mergeSkillFrontmatter(sources, 'dest');
        expect(merged).toHaveProperty('a');
        expect(merged).toHaveProperty('b');
    });
});

describe('mergeSkillBodies', () => {
    it('concatenates bodies in source order separated by a blank line', () => {
        const sources = [pf({}, 'body-a'), pf({}, 'body-b')];
        expect(mergeSkillBodies(sources)).toBe('body-a\n\nbody-b');
    });

    it('trims leading/trailing newlines on each body before joining', () => {
        const sources = [pf({}, '\nbody-a\n'), pf({}, '\n\nbody-b\n\n')];
        expect(mergeSkillBodies(sources)).toBe('body-a\n\nbody-b');
    });

    it('collapses exact-duplicate lines across bodies', () => {
        const sources = [pf({}, '# Title\ncontent-a'), pf({}, '# Title\ncontent-b')];
        const merged = mergeSkillBodies(sources);
        // # Title appears in both sources — kept once (first occurrence)
        expect(merged.match(/# Title/g)?.length).toBe(1);
        expect(merged).toContain('content-a');
        expect(merged).toContain('content-b');
    });
});

describe('serializeSkill', () => {
    it('wraps frontmatter in --- delimiters and appends body', () => {
        const out = serializeSkill({ name: 'x', version: '1.0.0' }, 'body text');
        expect(out.startsWith('---\n')).toBe(true);
        expect(out).toContain('name: x');
        expect(out).toContain('---\n\nbody text\n');
    });
});

describe('loadSkillSources', () => {
    it('throws ENOENT-tagged error for a missing skill', () => {
        const { restore } = withSkillDir({});
        try {
            expect(() => loadSkillSources(['nonexistent-skill-xyz'])).toThrow('Skill not found');
            try {
                loadSkillSources(['nonexistent-skill-xyz']);
            } catch (err) {
                expect((err as Error & { code?: string }).code).toBe('ENOENT');
            }
        } finally {
            restore();
        }
    });

    it('reads and parses each source skill file', () => {
        const { restore } = withSkillDir({
            demo: '---\nname: demo\ndescription: a demo\n---\n\n# demo\nbody',
        });
        try {
            const parsed = loadSkillSources(['demo']);
            expect(parsed).toHaveLength(1);
            const first = parsed[0];
            expect(first).toBeDefined();
            if (!first) throw new Error('expected parsed skill source');
            expect(first.data.name).toBe('demo');
            expect(first.body).toContain('# demo');
        } finally {
            restore();
        }
    });
});

describe('migrateSkillsDeterministic', () => {
    it('throws when called with no sources', () => {
        const { dir, restore } = withSkillDir({});
        try {
            expect(() => migrateSkillsDeterministic([], join(dir, 'out.md'))).toThrow('at least one source');
        } finally {
            restore();
        }
    });

    it('merges multiple sources into the destination file and returns the dest path', () => {
        const { dir, restore } = withSkillDir({
            a: '---\nname: a\ndescription: skill a\ntags: [x]\n---\n\n# A\nbody-a',
            b: '---\nname: b\ndescription: skill b\ntags: [y]\n---\n\n# B\nbody-b',
        });
        try {
            const dest = join(dir, 'merged.md');
            const result = migrateSkillsDeterministic(['a', 'b'], dest);

            expect(result.dest).toBe(dest);
            expect(existsSync(dest)).toBe(true);
            const written = readFileSync(dest, 'utf-8');
            // Destination name is derived from the dest path basename
            expect(written).toContain('name: merged');
            // Array union with dedup
            expect(written).toContain('x');
            expect(written).toContain('y');
            // Both bodies present, first-occurrence line dedup
            expect(written).toContain('# A');
            expect(written).toContain('body-a');
            expect(written).toContain('# B');
            expect(written).toContain('body-b');
        } finally {
            restore();
        }
    });

    it('creates the destination directory when it does not exist', () => {
        const { dir, restore } = withSkillDir({
            solo: '---\nname: solo\ndescription: solo skill\n---\n\n# Solo\nsolo body',
        });
        try {
            const dest = join(dir, 'nested', 'deep', 'out.md');
            expect(existsSync(join(dir, 'nested'))).toBe(false);

            migrateSkillsDeterministic(['solo'], dest);

            expect(existsSync(dest)).toBe(true);
        } finally {
            restore();
        }
    });
});
