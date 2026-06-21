import type { ContentType } from '../content/types';
import { evaluateAgent } from './agent';
import { evaluateCommand } from './command';
import type { QualityReport } from './dimensions';
import { evaluateHook } from './hook';
import { evaluateMagent } from './magent';
import { evaluateSkill } from './skill';

/** A heuristic evaluator: scores content for one content type. */
export type Evaluator = (content: string, target: string) => QualityReport;

/** Dispatch table from content type to its heuristic evaluator. */
const EVALUATORS: Record<ContentType, Evaluator> = {
    skill: evaluateSkill,
    command: evaluateCommand,
    agent: evaluateAgent,
    hook: evaluateHook,
    magent: evaluateMagent,
};

/**
 * Evaluate content with the heuristic evaluator for its type.
 *
 * Single dispatch verb so callers don't each rebuild the content-type→evaluator
 * map. Per-type parse-error handling lives in the individual evaluators, which
 * intentionally differ; this verb only routes.
 *
 * @param type     Content type selecting the evaluator.
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
export function evaluate(type: ContentType, content: string, target: string): QualityReport {
    return EVALUATORS[type](content, target);
}
