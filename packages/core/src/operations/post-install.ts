/**
 * Target post-install action mechanism (task 0130, ADR-037 / ADR-036).
 *
 * A generic, target-agnostic runner that executes ordered, id-stable actions
 * after a target's files are materialized and before its receipt/final
 * success. Actions are registered per target through `createPostInstallRegistry`
 * and run through `runPostInstallActions`; dry-run invocations run `preview`
 * only. Failures propagate loudly carrying the target/action identity.
 */

import type { InstallTarget } from '../targets';

/** Readonly context handed to every action; no target-specific fields. */
export interface PostInstallContext {
    readonly target: InstallTarget;
    readonly plugin: string;
    /** Absolute root the target materialized into (e.g. grok-bot Sand data root). */
    readonly installRoot: string;
    /** Absolute staging directory of the mapping; stays alive through action execution. */
    readonly stagingRoot: string;
    readonly dryRun: boolean;
}

/** Outcome of one post-install action run: files it wrote plus user-facing lines echoed by the command layer. */
export interface PostInstallResult {
    /** Absolute paths this action wrote; previews report none. */
    writtenFiles: string[];
    /** Concise user-facing lines echoed by the command layer. */
    messages: string[];
}

/** One unit of post-install work (e.g. Grok Bot registration handoff), shared by install and update. */
export interface PostInstallAction {
    /** Stable id; duplicates for one target are rejected at registration and run time. */
    readonly id: string;
    /** Describe intended effects without writing (dry-run). */
    preview(context: PostInstallContext): PostInstallResult | Promise<PostInstallResult>;
    /** Apply effects. Thrown errors propagate with target/action identity. */
    apply(context: PostInstallContext): PostInstallResult | Promise<PostInstallResult>;
}

/**
 * Transaction-scoped write capability an emission hands to its actions so
 * action writes share the target's rollback boundary. Fails if the write
 * cannot be journaled.
 */
export type TransactionalWrite = (absPath: string, content: string) => Promise<void>;

function errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Run registered actions once, in registration order. `dryRun` invokes
 * `preview` only. The first failing action aborts the run; the error carries
 * the target and action id.
 */
export async function runPostInstallActions(
    context: PostInstallContext,
    actions: readonly PostInstallAction[],
): Promise<PostInstallResult[]> {
    const seen = new Set<string>();
    for (const action of actions) {
        if (seen.has(action.id)) {
            throw new Error(`duplicate post-install action id '${action.id}' for target '${context.target}'`);
        }
        seen.add(action.id);
    }
    const results: PostInstallResult[] = [];
    for (const action of actions) {
        try {
            results.push(await (context.dryRun ? action.preview(context) : action.apply(context)));
        } catch (error) {
            throw new Error(
                `post-install action '${action.id}' failed for target '${context.target}': ${errorDetail(error)}`,
            );
        }
    }
    return results;
}

/** Registration seam the command layer uses to attach actions per install target before emission. */
export interface PostInstallRegistry {
    /** Register one action under a target key; duplicate ids per target are rejected. */
    register(target: InstallTarget, action: PostInstallAction): void;
    /** Actions for a target in registration order; absent target is a no-op. */
    resolve(target: InstallTarget): readonly PostInstallAction[];
}

/**
 * Fresh per-invocation registry. Targets add actions without touching the
 * runner; a second target registers and runs through the same dispatcher.
 */
export function createPostInstallRegistry(): PostInstallRegistry {
    const registry = new Map<InstallTarget, PostInstallAction[]>();
    return {
        register(target: InstallTarget, action: PostInstallAction): void {
            const actions = registry.get(target) ?? [];
            if (actions.some((existing) => existing.id === action.id)) {
                throw new Error(`duplicate post-install action id '${action.id}' for target '${target}'`);
            }
            actions.push(action);
            registry.set(target, actions);
        },
        resolve(target: InstallTarget): readonly PostInstallAction[] {
            return registry.get(target) ?? [];
        },
    };
}
