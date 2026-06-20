import type { Target } from '../targets';

/** A pipeline stage is a pure transformation function. */
export type Stage = (content: string) => string;

/**
 * Per-target pipeline of named stages.
 * All stages are pure — no side effects, no filesystem access.
 */
export class ConversionPipeline {
    private readonly stages: Map<Target, Stage[]>;

    constructor() {
        this.stages = new Map<Target, Stage[]>();
    }

    /** Register a stage for a specific target. Order is preserved. */
    registerStage(target: Target, stage: Stage): void {
        const list = this.stages.get(target);
        if (list) {
            list.push(stage);
        } else {
            this.stages.set(target, [stage]);
        }
    }

    /** Register the same stage for multiple targets. */
    registerStageFor(targets: Target[], stage: Stage): void {
        for (const target of targets) {
            this.registerStage(target, stage);
        }
    }

    /** Run all registered stages for a target in registration order. */
    run(content: string, target: Target): string {
        const stages = this.stages.get(target);
        if (!stages) return content;
        let result = content;
        for (const stage of stages) {
            result = stage(result);
        }
        return result;
    }

    /** Return true when at least one stage is registered for the target. */
    hasStages(target: Target): boolean {
        return (this.stages.get(target)?.length ?? 0) > 0;
    }
}
