import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { isGlobalSilent, logger, setGlobalSilent } from '../logger';

/**
 * Coverage target: plugins/cc/scripts/anti-hallucination/logger.ts (line/function >= 90%).
 *
 * Exercises the global-silent toggle and the silent/non-silent branches of `logger.log` and
 * `logger.error`. Output streams are mocked so assertions tie to the observable contract
 * (forwarded args) without coupling to log-format plumbing.
 */

const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
    setGlobalSilent(false);
});

afterEach(() => {
    setGlobalSilent(false);
    console.log = originalLog;
    console.error = originalError;
});

describe('isGlobalSilent / setGlobalSilent', () => {
    test('defaults to false', () => {
        expect(isGlobalSilent()).toBe(false);
    });

    test('reflects the most recent setGlobalSilent call', () => {
        setGlobalSilent(true);
        expect(isGlobalSilent()).toBe(true);

        setGlobalSilent(false);
        expect(isGlobalSilent()).toBe(false);
    });

    test('setGlobalSilent returns void', () => {
        const result = setGlobalSilent(true);
        expect(result).toBeUndefined();
    });
});

describe('logger.log', () => {
    test('forwards args to console.log when not silent', () => {
        const logSpy = mock((..._args: unknown[]) => undefined);
        console.log = logSpy;

        logger.log('hello', 42, { key: 'value' });

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0]).toEqual(['hello', 42, { key: 'value' }]);
    });

    test('suppresses output when global silent is true', () => {
        const logSpy = mock((..._args: unknown[]) => undefined);
        console.log = logSpy;
        setGlobalSilent(true);

        logger.log('should not appear');

        expect(logSpy).not.toHaveBeenCalled();
    });

    test('forwards zero arguments to console.log', () => {
        const logSpy = mock((..._args: unknown[]) => undefined);
        console.log = logSpy;

        logger.log();

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0]).toEqual([]);
    });
});

describe('logger.error', () => {
    test('forwards args to console.error when not silent', () => {
        const errorSpy = mock((..._args: unknown[]) => undefined);
        console.error = errorSpy;

        logger.error('boom', new Error('cause'));

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0]).toEqual(['boom', expect.any(Error)]);
    });

    test('suppresses output when global silent is true', () => {
        const errorSpy = mock((..._args: unknown[]) => undefined);
        console.error = errorSpy;
        setGlobalSilent(true);

        logger.error('should not appear');

        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('forwards zero arguments to console.error', () => {
        const errorSpy = mock((..._args: unknown[]) => undefined);
        console.error = errorSpy;

        logger.error();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy.mock.calls[0]).toEqual([]);
    });
});

describe('logger methods share the silent toggle', () => {
    test('enabling silent suppresses both log and error', () => {
        const logSpy = mock((..._args: unknown[]) => undefined);
        const errorSpy = mock((..._args: unknown[]) => undefined);
        console.log = logSpy;
        console.error = errorSpy;
        setGlobalSilent(true);

        logger.log('a');
        logger.error('b');

        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('disabling silent re-enables both log and error', () => {
        const logSpy = mock((..._args: unknown[]) => undefined);
        const errorSpy = mock((..._args: unknown[]) => undefined);
        console.log = logSpy;
        console.error = errorSpy;

        setGlobalSilent(true);
        logger.log('suppressed');
        setGlobalSilent(false);
        logger.log('emitted');

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy.mock.calls[0]).toEqual(['emitted']);
    });
});
