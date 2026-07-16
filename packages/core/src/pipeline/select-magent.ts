import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
 * Multi-file modular magent layers, concatenated in this order at install time
 * (modular multi-file magent contract). Session memory is not a magent layer —
 * use spur indexed context (`.spur/context/`) or the host agent’s own memory.
 * Plugin rules live under `plugins/<plugin>/rules/`, not in the magent tree.
 */
export const MAGENT_LAYER_FILES = ['IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'USER.md'] as const;

/**
 * Legacy override-directory aliases (`overrides/codexcli/`, `overrides/geminicli/`, …).
 * Tried after the canonical target id so new trees can use `overrides/codex/`
 * while older trees still work.
 */
const OVERRIDE_DIR_ALIASES: Record<Target, readonly string[]> = {
    claude: ['claude', 'claude-code'],
    codex: ['codex', 'codexcli'],
    pi: ['pi'],
    omp: ['omp'],
    opencode: ['opencode'],
    'antigravity-cli': ['antigravity-cli', 'antigravity', 'geminicli'],
    'antigravity-ide': ['antigravity-ide', 'antigravity'],
    hermes: ['hermes'],
    grok: ['grok'],
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
 *
 * Prefer {@link assembleMagentContent} when the tree may be multi-file
 * (IDENTITY/SOUL/AGENTS/USER + overrides/); this function only picks a single
 * top-level variant file.
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
 * True when `sourceDir` is a multi-file modular magent (has at least one of
 * IDENTITY/SOUL/USER alongside or instead of a lone AGENTS.md). Multi-file
 * trees are assembled via {@link assembleMagentContent}.
 */
export function isMultiFileMagent(sourceDir: string): boolean {
    return (
        existsSync(join(sourceDir, 'IDENTITY.md')) ||
        existsSync(join(sourceDir, 'SOUL.md')) ||
        existsSync(join(sourceDir, 'USER.md'))
    );
}

/**
 * Resolve one layer file for `target`: prefer `overrides/<alias>/<file>`, then
 * (for AGENTS.md only) the single-file target variant (`AGENTS.codex.md`, …),
 * then the base layer file. Returns absolute path or null.
 */
export function resolveMagentLayerFile(
    sourceDir: string,
    target: Target,
    layerFile: (typeof MAGENT_LAYER_FILES)[number],
): string | null {
    for (const alias of OVERRIDE_DIR_ALIASES[target]) {
        const override = join(sourceDir, 'overrides', alias, layerFile);
        if (existsSync(override)) return override;
    }
    // Per-target single-file variants only apply to the AGENTS layer (and CLAUDE
    // legacy names via selectMagentVariant when assembling a non-layered tree).
    if (layerFile === 'AGENTS.md') {
        const variant = selectMagentVariant(sourceDir, target);
        // selectMagentVariant also returns base AGENTS.md — only treat as layer
        // override when it is *not* the plain base path (i.e. a more specific hit).
        if (variant && variant !== join(sourceDir, 'AGENTS.md') && variant !== join(sourceDir, 'CLAUDE.md')) {
            return variant;
        }
    }
    const base = join(sourceDir, layerFile);
    return existsSync(base) ? base : null;
}

/** Result of assembling a magent for one target (content + provenance paths). */
export interface MagentAssembly {
    /** Concatenated (or single-file) body ready for {@link adaptMagentForTarget}. */
    content: string;
    /** Absolute paths of the layer/variant files that contributed, in order. */
    sources: string[];
}

/**
 * Assemble installable main-agent content for `target` from a magent source dir.
 *
 * - **Multi-file** (`IDENTITY`/`SOUL`/`USER` present): concatenate layers in
 *   {@link MAGENT_LAYER_FILES} order, each layer resolved via
 *   {@link resolveMagentLayerFile} (overrides win). Blank-line separators.
 * - **Single-file**: read the path from {@link selectMagentVariant}, or null.
 *
 * Callers still apply {@link adaptMagentForTarget} for shimming.
 */
export function assembleMagentContent(sourceDir: string, target: Target): MagentAssembly | null {
    if (isMultiFileMagent(sourceDir)) {
        const parts: string[] = [];
        const sources: string[] = [];
        for (const layer of MAGENT_LAYER_FILES) {
            const path = resolveMagentLayerFile(sourceDir, target, layer);
            if (!path) continue;
            const body = readFileSync(path, 'utf-8').replace(/\s+$/, '');
            if (body.length > 0) {
                parts.push(body);
                sources.push(path);
            }
        }
        if (parts.length === 0) return null;
        return { content: `${parts.join('\n\n')}\n`, sources };
    }
    const single = selectMagentVariant(sourceDir, target);
    if (!single) return null;
    return { content: readFileSync(single, 'utf-8'), sources: [single] };
}

/**
 * Apply magent shimming: rewrite plugin-scoped references (`plugin:foo` →
 * `plugin-foo`) so installed magent content resolves identically to the
 * skills/commands/subagents path. Codex also strips bare `@file` import lines
 * that Claude Code understands but Codex does not (legacy magents.sh parity).
 */
export function adaptMagentForTarget(content: string, pluginName: string, target: Target): string {
    let out = rewriteSkillReferences(content, pluginName);
    if (target === 'codex') {
        // Drop lines that are only Claude-style @file imports (optional trailing comment).
        out = out.replace(/^\s*@[\w./-]+\s*(?:#.*)?$/gm, '');
        out = out.replace(/\n{3,}/g, '\n\n');
    }
    return out;
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
 * True when the package has a Claude-native entry that `@`-imports modular
 * layer files (Claude Code expands these at session start). Install should
 * copy the package files + CLAUDE.md rather than pre-concatenating for claude.
 */
export function isClaudeImportStyle(sourceDir: string): boolean {
    const entry = join(sourceDir, 'CLAUDE.md');
    if (!existsSync(entry)) return false;
    const body = readFileSync(entry, 'utf-8');
    return /@(?:IDENTITY|SOUL|AGENTS|USER)\.md\b/.test(body) || /^\s*@[\w./-]+\.md\s*$/m.test(body);
}

/** Layer files copied next to CLAUDE.md for Claude import-style install. */
export const CLAUDE_PACKAGE_FILES = ['CLAUDE.md', 'IDENTITY.md', 'SOUL.md', 'AGENTS.md', 'USER.md'] as const;

/**
 * List rule markdown files in a directory (e.g. `plugins/cc/rules/`).
 * Empty when the directory is missing or has no `.md` files.
 */
export function listRuleMarkdownFiles(rulesDir: string): string[] {
    if (!existsSync(rulesDir)) return [];
    return readdirSync(rulesDir)
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .map((f) => join(rulesDir, f))
        .sort();
}

/**
 * Destination directory for modular rules for `target`, relative to the magent
 * dest root (project root or global config dir). Returns null when the target
 * has no known auto-loading rules folder in superskill's target set.
 *
 * | Target | Rules dir | Confidence |
 * | --- | --- | --- |
 * | claude | `.claude/rules/` | HIGH (Claude Code modular rules) |
 * | antigravity-cli | `.agents/rules/` | HIGH (rulesync / Gemini-family) |
 * | antigravity-ide | `.agents/rules/` | MEDIUM (IDE agent rules tree) |
 * | codex, pi, opencode, hermes, omp, grok | — | No modular rules folder in TARGETS |
 *
 * Cursor (`.cursor/rules/*.mdc`) and Windsurf (`.windsurf/rules`) support
 * rules folders but are **not** superskill install targets today.
 */
export function magentRulesRelDir(target: Target): string | null {
    switch (target) {
        case 'claude':
            return join('.claude', 'rules');
        case 'antigravity-cli':
        case 'antigravity-ide':
            return join('.agents', 'rules');
        default:
            return null;
    }
}

/**
 * Resolve the destination directory for a magent under `target`'s install root.
 *
 * - Project mode (global=false): the project root itself — `AGENTS.md` /
 *   `CLAUDE.md` are discovered at the repo root by every target.
 * - Global mode: each target's per-user config directory.
 */
export function magentGlobalDir(target: Target, homeDir: string): string | null {
    switch (target) {
        case 'claude':
            // Claude Code user memory / global CLAUDE.md + modular package live under ~/.claude
            return join(homeDir, '.claude');
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
        // omp / grok: no single pinned global magent path — emit at project root.
        case 'omp':
        case 'grok':
            return null;
    }
}
