import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
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
 * True when two paths are equal after canonicalization, or one is an ancestor of the other.
 *
 * Used before clean-before-write (`rmSync` recursive): if the delete target nests
 * with the source tree, the clean step would destroy the source. Fail-closed on
 * cross-root relatives (Windows different drives) — safer to refuse than delete.
 *
 * Containment is component-aware (a child named `..plugin` is a child, not an escape)
 * and symlink-aware: each side is canonicalized by realpathing its nearest existing
 * ancestor and appending the unresolved tail, so a symlinked leaf or a missing leaf
 * below a symlinked parent is compared by real filesystem identity (R1/F1).
 */
export function pathsNestOrEqual(a: string, b: string): boolean {
    const ra = canonicalizeForContainment(a);
    const rb = canonicalizeForContainment(b);
    if (parse(ra).root !== parse(rb).root) return false;
    return isContainedRelative(relative(ra, rb)) || isContainedRelative(relative(rb, ra));
}

/**
 * Directed containment: true when `candidate` equals `root` or lies beneath it after
 * canonicalization (R2). Used for filesystem-resolved boundaries such as the
 * marketplace root, where the traversal direction matters.
 */
export function pathIsOrUnder(root: string, candidate: string): boolean {
    const rr = canonicalizeForContainment(root);
    const rc = canonicalizeForContainment(candidate);
    if (parse(rr).root !== parse(rc).root) return false;
    return isContainedRelative(relative(rr, rc));
}

/**
 * Component-aware containment predicate over a `relative()` result: contained only
 * when empty (equal), not absolute, not exactly `..`, and not prefixed by `..` plus
 * the platform separator. A raw `startsWith('..')` misreads legitimate children such
 * as `..plugin` as escapes and is never used here (R1).
 */
function isContainedRelative(rel: string): boolean {
    if (rel === '') return true;
    if (isAbsolute(rel)) return false;
    if (rel === '..') return false;
    // `relative()` emits platform separators, but normalize across both spellings so a
    // Windows-style tail can never smuggle an escape past a POSIX-separator check.
    return !rel.startsWith(`..${sep}`) && !rel.startsWith('../') && !rel.startsWith('..\\');
}

/**
 * Canonicalize a path for containment comparison: realpath the nearest existing
 * ancestor, then append the unresolved tail. Catches a symlinked leaf and a missing
 * leaf below a symlinked parent; purely lexical inputs compare lexically.
 */
function canonicalizeForContainment(path: string): string {
    const resolved = resolve(path);
    if (existsSync(resolved)) {
        try {
            return realpathSync(resolved);
        } catch {
            return resolved;
        }
    }
    let current = resolved;
    for (;;) {
        const parent = dirname(current);
        if (parent === current) return resolved; // reached the root without a hit
        if (existsSync(parent)) {
            try {
                const realParent = realpathSync(parent);
                const tail = relative(parent, resolved);
                return tail ? join(realParent, tail) : realParent;
            } catch {
                return resolved;
            }
        }
        current = parent;
    }
}
