import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { cwd } from 'node:process';

/** Options for data root resolution. */
export interface PathOptions {
    /** Explicit project root; takes priority over auto-detection. */
    projectRoot?: string;
}

/**
 * Resolve the superskill data root directory.
 *
 * Resolution order (ADR-013):
 * 1. `projectRoot` if provided.
 * 2. `cwd` if `cwd/.superskill/` exists.
 * 3. `os.homedir()` as fallback.
 */
export function getDataRoot(opts?: PathOptions): string {
    if (opts?.projectRoot) {
        return opts.projectRoot;
    }
    if (existsSync(join(cwd(), '.superskill'))) {
        return cwd();
    }
    return homedir();
}

/**
 * Resolve the evaluations database path.
 *
 * @returns `<dataRoot>/.superskill/evaluations.db`
 */
export function getDBPath(opts?: PathOptions): string {
    return join(getDataRoot(opts), '.superskill', 'evaluations.db');
}

/**
 * Resolve the proposals directory path.
 *
 * @returns `<dataRoot>/.superskill/proposals/`
 */
export function getProposalsDir(opts?: PathOptions): string {
    return join(getDataRoot(opts), '.superskill', 'proposals');
}

/**
 * True when two paths are equal after resolve, or one is an ancestor of the other.
 *
 * Used before clean-before-write (`rmSync` recursive): if the delete target nests
 * with the source tree, the clean step would destroy the source. Fail-closed on
 * cross-root relatives (Windows different drives) — safer to refuse than delete.
 */
export function pathsNestOrEqual(a: string, b: string): boolean {
    const ra = resolve(a);
    const rb = resolve(b);
    const aToB = relative(ra, rb);
    const bToA = relative(rb, ra);
    // Equal → relative is ''. Nested → one relative lacks a leading '..'.
    return !aToB.startsWith('..') || !bToA.startsWith('..');
}
