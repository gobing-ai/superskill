import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

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
 * Resolve a plugin name to its root directory via marketplace resolution.
 *
 * Resolution order:
 * 1. `--marketplace <path>` — explicit marketplace file or directory
 * 2. `.claude-plugin/marketplace.json` in CWD
 * 3. Signal fall-through — caller should scan `plugins/<name>/`
 *
 * Phase 1: only relative-path `source` values (starting `./`).
 * Remote sources (`github`, `url`, `git-subdir`, `npm`) and `../`-escapes
 * are rejected with distinct messages.
 */
export function resolvePlugin(marketplacePath: string | undefined, pluginName: string): ResolvedPlugin | null {
    let manifestPath: string | null = null;

    if (marketplacePath) {
        // --marketplace can point to the file or its parent directory
        if (marketplacePath.endsWith('marketplace.json')) {
            manifestPath = resolve(marketplacePath);
        } else {
            manifestPath = resolve(join(marketplacePath, 'marketplace.json'));
        }
        if (!existsSync(manifestPath)) {
            throw new Error(`Marketplace manifest not found at: ${manifestPath}`);
        }
    } else {
        // Scan CWD for .claude-plugin/marketplace.json
        const cwdManifest = resolve('.claude-plugin', 'marketplace.json');
        if (existsSync(cwdManifest)) {
            manifestPath = cwdManifest;
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

    const manifest = marketplaceSchema.parse(parsed);
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
    // Also validate pluginRoot from the manifest — it can contain `..` to escape the marketplace root.
    const pluginRootBase = manifest.metadata?.pluginRoot ?? '';
    if (pluginRootBase && /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(pluginRootBase)) {
        throw new Error(`Plugin root for '${pluginName}' escapes the marketplace root: '${pluginRootBase}'.`);
    }

    // Marketplace root = directory containing .claude-plugin/ (NOT .claude-plugin/ itself)
    const marketplaceRoot = resolve(manifestPath, '..', '..');

    const pluginRoot = resolve(marketplaceRoot, pluginRootBase, source);

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
        manifestPath = marketplacePath.endsWith('marketplace.json')
            ? resolve(marketplacePath)
            : resolve(join(marketplacePath, 'marketplace.json'));
        if (!existsSync(manifestPath)) return [];
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
