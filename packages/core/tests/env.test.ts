import { afterEach, describe, expect, it } from 'bun:test';
import { getEnvVar, getEnvVars, removeEnvVar, setEnvVar } from '../src/env';

const PROBE = 'SUPERSKILL_ENV_GATEWAY_PROBE';

afterEach(() => {
    removeEnvVar(PROBE);
});

describe('env gateway (packages/core/src/env.ts)', () => {
    it('returns the fallback only for an unset variable', () => {
        removeEnvVar(PROBE);
        expect(getEnvVar(PROBE)).toBeUndefined();
        expect(getEnvVar(PROBE, 'fallback')).toBe('fallback');
    });

    it('treats an empty string as a set value, not a fallback trigger', () => {
        setEnvVar(PROBE, '');
        expect(getEnvVar(PROBE)).toBe('');
        expect(getEnvVar(PROBE, 'fallback')).toBe('');
    });

    it('setEnvVar stores a value visible via getEnvVar', () => {
        setEnvVar(PROBE, 'value');
        expect(getEnvVar(PROBE)).toBe('value');
    });

    it('setEnvVar with undefined removes the key (restores absence exactly)', () => {
        setEnvVar(PROBE, 'value');
        setEnvVar(PROBE, undefined);
        expect(getEnvVar(PROBE)).toBeUndefined();
        expect(PROBE in getEnvVars()).toBe(false);
    });

    it('getEnvVars returns the live record, not a copy', () => {
        setEnvVar(PROBE, 'live');
        expect(getEnvVars()[PROBE]).toBe('live');
        getEnvVars()[PROBE] = 'mutated';
        expect(getEnvVar(PROBE)).toBe('mutated');
    });

    it('removeEnvVar on an absent key is a no-op', () => {
        removeEnvVar(PROBE);
        expect(() => removeEnvVar(PROBE)).not.toThrow();
        expect(getEnvVar(PROBE)).toBeUndefined();
    });
});
