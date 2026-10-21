import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_REASON_V1, HOOK_FEEDBACK_TAG } from '../ah_guard';

/**
 * WHY this file exists (drift gate, not coverage theatre).
 *
 * The v1 tag is quoted in three places that must move together: the guard that emits it, the
 * always-loaded rule module, and the persona instructions that reach targets without a rules
 * directory. A future `v2` bumps `HOOK_FEEDBACK_TAG`; this test then fails until the rule and the
 * persona carry the new literal, so a half-updated protocol cannot ship.
 *
 * The persona path is resolved at runtime: the package lives under the plugin tree since ADR-041,
 * and the legacy repo-root path is kept so the test reports a real failure rather than a missing
 * file if the package ever moves back.
 */

const PLUGIN_ROOT = join(import.meta.dir, '..', '..', '..');
const RULE_PATH = join(PLUGIN_ROOT, 'rules', '05-hook-feedback.md');
const PERSONA_CANDIDATES = [
    join(PLUGIN_ROOT, 'magents', 'team-stark-children', 'AGENTS.md'),
    join(import.meta.dir, '..', '..', '..', '..', '..', 'magents', 'team-stark-children', 'AGENTS.md'),
];

/** Resolve the persona AGENTS.md, failing loudly when neither known path exists. */
function resolvePersonaPath(): string {
    for (const candidate of PERSONA_CANDIDATES) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(`persona AGENTS.md not found at any of:\n${PERSONA_CANDIDATES.join('\n')}`);
}

/** The statements every surface carrying the protocol must state, in order. */
const REQUIRED_STATEMENTS: Array<[label: string, pattern: RegExp]> = [
    ['the versioned tag literal', new RegExp(HOOK_FEEDBACK_TAG.replace(/[[\]]/g, '\\$&'))],
    ['the UNVERIFIED reply form', /UNVERIFIED:/],
    ['the three-line bound', /three lines/],
    ['the "not from the user" statement', /not from the user/],
];

describe('hook-feedback protocol v1 — tag and instruction stay in sync', () => {
    it('the block reason starts with the exported tag', () => {
        expect(BLOCK_REASON_V1.startsWith(HOOK_FEEDBACK_TAG)).toBe(true);
    });

    it('the rule module states every required instruction', () => {
        const rule = readFileSync(RULE_PATH, 'utf-8');
        for (const [label, pattern] of REQUIRED_STATEMENTS) {
            expect(`${label}:${pattern.test(rule)}`).toBe(`${label}:true`);
        }
    });

    it('the persona instructions state every required instruction', () => {
        const persona = readFileSync(resolvePersonaPath(), 'utf-8');
        for (const [label, pattern] of REQUIRED_STATEMENTS) {
            expect(`${label}:${pattern.test(persona)}`).toBe(`${label}:true`);
        }
    });
});
