import type { EvalCase, RuleJudge, Target } from '@gobing-ai/superskill-core';
import { aggregateHard, scoreExact, scoreRule, TARGET_TO_AGENT_NAME } from '@gobing-ai/superskill-core';
import { type AgentName, AiRunner } from '@gobing-ai/ts-ai-runner';

// ── Backend Interface ────────────────────────────────────────────────────────

/**
 * Abstraction over the agent runtime for replay evaluation.
 * The mock implementation makes the gate CI-able at zero token cost;
 * the real implementation delegates to ts-ai-runner.
 */
export interface ReplayBackend {
    /**
     * Run a skill text against a prompt and return the agent's output text.
     *
     * @param systemPrompt  The candidate skill text (injected as system prompt).
     * @param userPrompt    The evaluation case prompt.
     * @returns             The agent's text output.
     */
    run(systemPrompt: string, userPrompt: string): Promise<string>;
}

// ── Mock Backend ─────────────────────────────────────────────────────────────

/**
 * Deterministic mock backend that returns scripted outputs keyed by case id.
 * Inject this in tests/offline callers to mirror SkillOpt's mock discipline.
 */
export class MockReplayBackend implements ReplayBackend {
    private outputs: Map<string, string>;

    /**
     * @param outputs  Map from case id to the exact output text to return.
     */
    constructor(outputs: Record<string, string> = {}) {
        this.outputs = new Map(Object.entries(outputs));
    }

    /**
     * The mock ignores the prompt and returns the pre-scripted output
     * for the case id extracted from the user prompt. The convention is
     * that the replay runner prefixes each prompt with `[case:<id>]`.
     */
    async run(_systemPrompt: string, userPrompt: string): Promise<string> {
        // Extract case id from the bracketed prefix
        const match = userPrompt.match(/^\[case:([^\]]+)\]/);
        const caseId: string = match?.[1] ?? userPrompt;

        const scripted = this.outputs.get(caseId);
        if (scripted !== undefined) return scripted;

        // Default: return the prompt itself (catches un-mocked cases)
        return `[mock: no output for case "${caseId}"]`;
    }
}

// ── Real Backend ─────────────────────────────────────────────────────────────

/**
 * Real backend that delegates to ts-ai-runner to invoke a coding agent.
 */
export class TsAiRunnerBackend implements ReplayBackend {
    private runner: AiRunner;
    private agent: AgentName;

    /**
     * @param agent   Target coding agent (default: claude).
     * @param runner  Optional pre-configured AiRunner for DI (test seam). When
     *                omitted, a default AiRunner is constructed.
     */
    constructor(agent: AgentName = 'claude', runner?: AiRunner) {
        this.runner = runner ?? new AiRunner();
        this.agent = agent;
    }

    async run(systemPrompt: string, userPrompt: string): Promise<string> {
        const result = await this.runner.runPromptCommand(this.agent, {
            input: userPrompt,
            systemPrompt,
        });
        return result.stdout;
    }
}

/**
 * Build the replay backend for an empirical gate run.
 *
 * @param target    Superskill target whose agent shim should execute the replay.
 * @param injected  Optional backend used by deterministic tests/offline callers.
 * @returns         The injected backend, or a ts-ai-runner backend for `target`.
 */
export function createReplayBackend(target: Target, injected?: ReplayBackend): ReplayBackend {
    return injected ?? new TsAiRunnerBackend(TARGET_TO_AGENT_NAME[target]);
}

// ── Replay Functions ─────────────────────────────────────────────────────────

/** Result of replaying a single eval case. */
export interface ReplayCaseResult {
    /** Binary score (0.0 or 1.0). */
    hard: number;
    /** The raw agent output. */
    output: string;
}

/** Result of replaying a split of eval cases. */
export interface ReplaySplitResult {
    /** Aggregate mean score over the split. */
    hard: number;
    /** Number of cases replayed. */
    n: number;
}

/**
 * Run a single eval case against a candidate skill text and score the output.
 *
 * @param backend  The replay backend (mock or real).
 * @param skill    The candidate skill text (injected as system prompt).
 * @param ev       The eval case to replay.
 * @param toolsCalled  Optional tool names to make available to the rule judge.
 * @returns        The binary score and raw output.
 */
export async function replayCase(
    backend: ReplayBackend,
    skill: string,
    ev: EvalCase,
    toolsCalled?: string[],
): Promise<ReplayCaseResult> {
    // The mock backend extracts the case id from the prompt via [case:<id>] prefix
    const prompt = `[case:${ev.id}] ${ev.prompt}`;
    const output = await backend.run(skill, prompt);

    let hard: number;
    if (ev.reference_kind === 'exact') {
        hard = scoreExact(output, ev.reference as string);
    } else {
        hard = scoreRule(output, ev.reference as RuleJudge, toolsCalled);
    }

    return { hard, output };
}

/**
 * Replay all cases in a given split and return the aggregate score.
 *
 * @param backend  The replay backend.
 * @param skill    The candidate skill text.
 * @param cases    All eval cases.
 * @param split    Which split to replay ('train' or 'holdout').
 * @param toolsCalled  Optional tool names for the rule judge.
 * @returns        Aggregate score and case count.
 */
export async function replaySplit(
    backend: ReplayBackend,
    skill: string,
    cases: EvalCase[],
    split: 'train' | 'holdout',
    toolsCalled?: string[],
): Promise<ReplaySplitResult> {
    const splitCases = cases.filter((c) => c.split === split);
    if (splitCases.length === 0) return { hard: 0.0, n: 0 };

    const results = await Promise.all(splitCases.map((c) => replayCase(backend, skill, c, toolsCalled)));
    const scores = results.map((r) => r.hard);

    return { hard: aggregateHard(scores), n: splitCases.length };
}
