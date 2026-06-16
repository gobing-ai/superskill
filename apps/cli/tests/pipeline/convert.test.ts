import { describe, expect, it } from 'bun:test';
import { ConversionPipeline } from '../../src/pipeline/convert';

describe('ConversionPipeline', () => {
    it('runs no stages when none registered', () => {
        const pipeline = new ConversionPipeline();
        expect(pipeline.run('hello', 'codex')).toBe('hello');
    });

    it('runs a single stage', () => {
        const pipeline = new ConversionPipeline();
        pipeline.registerStage('codex', (c) => c.toUpperCase());
        expect(pipeline.run('hello', 'codex')).toBe('HELLO');
    });

    it('runs stages in registration order', () => {
        const pipeline = new ConversionPipeline();
        pipeline.registerStage('codex', (c) => `${c}!`);
        pipeline.registerStage('codex', (c) => c.repeat(2));
        // First: "hello" → "hello!", then: "hello!" → "hello!hello!"
        expect(pipeline.run('hello', 'codex')).toBe('hello!hello!');
    });

    it('stages are per-target', () => {
        const pipeline = new ConversionPipeline();
        pipeline.registerStage('codex', (c) => c.toUpperCase());
        pipeline.registerStage('pi', (c) => `[pi] ${c}`);
        expect(pipeline.run('hello', 'codex')).toBe('HELLO');
        expect(pipeline.run('hello', 'pi')).toBe('[pi] hello');
    });

    it('registerStageFor adds stage to multiple targets', () => {
        const pipeline = new ConversionPipeline();
        pipeline.registerStageFor(['codex', 'pi', 'opencode'], (c) => c.toUpperCase());
        expect(pipeline.run('x', 'codex')).toBe('X');
        expect(pipeline.run('x', 'pi')).toBe('X');
        expect(pipeline.run('x', 'opencode')).toBe('X');
        expect(pipeline.run('x', 'claude')).toBe('x'); // not registered
    });

    it('hasStages returns false for unregistered target', () => {
        const pipeline = new ConversionPipeline();
        expect(pipeline.hasStages('codex')).toBe(false);
    });

    it('hasStages returns true after registration', () => {
        const pipeline = new ConversionPipeline();
        pipeline.registerStage('codex', (c) => c);
        expect(pipeline.hasStages('codex')).toBe(true);
    });
});
