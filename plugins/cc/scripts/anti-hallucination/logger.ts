/**
 * Minimal self-contained logger for the embedded anti-hallucination scripts.
 *
 * The skill migrated verbatim from Spur (task 0041); it carries its own tiny logger so the
 * scripts/tests run in the cc plugin without depending on the host plugin's shared logger. API is
 * exactly the subset the scripts + tests use: `logger.log` plus the global-silent toggle
 * (`isGlobalSilent` / `setGlobalSilent`).
 */

let globalSilent = false;

/** Whether all logger output is currently suppressed. */
export function isGlobalSilent(): boolean {
    return globalSilent;
}

/** Suppress (or re-enable) all logger output — used by tests to keep the runner quiet. */
export function setGlobalSilent(silent: boolean): void {
    globalSilent = silent;
}

export const logger = {
    log: (...args: unknown[]): void => {
        if (globalSilent) return;
        console.log(...args);
    },
    error: (...args: unknown[]): void => {
        if (globalSilent) return;
        console.error(...args);
    },
};
