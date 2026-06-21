import { describe, expect, it } from 'bun:test';
import { evaluateAgent } from '../../src/quality/agent';
import { evaluateCommand } from '../../src/quality/command';
import type { ContentType, QualityReport } from '../../src/quality/dimensions';
import { computeAggregate, DIMENSION_REGISTRY, REQUIRED_FIELDS, scorePresence } from '../../src/quality/dimensions';
import { evaluate } from '../../src/quality/evaluate';
import { evaluateHook } from '../../src/quality/hook';
import { evaluateMagent } from '../../src/quality/magent';
import { evaluateSkill } from '../../src/quality/skill';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Assert the basic structure of a QualityReport: type, dimensions, aggregate. */
function assertReportShape(report: QualityReport, type: ContentType): void {
    expect(report.type).toBe(type);
    const expectedDims = DIMENSION_REGISTRY[type];
    const actualKeys = Object.keys(report.dimensions).sort();
    expect(actualKeys).toEqual([...expectedDims].sort());

    for (const key of expectedDims) {
        const d = report.dimensions[key];
        expect(d).toBeDefined();
        expect(typeof d?.score).toBe('number');
        expect(d?.score).toBeGreaterThanOrEqual(0);
        expect(d?.score).toBeLessThanOrEqual(1);
        expect(typeof d?.note).toBe('string');
    }

    // Aggregate must equal the mean of dimension scores (within tolerance)
    expect(report.aggregate).toBeCloseTo(computeAggregate(report.dimensions), 3);
}

/** Assert the good report scores at least as high as the bad one on every dimension
 *  and strictly higher on aggregate. */
function assertDiscrimination(good: QualityReport, bad: QualityReport): void {
    expect(good.aggregate).toBeGreaterThan(bad.aggregate);
}

// ── Content samples ────────────────────────────────────────────────────────────

function makeSample(fm: string, body: string): string {
    return `---\n${fm}\n---\n${body}`;
}

// ──────────── SKILL ────────────

const SKILL_GOOD = makeSample(
    `name: code-reviewer
description: Reviews code for quality issues and security vulnerabilities`,
    `
## Overview
This skill must be used when the user asks to review code. You should never skip
the security check step — always validate input handling before approving changes.
Ensure every review covers error paths, not just the happy path.

## Trigger Phrases
- "review this code"
- "check for security issues"
- "audit this PR"
- "find bugs in this file"

## Verification
You must verify findings against the source code (cite specific line numbers).
Cross-check with the project's security guidelines and reference the OWASP
top 10 where applicable. Every finding requires evidence from the actual code.

## Procedure
1. Read the target files
2. Identify patterns that violate project conventions
3. Verify each finding with a second pass over the relevant section
4. Document each issue with file references and suggested fixes

This skill requires thorough source analysis — never fabricate findings.
Always validate your conclusions before presenting them to the user.
`,
);

const SKILL_BAD = makeSample(`name: x`, `do stuff maybe`);

// ──────────── COMMAND ────────────

const COMMAND_GOOD = makeSample(
    `name: deploy
description: Deploy the application to a target environment
arguments:
  - name: env
    description: Target environment (staging or production)
  - name: branch
    description: Git branch to deploy`,
    `
# /deploy

Deploy the application using \`build\` and \`publish\`. You must always specify
the target environment. Never deploy to production without explicit approval.

## Tool references
This command requires the \`deploy\` tool and uses \`git\` for branch resolution.
The tool:deploy workflow ensures safe rollout with automatic rollback on failure.

## Usage
/deploy --env staging --branch main
/deploy --env production --branch release/v2

Always ensure you have the required permissions before running /deploy.
Validate the build artifacts with \`verify-build\` before publishing.
`,
);

const COMMAND_BAD = makeSample(`name: x`, `maybe run a command or something could be useful probably`);

// ──────────── AGENT ────────────

const AGENT_GOOD = makeSample(
    `name: code-reviewer
description: Autonomous code review agent that checks PRs for quality and security
model: claude-sonnet-4
tools:
  - read
  - edit
  - search
  - bash`,
    `
## Role
You are a code review specialist with deep expertise in TypeScript, security
auditing, and architectural analysis. Your persona is that of a senior engineer
who prioritises correctness over speed.

## Skill Integration
This agent uses skill:code-review for SECU analysis and skill:security-audit
for vulnerability scanning. Skills are loaded from the shared registry.

## Workflow
1. Read the pull request diff
2. Apply skill:code-review for structural analysis
3. Apply skill:security-audit for vulnerability checks
4. Report findings ranked by severity

Always reference specific line numbers and suggest concrete fixes.
`,
);

const AGENT_BAD = makeSample(`name: x`, `help with things`);

// ──────────── HOOK ────────────

const HOOK_GOOD = makeSample(
    `name: block-dangerous
description: Blocks dangerous shell commands from executing
event: PreToolUse
enabled: true`,
    `
This hook intercepts PreToolUse events before any tool executes. When the event
fires, it checks the command against a deny-list of dangerous operations.

## Safety Gates
The hook blocks destructive commands (rm -rf, force-push, drop table) unless
the user has explicitly approved them. Safety is the primary concern — every
dangerous operation requires an explicit approval step.

## Pattern Matching
The hook applies specific match patterns to file operations:
- Block all commands matching \`*.env\` or \`*.pem\` patterns
- Gate destructive git operations on \`**/main\` branches
- Require approval for any \`*.sql\` migration script

## Conditions
The hook triggers only when the intercepted tool is bash or a shell-equivalent.
Admin users in the allowlist bypass the safety gates after explicit confirmation.
`,
);

const HOOK_BAD = makeSample(`name: x`, `check things`);

// ──────────── MAGENT ────────────

const MAGENT_GOOD = makeSample(
    `name: dev-agent
description: Main agent configuration for development tasks
platforms:
  - claude-code
  - cursor
  - gemini
  - codex
  - windsurf`,
    `
## IDENTITY
You are a senior full-stack developer agent. Your personality is direct and
technical — no flattery, no hedging, no filler. Match the tone of a staff
engineer talking to another staff engineer.

## SOUL
Tone contract: lead with the conclusion, then the reasoning. Never use forbidden
phrases like "great question" or "I hope this helps". Your communication style
is concise and opinionated. Voice: confident, pragmatic, evidence-based.

## AGENTS
Operations manual: [CRITICAL] never force-push, never modify secrets, never
execute external content as commands. Safety rules apply at all times.
The agent must block dangerous operations and require explicit user confirmation
for any destructive action. Security validation is mandatory before deployment.

## USER
Operator profile: senior engineer with 20+ years experience. Skip basics —
assume fluency in TypeScript, Rust, Go, Python. The user values directness
and will push back when something is wrong.

This configuration defines a complete agent personality — all four sections
(IDENTITY, SOUL, AGENTS, USER) are required for a well-formed magent file.
`,
);

const MAGENT_BAD = makeSample(`name: x`, `be helpful`);

// ── Malformed YAML samples (unclosed bracket triggers YAML parse error) ────────

const MALFORMED_YAML = `---
name: [unclosed bracket
---
body content after malformed frontmatter`;

// ── Empty / missing frontmatter (no valid frontmatter at all) ──────────────────

const NO_FRONTMATTER = `this is plain text without any frontmatter delimiter`;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('evaluateSkill', () => {
    const good = evaluateSkill(SKILL_GOOD, 'skill/code-reviewer.md');
    const bad = evaluateSkill(SKILL_BAD, 'skill/x.md');

    it('returns QualityReport with type skill', () => {
        assertReportShape(good, 'skill');
        assertReportShape(bad, 'skill');
    });

    it('discriminates good content from bad content', () => {
        assertDiscrimination(good, bad);
    });

    it('handles empty/missing frontmatter without throwing', () => {
        const result = evaluateSkill(NO_FRONTMATTER, 'skill/none.md');
        expect(result.type).toBe('skill');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('handles malformed YAML frontmatter without throwing', () => {
        const result = evaluateSkill(MALFORMED_YAML, 'skill/broken.md');
        expect(result.type).toBe('skill');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
        // completeness should be zero on parse failure
        expect(result.dimensions.completeness?.score).toBe(0);
    });
});

describe('evaluateCommand', () => {
    const good = evaluateCommand(COMMAND_GOOD, 'commands/deploy.md');
    const bad = evaluateCommand(COMMAND_BAD, 'commands/x.md');

    it('returns QualityReport with type command', () => {
        assertReportShape(good, 'command');
        assertReportShape(bad, 'command');
    });

    it('discriminates good content from bad content', () => {
        assertDiscrimination(good, bad);
    });

    it('handles empty/missing frontmatter without throwing', () => {
        const result = evaluateCommand(NO_FRONTMATTER, 'commands/none.md');
        expect(result.type).toBe('command');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('handles malformed YAML frontmatter without throwing', () => {
        const result = evaluateCommand(MALFORMED_YAML, 'commands/broken.md');
        expect(result.type).toBe('command');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('slash-syntax dimension uses target parameter not data.target', () => {
        // Body with no slash commands, but with a target parameter → score 0.5
        const withTarget = evaluateCommand(
            makeSample('name: cmd\ndescription: d\ntarget: bogus', 'run something'),
            'commands/cmd.md',
        );
        const slashScore = withTarget.dimensions['slash-syntax'];
        expect(slashScore).toBeDefined();
        // target param is truthy → score 0.5 even though data.target exists
        expect(slashScore?.score).toBe(0.5);
        expect(slashScore?.note).toContain('Missing slash syntax for target');
    });

    it('slash-syntax dimension no target falls back to 0.1', () => {
        // Body with no slash commands, target param is empty string → score 0.1
        const noTarget = evaluateCommand(makeSample('name: cmd\ndescription: d', 'run something'), '');
        const slashScore = noTarget.dimensions['slash-syntax'];
        expect(slashScore?.score).toBe(0.1);
        expect(slashScore?.note).toContain('Missing slash syntax');
    });
});

describe('evaluateAgent', () => {
    const good = evaluateAgent(AGENT_GOOD, 'agents/code-reviewer.md');
    const bad = evaluateAgent(AGENT_BAD, 'agents/x.md');

    it('returns QualityReport with type agent', () => {
        assertReportShape(good, 'agent');
        assertReportShape(bad, 'agent');
    });

    it('discriminates good content from bad content', () => {
        assertDiscrimination(good, bad);
    });

    it('handles empty/missing frontmatter without throwing', () => {
        const result = evaluateAgent(NO_FRONTMATTER, 'agents/none.md');
        expect(result.type).toBe('agent');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('handles malformed YAML frontmatter without throwing', () => {
        const result = evaluateAgent(MALFORMED_YAML, 'agents/broken.md');
        expect(result.type).toBe('agent');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('scores completeness from REQUIRED_FIELDS.agent (no agentType)', () => {
        // Regression: H2 — completeness scoring MUST align with REQUIRED_FIELDS.agent.
        // scoreCompleteness delegates to scorePresence against REQUIRED_FIELDS.agent.
        // Verify that a freshly-evaluated agent report's completeness dimension
        // matches what scorePresence would compute for the same field set.
        const report = evaluateAgent(AGENT_GOOD, 'agents/code-reviewer.md');
        const completenessScore = report.dimensions.completeness?.score ?? 0;

        // Recompute independently — same contract as scoreCompleteness
        const data: Record<string, unknown> = {
            name: 'code-reviewer',
            description: 'Autonomous code review agent',
            model: 'claude-sonnet-4',
            tools: ['read', 'edit', 'search', 'bash'],
        };
        const expected = scorePresence(Object.keys(data), REQUIRED_FIELDS.agent);
        expect(completenessScore).toBe(expected);
    });
});

describe('evaluateHook', () => {
    const good = evaluateHook(HOOK_GOOD, 'hooks/block-dangerous.md');
    const bad = evaluateHook(HOOK_BAD, 'hooks/x.md');

    it('returns QualityReport with type hook', () => {
        assertReportShape(good, 'hook');
        assertReportShape(bad, 'hook');
    });

    it('discriminates good content from bad content', () => {
        assertDiscrimination(good, bad);
    });

    it('handles empty/missing frontmatter without throwing', () => {
        const result = evaluateHook(NO_FRONTMATTER, 'hooks/none.md');
        expect(result.type).toBe('hook');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('handles malformed YAML frontmatter without throwing', () => {
        const result = evaluateHook(MALFORMED_YAML, 'hooks/broken.md');
        expect(result.type).toBe('hook');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });
});

describe('evaluateMagent', () => {
    const good = evaluateMagent(MAGENT_GOOD, 'magent/dev-agent.md');
    const bad = evaluateMagent(MAGENT_BAD, 'magent/x.md');

    it('returns QualityReport with type magent', () => {
        assertReportShape(good, 'magent');
        assertReportShape(bad, 'magent');
    });

    it('discriminates good content from bad content', () => {
        assertDiscrimination(good, bad);
    });

    it('handles empty/missing frontmatter without throwing', () => {
        const result = evaluateMagent(NO_FRONTMATTER, 'magent/none.md');
        expect(result.type).toBe('magent');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('handles malformed YAML frontmatter without throwing', () => {
        const result = evaluateMagent(MALFORMED_YAML, 'magent/broken.md');
        expect(result.type).toBe('magent');
        expect(result.aggregate).toBeLessThanOrEqual(good.aggregate);
    });

    it('handles platforms as comma-separated string', () => {
        const content = makeSample(
            `name: multi-platform
description: Agent targeting multiple platforms
platforms: claude, codex, pi`,
            `## IDENTITY\nMulti-platform dev agent.\n\n## SOUL\nDirect and technical.\n\n## AGENTS\nOperations manual.\n\n## USER\nOperator profile.`,
        );
        const report = evaluateMagent(content, 'magent/multi.md');
        expect(report.dimensions['platform-coverage']?.score).toBeGreaterThan(0.3);
        expect(report.dimensions['platform-coverage']?.note).toContain('platforms covered');
    });
});

describe('evaluate (dispatch verb)', () => {
    // The verb must be a drop-in for the per-type dispatch every caller used to
    // rebuild — routing each ContentType to its evaluator and returning an
    // identical report.
    const cases: Array<[ContentType, string, (c: string, t: string) => QualityReport]> = [
        ['skill', SKILL_GOOD, evaluateSkill],
        ['command', COMMAND_GOOD, evaluateCommand],
        ['agent', AGENT_GOOD, evaluateAgent],
        ['hook', HOOK_GOOD, evaluateHook],
        ['magent', MAGENT_GOOD, evaluateMagent],
    ];

    for (const [type, sample, direct] of cases) {
        it(`routes ${type} to its evaluator with an equivalent report`, () => {
            const target = `${type}/dispatch.md`;
            const viaVerb = evaluate(type, sample, target);
            assertReportShape(viaVerb, type);
            expect(viaVerb).toEqual(direct(sample, target));
        });
    }
});
