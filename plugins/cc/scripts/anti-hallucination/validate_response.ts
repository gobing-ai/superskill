#!/usr/bin/env bun
/**
 * Standalone response validator — NOT a hook adapter.
 *
 * Validates a response text (from `RESPONSE_TEXT` env or stdin) against the
 * anti-hallucination protocol and prints the `{ok, reason, issues?}` result JSON.
 *
 * Exit contract (validation-CLI semantics): 0 = protocol followed, 1 = violation.
 * This is deliberately NOT the hook block signal (hooks emit canonical decision JSON
 * at exit 0 — see `ah_guard.ts`). Do not wire this script into `hooks.json`; hosts
 * would treat its exit 1 as a non-blocking error, not a block. Use
 * `superskill hook run cc anti-hallucination` for hook enforcement.
 */

import { readPipedStdin, verifyAntiHallucinationProtocol } from './ah_guard';
import { logger } from './logger';

interface ValidationResult {
    ok: boolean;
    reason: string;
    issues?: string[];
}

type ReadStdin = () => Promise<string>;

export function validateResponseText(text: string | undefined): ValidationResult {
    if (!text || text.trim().length === 0) {
        return { ok: true, reason: 'No response text provided' };
    }

    return verifyAntiHallucinationProtocol(text);
}

export async function readStdinText(
    readStdin: ReadStdin = readPipedStdin,
    isTty: boolean = Boolean(process.stdin.isTTY),
): Promise<string | undefined> {
    // A TTY means no caller piped a payload. Non-TTY reads reuse the engine's bounded,
    // idle-rearming reader so a host that holds fd 0 open cannot hang this adapter.
    if (isTty) return undefined;
    try {
        const input = await readStdin();
        return input.trim().length > 0 ? input : undefined;
    } catch {
        return undefined;
    }
}

export async function main(): Promise<number> {
    const responseText = process.env.RESPONSE_TEXT ?? (await readStdinText());
    const result = validateResponseText(responseText);

    logger.log(JSON.stringify(result));

    return result.ok ? 0 : 1;
}

if (import.meta.main) {
    process.exit(await main());
}
