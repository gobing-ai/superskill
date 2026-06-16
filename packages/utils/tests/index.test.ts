import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { add, logger } from '../src/index';

describe('add', () => {
    it('sums two numbers', () => {
        expect(add(2, 3)).toBe(5);
    });
});

describe('logger', () => {
    let stdoutCalls: string[];
    let origWrite: typeof Bun.write;

    beforeEach(() => {
        stdoutCalls = [];
        origWrite = Bun.write;
        Bun.write = ((dest: unknown, data: Uint8Array) => {
            if (dest === Bun.stdout) stdoutCalls.push(new TextDecoder().decode(data));
            return Promise.resolve(data.length);
        }) as typeof Bun.write;
    });

    afterEach(() => {
        Bun.write = origWrite;
    });

    it('info writes a newline-terminated line', () => {
        logger.info('hello');
        expect(stdoutCalls).toEqual(['hello\n']);
    });

    it('out writes without trailing newline', () => {
        logger.out('7\n');
        expect(stdoutCalls).toEqual(['7\n']);
    });

    it('error writes to Bun.stderr', () => {
        const stderrCalls: string[] = [];
        Bun.write = ((dest: unknown, data: Uint8Array) => {
            const text = new TextDecoder().decode(data);
            if (dest === Bun.stderr) stderrCalls.push(text);
            return Promise.resolve(data.length);
        }) as typeof Bun.write;

        logger.error('oops');
        expect(stderrCalls).toEqual(['oops\n']);
    });
});
