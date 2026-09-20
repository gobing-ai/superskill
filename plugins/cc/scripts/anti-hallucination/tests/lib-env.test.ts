import { afterEach, describe, expect, it } from 'bun:test';
import { getEnvVar, getEnvVars, removeEnvVar, setEnvVar } from '../lib/env';

/**
 * Contract-parity coverage for the vendored gateway (ADR-024 twin of
 * packages/core/src/env.ts, covered by packages/core/tests/env.test.ts). The
 * project coverage gate runs per-file, so this copy carries its own suite.
 */
describe('vendored env gateway (lib/env)', () => {
    const KEY = 'SUPERSKILL_LIB_ENV_PROBE';

    afterEach(() => {
        removeEnvVar(KEY);
    });

    it('returns fallback only when the variable is unset', () => {
        removeEnvVar(KEY);
        expect(getEnvVar(KEY, 'fallback')).toBe('fallback');
        setEnvVar(KEY, '');
        expect(getEnvVar(KEY, 'fallback')).toBe('');
        setEnvVar(KEY, 'value');
        expect(getEnvVar(KEY, 'fallback')).toBe('value');
    });

    it('writes, restores absence via undefined, and reports the live record', () => {
        const hadKey = KEY in getEnvVars();
        const prev = getEnvVar(KEY);

        setEnvVar(KEY, 'v1');
        expect(getEnvVars()[KEY]).toBe('v1');
        setEnvVar(KEY, prev);
        if (!hadKey) removeEnvVar(KEY);
        expect(KEY in getEnvVars()).toBe(hadKey);
    });

    it('removeEnvVar is a no-op on an absent key', () => {
        removeEnvVar(KEY);
        expect(() => removeEnvVar(KEY)).not.toThrow();
    });
});
