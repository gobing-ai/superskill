import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    clamp,
    duplicationRatio,
    extractBody,
    keywordDensity,
    noOpDensity,
    parseErrorNote,
    parseFrontmatterSafe,
    scoreLength,
} from './heuristics';
import { computeAggregate, DIMENSION_REGISTRY, type DimensionScore, type QualityReport } from './types';

// Governance section patterns for main-agent configs (frontmatter-optional).
// `keywords` match a markdown link's text or resolved target basename (disclosure-aware
// completeness): an area counts when either its heading regex hits or a link-resolving
// doc matches its keywords. `label` is the area identity (no parallel enum).
const MAGENT_SECTIONS: { re: RegExp; label: string; keywords: string[] }[] = [
    { re: /^## .*[Pp]roject|^## .*[Ss]tack/m, label: 'project', keywords: ['project', 'stack'] },
    { re: /^## .*[Cc]ommand|^## .*[Tt]ool/m, label: 'commands', keywords: ['command', 'tool'] },
    {
        re: /^## .*[Vv]erif|^## .*[Tt]est|^## .*[Gg]ate/m,
        label: 'verification',
        keywords: ['verification', 'verify', 'test', 'gate'],
    },
    {
        re: /^## .*[Cc]onvention|^## .*[Ss]tyle|^## .*[Bb]oundar/m,
        label: 'conventions',
        keywords: ['convention', 'style', 'boundary'],
    },
    {
        re: /^## .*[Ss]afety|^## .*[Ss]ecurity|^## .*[Cc]ritical/m,
        label: 'safety',
        keywords: ['safety', 'security', 'critical'],
    },
    {
        re: /^## .*[Dd]oc|^## .*[Rr]eference|^## .*[Rr]outing/m,
        label: 'docs',
        keywords: ['doc', 'reference', 'routing'],
    },
];

/** True when `target` resolves to an existing file under `basePath`. Absent basePath → never (R4). */
function resolvesOnDisk(basePath: string | undefined, target: string): boolean {
    if (basePath === undefined) return false;
    try {
        return existsSync(resolve(basePath, target));
    } catch {
        return false;
    }
}

/** True when a markdown link in body matches the area's keywords and its target resolves on disk. */
function linkMatchesArea(body: string, keywords: string[], basePath: string): boolean {
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    for (const m of body.matchAll(linkRe)) {
        const text = m[1] ?? '';
        const target = m[2] ?? '';
        if (/^(https?:|mailto:)/i.test(target) || target.startsWith('#')) continue; // relative targets only
        const pathPart = target.split('#')[0] ?? '';
        if (!resolvesOnDisk(basePath, pathPart)) continue;
        const basename = pathPart.split('/').pop() ?? pathPart;
        const hay = `${text} ${basename}`.toLowerCase();
        if (keywords.some((kw) => hay.includes(kw.toLowerCase()))) return true;
    }
    return false;
}

/** Count governance sections found in body; link-resolved areas count when basePath is given. */
function scoreCompleteness(body: string, basePath?: string): DimensionScore {
    let found = 0;
    for (const { re, keywords } of MAGENT_SECTIONS) {
        if (re.test(body)) {
            found++;
            continue; // heading match short-circuits; never double-count an area
        }
        if (basePath !== undefined && linkMatchesArea(body, keywords, basePath)) found++;
    }
    const score = clamp(found / MAGENT_SECTIONS.length);
    const findings = found < MAGENT_SECTIONS.length / 2 ? ['Config is missing key governance sections'] : undefined;
    const recs =
        found < MAGENT_SECTIONS.length
            ? ['Add more governance sections (commands, verification, conventions, safety, docs)']
            : undefined;
    return {
        score,
        note: `${found}/${MAGENT_SECTIONS.length} governance sections present`,
        findings,
        recommendations: recs,
    };
}

/** Score platform coverage from frontmatter data.platforms, with body-based fallback. */
function scorePlatformCoverage(data: Record<string, unknown>, body: string): DimensionScore {
    const raw = data.platforms;
    let platforms: string[] = [];
    if (Array.isArray(raw)) {
        platforms = raw.map(String);
    } else if (typeof raw === 'string') {
        platforms = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    // Body-based fallback: detect platform mentions in prose
    if (platforms.length === 0) {
        const detected: string[] = [];
        const platformPatterns: [RegExp, string][] = [
            [/claude.?code/i, 'claude-code'],
            [/codex/i, 'codex'],
            [/gemini/i, 'gemini'],
            [/cursor/i, 'cursor'],
            [/windsurf/i, 'windsurf'],
            [/opencode/i, 'opencode'],
            [/openclaw/i, 'openclaw'],
            [/antigravity/i, 'antigravity'],
            [/\bpi\b/i, 'pi'],
        ];
        for (const [re, name] of platformPatterns) {
            if (re.test(body)) detected.push(name);
        }
        platforms = detected;
    }

    const score = clamp(Math.min(platforms.length / 5, 1));
    const findings =
        platforms.length === 0
            ? ['No platforms declared or detected']
            : platforms.length < 3
              ? ['Limited platform coverage']
              : undefined;
    const recs =
        platforms.length < 3
            ? ['Declare supported platforms in frontmatter (platforms:) or mention them in prose']
            : undefined;
    return { score, note: `${platforms.length} platforms covered`, findings, recommendations: recs };
}

/**
 * Score body length within 1000–8000 sweet spot, penalized by no-op density and
 * within-body n-gram duplication (R2). A magent config (AGENTS.md/CLAUDE.md) has no
 * separate description field — it's read wholesale rather than dispatch-selected — so
 * only the body-quality proxies apply here, not the description-budget check.
 */
function scoreConciseness(body: string): DimensionScore {
    const lengthScore = scoreLength(body, 1000, 8000);
    const noOp = noOpDensity(body);
    const bodyDup = duplicationRatio(body, undefined, 12);
    const score = clamp(lengthScore * (1 - noOp) * (1 - bodyDup * 0.3));

    const findings: string[] = [];
    const recs: string[] = [];
    if (noOp > 0.2) {
        findings.push('Body contains default-behavior phrases that do not change model behavior (no-op candidates).');
        recs.push('Delete no-op instructions rather than trimming them — they add no signal.');
    }
    if (bodyDup > 0.15) {
        findings.push('Body repeats the same phrasing (n-gram duplication) in multiple places.');
        recs.push('Collapse duplicated phrasing into one authoritative section; cite it elsewhere.');
    }

    return {
        score,
        note: `Body length: ${body.length} chars`,
        findings: findings.length > 0 ? findings : undefined,
        recommendations: recs.length > 0 ? recs : undefined,
    };
}

/**
 * Detect tone-consistency signals (tone, style, voice, personality, forbidden).
 * >= 2 matched → 1.0,  1 → 0.6,  0 → 0.2.
 */
function scoreToneConsistency(body: string): DimensionScore {
    const signals = [/tone/i, /style/i, /voice/i, /personality/i, /forbidden/i];
    let found = 0;
    for (const re of signals) {
        if (re.test(body)) found++;
    }
    if (found >= 2) return { score: 1.0, note: 'Tone consistent across sections' };
    return { score: found === 1 ? 0.6 : 0.2, note: 'Mixed tone signals' };
}

/** Score safety keyword density with explicit count. */
function scoreSafety(body: string): DimensionScore {
    const keywords = ['[CRITICAL]', 'safety', 'NEVER', 'block', 'dangerous', 'security', 'validation'];
    const density = keywordDensity(body, keywords);
    // Count exact occurrences for the note (case-insensitive)
    const lower = body.toLowerCase();
    let count = 0;
    for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) count++;
    }
    const findings = count < 3 ? ['Limited safety markers in config'] : undefined;
    const recs =
        count < 3 ? ['Add [CRITICAL] markers, safety rules, NEVER directives, and security validation'] : undefined;
    return { score: density, note: `${count} safety markers found`, findings, recommendations: recs };
}
// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate magent content against 5 quality dimensions: completeness,
 * platform-coverage, conciseness, tone-consistency, and safety.
 *
 * @param content  Markdown content string with YAML frontmatter.
 * @param target   Identifier for the content being evaluated.
 * @param basePath Optional directory for resolving markdown links against disk
 *                 (disclosure-aware completeness). Absent → byte-identical to
 *                 the pre-basePath behavior (R4).
 * @returns        QualityReport with per-dimension scores and aggregate.
 */
export function evaluateMagent(content: string, target: string, basePath?: string): QualityReport {
    const body = extractBody(content);
    // Distinguish "no frontmatter" (valid for magents — AGENTS.md/CLAUDE.md are plain markdown)
    // from "malformed frontmatter" (starts with --- but parse fails — real error)
    const hasFrontmatter = content.startsWith('---\n') || content.startsWith('---\r\n');
    const fmResult = hasFrontmatter ? parseFrontmatterSafe(content) : undefined;
    const data = fmResult ?? {};
    const fmNote = hasFrontmatter && fmResult === null ? parseErrorNote(content, 'Frontmatter parse error') : null;

    const dimensions: Record<string, DimensionScore> = {
        completeness: scoreCompleteness(body, basePath),
        'platform-coverage': scorePlatformCoverage(data, body),
        conciseness: scoreConciseness(body),
        'tone-consistency': scoreToneConsistency(body),
        safety: scoreSafety(body),
    };

    // Only attach frontmatter error note for real parse failures (starts with --- but parse fails)
    if (fmNote) {
        const firstKey = DIMENSION_REGISTRY.magent[0];
        if (firstKey && dimensions[firstKey]) {
            dimensions[firstKey] = { ...dimensions[firstKey], note: fmNote };
        }
    }

    return {
        type: 'magent',
        target,
        content: '',
        aggregate: computeAggregate(dimensions),
        dimensions,
    };
}
