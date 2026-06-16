import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
