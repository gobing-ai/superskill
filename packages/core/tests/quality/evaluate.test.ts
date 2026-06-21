import { describe, expect, it } from 'bun:test';
import { evaluate } from '../../src/quality/evaluate';
import type { ContentType, QualityReport } from '../../src/quality/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSample(fm: string, body: string): string {
    return `---\n${fm}\n---\n${body}`;
}

/** Assert the basic structure of a QualityReport: type, dimensions, aggregate. */
function assertReportShape(report: QualityReport, type: ContentType): void {
    expect(report.type).toBe(type);
    expect(typeof report.aggregate).toBe('number');
    expect(report.aggregate).toBeGreaterThanOrEqual(0);
    expect(report.aggregate).toBeLessThanOrEqual(1);
    expect(report.dimensions).toBeDefined();
    expect(typeof report.dimensions).toBe('object');
    expect(Object.keys(report.dimensions).length).toBeGreaterThan(0);
}

// ── Content samples ────────────────────────────────────────────────────────────

const SAMPLES = {
    skill: makeSample(
        `name: code-reviewer
description: Reviews code for quality issues and security vulnerabilities`,
        `# Code Reviewer\n\nThis skill reviews code for quality issues and security vulnerabilities.\n\n## Instructions\n\n- Read the full file\n- Run static analysis\n- Report findings`,
    ),
    command: makeSample(
        `name: deploy
description: Deploy the application to production
arguments:
  - name: branch
    description: Git branch to deploy`,
        `# Deploy Command\n\nDeploys the application to the specified environment.\n\n## Usage\n\n\`\`\`bash\n/deploy main\n\`\`\``,
    ),
    agent: makeSample(
        `name: code-reviewer
description: Reviews code for quality issues
tools:
  - read
  - bash`,
        `# Code Reviewer Agent\n\nReviews code and reports findings.\n\n## Instructions\n\nYou are a code reviewer. Check for bugs and issues.`,
    ),
    hook: makeSample(
        `name: block-dangerous
description: Blocks dangerous shell commands
enabled: true`,
        `# Block Dangerous Hook\n\nThis hook blocks dangerous shell commands.\n\n## Rules\n\n- Block rm -rf\n- Block force push`,
    ),
    magent: makeSample(
        `name: dev-agent
description: Development agent configuration
description: General development agent
targets:
  - claude-code
  - windsurf`,
        `# Development Agent\n\nThis is a development agent configuration.\n\n## Instructions\n\nYou are a helpful development assistant.`,
    ),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('evaluate', () => {
    it('routes skill content to the skill evaluator', () => {
        const report = evaluate('skill', SAMPLES.skill, 'skill/code-reviewer.md');
        assertReportShape(report, 'skill');
        expect(report.target).toBe('skill/code-reviewer.md');
    });

    it('routes command content to the command evaluator', () => {
        const report = evaluate('command', SAMPLES.command, 'commands/deploy.md');
        assertReportShape(report, 'command');
        expect(report.target).toBe('commands/deploy.md');
    });

    it('routes agent content to the agent evaluator', () => {
        const report = evaluate('agent', SAMPLES.agent, 'agents/code-reviewer.md');
        assertReportShape(report, 'agent');
        expect(report.target).toBe('agents/code-reviewer.md');
    });

    it('routes hook content to the hook evaluator', () => {
        const report = evaluate('hook', SAMPLES.hook, 'hooks/block-dangerous.md');
        assertReportShape(report, 'hook');
        expect(report.target).toBe('hooks/block-dangerous.md');
    });

    it('routes magent content to the magent evaluator', () => {
        const report = evaluate('magent', SAMPLES.magent, 'magents/dev-agent.md');
        assertReportShape(report, 'magent');
        expect(report.target).toBe('magents/dev-agent.md');
    });

    it('produces a non-zero aggregate for well-formed content', () => {
        for (const type of ['skill', 'command', 'agent', 'hook', 'magent'] as ContentType[]) {
            const report = evaluate(type, SAMPLES[type], `${type}/test.md`);
            expect(report.aggregate).toBeGreaterThan(0);
        }
    });

    it('scores a 14k-char skill body above zero on conciseness (B3c regression)', () => {
        // A rich but legitimate skill body should not auto-zero conciseness.
        const body = `# Rich Skill\n\n${'x'.repeat(14000)}`;
        const content = `---\nname: rich-skill\ndescription: A complete skill with substantial body\n---\n${body}`;
        const report = evaluate('skill', content, 'skill/rich-skill');
        const conciseness = report.dimensions.conciseness;
        expect(conciseness).toBeDefined();
        expect(conciseness?.score).toBeGreaterThan(0);
    });
});
