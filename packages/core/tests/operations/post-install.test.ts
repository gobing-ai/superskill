import { describe, expect, it } from 'bun:test';
import {
    createPostInstallRegistry,
    type PostInstallAction,
    type PostInstallContext,
    type PostInstallResult,
    runPostInstallActions,
} from '../../src/operations/post-install';

const CTX: PostInstallContext = {
    target: 'pi',
    plugin: 'demo',
    installRoot: '/root',
    stagingRoot: '/staging',
    dryRun: false,
};

function action(
    id: string,
    overrides: Partial<PostInstallAction> = {},
    result: PostInstallResult = { writtenFiles: [], messages: [id] },
): PostInstallAction {
    return {
        id,
        preview: () => result,
        apply: () => result,
        ...overrides,
    };
}

describe('runPostInstallActions (task 0130 mechanism)', () => {
    it('runs actions once in registration order and returns ordered results (apply path)', async () => {
        const calls: string[] = [];
        const results = await runPostInstallActions(CTX, [
            action('a', {
                apply: () => {
                    calls.push('a');
                    return { writtenFiles: ['/root/a'], messages: ['a done'] };
                },
            }),
            action('b', {
                apply: () => {
                    calls.push('b');
                    return { writtenFiles: [], messages: ['b done'] };
                },
            }),
        ]);
        expect(calls).toEqual(['a', 'b']);
        expect(results.map((r) => r.messages)).toEqual([['a done'], ['b done']]);
        expect(results[0]?.writtenFiles).toEqual(['/root/a']);
    });

    it('dry-run invokes preview only', async () => {
        let applied = 0;
        let previewed = 0;
        const results = await runPostInstallActions({ ...CTX, dryRun: true }, [
            action('a', {
                preview: () => {
                    previewed += 1;
                    return { writtenFiles: [], messages: ['would do a'] };
                },
                apply: () => {
                    applied += 1;
                    return { writtenFiles: ['/root/a'], messages: ['did a'] };
                },
            }),
        ]);
        expect(previewed).toBe(1);
        expect(applied).toBe(0);
        expect(results[0]?.writtenFiles).toEqual([]); // previews report no written files
        expect(results[0]?.messages).toEqual(['would do a']);
    });

    it('propagates failures carrying the target and action identity', async () => {
        await expect(
            runPostInstallActions(CTX, [
                action('a'),
                action('b', {
                    apply: () => {
                        throw new Error('boom');
                    },
                }),
            ]),
        ).rejects.toThrow(/post-install action 'b' failed for target 'pi': boom/);
    });

    it('rejects duplicate action ids for one target', async () => {
        await expect(runPostInstallActions(CTX, [action('dup'), action('dup')])).rejects.toThrow(
            /duplicate post-install action id 'dup' for target 'pi'/,
        );
    });

    it('no actions is a no-op', async () => {
        expect(await runPostInstallActions(CTX, [])).toEqual([]);
    });
});

describe('createPostInstallRegistry (task 0130 registration)', () => {
    it('absent target is a no-op', () => {
        expect(createPostInstallRegistry().resolve('pi')).toEqual([]);
    });

    it('resolves registered actions in order and rejects duplicate ids per target', () => {
        const registry = createPostInstallRegistry();
        registry.register('pi', action('one'));
        registry.register('pi', action('two'));
        expect(registry.resolve('pi').map((a) => a.id)).toEqual(['one', 'two']);
        expect(() => registry.register('pi', action('one'))).toThrow(
            /duplicate post-install action id 'one' for target 'pi'/,
        );
    });

    it('a second-target synthetic action registers and runs through the same dispatcher (no runner change)', async () => {
        const registry = createPostInstallRegistry();
        // Synthetic second target ('claude'): registers and dispatches identically.
        registry.register(
            'claude',
            action('claude/ext', { apply: () => ({ writtenFiles: ['/x'], messages: ['ext ran'] }) }),
        );
        const results = await runPostInstallActions({ ...CTX, target: 'claude' }, registry.resolve('claude'));
        expect(results).toEqual([{ writtenFiles: ['/x'], messages: ['ext ran'] }]);
    });
});
