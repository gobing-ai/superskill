/**
 * Non-blocking stdin reader shared by the script/hook dispatchers.
 *
 * WHY this exists: hook and script runners are spawned by agent hosts that pipe a
 * JSON payload on fd 0. A plain synchronous fd-0 read blocks forever when a host opens
 * the pipe but never writes and never closes it (observed with Antigravity), which
 * hangs the agent mid-run. Reading through stream events with a bounded budget keeps
 * a silent host from stalling the process.
 *
 * The budget is an **idle** timeout, never a deadline on the whole read: it is re-armed
 * on every chunk. A single fixed deadline drops a payload a host writes late and
 * truncates any payload it streams in more than one write — and because every runner
 * fails open on an unparseable payload (`hook-run.ts` `runSpTaskWriteGuard`,
 * `runStopGuard`), a truncated read silently converts a `deny` into an `allow`. Only
 * genuine idleness may end the read.
 */

/** Default idle budget, in ms, for the first stdin byte and between chunks. */
export const DEFAULT_STDIN_TIMEOUT_MS = 250;

/**
 * Resolve the default stdin idle budget, honoring `SUPERSKILL_STDIN_TIMEOUT_MS` so a
 * host with unusual piping latency can be tuned without a code change. Non-numeric or
 * non-positive values fall back to {@link DEFAULT_STDIN_TIMEOUT_MS}.
 */
export function resolveStdinTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
    const parsed = Number.parseInt(env.SUPERSKILL_STDIN_TIMEOUT_MS ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STDIN_TIMEOUT_MS;
}

/**
 * Read piped stdin without blocking indefinitely.
 *
 * Returns `undefined` on an interactive terminal (no host piped anything), when the
 * stream errors, or when nothing arrives within `firstByteMs`. Once data starts
 * flowing the read continues until `end`, bounded only by `idleMs` of silence between
 * chunks — so a multi-write payload is never truncated. Whitespace-only input reads as
 * `undefined`, matching the original TTY-guarded reader's contract.
 *
 * @param firstByteMs How long to wait for the first byte before giving up.
 * @param idleMs How long to tolerate silence between chunks once data has started.
 */
export async function readStdinNonBlocking(
    firstByteMs = resolveStdinTimeoutMs(),
    idleMs = firstByteMs,
): Promise<string | undefined> {
    if (process.stdin.isTTY) return undefined;
    return new Promise((resolve) => {
        let data = '';
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        function cleanup() {
            if (timer !== undefined) clearTimeout(timer);
            process.stdin.removeListener('data', onData);
            process.stdin.removeListener('end', onEnd);
            process.stdin.removeListener('error', onError);
        }

        function settle(value: string | undefined) {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
        }

        /** Re-arm the idle timer; any pending deadline is discarded. */
        function arm(ms: number) {
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(() => settle(data.trim().length > 0 ? data : undefined), ms);
        }

        function onData(chunk: string | Buffer) {
            data += chunk.toString();
            arm(idleMs);
        }

        function onEnd() {
            settle(data.trim().length > 0 ? data : undefined);
        }

        function onError() {
            settle(undefined);
        }

        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', onData);
        process.stdin.on('end', onEnd);
        process.stdin.on('error', onError);
        process.stdin.resume();
        arm(firstByteMs);
    });
}
