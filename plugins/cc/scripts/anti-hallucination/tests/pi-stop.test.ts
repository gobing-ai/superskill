import { expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import installGuard, { type PiStopHost } from '../pi-stop';

it('declares the native Pi extension using the existing installer manifest contract', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../plugin.json', import.meta.url), 'utf8'));
    expect(manifest.extensions.pi).toEqual(['scripts/anti-hallucination/pi-stop.ts']);
});

it('continues Pi once for unsupported claims, preserves host boundaries, and resets on new user input', async () => {
    const handlers = new Map<string, (event: never) => unknown>();
    const host = {
        on(event: string, handler: (event: never) => unknown) {
            handlers.set(event, handler);
        },
    } as PiStopHost;
    installGuard(host);
    const emit = (name: string, event: unknown = {}) => handlers.get(name)?.(event as never);
    const claim = 'React version 99.0.0 is the latest release.';
    const boundary = (content: string, overrides = {}) => ({
        outcome: 'completed',
        entries: [{ type: 'custom', customType: 'other-extension', data: 'preserve' }],
        context: {
            canContinue: false,
            pendingMessages: [],
            llmMessages: [{ role: 'assistant', content }],
        },
        ...overrides,
    });
    expect(emit('agent_before_settle', boundary('Done. Tests passed.'))).toBeUndefined();
    expect(emit('agent_before_settle', boundary(claim, { outcome: 'aborted' }))).toBeUndefined();
    expect(emit('agent_before_settle', boundary(claim, { outcome: 'error' }))).toBeUndefined();
    expect(
        emit(
            'agent_before_settle',
            boundary(claim, {
                context: {
                    canContinue: true,
                    pendingMessages: [{}],
                    llmMessages: [{ role: 'assistant', content: claim }],
                },
            }),
        ),
    ).toBeUndefined();
    const feedback = emit('agent_before_settle', boundary(claim));
    expect(feedback).toMatchObject({
        continue: true,
        entries: [
            { type: 'custom', customType: 'other-extension', data: 'preserve' },
            { type: 'custom_message', customType: 'cc-anti-hallucination', display: true },
        ],
    });
    expect(JSON.stringify(feedback)).toContain('Add verification');
    expect(emit('agent_before_settle', boundary(claim))).toBeUndefined();
    emit('input', { source: 'extension' });
    expect(emit('agent_before_settle', boundary(claim))).toBeUndefined();
    emit('input', { source: 'interactive' });
    expect(emit('agent_before_settle', boundary(claim))).toMatchObject({ continue: true });
    emit('session_start');
    expect(emit('agent_before_settle', boundary(claim))).toMatchObject({ continue: true });
});
