/**
 * Bot probe receipt reader (task 0160 / feature D1 R1+R2).
 *
 * Schema version 1 of the receipt a Grok Bot writes from `cc-grok-bot-probe`.
 * The CLI never probes a host itself (ADR-036, Q&A 2026-11-04): the Bot
 * produces the receipt, doctor only reads it. The receipt is untrusted
 * Bot-written data: validate, strip unknown keys/ids, cap sizes, and never
 * echo raw file content in an error.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Frozen receipt schema version; any addition bumps this and only this. */
export const GROK_BOT_PROBE_SCHEMA_VERSION = 1;
/** Frozen receipt `kind` discriminator. */
export const GROK_BOT_PROBE_KIND = 'superskill.grok-bot.probe';
/** A receipt older than this many days reports `stale` (Q&A 2026-11-04). */
export const GROK_BOT_PROBE_STALE_DAYS = 30;
/** Largest accepted receipt file; larger files are `invalid`. */
export const GROK_BOT_PROBE_MAX_BYTES = 65536;
/** Largest accepted `value`/`evidence` string; longer values are a schema failure. */
export const GROK_BOT_PROBE_MAX_VALUE_CHARS = 200;

/** The eight feature-D1 P0 capability ids (frozen set, see `GROK_BOT_PROBE_CAPABILITY_IDS`). */
export type GrokBotProbeCapabilityId =
    | 'host-os-arch'
    | 'host-home'
    | 'sand-env'
    | 'sand-roots'
    | 'skill-save'
    | 'plugin-install'
    | 'runtime-persistence'
    | 'mcp-command';

/** Canonical id list and single source of truth; report entries keep this order. */
export const GROK_BOT_PROBE_CAPABILITY_IDS = [
    'host-os-arch',
    'host-home',
    'sand-env',
    'sand-roots',
    'skill-save',
    'plugin-install',
    'runtime-persistence',
    'mcp-command',
] as const satisfies readonly GrokBotProbeCapabilityId[];

//** Per-capability status: exercised/read (`observed`), confirmed missing (`absent`), not determined (`unverified`). */
export type GrokBotProbeStatus = 'observed' | 'absent' | 'unverified';
//** Doctor's view of the receipt file itself, separate from catalog health. */
export type GrokBotProbeReceiptState = 'missing' | 'invalid' | 'stale' | 'valid';

/** One capability row as reported by the Bot. */
export interface GrokBotProbeEntry {
    id: GrokBotProbeCapabilityId;
    status: GrokBotProbeStatus;
    value: string | string[] | null;
    evidence: string | null;
}

/** Schema-version-1 receipt as written by `cc-grok-bot-probe` on the Bot host. */
export interface GrokBotProbeReceipt {
    schemaVersion: number;
    kind: string;
    generatedAt: string;
    capabilities: GrokBotProbeEntry[];
}

/** Read-only probe-receipt view consumed by `GrokBotDoctorReport.capabilities` (task 0160). */
export interface GrokBotProbeReport {
    state: GrokBotProbeReceiptState;
    path: string | null;
    generatedAt: string | null;
    entries: GrokBotProbeEntry[];
    missingIds: GrokBotProbeCapabilityId[];
    problem: string | null;
}

/** Default receipt location under a resolved Sand data root. */
export function grokBotProbeReceiptPath(dataRoot: string): string {
    return join(dataRoot, '.superskill', 'grok-bot', 'probe', 'receipt.json');
}

/** ISO-8601 UTC with the single legal `Z` spelling — anything else is a schema failure (AC2). */
function isIsoUtc(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) return false;
    return !Number.isNaN(Date.parse(value));
}

const probeValueSchema = z.union([
    z.string().max(GROK_BOT_PROBE_MAX_VALUE_CHARS),
    z.array(z.string().max(GROK_BOT_PROBE_MAX_VALUE_CHARS)).max(64),
    z.null(),
]);

const probeEntrySchema = z.object({
    id: z.string().min(1),
    status: z.enum(['observed', 'absent', 'unverified']),
    value: probeValueSchema.optional().default(null),
    evidence: z.string().max(GROK_BOT_PROBE_MAX_VALUE_CHARS).nullish().default(null),
});

const probeReceiptSchema = z.object({
    schemaVersion: z.literal(GROK_BOT_PROBE_SCHEMA_VERSION),
    kind: z.literal(GROK_BOT_PROBE_KIND),
    generatedAt: z.string().refine(isIsoUtc, 'non-ISO generatedAt'),
    capabilities: z.array(probeEntrySchema),
});

function missing(path: string | null, problem: string | null = null): GrokBotProbeReport {
    return { state: 'missing', path, generatedAt: null, entries: [], missingIds: [], problem };
}

function invalid(path: string | null, problem: string): GrokBotProbeReport {
    return { state: 'invalid', path, generatedAt: null, entries: [], missingIds: [], problem };
}

/**
 * Never-throwing receipt reader (R3). Precedence: null path → missing; stat
 * fails → missing; size > 64 KiB → invalid; unparseable → invalid; schema
 * fails → invalid; otherwise valid, then stale when older than 30 days.
 * Entries are re-ordered to the canonical id list, unknown ids are dropped,
 * omitted ids land in `missingIds`.
 */
export function readGrokBotProbeReceipt(input: { path: string | null; now?: Date }): GrokBotProbeReport {
    const { path } = input;
    if (path === null) return missing(null);
    let size: number;
    try {
        const stat = statSync(path);
        // AC2: statSync follows links, so a directory — or a symlink resolving to one — is invalid, not missing.
        if (!stat.isFile()) return invalid(path, 'receipt path is not a regular file');
        size = stat.size;
    } catch {
        return missing(path);
    }
    if (size > GROK_BOT_PROBE_MAX_BYTES) return invalid(path, `receipt larger than ${GROK_BOT_PROBE_MAX_BYTES} bytes`);
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return invalid(path, 'receipt is not valid JSON');
    }
    const decoded = probeReceiptSchema.safeParse(parsed);
    if (!decoded.success) return invalid(path, 'receipt does not match probe schema version 1');
    const seen = new Set<string>();
    for (const capability of decoded.data.capabilities) {
        if (seen.has(capability.id)) return invalid(path, `duplicate capability id: ${capability.id}`);
        seen.add(capability.id);
    }
    const entries: GrokBotProbeEntry[] = [];
    const missingIds: GrokBotProbeCapabilityId[] = [];
    for (const id of GROK_BOT_PROBE_CAPABILITY_IDS) {
        const capability = decoded.data.capabilities.find((capability) => capability.id === id);
        if (!capability) {
            missingIds.push(id);
            continue;
        }
        entries.push({
            id,
            status: capability.status,
            value: capability.value,
            evidence: capability.evidence,
        });
    }
    const report: GrokBotProbeReport = {
        state: 'valid',
        path,
        generatedAt: decoded.data.generatedAt,
        entries,
        missingIds,
        problem: null,
    };
    // Injectable clock for tests; real time when omitted.
    const now = input.now?.getTime() ?? Date.now();
    const ageMs = now - Date.parse(decoded.data.generatedAt);
    if (ageMs > GROK_BOT_PROBE_STALE_DAYS * 24 * 60 * 60 * 1000) return { ...report, state: 'stale' };
    return report;
}
