/**
 * Marketplace registration mode — how a host CLI (Claude/Grok/OMP) learns
 * about a marketplace repo. Layer A of the two-layer marketplace design
 * (see docs/01_PRD.md deferred table and task 0086 D1).
 */
export type MarketplaceSource = 'directory' | 'github';

/**
 * Known GitHub remote map — marketplace manifest `name` → `owner/repo` slug.
 * Overridable: the CLI may inject a custom map at runtime for private forks
 * or alternative hosting. Only consulted when `mode === 'github'`.
 */
export const KNOWN_GITHUB_REPOS: Readonly<Record<string, string>> = {
    spur: 'gobing-ai/spur',
    superskill: 'gobing-ai/superskill',
};

/** Result of marketplace registration resolution. */
export interface MarketplaceRegistration {
    /** The identifier for the host CLI `marketplace add` command. */
    source: string;
    /** Source mode used to derive the source. */
    mode: MarketplaceSource;
}

/**
 * Resolve how to register a marketplace with the target host CLI.
 *
 * `directory` → absolute path to the marketplace root (authoring/dogfood).
 * `github`   → `owner/repo` slug from {@link KNOWN_GITHUB_REPOS}; falls back
 *              to the absolute path when the marketplace name is unknown so
 *              `install --marketplace-source github` degrades safely for
 *              private/local projects.
 *
 * Pure function — no FS access, stable across machines. The caller is
 * responsible for verifying the marketplace name matches a known remote
 * before depending on the slug form.
 */
export function resolveMarketplaceRegistration(
    marketplaceRoot: string,
    marketplaceName: string,
    mode: MarketplaceSource,
): MarketplaceRegistration {
    if (mode === 'github') {
        const slug = KNOWN_GITHUB_REPOS[marketplaceName];
        if (slug) return { source: slug, mode: 'github' };
        // Unknown name → fall back to path so the command does not break.
    }
    return { source: marketplaceRoot, mode: 'directory' };
}
