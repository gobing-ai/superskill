import { describe, expect, it } from 'bun:test';
import { checkCitations, checkDimensionDrift, countRubricDimensions, type FileResolver } from '../builder';

/** In-memory resolver: any path in `present` exists with the given line count. */
function fakeFs(present: Record<string, number>): FileResolver {
    return {
        exists: (rel) => rel in present,
        lineCount: (rel) => present[rel] ?? 0,
    };
}

describe('checkCitations', () => {
    it('flags a citation whose file does not exist (the cc-hooks dead-path defect)', () => {
        const body = 'See `apps/cli/src/quality/dimensions.ts:54` for the dimensions.';
        const findings = checkCitations('SKILL.md', body, fakeFs({}));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('apps/cli/src/quality/dimensions.ts');
        expect(findings[0].message).toContain('does not exist');
    });

    it('flags a citation whose line is past end of file', () => {
        const body = 'Schema at `packages/core/src/rubrics/command.yaml:9999`.';
        const fs = fakeFs({ 'packages/core/src/rubrics/command.yaml': 53 });
        const findings = checkCitations('SKILL.md', body, fs);
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('file has 53 lines');
    });

    it('passes when the file exists and the line is in range', () => {
        const body = 'Defined at `packages/core/src/quality/hook.ts:226`.';
        const fs = fakeFs({ 'packages/core/src/quality/hook.ts': 300 });
        expect(checkCitations('SKILL.md', body, fs)).toHaveLength(0);
    });

    it('ignores illustrative placeholder paths outside resolvable roots', () => {
        const body = 'Run `bash examples/validate.sh` and edit `agents/my-agent.md`.';
        // Neither path is under a resolvable prefix, so neither is checked.
        expect(checkCitations('SKILL.md', body, fakeFs({}))).toHaveLength(0);
    });
});

describe('checkDimensionDrift', () => {
    const rubricOf = (counts: Record<string, number>) => (t: string) => counts[t] ?? -1;

    it('flags a stale dimension count (the cc-commands "10 dimensions" defect)', () => {
        const body = 'Evaluate quality across 10 dimensions.';
        const findings = checkDimensionDrift('SKILL.md', body, 'cc-commands', rubricOf({ command: 5 }));
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toContain('claims "10 dimensions"');
        expect(findings[0].message).toContain('command.yaml defines 5');
    });

    it('passes when the claimed count matches the rubric', () => {
        const body = 'Scored across 5 rubric dimensions.';
        expect(checkDimensionDrift('SKILL.md', body, 'cc-commands', rubricOf({ command: 5 }))).toHaveLength(0);
    });

    it('skips skills that document no rubric', () => {
        const body = 'This skill mentions 99 dimensions of nothing.';
        expect(checkDimensionDrift('SKILL.md', body, 'unmapped-skill', rubricOf({}))).toHaveLength(0);
    });

    it('skips when the rubric is absent (count <= 0)', () => {
        const body = 'Scored across 10 dimensions.';
        expect(checkDimensionDrift('SKILL.md', body, 'cc-agents', rubricOf({ agent: -1 }))).toHaveLength(0);
    });
});

describe('countRubricDimensions', () => {
    it('counts `- name:` entries regardless of indentation', () => {
        const yaml = ['dimensions:', '  - name: completeness', '  - name: clarity', '  - name: model-fit'].join('\n');
        expect(countRubricDimensions(yaml)).toBe(3);
    });

    it('returns 0 for a rubric with no dimensions', () => {
        expect(countRubricDimensions('version: 1\ntype: skill\n')).toBe(0);
    });
});
