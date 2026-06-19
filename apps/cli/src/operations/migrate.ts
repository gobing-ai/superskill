import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { echo } from '@gobing-ai/ts-utils';
import { stringify } from 'yaml';
import { type ParsedFrontmatter, parseFrontmatter } from '../content/frontmatter';
import { resolveContentName, resolveContentPath } from '../content/identity';
import type { DbAdapter } from '../store';
import type { Target } from '../targets';
import { evolve } from './evolve';

/** Options for the migrate operation. */
export interface MigrateOptions {
    /** Run the refinement layer (routes through the Phase 4 generation seam, F023). */
    refine?: boolean;
    /** Path to an agent-authored proposal JSON (ingest-in mode with --refine). */
    ingest?: string;
    /** Target agent platform. */
    target?: Target;
    /** Δ-margin gate threshold for ingest (default 0.05). */
    margin?: number;
    /** Inject an already-open DbAdapter for testing (forwarded to evolve). */
    adapter?: DbAdapter;
}

/** Result of a migrate operation. */
export interface MigrateResult {
    /** Path to the merged skill file. */
    dest: string;
    /** True when generation briefs were emitted to stdout (envelope-out mode). */
    envelopeOut: boolean;
    /** True when the double-loop gate rejected the ingested proposal (file restored). */
    rejected?: boolean;
    /** Human-readable rejection reason when rejected. */
    rejectionReason?: string;
}

/**
 * Resolve and read skill sources, returning parsed frontmatter + body for each.
 *
 * Uses `resolveContentPath` (F007 / content/identity.ts) — the canonical content-IO
 * path resolver. Throws an ENOENT-tagged error if any source cannot be resolved,
 * which `runOperation` maps to exit 2 (R6).
 */
function loadSources(sources: string[]): ParsedFrontmatter[] {
    const parsed: ParsedFrontmatter[] = [];
    for (const source of sources) {
        const path = resolveContentPath('skill', source);
        if (!path || !existsSync(path)) {
            throw Object.assign(new Error(`Skill not found: ${source}`), { code: 'ENOENT' });
        }
        const content = readFileSync(path, 'utf-8');
        parsed.push(parseFrontmatter(content));
    }
    return parsed;
}

/**
 * Deduplicate an array of primitives, preserving first-occurrence order.
 */
function dedupeArray(values: unknown[]): unknown[] {
    const seen = new Set<unknown>();
    const result: unknown[] = [];
    for (const v of values) {
        if (!seen.has(v)) {
            seen.add(v);
            result.push(v);
        }
    }
    return result;
}

/**
 * Merge frontmatter from multiple parsed sources.
 *
 * Conflict policy (documented, deterministic):
 * - `name` → dest-derived canonical name (`resolveContentName(dest)`).
 * - Array values → union with dedup, preserving first-source order.
 * - Scalar conflicts → first source wins (sources are ordered).
 * - All keys from all sources appear in the output (union).
 */
function mergeFrontmatter(sources: ParsedFrontmatter[], destName: string): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const { data } of sources) {
        for (const [key, value] of Object.entries(data)) {
            if (!(key in merged)) {
                merged[key] = value;
            } else {
                const existing = merged[key];
                if (Array.isArray(existing) && Array.isArray(value)) {
                    merged[key] = dedupeArray([...existing, ...value]);
                }
                // Scalar conflict: first source wins (already in merged).
            }
        }
    }
    merged.name = destName;
    return merged;
}

/**
 * Merge bodies from multiple parsed sources.
 *
 * Bodies are concatenated in source order, separated by a blank line.
 * Identical lines (exact match including whitespace) are collapsed to their
 * first occurrence. Runs of blank lines are collapsed to a single blank line.
 */
function mergeBodies(sources: ParsedFrontmatter[]): string {
    const bodies = sources.map((s) => s.body.replace(/^\n+/, '').replace(/\n+$/, ''));
    const concatenated = bodies.join('\n\n');
    return dedupeLines(concatenated);
}

/**
 * Collapse exact-duplicate lines (first occurrence kept) and consecutive blank lines.
 */
function dedupeLines(text: string): string {
    const seen = new Set<string>();
    const out: string[] = [];
    let prevBlank = false;
    for (const line of text.split('\n')) {
        if (line === '') {
            if (!prevBlank) out.push('');
            prevBlank = true;
            continue;
        }
        prevBlank = false;
        if (!seen.has(line)) {
            seen.add(line);
            out.push(line);
        }
    }
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.join('\n');
}

/**
 * Serialize merged frontmatter + body into a skill markdown file.
 */
function serializeSkill(frontmatter: Record<string, unknown>, body: string): string {
    const yamlStr = stringify(frontmatter);
    return `---\n${yamlStr}---\n\n${body}\n`;
}

/**
 * Read the `proposal_id` from an agent-authored proposal JSON file.
 *
 * Used to pass as `acceptId` to evolve so the `--refine --ingest` path applies
 * the proposal through the double-loop gate (F024) rather than just persisting it.
 */
function readProposalId(proposalPath: string): string | undefined {
    const raw = readFileSync(proposalPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && 'proposal_id' in parsed) {
        const id = parsed.proposal_id;
        if (typeof id === 'string') return id;
    }
    return undefined;
}

/**
 * Merge/migrate skills into a destination file.
 *
 * **Deterministic merge core** (ships independent of Phase 4 — R3, R5):
 * resolves sources via `resolveContentPath` (F007), merges frontmatter (union with
 * documented conflict policy) + bodies (concatenate/dedupe) via `content/frontmatter.ts`,
 * and writes the merged skill to `<dest>`. This alone is a usable migrate.
 *
 * **Refinement layer** (`--refine`, routes through F023 generation seam — R4, R8):
 * - `--refine` alone → `evolve --propose-only --json` envelope-out (generation briefs, no model call — R7).
 * - `--refine --ingest <file>` → applies the agent-authored proposal through the double-loop
 *   gate (F024); a regressive merge is rejected and the file is restored to the deterministic merge.
 *
 * @param sources  Source skill names or paths (at least one required).
 * @param dest     Destination file path for the merged skill.
 * @param opts     Migrate options.
 * @returns        Result describing the merged file and refinement outcome.
 */
export async function migrateSkills(sources: string[], dest: string, opts?: MigrateOptions): Promise<MigrateResult> {
    if (sources.length === 0) {
        throw Object.assign(new Error('migrate requires at least one source skill'), { code: 1 });
    }

    // 1. Deterministic merge core (R3, R5) — usable alone, no Phase 4 dependency.
    const parsed = loadSources(sources);
    const destName = resolveContentName(dest);
    const mergedFm = mergeFrontmatter(parsed, destName);
    const mergedBody = mergeBodies(parsed);
    const mergedContent = serializeSkill(mergedFm, mergedBody);

    const destDir = dirname(dest);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    writeFileSync(dest, mergedContent);

    // 2. Refinement layer (R4, R8) — routes through the generation seam, no bespoke rewrite.
    if (opts?.refine) {
        if (opts.ingest) {
            // Ingest-in: apply agent-authored proposal through the double-loop gate (F024).
            const acceptId = readProposalId(opts.ingest);
            const result = await evolve('skill', dest, {
                ingest: opts.ingest,
                acceptId,
                target: opts.target,
                margin: opts.margin,
                adapter: opts.adapter,
            });
            if (result.rejected) {
                echo(`Refinement rejected: ${result.rejectionReason}. Merged skill restored to deterministic merge.`);
            }
            return {
                dest,
                envelopeOut: false,
                ...(result.rejected ? { rejected: true, rejectionReason: result.rejectionReason } : {}),
            };
        }
        // Envelope-out: emit generation briefs for the Author persona (no model call — R7).
        await evolve('skill', dest, {
            proposeOnly: true,
            json: true,
            target: opts.target,
            adapter: opts.adapter,
        });
        return { dest, envelopeOut: true };
    }

    return { dest, envelopeOut: false };
}
