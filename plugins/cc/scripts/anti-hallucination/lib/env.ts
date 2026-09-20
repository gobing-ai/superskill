/**
 * Vendored env gateway for standalone plugin scripts (ADR-024): the anti-hallucination
 * scripts are staged and invoked by path on non-Claude targets, so they cannot import
 * workspace packages (`@gobing-ai/*` imports fail here — spur task 0669). This file is
 * an exact copy of `packages/core/src/env.ts`; keep the two in sync. The project-local
 * `boundary/env-var-hygiene` rule exempts both copies.
 */

/**
 * Read one environment variable. Only an unset variable yields `fallback`;
 * an empty string is a set value and is returned as-is.
 */
export function getEnvVar(name: string, fallback?: string): string | undefined {
    const raw = process.env[name];
    return raw === undefined ? fallback : raw;
}

/**
 * Read the live environment as a record. The returned object IS `process.env`
 * (not a copy): whole-record operations (`{ ...getEnvVars(), ...vars }`,
 * `Object.entries(getEnvVars())`) see later mutations, which child-spawn
 * composition relies on. For single variables prefer {@link getEnvVar},
 * {@link setEnvVar}, or {@link removeEnvVar}.
 */
export function getEnvVars(): Record<string, string | undefined> {
    return process.env;
}

/**
 * Set one environment variable through the sanctioned gateway. Passing
 * `undefined` removes the key, so the save/restore idiom
 * (`const prev = getEnvVar(k); … setEnvVar(k, prev)`) restores absence exactly.
 */
export function setEnvVar(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

/** Remove one environment variable; a no-op when the key is absent. */
export function removeEnvVar(name: string): void {
    delete process.env[name];
}
