import { describe, expect, it } from 'bun:test';
import { CLAUDE_HOOK_EVENTS, CLAUDE_TO_CANONICAL_EVENT, KNOWN_HOOK_EVENTS } from '../../src/content/hook-events';

// Membership checks against a readonly tuple of literal types require a widened view.
const EVENTS_AS_STRINGS: readonly string[] = CLAUDE_HOOK_EVENTS;

describe('hook-events', () => {
    describe('CLAUDE_HOOK_EVENTS', () => {
        it('includes the core Claude Code events that shipped the bug-041 drift', () => {
            // UserPromptSubmit was silently dropped because quality/hook.ts omitted it.
            // This test pins it in the canonical set so validate() accepts it.
            expect(EVENTS_AS_STRINGS).toContain('UserPromptSubmit');
        });

        it('includes the 9 events the old quality/hook.ts set recognized', () => {
            const oldSet = [
                'PreToolUse',
                'PostToolUse',
                'Stop',
                'SubagentStop',
                'SessionStart',
                'SessionEnd',
                'PreCompact',
                'Notification',
            ];
            for (const e of oldSet) {
                expect(EVENTS_AS_STRINGS).toContain(e);
            }
        });

        it('is a superset of every key in the canonical-event map', () => {
            // R6 acceptance: every mapper key must be a known event — prevents a future
            // validate() warning on an event the mapper converts fine.
            const eventSet = new Set<string>(CLAUDE_HOOK_EVENTS);
            for (const key of Object.keys(CLAUDE_TO_CANONICAL_EVENT)) {
                expect(eventSet.has(key)).toBe(true);
            }
        });
    });

    describe('KNOWN_HOOK_EVENTS alias', () => {
        it('is the same reference as CLAUDE_HOOK_EVENTS (backward-compat)', () => {
            expect(KNOWN_HOOK_EVENTS).toBe(CLAUDE_HOOK_EVENTS);
        });
    });

    describe('CLAUDE_TO_CANONICAL_EVENT', () => {
        it('maps UserPromptSubmit to the rulesync beforeSubmitPrompt canonical name', () => {
            // bug-041 regression guard: the whole point of unifying the taxonomy was
            // that UserPromptSubmit (Claude native) maps to beforeSubmitPrompt (rulesync).
            expect(CLAUDE_TO_CANONICAL_EVENT.UserPromptSubmit).toBe('beforeSubmitPrompt');
        });

        it('maps every Claude event to a non-empty lowercase-first canonical name', () => {
            for (const [claudeEvent, canonical] of Object.entries(CLAUDE_TO_CANONICAL_EVENT)) {
                // Canonical names start lowercase (camelCase). Interior capitals are expected.
                expect(canonical.length).toBeGreaterThan(0);
                expect(canonical[0]).toMatch(/[a-z]/);
                expect(claudeEvent.length).toBeGreaterThan(0);
            }
        });
    });
});
