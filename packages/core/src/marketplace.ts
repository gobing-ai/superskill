import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { pathIsOrUnder } from './content/paths';

/** A single plugin entry in a marketplace manifest. */
const pluginEntrySchema = z
    .object({
        name: z.string().min(1),
        source: z.union([z.string().min(1), z.object({ source: z.string().min(1) }).passthrough()]),
    })
    .passthrough();

/** Marketplace manifest schema — passthrough for forward compat. */
const marketplaceSchema = z
    .object({
        name: z.string().optional(),
        owner: z
            .object({
                name: z.string().optional(),
                email: z.string().optional(),
            })
            .passthrough()
            .optional(),
        metadata: z
            .object({
                pluginRoot: z.string().optional(),
            })
            .passthrough()
            .optional(),
        plugins: z.array(pluginEntrySchema),
    })
    .passthrough();
/** Parsed marketplace manifest. */
export type MarketplaceManifest = z.infer<typeof marketplaceSchema>;

/** Result of a successful plugin resolution. */
export interface ResolvedPlugin {
    pluginRoot: string;
    marketplaceRoot: string;
    source: string;
}

/**
 * Derive the marketplace root from a resolved manifest path.
 *
 * The manifest sits either directly at the root (`<root>/marketplace.json`) or
 * under `<root>/.claude-plugin/marketplace.json`. The root is the manifest's
 * directory, raised one level only when that directory is literally
 * `.claude-plugin`. This single rule covers the direct-file branch too.
 */
function deriveMarketplaceRoot(manifestPath: string): string {
    const dir = dirname(manifestPath);
    return basename(dir) === '.claude-plugin' ? resolve(dir, '..') : resolve(dir);
}

/**
 * Probe a `--marketplace` locator for a manifest with the uniform three-way
 * rule (R1): direct file (when the locator ends in `marketplace.json`) →
 * `<X>/marketplace.json` → `<X>/.claude-plugin/marketplace.json`. Throws only
 * after all applicable probes, naming every probed path.
 */
function findMarketplaceManifest(marketplacePath: string): { manifestPath: string; marketplaceRoot: string } {
    const probed: string[] = [];
    let manifestPath: string | null = null;

    if (marketplacePath.endsWith('marketplace.json')) {
        manifestPath = resolve(marketplacePath);
        probed.push(manifestPath);
    } else {
        const root = resolve(marketplacePath);
        const atRoot = join(root, 'marketplace.json');
        const inClaudePlugin = join(root, '.claude-plugin', 'marketplace.json');
        probed.push(atRoot, inClaudePlugin);
        if (existsSync(atRoot)) manifestPath = atRoot;
        else if (existsSync(inClaudePlugin)) manifestPath = inClaudePlugin;
    }

    if (!manifestPath || !existsSync(manifestPath)) {
        throw new Error(`Marketplace manifest not found. Probed: ${probed.join(', ')}`);
    }

    return { manifestPath, marketplaceRoot: deriveMarketplaceRoot(manifestPath) };
}

/**
 * Resolve a plugin name to its root directory via marketplace resolution.
 *
 * Resolution order:
 * 1. `--marketplace <locator>` — explicit marketplace file, directory, or
 *    (remote GitHub) locator already materialized by the caller
 * 2. `.claude-plugin/marketplace.json` in CWD
 * 3. Signal fall-through — caller should scan `plugins/<name>/`
 *
 * Phase 1: only relative-path `source` values (starting `./`).
 * Remote sources (`github`, `url`, `git-subdir`, `npm`) and `../`-escapes
 * are rejected with distinct messages.
 */
export function resolvePlugin(marketplacePath: string | undefined, pluginName: string): ResolvedPlugin | null {
    let manifestPath: string | null = null;
    let marketplaceRoot = '';

    if (marketplacePath) {
        const found = findMarketplaceManifest(marketplacePath);
        manifestPath = found.manifestPath;
        marketplaceRoot = found.marketplaceRoot;
    } else {
        // Scan CWD for .claude-plugin/marketplace.json
        const cwdManifest = resolve('.claude-plugin', 'marketplace.json');
        if (existsSync(cwdManifest)) {
            manifestPath = cwdManifest;
            marketplaceRoot = deriveMarketplaceRoot(cwdManifest);
        }
    }

    if (!manifestPath) {
        // No marketplace found — signal fall-through for plugins/<name>/ scan
        return null;
    }

    const raw = readFileSync(manifestPath, 'utf-8');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`Invalid JSON in marketplace manifest: ${manifestPath}`);
    }

    let manifest: MarketplaceManifest;
    try {
        manifest = marketplaceSchema.parse(parsed);
    } catch (e) {
        // Mirror the JSON.parse wrap above: a raw ZodError dump is not an actionable CLI error.
        const detail =
            e instanceof z.ZodError
                ? e.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ')
                : String(e);
        throw new Error(`Invalid marketplace manifest: ${manifestPath} — ${detail}`);
    }
    const entry = manifest.plugins.find((p) => p.name === pluginName);
    if (!entry) {
        return null;
    }

    const source = entry.source;

    if (typeof source !== 'string') {
        throw new Error(
            `Remote sources not yet supported for plugin '${pluginName}'. Phase 1 only supports relative-path sources (starting with './').`,
        );
    }

    // Reject remote sources (Phase 1: only relative paths)
    if (!source.startsWith('./')) {
        throw new Error(
            `Remote sources not yet supported for plugin '${pluginName}'. Phase 1 only supports relative-path sources (starting with './').`,
        );
    }

    // Reject path-escaping sources — match `..` as a path segment on both / and \ separators,
    // so legitimate names containing `..` as a substring (e.g. `./a..b`) are allowed.
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(source)) {
        throw new Error(`Plugin source for '${pluginName}' escapes the marketplace root: '${source}'.`);
    }
    // Also validate pluginRoot from the manifest — it can contain `..` to escape the marketplace root,
    // or be absolute (e.g. /etc) to bypass it entirely. Reject both.
    const pluginRootBase = manifest.metadata?.pluginRoot ?? '';
    if (pluginRootBase) {
        if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(pluginRootBase)) {
            throw new Error(`Plugin root for '${pluginName}' escapes the marketplace root: '${pluginRootBase}'.`);
        }
        if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(pluginRootBase)) {
            throw new Error(`Plugin root for '${pluginName}' escapes the marketplace root: '${pluginRootBase}'.`);
        }
    }

    const pluginRoot = resolve(marketplaceRoot, pluginRootBase, source);

    // Authoritative inode boundary (R2/F2): the lexical checks above stay as fast
    // actionable pre-filters, but a symlinked source leaf, `pluginRoot` metadata, or
    // symlinked parent component can resolve the plugin outside the marketplace root
    // while every lexical path remains inside it. Compare canonical real paths —
    // equality or a descendant is accepted; ancestor/sibling/cross-root is rejected.
    const realMarketplaceRoot = realpathSync(marketplaceRoot);
    let realPluginRoot: string;
    try {
        realPluginRoot = realpathSync(pluginRoot);
    } catch {
        throw new Error(`Plugin root not found: ${pluginRoot}`);
    }
    if (!pathIsOrUnder(realMarketplaceRoot, realPluginRoot)) {
        throw new Error(
            `Plugin root for '${pluginName}' escapes the marketplace root after symlink resolution: ` +
                `'${realPluginRoot}' is not inside '${realMarketplaceRoot}'.`,
        );
    }

    let dirents: string[];
    try {
        dirents = readdirSync(pluginRoot);
    } catch {
        throw new Error(`Plugin root not found: ${pluginRoot}`);
    }

    const hasSkills = dirents.includes('skills');
    const hasCommands = dirents.includes('commands');
    const hasAgents = dirents.includes('agents');
    const hasHooksDir = dirents.includes('hooks');
    const hasHooksFile = dirents.includes('hooks.json');
    if (!(hasSkills || hasCommands || hasAgents || hasHooksDir || hasHooksFile)) {
        throw new Error(
            `No recognizable plugin content (skills/, commands/, agents/, hooks/, hooks.json) in: ${pluginRoot}`,
        );
    }
    return { pluginRoot, marketplaceRoot, source };
}

/**
 * List all resolvable plugin names from the marketplace manifest at the
 * given path (or CWD fallback), for "not found" error messages.
 */
export function listResolvablePlugins(marketplacePath: string | undefined): string[] {
    let manifestPath: string | null = null;

    if (marketplacePath) {
        try {
            manifestPath = findMarketplaceManifest(marketplacePath).manifestPath;
        } catch {
            return [];
        }
    } else {
        const cwdManifest = resolve('.claude-plugin', 'marketplace.json');
        if (existsSync(cwdManifest)) manifestPath = cwdManifest;
    }

    if (!manifestPath) return [];

    try {
        const raw = readFileSync(manifestPath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        const manifest = marketplaceSchema.parse(parsed);
        return manifest.plugins.map((p) => p.name);
    } catch {
        return [];
    }
}
