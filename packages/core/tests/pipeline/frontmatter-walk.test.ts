import { describe, expect, it } from 'bun:test';
import {
    type FrontmatterLineRule,
    type FrontmatterWalkOptions,
    walkFrontmatter,
} from '../../src/pipeline/frontmatter-walk';

/**
 * Direct unit tests for the shared frontmatter walker.
 *
 * The adapter modules (adapt-command, adapt-subagent) exercise this transitively,
 * but this suite is the focused coverage for walkFrontmatter itself — every
 * branch of the state machine (opener, closer, name-drop, line rules, closer
 * injection, fallback) is exercised directly so the contract is pinned
 * independently of the adapters' particular rule sets.
 */

const baseOpts = {
    expectedName: 'my-command',
    fallbackBlock: '---\nname: my-command\n---',
};

describe('walkFrontmatter — opener handling', () => {
    it('injects name: as the first field after the opening ---', () => {
        const input = '---\ndescription: hi\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        const lines = out.split('\n');
        expect(lines[0]).toBe('---');
        expect(lines[1]).toBe('name: my-command');
        expect(lines[2]).toBe('description: hi');
    });

    it('preserves preamble lines that appear before the opening ---', () => {
        // Lines 66-68 of frontmatter-walk.ts: preamble content is pushed through
        // untouched until the first --- is seen.
        const input = '<!-- preamble -->\n---\ndescription: hi\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        const lines = out.split('\n');
        expect(lines[0]).toBe('<!-- preamble -->');
        expect(lines[1]).toBe('---');
        expect(lines[2]).toBe('name: my-command');
    });

    it('drops a pre-existing name: line inside the block (walker owns the name)', () => {
        const input = '---\nname: old-name\ndescription: hi\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        const lines = out.split('\n');
        expect(lines[1]).toBe('name: my-command');
        expect(lines.some((l) => l === 'name: old-name')).toBe(false);
        // Only one name: line survives.
        const nameCount = lines.filter((l) => /^name:\s/.test(l)).length;
        expect(nameCount).toBe(1);
    });

    it('injects the canonical name even when the source name differs only by case', () => {
        // The name-drop predicate is /^name:\s*/ — case-sensitive, so a `Name:`
        // line would survive as a regular field. This pins that behavior so a
        // future "case-insensitive name" change is a conscious decision.
        const input = '---\nName: Title-Case\ndescription: hi\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        const lines = out.split('\n');
        expect(lines[1]).toBe('name: my-command');
        expect(lines).toContain('Name: Title-Case');
    });
});

describe('walkFrontmatter — fallback when no opener exists', () => {
    it('returns fallbackBlock + original content when no --- opener is found', () => {
        const input = 'no frontmatter here\njust body';
        const out = walkFrontmatter(input, baseOpts);
        expect(out).toBe(`---\nname: my-command\n---\n\n${input}`);
    });

    it('uses the caller-supplied fallbackBlock verbatim', () => {
        const opts: FrontmatterWalkOptions = {
            expectedName: 'x',
            fallbackBlock: '---\nname: x\ndisable-model-invocation: true\n---',
        };
        const input = 'body only';
        const out = walkFrontmatter(input, opts);
        expect(out).toBe(`---\nname: x\ndisable-model-invocation: true\n---\n\n${input}`);
    });
});

describe('walkFrontmatter — line rules', () => {
    const upperRule: FrontmatterLineRule = {
        test: (l) => /^description:\s*/.test(l),
        rewrite: (l) => l.toUpperCase(),
    };

    it('applies the first matching rule and pushes the rewritten line', () => {
        const input = '---\ndescription: hello\n---\nbody';
        const out = walkFrontmatter(input, { ...baseOpts, lineRules: [upperRule] });
        expect(out).toContain('DESCRIPTION: HELLO');
        expect(out).not.toContain('description: hello');
    });

    it('drops a line when the rule returns null', () => {
        const dropRule: FrontmatterLineRule = {
            test: (l) => /^description:\s*/.test(l),
            rewrite: () => null,
        };
        const input = '---\ndescription: hello\n---\nbody';
        const out = walkFrontmatter(input, { ...baseOpts, lineRules: [dropRule] });
        expect(out).not.toContain('description:');
    });

    it('applies only the first matching rule (first match wins)', () => {
        const ruleA: FrontmatterLineRule = {
            test: (l) => /^description:\s*/.test(l),
            rewrite: () => 'A',
        };
        const ruleB: FrontmatterLineRule = {
            test: (l) => /^description:\s*/.test(l),
            rewrite: () => 'B',
        };
        const input = '---\ndescription: hello\n---\nbody';
        const out = walkFrontmatter(input, { ...baseOpts, lineRules: [ruleA, ruleB] });
        expect(out.split('\n')).toContain('A');
        expect(out.split('\n')).not.toContain('B');
    });

    it('passes unmatched block lines through unchanged when lineRules is undefined', () => {
        const input = '---\nallowed-tools: foo\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        expect(out).toContain('allowed-tools: foo');
    });

    it('passes unmatched block lines through unchanged when no rule matches', () => {
        const input = '---\nallowed-tools: foo\n---\nbody';
        const out = walkFrontmatter(input, { ...baseOpts, lineRules: [upperRule] });
        expect(out).toContain('allowed-tools: foo');
    });
});

describe('walkFrontmatter — closer injection', () => {
    const injectOpts: FrontmatterWalkOptions = {
        expectedName: 'cmd',
        closerInjection: {
            lines: ['disable-model-invocation: true'],
            shouldInject: (seen) => !seen.some((l) => /^disable-model-invocation:\s*/.test(l)),
        },
        fallbackBlock: '---\nname: cmd\n---',
    };

    it('injects lines before the closer when shouldInject returns true', () => {
        const input = '---\ndescription: hi\n---\nbody';
        const out = walkFrontmatter(input, injectOpts);
        const lines = out.split('\n');
        const closerIdx = lines.lastIndexOf('---');
        expect(lines[closerIdx - 1]).toBe('disable-model-invocation: true');
    });

    it('does not inject when shouldInject returns false', () => {
        const input = '---\ndisable-model-invocation: true\n---\nbody';
        const out = walkFrontmatter(input, injectOpts);
        // Exactly one injection line total — the original one.
        const count = out.split('\n').filter((l) => l === 'disable-model-invocation: true').length;
        expect(count).toBe(1);
    });

    it('does not inject when closerInjection is absent', () => {
        const input = '---\ndescription: hi\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        expect(out).not.toContain('disable-model-invocation');
    });
});

describe('walkFrontmatter — body preservation', () => {
    it('preserves body content after the frontmatter block unchanged', () => {
        const body = '## Usage\n\n```ts\nconst x = 1;\n```\n';
        const input = `---\ndescription: hi\n---\n${body}`;
        const out = walkFrontmatter(input, baseOpts);
        expect(out.endsWith(body)).toBe(true);
    });

    it('handles --- appearing in the body as a thematic break, not a closer', () => {
        // Once inFrontmatter flips false on the real closer, a later --- in the
        // body is just pushed through (thematic break / horizontal rule).
        const input = '---\ndescription: hi\n---\n\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        // The body --- is preserved.
        // Opener + closer + body thematic break = 3 dash-only lines.
        const dashCount = out.split('\n').filter((l) => l.trim() === '---').length;
        expect(dashCount).toBe(3);
    });
});

describe('walkFrontmatter — name: line edge cases', () => {
    it('drops a name: line with trailing content and does not touch the next field', () => {
        const input = '---\nname: old\ndescription: keep\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        const lines = out.split('\n');
        expect(lines[1]).toBe('name: my-command');
        expect(lines[2]).toBe('description: keep');
    });

    it('drops multiple name: lines, keeping only the injected one', () => {
        const input = '---\nname: a\nname: b\ndescription: c\n---\nbody';
        const out = walkFrontmatter(input, baseOpts);
        const nameCount = out.split('\n').filter((l) => /^name:\s/.test(l)).length;
        expect(nameCount).toBe(1);
    });
});
