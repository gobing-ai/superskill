import { readFileSync } from 'node:fs';
import { migrateSkillsDeterministic, type Target } from '@gobing-ai/superskill-core';
import { echo } from '@gobing-ai/ts-utils';
import type { DbAdapter } from '../store';
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
    migrateSkillsDeterministic(sources, dest);

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
