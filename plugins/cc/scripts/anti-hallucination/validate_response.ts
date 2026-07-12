#!/usr/bin/env bun
/**
 * Standalone response validator — NOT a hook adapter.
 *
 * Validates a response text (from `RESPONSE_TEXT` env or stdin) against the
 * anti-hallucination protocol and prints the `{ok, reason, issues?}` result JSON.
 *
 * Exit contract (validation-CLI semantics): 0 = protocol followed, 1 = violation.
 * This is deliberately NOT the hook block signal (hooks use exit 2 + stderr — see
 * `ah_guard.ts`). Do not wire this script into `hooks.json`; hosts would treat its
 * exit 1 as a non-blocking error, not a block. Use `superskill hook run cc
 * anti-hallucination` for hook enforcement.
 */

import { readFileSync } from 'node:fs';
import { verifyAntiHallucinationProtocol } from './ah_guard';
import { logger } from './logger';

interface ValidationResult {
    ok: boolean;
    reason: string;
    issues?: string[];
}

type ReadTextFile = (path: string, encoding: 'utf-8') => string;

export function validateResponseText(text: string | undefined): ValidationResult {
    if (!text || text.trim().length === 0) {
        return { ok: true, reason: 'No response text provided' };
    }

    return verifyAntiHallucinationProtocol(text);
}

export function readStdinText(readTextFile: ReadTextFile = readFileSync): string | undefined {
    try {
        const input = readTextFile('/dev/stdin', 'utf-8');
        return input.trim().length > 0 ? input : undefined;
    } catch {
        return undefined;
    }
}

export function main(): number {
    const responseText = Bun.env.RESPONSE_TEXT ?? readStdinText();
    const result = validateResponseText(responseText);

    logger.log(JSON.stringify(result));

    return result.ok ? 0 : 1;
}

if (import.meta.main) {
    process.exit(main());
}
