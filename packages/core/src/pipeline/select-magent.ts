import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Target } from '../targets';
import { rewriteSkillReferences } from './rewrite-references';

/**
 * Per-target candidate filename priority for main-agent manifests. Most
 * specific first: `<base>.<target>.md` wins over a generic `<base>.md`. Claude
 * additionally accepts the historical `CLAUDE.md` / `CLAUDE.claude.md` names.
 *
 * Bases (`AGENTS`, `CLAUDE`) are tried in order — `AGENTS.md` is the
 * cross-platform default; `CLAUDE.md` is the Claude-specific fallback.
 */
const TARGET_CANDIDATES: Record<Target, ReadonlyArray<readonly [base: string, suffix: string]>> = {
    claude: [
        ['AGENTS', '.claude.md'],
        ['CLAUDE', '.claude.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.md'],
    ],
    codex: [
        ['AGENTS', '.codex.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.codex.md'],
        ['CLAUDE', '.md'],
    ],
    pi: [
        ['AGENTS', '.pi.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.pi.md'],
        ['CLAUDE', '.md'],
    ],
    omp: [
        ['AGENTS', '.omp.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.omp.md'],
        ['CLAUDE', '.md'],
    ],
    opencode: [
        ['AGENTS', '.opencode.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.opencode.md'],
        ['CLAUDE', '.md'],
    ],
    'antigravity-cli': [
        ['AGENTS', '.antigravity-cli.md'],
        ['AGENTS', '.antigravity.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.antigravity-cli.md'],
        ['CLAUDE', '.md'],
    ],
    'antigravity-ide': [
        ['AGENTS', '.antigravity-ide.md'],
        ['AGENTS', '.antigravity.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.antigravity-ide.md'],
        ['CLAUDE', '.md'],
    ],
    hermes: [
        ['AGENTS', '.hermes.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.hermes.md'],
        ['CLAUDE', '.md'],
    ],
    grok: [
        ['AGENTS', '.grok.md'],
        ['AGENTS', '.md'],
        ['CLAUDE', '.grok.md'],
        ['CLAUDE', '.md'],
    ],
};

/**
 * Select the best-matching magent manifest file for `target` from a staged
 * magent directory. Returns the absolute path to the selected file, or `null`
 * when no candidate exists — callers MUST handle the null (skip emission,
 * log in verbose mode) rather than fabricating one.
 *
 * Resolution order is most-specific-first per {@link TARGET_CANDIDATES}. The
 * function is pure (only `existsSync` reads) and side-effect free — no content
 * rewriting happens here.
 */
export function selectMagentVariant(sourceDir: string, target: Target): string | null {
    const candidates = TARGET_CANDIDATES[target];
    for (const [base, suffix] of candidates) {
        const candidate = join(sourceDir, `${base}${suffix}`);
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * Apply magent shimming: rewrite plugin-scoped references (`plugin:foo` →
 * `plugin-foo`) so installed magent content resolves identically to the
 * skills/commands/subagents path. Thin wrapper keeps the shim policy in one
 * place — if magents later need target-specific frontmatter injection (like
 * `adaptSubagentToSkill`), it grows here without touching the install loop.
 */
export function adaptMagentForTarget(content: string, pluginName: string, _target: Target): string {
    return rewriteSkillReferences(content, pluginName);
}

/**
 * Output filename for a shimmed magent on `target`. Most platforms consume
 * `AGENTS.md`; Claude Code historically reads `CLAUDE.md`. Keeping this as a
 * function (not a map) lets callers pass an already-resolved target without
 * risking a partial-map lookup.
 */
export function magentOutputFilename(target: Target): string {
    return target === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
}

/**
 * Resolve the destination directory for a magent under `target`'s install root.
 *
 * - Project mode (global=false): the project root itself — `AGENTS.md` /
 *   `CLAUDE.md` are discovered at the repo root by every target.
 * - Global mode: each target's per-user config directory. For targets whose
 *   global landing path isn't pinned (claude/hermes/omp/grok use native
 *   installers or surrogate paths), return `null` so the caller can fall back
 *   to project-root emission or skip with a verbose warning rather than writing
 *   to an invented path.
 */
export function magentGlobalDir(target: Target, homeDir: string): string | null {
    switch (target) {
        case 'codex':
            return join(homeDir, '.codex');
        case 'pi':
            return join(homeDir, '.pi', 'agent');
        case 'opencode':
            return join(homeDir, '.config', 'opencode');
        case 'antigravity-cli':
            return join(homeDir, '.gemini', 'antigravity-cli');
        case 'antigravity-ide':
            return join(homeDir, '.gemini', 'config');
        case 'hermes':
            return join(homeDir, '.hermes');
        // claude, omp, grok: native installers own their config layout; magents
        // for these targets are emitted at the project root in both modes.
        case 'claude':
        case 'omp':
        case 'grok':
            return null;
    }
}
