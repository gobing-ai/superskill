import { afterEach, describe, expect, it } from 'bun:test';
import { DEFAULT_STDIN_TIMEOUT_MS, readStdinNonBlocking, resolveStdinTimeoutMs } from '../src/stdin';

/**
 * Contract of the shared non-blocking stdin reader.
 *
 * Two failure modes drove this suite, both observed in production behavior:
 *   1. A host that holds fd 0 open without ever writing or closing hangs the agent
 *      (the original `readFileSync(0)` blocked forever).
 *   2. A single fixed deadline drops a late payload and truncates a multi-write one.
 *      Because every runner fails open on an unparseable payload, a truncated read
 *      silently converts a guard `deny` into an `allow` — so "no truncation" is a
 *      security property here, not a nicety.
 */

const origTty = process.stdin.isTTY;

function setTty(value: boolean) {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
}

/** Emit `chunks` on stdin spaced `gapMs` apart, then optionally `end`. */
function emitChunks(chunks: string[], gapMs: number, thenEnd = true) {
    chunks.forEach((chunk, i) => {
        setTimeout(() => process.stdin.emit('data', Buffer.from(chunk)), gapMs * (i + 1));
    });
    if (thenEnd) setTimeout(() => process.stdin.emit('end'), gapMs * (chunks.length + 1));
}

afterEach(() => {
    // Restore the real TTY flag and stop the flowing-mode stdin the reader resumed, so
    // neither leaks into sibling suites.
    Object.defineProperty(process.stdin, 'isTTY', { value: origTty, configurable: true });
    process.stdin.pause();
});

describe('resolveStdinTimeoutMs', () => {
    it('defaults when SUPERSKILL_STDIN_TIMEOUT_MS is unset', () => {
        expect(resolveStdinTimeoutMs({})).toBe(DEFAULT_STDIN_TIMEOUT_MS);
    });

    it('honors a positive numeric override', () => {
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: '1500' })).toBe(1500);
    });

    it('falls back to the default on non-numeric or non-positive values', () => {
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: 'soon' })).toBe(DEFAULT_STDIN_TIMEOUT_MS);
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: '0' })).toBe(DEFAULT_STDIN_TIMEOUT_MS);
        expect(resolveStdinTimeoutMs({ SUPERSKILL_STDIN_TIMEOUT_MS: '-5' })).toBe(DEFAULT_STDIN_TIMEOUT_MS);
    });
});

describe('readStdinNonBlocking', () => {
    it('returns undefined on interactive TTY stdin', async () => {
        setTty(true);
        expect(await readStdinNonBlocking(10)).toBeUndefined();
    });

    it('returns accumulated text on stdin data + end events', async () => {
        setTty(false);
        const promise = readStdinNonBlocking(500);
        process.stdin.emit('data', Buffer.from('hello '));
        process.stdin.emit('data', Buffer.from('world'));
        process.stdin.emit('end');
        expect(await promise).toBe('hello world');
    });

    it('returns undefined on error event', async () => {
        setTty(false);
        const promise = readStdinNonBlocking(500);
        process.stdin.emit('error', new Error('stream error'));
        expect(await promise).toBeUndefined();
    });

    it('treats whitespace-only stdin as no input', async () => {
        setTty(false);
        const promise = readStdinNonBlocking(500);
        process.stdin.emit('data', Buffer.from('   \n\t '));
        process.stdin.emit('end');
        expect(await promise).toBeUndefined();
    });

    // Regression (hang): the reason this reader replaced the synchronous fd-0 read. A host that
    // opens the pipe and never writes must not stall the process — bounded, not blocked.
    //
    // This also covers the documented bounded-drop residual: a first byte arriving later than
    // `firstByteMs` is not waited for, and takes this exact branch (timer fires with no data).
    // Deliberately asserted WITHOUT scheduling a late `process.stdin.emit` — a timer that outlives
    // its test injects a stray chunk into whichever reader is listening next. That is not
    // hypothetical: an earlier revision of this suite emitted "too late" at +300ms and corrupted
    // `readPipedStdin`'s payload in the ah_guard suite, failing only under a two-file run order.
    it('gives up within the budget when a host holds stdin open without writing', async () => {
        setTty(false);
        const started = Date.now();
        const res = await readStdinNonBlocking(40);
        expect(res).toBeUndefined();
        expect(Date.now() - started).toBeLessThan(2000);
    });

    // Regression (truncation): each gap stays under the budget while the total span far
    // exceeds it. A fixed deadline resolves mid-stream here and returns partial JSON; the
    // idle timer must re-arm per chunk and deliver the whole payload.
    it('accumulates a payload streamed in chunks whose total span exceeds the budget', async () => {
        setTty(false);
        const payload = ['{"tool_name":"Write",', '"tool_input":{', '"file_path":"docs/tasks/x.md"', '}}'];
        const promise = readStdinNonBlocking(120);
        emitChunks(payload, 60);
        const res = await promise;
        expect(res).toBe(payload.join(''));
        // The security property that matters: the result is parseable, so the guard sees a
        // real payload instead of failing open on a truncated one.
        expect(() => JSON.parse(res as string)).not.toThrow();
    });
});
