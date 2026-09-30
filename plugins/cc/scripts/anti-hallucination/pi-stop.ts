import { runStopGuard } from './ah_guard';

interface SettleEvent {
    outcome: string;
    entries: unknown[];
    context: { pendingMessages: unknown[]; llmMessages: unknown[] };
}

interface SettleResult {
    continue: true;
    entries: unknown[];
}

/** Structural subset of Pi 0.99.1's native extension API; no SDK runtime dependency. */
export interface PiStopHost {
    on(event: 'session_start', handler: () => void): unknown;
    on(event: 'input', handler: (event: { source: string }) => void): unknown;
    on(event: 'agent_before_settle', handler: (event: SettleEvent) => SettleResult | undefined): unknown;
}

/** Enforce the shared guard at Pi's actionable settlement boundary, once per user input. */
export default function installGuard(pi: PiStopHost): void {
    let continued = false;
    pi.on('session_start', () => {
        continued = false;
    });
    pi.on('input', (event) => {
        if (event.source !== 'extension') continued = false;
    });
    pi.on('agent_before_settle', (event) => {
        if (continued || event.outcome !== 'completed' || event.context.pendingMessages.length > 0) return;
        const result = JSON.parse(
            runStopGuard(undefined, JSON.stringify({ messages: event.context.llmMessages })).output,
        );
        if (result.decision !== 'block') return;
        continued = true;
        return {
            continue: true,
            entries: [
                ...event.entries,
                {
                    type: 'custom_message',
                    customType: 'cc-anti-hallucination',
                    content: result.reason,
                    display: true,
                },
            ],
        };
    });
}
