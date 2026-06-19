#!/usr/bin/env bun
/**
 * Anti-Hallucination Guard - Stop Hook for Claude Code
 *
 * This script enforces the anti-hallucination protocol by verifying that
 * responses include proper source citations, confidence levels,
 * and evidence of verification tool usage.
 *
 * Environment Variables:
 *     ARGUMENTS    - JSON string containing Stop hook context with:
 *                    - messages: Array of conversation messages
 *                    - last_message: Most recent assistant message
 *
 * Exit Codes:
 *     0 - Allow stop (protocol followed)
 *     1 - Deny stop (protocol not followed, outputs JSON with reason)
 *
 * Output Format (stdout):
 *     {"ok": true, "reason": "Task is complete"}           # Allow stop
 *     {"ok": false, "reason": "Add verification for ..."}  # Deny stop
 */

import { logger } from './logger';

// =============================================================================
// VERIFICATION PATTERNS
// =============================================================================

// Source citation patterns (no 'g' flag to avoid stateful lastIndex)
const SOURCE_PATTERNS = [
    /\[Source:\s*[^\]]+\]/i, // [Source: URL or Title]
    /Source:\s*\[?[^\n]+\]?/i, // Source: URL or Title
    /Sources:\s*\n\s*-\s*\[?[^\n]+\]/i, // Sources: list format
    /https?:\/\/[^\s)]+/i, // Any HTTP/HTTPS URL
    /\*\*Source\*\*:\s*[^\n]+/i, // Markdown bold Source:
];

// Confidence level patterns (no 'g' flag to avoid stateful lastIndex)
const CONFIDENCE_PATTERNS = [
    /Confidence:\s*(HIGH|MEDIUM|LOW)/i,
    /\*\*Confidence\*\*:\s*(HIGH|MEDIUM|LOW)/i,
    /### Confidence/i,
];

// Verification tool usage patterns (evidence tools)
const TOOL_PATTERNS = [
    /ref_search_documentation/,
    /ref_read_url/,
    /searchCode/,
    /WebSearch/,
    /WebFetch/,
    /mcp__ref__ref_search_documentation/,
    /mcp__ref__ref_read_url/,
    /mcp__grep__searchCode/,
];

// Red flags - patterns that indicate claims without verification
const RED_FLAG_PATTERNS = [
    /I (?:think|believe|recall) (?:that|the)?/gi,
    /(?:It|This) (?:should|might|may|could)/gi,
    /Probably|Likely|Possibly/gi,
    /(?:As far as|If I) (?:know|recall)/gi,
];

// =============================================================================
// TYPES
// =============================================================================

interface VerificationResult {
    ok: boolean;
    reason: string;
    issues?: string[];
}

interface Message {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
}

interface HookContext {
    messages?: Message[];
    last_message?: string;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

export function extractLastAssistantMessage(context: HookContext): string | undefined {
    const messages = context.messages ?? [];

    // Find the last assistant message in messages array
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.role === 'assistant') {
            const content = message.content;
            if (Array.isArray(content)) {
                // Handle mixed content (text + tool_use)
                const textParts: string[] = [];
                for (const part of content) {
                    if (part.type === 'text' && part.text) {
                        textParts.push(part.text);
                    }
                }
                return textParts.join('\n');
            }
            return String(content);
        }
    }

    // Fallback to last_message if provided
    const lastMsg = context.last_message;
    if (lastMsg) {
        return String(lastMsg);
    }

    return undefined;
}

export function hasSourceCitations(text: string): boolean {
    if (!text) return false;

    for (const pattern of SOURCE_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

export function hasConfidenceLevel(text: string): boolean {
    if (!text) return false;

    for (const pattern of CONFIDENCE_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

export function hasToolUsageEvidence(text: string): boolean {
    if (!text) return false;

    for (const pattern of TOOL_PATTERNS) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}

export function hasRedFlags(text: string): string[] {
    if (!text) return [];

    const foundFlags: string[] = [];
    for (const pattern of RED_FLAG_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            foundFlags.push(...matches);
        }
    }
    return foundFlags;
}

export function requiresExternalVerification(text: string): boolean {
    if (!text) return false;

    // Keywords that indicate external info is needed (all lowercase for textLower search)
    const verificationKeywords = [
        'api',
        'library',
        'framework',
        'method',
        'function',
        'version',
        'documentation',
        'official',
        /recent\s+(?:change|update|release)/i,
        /\d+\.\d+(?:\.\d+)?/, // Version numbers like 1.2.3
        /https?:\/\//, // URLs mentioned
    ];

    const textLower = text.toLowerCase();
    for (const keyword of verificationKeywords) {
        if (typeof keyword === 'string') {
            if (textLower.includes(keyword)) {
                return true;
            }
        } else if (keyword.test(textLower)) {
            return true;
        }
    }

    return false;
}

export function verifyAntiHallucinationProtocol(text: string): VerificationResult {
    if (!text || text.trim().length < 50) {
        // Empty or very short messages are OK
        return { ok: true, reason: 'Task is complete' };
    }

    // Check if content requires verification
    const needsVerification = requiresExternalVerification(text);

    if (!needsVerification) {
        // Internal discussion, no verification needed
        return { ok: true, reason: 'Task is complete (internal discussion)' };
    }

    // Check for source citations
    const hasSources = hasSourceCitations(text);

    // Check for confidence levels
    const hasConfidence = hasConfidenceLevel(text);

    // Check for tool usage evidence
    const hasTools = hasToolUsageEvidence(text);

    // Check for red flags
    const redFlags = hasRedFlags(text);

    // Decision logic
    const issues: string[] = [];

    if (!hasSources) {
        issues.push('source citations for API/library claims');
    }

    if (!hasConfidence) {
        issues.push('confidence level (HIGH/MEDIUM/LOW)');
    }

    if (redFlags.length > 0 && !hasTools) {
        const uniqueFlags = Array.from(new Set(redFlags)).slice(0, 3);
        issues.push(`uncertainty phrases detected: ${uniqueFlags.join(', ')}`);
    }

    if (issues.length > 0) {
        const reason = `Add verification for: ${issues.join(', ')}`;
        return { ok: false, reason, issues };
    }

    // If all checks pass
    return { ok: true, reason: 'Task is complete' };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

export function main(): number {
    // Read context from ARGUMENTS environment variable
    const argumentsJson = Bun.env.ARGUMENTS ?? '{}';

    let context: HookContext;
    try {
        context = JSON.parse(argumentsJson);
    } catch {
        // If ARGUMENTS is not valid JSON, check if it's empty
        if (!argumentsJson || argumentsJson === '{}') {
            // No context available - allow stop
            const output: VerificationResult = { ok: true, reason: 'Task is complete (no context)' };
            logger.log(JSON.stringify(output));
            return 0;
        }
        // Invalid JSON - warn but allow
        const output: VerificationResult = { ok: true, reason: 'Task is complete (invalid context ignored)' };
        logger.log(JSON.stringify(output));
        return 0;
    }

    // Extract the last assistant message
    const content = extractLastAssistantMessage(context);

    // Handle case where content couldn't be extracted
    if (content === undefined) {
        const output: VerificationResult = { ok: true, reason: 'No content to verify' };
        logger.log(JSON.stringify(output));
        return 0;
    }

    // Verify anti-hallucination protocol
    const result = verifyAntiHallucinationProtocol(content);

    logger.log(JSON.stringify(result));

    // Exit code: 0 = allow stop, 1 = deny stop
    return result.ok ? 0 : 1;
}

if (import.meta.main) {
    process.exit(main());
}
