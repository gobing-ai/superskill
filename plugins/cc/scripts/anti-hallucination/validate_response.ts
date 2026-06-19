#!/usr/bin/env bun

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
