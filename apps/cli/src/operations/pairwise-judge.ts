import type { RubricRef, Target } from '@gobing-ai/superskill-core';
import { TARGET_TO_AGENT_NAME } from '@gobing-ai/superskill-core';
import { type AgentName, AiRunner } from '@gobing-ai/ts-ai-runner';

// ── Types ────────────────────────────────────────────────────────────────────

/** Output ordering used to control and test position bias. */
export type JudgeOrder = 'candidate-first' | 'baseline-first';

/** Verdict from a pairwise comparison of two outputs against a rubric criterion. */
export interface PairwiseVerdict {
    /** Which output better satisfies the criterion. */
    winner: 'candidate' | 'baseline' | 'tie';
    /** Confidence margin 0..1 (0 = no preference, 1 = strong preference). */
    margin: number;
}

/** Options threaded into judge backends. */
export interface JudgeOptions {
    order?: JudgeOrder;
    seed?: number;
    temperature?: number;
}

/** Minimal ts-ai-runner surface used by the judge. */
interface PromptRunner {
    runPromptCommand(
        agent: AgentName,
        opts: {
            input: string;
            systemPrompt: string;
            seed?: number;
            temperature?: number;
        },
    ): Promise<{ stdout: string; stderr?: string; exitCode?: number | null }>;
}

/** Abstraction over the LLM judge for rubric cases. */
export interface JudgeBackend {
    judge(
        rubric: RubricRef,
        prompt: string,
        candOutput: string,
        baseOutput: string,
        options?: JudgeOptions,
    ): Promise<PairwiseVerdict>;
}

// ── Scripted Judge Backend ───────────────────────────────────────────────────

/**
 * Deterministic judge backend keyed by case id. Order-specific keys use
 * `<caseId>:cb` (candidate first) and `<caseId>:bc` (baseline first).
 */
export class ScriptedJudgeBackend implements JudgeBackend {
    private readonly verdicts: Map<string, PairwiseVerdict>;

    constructor(verdicts: Record<string, PairwiseVerdict> = {}) {
        this.verdicts = new Map(Object.entries(verdicts));
    }

    async judge(
        _rubric: RubricRef,
        prompt: string,
        _candOutput: string,
        _baseOutput: string,
        options?: JudgeOptions,
    ): Promise<PairwiseVerdict> {
        const caseId = extractCaseId(prompt);
        const order = options?.order === 'baseline-first' ? 'bc' : 'cb';
        return this.verdicts.get(`${caseId}:${order}`) ?? this.verdicts.get(caseId) ?? { winner: 'tie', margin: 0 };
    }
}

// ── Real Judge Backend ───────────────────────────────────────────────────────

/** Real backend that delegates pairwise rubric judging to ts-ai-runner. */
export class TsAiRunnerJudgeBackend implements JudgeBackend {
    private readonly runner: PromptRunner;
    private readonly agent: AgentName;

    constructor(agent: AgentName = 'claude', runner?: PromptRunner) {
        this.runner = runner ?? (new AiRunner() as unknown as PromptRunner);
        this.agent = agent;
    }

    async judge(
        rubric: RubricRef,
        prompt: string,
        candOutput: string,
        baseOutput: string,
        options?: JudgeOptions,
    ): Promise<PairwiseVerdict> {
        const candidateFirst = options?.order !== 'baseline-first';
        const outputA = candidateFirst ? candOutput : baseOutput;
        const outputB = candidateFirst ? baseOutput : candOutput;
        const systemPrompt = [
            'You are a strict pairwise behavior judge.',
            'Compare two outputs for the same task against the rubric criterion.',
            'Return only JSON: {"winner":"A"|"B"|"tie","margin":number}.',
            'The margin must be a number from 0 to 1.',
        ].join('\n');
        const input = [
            `Criterion: ${rubric.criterion}`,
            rubric.excellent ? `Excellent anchor: ${rubric.excellent}` : '',
            rubric.poor ? `Poor anchor: ${rubric.poor}` : '',
            `Task prompt:\n${prompt}`,
            `Output A:\n${outputA}`,
            `Output B:\n${outputB}`,
        ]
            .filter(Boolean)
            .join('\n\n');

        const result = await this.runner.runPromptCommand(this.agent, {
            input,
            systemPrompt,
            ...(options?.seed !== undefined ? { seed: options.seed } : {}),
            ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        });
        return parseJudgeResponse(result.stdout, candidateFirst);
    }
}

/** Build the rubric judge backend for an empirical gate run. */
export function createJudgeBackend(target: Target, injected?: JudgeBackend): JudgeBackend {
    return injected ?? new TsAiRunnerJudgeBackend(TARGET_TO_AGENT_NAME[target]);
}

// ── Pairwise Judge ───────────────────────────────────────────────────────────

/**
 * Run one semantic pairwise comparison. The `seed` controls output order so
 * noise-floor replays can alternate candidate-first/baseline-first without
 * turning the primary score into two independent absolute scores.
 */
export async function pairwiseJudge(
    backend: JudgeBackend,
    rubric: RubricRef,
    casePrompt: string,
    candOutput: string,
    baseOutput: string,
    options: JudgeOptions = {},
): Promise<PairwiseVerdict> {
    const order =
        options.order ?? (options.seed !== undefined && options.seed % 2 === 1 ? 'baseline-first' : 'candidate-first');
    return backend.judge(rubric, casePrompt, candOutput, baseOutput, { ...options, order });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a verdict into a signed candidate-baseline margin. */
export function signedMargin(verdict: PairwiseVerdict): number {
    if (verdict.winner === 'candidate') return verdict.margin;
    if (verdict.winner === 'baseline') return -verdict.margin;
    return 0;
}

/** Combine two opposite-order verdicts conservatively for direct helper tests and callers. */
export function deBias(a: PairwiseVerdict, b: PairwiseVerdict): PairwiseVerdict {
    if (a.winner === 'tie' || b.winner === 'tie') {
        return { winner: 'tie', margin: 0 };
    }
    const avg = (signedMargin(a) + signedMargin(b)) / 2;
    if (avg > 0) return { winner: 'candidate', margin: avg };
    if (avg < 0) return { winner: 'baseline', margin: Math.abs(avg) };
    return { winner: 'tie', margin: 0 };
}

function extractCaseId(prompt: string): string {
    return prompt.match(/^\[case:([^\]]+)\]/)?.[1] ?? 'unknown';
}

function parseJudgeResponse(stdout: string, candidateFirst: boolean): PairwiseVerdict {
    let parsed: unknown;
    try {
        parsed = JSON.parse(stdout.trim());
    } catch {
        throw new Error(`Pairwise judge returned invalid JSON: ${stdout.slice(0, 200)}`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Pairwise judge returned a non-object JSON payload.');
    }
    const value = parsed as { winner?: unknown; margin?: unknown };
    if (value.winner !== 'A' && value.winner !== 'B' && value.winner !== 'tie') {
        throw new Error('Pairwise judge JSON must include winner "A", "B", or "tie".');
    }
    if (typeof value.margin !== 'number' || value.margin < 0 || value.margin > 1) {
        throw new Error('Pairwise judge JSON must include margin in [0,1].');
    }
    if (value.winner === 'tie') return { winner: 'tie', margin: 0 };
    if (value.winner === 'A') {
        return { winner: candidateFirst ? 'candidate' : 'baseline', margin: value.margin };
    }
    return { winner: candidateFirst ? 'baseline' : 'candidate', margin: value.margin };
}
