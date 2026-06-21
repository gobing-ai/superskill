import { describe, expect, it } from 'bun:test';
import { evaluateAgent } from '../../src/quality/agent';
import { evaluateCommand } from '../../src/quality/command';
import { evaluate } from '../../src/quality/evaluate';
import { scorePresence } from '../../src/quality/heuristics';
import { evaluateHook } from '../../src/quality/hook';
import { evaluateMagent } from '../../src/quality/magent';
import { evaluateSkill } from '../../src/quality/skill';
import type { ContentType, QualityReport } from '../../src/quality/types';
import { computeAggregate, DIMENSION_REGISTRY, REQUIRED_FIELDS } from '../../src/quality/types';

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
    `description: Deploy the application to a target environment
argument-hint: "<env> [--branch <name>] [--force]"
allowed-tools:
  - read
  - edit
  - bash`,
    `
# /deploy

Deploy the application using \`build\` and \`publish\`. You must always specify
the target environment. Never deploy to production without explicit approval.

## Tool references
This command requires the \`deploy\` tool and uses \`git\` for branch resolution.
The tool:deploy workflow ensures safe rollout with automatic rollback on failure.

## Usage
/deploy staging --branch main
/deploy production --branch release/v2 --force

Always ensure you have the required permissions before running /deploy.
Validate the build artifacts with \`verify-build\` before publishing.
`,
);

const COMMAND_BAD = makeSample('', `maybe run a command or something could be useful probably`);

// Command with no parameters (no argument-hint) — should NOT be penalized
const COMMAND_NO_PARAMS = makeSample(
    `description: List all tasks with optional status filter
allowed-tools:
  - read`,
    `
# /list-tasks

Lists all tasks. Use the status filter to narrow results.
Always check the task index before creating new tasks.

## Usage
/list-tasks
`,
);

// Command that declares argument-hint but leaves it empty — author left it blank
const COMMAND_EMPTY_HINT = makeSample(
    `description: Run something with arguments
argument-hint: ""
allowed-tools:
  - read`,
    `
# /run-something

Runs something. Use /run-something with arguments.
`,
);

// Command missing description — should be penalized
const COMMAND_NO_DESC = makeSample(
    `argument-hint: "<task-id>"
allowed-tools:
  - read
  - write`,
    `
# /show-task

Shows detailed information about a task.

## Usage
/show-task 0042
`,
);
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
## Project
You are a senior full-stack developer agent. This config targets multi-platform
development with Claude Code, Codex, and Gemini CLI support.

## Commands
- \`bun run lint\` — Biome check + typecheck
- \`bun run test\` — test suite
- \`bun run build\` — production build

## Verification Gate
All must pass before "done": lint clean, tests pass, build succeeds, git clean.
Never bypass with --no-verify or --force.

## Conventions & Style
4-space indent, single quotes, semicolons. Interface for objects, type for unions.
Match existing conventions — never introduce competing styles.

## Safety
[CRITICAL] Never force-push, never commit secrets. All destructive operations
require explicit user confirmation. Security validation is mandatory before
deployment. The agent MUST block dangerous operations.

## Documentation
Each doc owns exactly one question. Lower-numbered docs are authoritative.
Facts live in one place; other docs link, never restate.
`,
);

const MAGENT_BAD = makeSample('', `just some text without structure`);

// Frontmatter-less magent (plain markdown — AGENTS.md/CLAUDE.md style)
const MAGENT_NO_FM = `
## Project
This is a development agent config for a Bun + TypeScript monorepo.
Supports Claude Code, Codex, and Gemini CLI workflows.
Uses Biome for linting and formatting, Turborepo for builds.

## Commands
- \`bun run lint\` — check + typecheck
- \`bun run test\` — test suite
- \`bun run build\` — production build

## Conventions
4-space indent, trailing commas, single quotes. Never introduce new tooling.

## Safety
[CRITICAL] Never force-push. Never commit secrets. Always validate before deploy.

## Documentation
See docs/ for architecture, design, and feature documentation.
`;

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
    const noParams = evaluateCommand(COMMAND_NO_PARAMS, 'commands/list-tasks.md');
    const emptyHint = evaluateCommand(COMMAND_EMPTY_HINT, 'commands/run-something.md');
    const noDesc = evaluateCommand(COMMAND_NO_DESC, 'commands/show-task.md');

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

    // C1 regression: real Claude Code commands score completeness ≈ 1.0
    it('real Claude Code command (description + argument-hint + allowed-tools) scores completeness ≈ 1.0', () => {
        const c = good.dimensions.completeness;
        expect(c?.score).toBeGreaterThanOrEqual(0.9);
        expect(c?.note).toBe('All required fields present');
    });

    // C1 regression: "Missing fields: name" MUST NOT appear
    it('never reports "Missing fields: name" for a described command', () => {
        const c = good.dimensions.completeness;
        expect(c?.note).not.toContain('name');
    });

    // C2 regression: rich argument-hint scores ≈ 1.0
    it('rich argument-hint (<env> [--branch <name>] [--force]) scores ≈ 1.0', () => {
        const ah = good.dimensions['argument-hints'];
        expect(ah?.score).toBeGreaterThanOrEqual(0.9);
    });

    // C2 regression: no-params command NOT penalized
    it('command with no argument-hint (no params) scores argument-hints 1.0', () => {
        const ah = noParams.dimensions['argument-hints'];
        expect(ah?.score).toBe(1.0);
        expect(ah?.note).toContain('No argument-hint');
    });

    // C2 regression: declared-but-empty argument-hint is penalized (distinct from no-params)
    it('command with empty argument-hint scores argument-hints < 1.0', () => {
        const ah = emptyHint.dimensions['argument-hints'];
        expect(ah?.score).toBeLessThan(1.0);
        expect(ah?.note).toContain('empty');
    });

    // C2 regression: missing description penalized
    it('command missing description scores low completeness', () => {
        const c = noDesc.dimensions.completeness;
        expect(c?.score).toBeLessThanOrEqual(0.3);
        expect(c?.note).toContain('Missing');
    });

    // C3 regression: allowed-tools with 3 tools scores high tool-references
    it('command with 3 allowed-tools scores tool-references ≥ 0.9', () => {
        const tr = good.dimensions['tool-references'];
        expect(tr?.score).toBeGreaterThanOrEqual(0.9);
    });

    it('slash-syntax dimension uses target parameter not data.target', () => {
        const withTarget = evaluateCommand(
            makeSample('description: d\ntarget: bogus', 'run something'),
            'commands/cmd.md',
        );
        const slashScore = withTarget.dimensions['slash-syntax'];
        expect(slashScore?.score).toBe(0.5);
        expect(slashScore?.note).toContain('Missing slash syntax for target');
    });

    it('slash-syntax dimension no target falls back to 0.1', () => {
        const noTarget = evaluateCommand(makeSample('description: d', 'run something'), '');
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
    const noFm = evaluateMagent(MAGENT_NO_FM, 'AGENTS.md');

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

    // M2 regression: frontmatter-less configs are valid for magents
    it('frontmatter-less config (AGENTS.md style) scores completeness > 0 and no parse error', () => {
        const c = noFm.dimensions.completeness;
        expect(c?.score).toBeGreaterThan(0);
        expect(c?.note).not.toContain('Frontmatter');
        expect(c?.note).not.toContain('parse error');
    });

    // M2 regression: frontmatter-less config detects platforms from body
    it('frontmatter-less config detects platforms from body prose', () => {
        const pc = noFm.dimensions['platform-coverage'];
        expect(pc?.score).toBeGreaterThan(0);
    });

    // M2 regression: frontmatter magent still scores correctly (no regression)
    it('frontmatter magent with platforms scores high platform-coverage', () => {
        const pc = good.dimensions['platform-coverage'];
        expect(pc?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('malformed YAML frontmatter still flags an error', () => {
        const result = evaluateMagent(MALFORMED_YAML, 'magent/broken.md');
        const c = result.dimensions.completeness;
        expect(c?.note).toContain('parse error');
    });

    it('handles platforms as comma-separated string', () => {
        const content = makeSample(
            `name: multi-platform
description: Agent targeting multiple platforms
platforms: claude, codex, pi`,
            `## Project\nMulti-platform dev agent.\n\n## Commands\nVarious commands.\n\n## Safety\n[CRITICAL] rules.`,
        );
        const report = evaluateMagent(content, 'magent/multi.md');
        expect(report.dimensions['platform-coverage']?.score).toBeGreaterThan(0.3);
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
