import {
    clamp,
    completionCheckability,
    countTriggerBranches,
    descriptionTriggerRichness,
    duplicationRatio,
    extractBody,
    hasPattern,
    keywordDensity,
    negationDensity,
    noOpDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    progressiveDisclosureShape,
    scoreClarityFromDensities,
    scoreDescriptionBudget,
    scoreLength,
    scorePresence,
} from './heuristics';
import { computeAggregate, type DimensionScore, type QualityReport, REQUIRED_FIELDS } from './types';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate skill content against 5 quality dimensions: completeness, clarity,
 * trigger-accuracy, anti-hallucination, and conciseness.
 *
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
export function evaluateSkill(content: string, target: string): QualityReport {
    const data = parseFrontmatterSafe(content);
    const body = extractBody(content);
    const description = typeof data?.description === 'string' ? data.description : '';

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(content, data, body),
        clarity: scoreClarity(body),
        'trigger-accuracy': scoreTriggerAccuracy(body, description, data),
        'anti-hallucination': scoreAntiHallucination(body),
        conciseness: scoreConciseness(body, description),
    };

    return {
        type: 'skill',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}

// ── Dimension Scorers ─────────────────────────────────────────────────────────

function scoreCompleteness(content: string, data: Record<string, unknown> | null, body: string): DimensionScore {
    // R14: frontmatter parse failures never throw, produce low score with error note
    if (data === null) {
        const note = parseErrorNote(content, 'Frontmatter parse error');
        return { score: 0, note };
    }

    const presentKeys = Object.keys(data);
    const required = REQUIRED_FIELDS.skill;
    const presence = scorePresence(presentKeys, required);
    const structure = hasPattern(body, [/^# /m, /^## /m, /^### /m]);
    // Progressive-disclosure shape (R2): a body over budget with no references/ (or
    // See Also / Additional Resources) disclosure is folded in as a completeness gap —
    // it means the skill claims to cover its purpose but hasn't disclosed the detail
    // that would make that coverage checkable.
    const disclosed = progressiveDisclosureShape(body) ? 1 : 0.7;
    const score = clamp(presence * structure * disclosed);

    const keySet = new Set(presentKeys);
    const missing = required.filter((f) => !keySet.has(f));
    const note = missing.length > 0 ? `Missing fields: ${missing.join(', ')}` : 'All required fields present';

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (missing.length > 0) {
        findings.push(`Missing required frontmatter: ${missing.join(', ')}`);
        recommendations.push(`Add \`${missing.join('`, `')}\` to YAML frontmatter`);
    }
    if (structure < 1) {
        findings.push('Body lacks section headings (# / ## / ###). Structure aids navigation.');
        recommendations.push('Organize content with markdown headings for progressive disclosure');
    }
    if (disclosed < 1) {
        findings.push('Body is over the disclosure budget with no references/ (or See Also) link.');
        recommendations.push('Move supporting detail into references/*.md and link it, rather than growing the body.');
    }

    return { score, note, findings, recommendations };
}

function scoreClarity(body: string): DimensionScore {
    const base = scoreClarityFromDensities(body);
    // Completion-criteria checkability (R2): for step/workflow-shaped bodies, penalize
    // vague done-bounds ("as needed", "understanding reached") that make a step
    // undecidable. Bodies with no step structure are unaffected (checkability returns 1).
    const checkability = completionCheckability(body);
    // Negation (0077 R5): steering that leans on prohibition ("don't X") instead of
    // naming the positive target primes the banned behavior. Only a dominant lean is
    // penalized (a few hard guardrails are legitimate); the factor is gentle because
    // guardrail-vs-negation is ultimately an LLM-judged call.
    const negation = negationDensity(body);
    const negationFactor = negation > 0.5 ? 1 - (negation - 0.5) * 0.6 : 1;
    const score = clamp(base.score * checkability * negationFactor);

    const findings = [...(base.findings ?? [])];
    const recommendations = [...(base.recommendations ?? [])];
    if (checkability < 1) {
        findings.push('Step-shaped content uses vague completion bounds (e.g. "as needed", "when ready").');
        recommendations.push('Replace vague bounds with a decidable done-condition per step.');
    }
    if (negation > 0.5) {
        findings.push('Steering leans on prohibition ("don\'t X") over naming the positive target (negation).');
        recommendations.push(
            'Prompt the positive: state the target behavior; keep a prohibition only as an unphraseable hard guardrail.',
        );
    }

    return { score, note: base.note, findings, recommendations };
}

function scoreTriggerAccuracy(body: string, description: string, data: Record<string, unknown> | null): DimensionScore {
    // Invocation axis (R3/task 0070): a user-invoked skill (disable-model-invocation:
    // true) is deliberately NOT trigger-rich — the human is the index, not a dispatching
    // orchestrator, so branch-counting the description-vs-mode is the correct scoring
    // question here, not "how many When-to-Use branches does this have". Score the
    // description's shape against its declared mode instead of the branch count.
    const userInvoked = data?.['disable-model-invocation'] === true;
    if (userInvoked) {
        return scoreUserInvokedDescription(description);
    }

    const phrases = collectTriggerPhrases(body, description);
    const count = countTriggerBranches(phrases);

    // Score 1.0 for 3–10 distinct branches; linear ramp below 3, linear drop above 10.
    let score: number;
    if (count >= 3 && count <= 10) {
        score = 1.0;
    } else if (count < 3) {
        score = clamp(count / 3);
    } else {
        score = clamp(1 - (count - 10) / 10);
    }

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (count < 3) {
        findings.push(`Only ${count} distinct trigger branch(es) found; aim for 3–10 for reliable skill activation.`);
        recommendations.push('Add 1–2 more When-to-Use scenarios covering genuinely distinct branches.');
    } else if (count > 10) {
        findings.push(`${count} distinct trigger branches may cause overlap with adjacent skills.`);
        recommendations.push('Consolidate overlapping triggers or narrow the activation scope.');
    }
    if (phrases.length > count) {
        findings.push(
            `${phrases.length} trigger phrase(s) collapse to ${count} distinct branch(es) — some are synonym clusters.`,
        );
        recommendations.push('Collapse synonym-cluster triggers into one phrase per genuine branch.');
    }

    return {
        score,
        note: `${count} distinct trigger branch(es) (${phrases.length} phrases)`,
        findings,
        recommendations,
    };
}

/**
 * Score a user-invoked skill's description against the "one-line, human-facing"
 * shape it should have (the inverse check of the model-invoked branch-count path
 * above). High trigger-richness here is a finding, not an asset — a human already
 * picked this skill directly; a dispatch-branch list is wasted context for them.
 */
function scoreUserInvokedDescription(description: string): DimensionScore {
    const richness = descriptionTriggerRichness(description);
    const score = clamp(1 - richness);

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (richness > 0.4) {
        findings.push(
            'This skill is user-invoked (disable-model-invocation: true) but the description reads ' +
                'trigger-rich. A user-invoked skill cannot be fired by other skills or commands.',
        );
        recommendations.push('Rewrite the description as a one-line, human-facing summary — no branch list.');
    }

    return {
        score,
        note: `User-invoked: description trigger-richness ${richness.toFixed(2)} (lower is better)`,
        findings,
        recommendations,
    };
}

function scoreAntiHallucination(body: string): DimensionScore {
    const density = keywordDensity(body, [
        'verify',
        'cite',
        'source',
        'cross-check',
        'reference',
        'validate',
        'document',
        'evidence',
    ]);
    const note = density > 0 ? 'Includes verification language' : 'Missing verification instructions';

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (density < 0.3) {
        findings.push('Verification/citation language sparse or absent. Skill may invite fabrication.');
        recommendations.push(
            'Add explicit "verify with source", "cross-check against docs", or "cite the reference" instructions.',
        );
    }

    return { score: density, note, findings, recommendations };
}

function scoreConciseness(body: string, description: string): DimensionScore {
    // 500–15000 chars ≈ 15–500 lines of markdown. A rich skill body (e.g. cc-skills at ~14k)
    // should not auto-zero; 15000 accommodates complete multi-section skills.
    const lengthScore = scoreLength(body, 500, 15000);
    // Description char-budget (context load): a model-invoked description sits in
    // context every turn it's a candidate, so it pays a separate, tighter budget.
    const budgetScore = description ? scoreDescriptionBudget(description) : 1;
    // No-op density: curated default-behavior phrases ("be helpful", "think carefully")
    // that don't change model behavior — candidates for deletion, not trimming.
    const noOp = noOpDensity(body);
    // Duplication: description restated in the body, or repeated prose n-grams within the
    // body. Uses a 12-word shingle (not 8) so short repeated identifiers (filenames, CLI
    // examples like `AGENTS.md`) that legitimately recur across a reference list don't
    // register as duplication — only genuinely restated prose passages do.
    const descDup = description ? duplicationRatio(description, body, 12) : 0;
    const bodyDup = duplicationRatio(body, undefined, 12);

    const score = clamp(lengthScore * budgetScore * (1 - noOp) * (1 - descDup) * (1 - bodyDup * 0.3));

    const findings: string[] = [];
    const recommendations: string[] = [];
    if (budgetScore < 1) {
        findings.push(`Description is ${description.length} chars, outside the 20–500 char budget.`);
        recommendations.push('Tighten the description to the identity phrase plus distinct trigger branches.');
    }
    if (noOp > 0.2) {
        findings.push('Body contains default-behavior phrases that do not change model behavior (no-op candidates).');
        recommendations.push(
            'Run the no-op test per sentence and delete the whole failing sentence — do not trim words from it.',
        );
    }
    if (descDup > 0.3) {
        findings.push('Body restates the description near-verbatim (duplication).');
        recommendations.push('State identity once in the description; do not repeat it in the body.');
    }
    if (bodyDup > 0.15) {
        findings.push('Body repeats the same phrasing (n-gram duplication) in multiple places.');
        recommendations.push('Collapse duplicated phrasing into one authoritative section; cite it elsewhere.');
    }

    return { score, note: `Body length: ${body.length} chars`, findings, recommendations };
}

// ── Trigger Phrase Collection ─────────────────────────────────────────────────

/**
 * Collect candidate trigger phrases from the body's dedicated trigger section
 * (a heading containing "trigger" or "when to use"). When no such section
 * exists, fall back to reading distinct branches from the frontmatter
 * description instead. Does NOT fall back to counting every list item in the
 * body — that fallback previously inflated unrelated skills (e.g. hooks,
 * cc-skills) to 30+ "triggers" by counting ordinary procedure bullets. A
 * skill with a genuine trigger section is scored on that section ALONE — the
 * description is not double-counted on top of it, or a 5-branch "When to Use"
 * list plus a 6-clause description would look like 11+ branches.
 */
function collectTriggerPhrases(body: string, description: string): string[] {
    const fromSection = triggerSectionPhrases(body);
    if (fromSection.length > 0) return fromSection;
    return descriptionTriggerPhrases(description);
}

/** List items found within a heading containing "trigger" or "when to use". */
function triggerSectionPhrases(body: string): string[] {
    const lines = body.split('\n');
    let inTriggerSection = false;
    let sectionDepth = 0;
    const phrases: string[] = [];

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
            const depth = headingMatch[1]?.length ?? 0;
            const title = (headingMatch[2] ?? '').toLowerCase();

            if (/\b(?:trigger|when to use)/i.test(title)) {
                inTriggerSection = true;
                sectionDepth = depth;
            } else if (inTriggerSection && depth <= sectionDepth) {
                inTriggerSection = false;
            }
            continue;
        }
        if (inTriggerSection) {
            const listMatch = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)/);
            if (listMatch?.[1]) {
                phrases.push(listMatch[1].replace(/^["']|["']$/g, '').trim());
            }
        }
    }

    return phrases;
}

/**
 * Split a description into candidate trigger phrases on common branch delimiters
 * (commas, semicolons, " or ", " when "). Used when the body has no dedicated
 * trigger section — the description is the only remaining signal for what a skill
 * fires on, so we read distinct branches from it instead of guessing from bullets
 * that describe procedure, not activation.
 */
function descriptionTriggerPhrases(description: string): string[] {
    if (!description) return [];
    // Split on quoted-phrase commas/semicolons/"or" only — NOT on "when", which appears
    // in ordinary lead-in prose ("Use this skill when the user asks to...") far more often
    // than as a genuine branch delimiter, and would wrongly split the lead-in itself into
    // a spurious extra branch.
    return description
        .split(/[,;]|(?:\bor\b)/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 3);
}
