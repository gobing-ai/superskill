/**
 * grok-bot ownership-marker helpers: hashing, marker build/read/validate, and
 * marker-hash freshness (task 0146 R13 pure move out of grok-bot.ts). grok-bot.ts
 * re-exports the names that were exported before the move, so the package surface is
 * unchanged. Imports the target constants/preflight error from grok-bot.ts — used only
 * inside function bodies, so the module cycle is safe under any load order.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
    BOT_MARKER_SCHEMA_VERSION,
    BOT_ORIGIN_MARKER,
    type BotSkillEntry,
    GROK_BOT_TARGET,
    type GrokBotMaterialize,
    GrokBotPreflightError,
    type GrokBotSource,
} from './grok-bot';

/** Per-workflow ownership marker (`.superskill-origin.json`) gating overwrite decisions. */
export interface GrokBotOriginMarker {
    schemaVersion: 1;
    target: 'grok-bot';
    plugin: string;
    source: GrokBotSource;
    mode: GrokBotMaterialize;
    /** Absolute canonical SKILL.md path (bridge) or null (full materialization). */
    canonicalPath: string | null;
    superskillVersion: string;
    installedAt: string;
    /** Basename → SHA-256 over the owned skill files (marker excluded). */
    hashes: Record<string, string>;
}

/** SHA-256 hex over raw bytes. */
function sha256Bytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

/** SHA-256 hex over file bytes. */
export function sha256File(path: string): string {
    return sha256Bytes(readFileSync(path));
}

/** SHA-256 hex digest of a UTF-8 text string. */
export function sha256Text(text: string): string {
    return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/** List regular files under `root` as sorted `/`-joined relative paths (symlinks skipped). */
export function listRegularFilesRel(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string, prefix: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                walk(join(dir, entry.name), `${prefix}${entry.name}/`);
            } else if (entry.isFile()) {
                out.push(`${prefix}${entry.name}`);
            }
        }
    };
    walk(root, '');
    return out.sort();
}

function hashEntry(entry: BotSkillEntry): Record<string, string> {
    const hashes: Record<string, string> = { 'SKILL.md': sha256Text(entry.skillMd) };
    for (const [rel, content] of entry.files) hashes[rel] = sha256Bytes(content);
    return hashes;
}

/** Serializes the origin marker (schemaVersion 1) with per-file SHA-256 hashes, newline-terminated. */
export function buildMarker(args: {
    plugin: string;
    source: GrokBotSource;
    mode: GrokBotMaterialize;
    canonicalPath: string | null;
    superskillVersion: string;
    nowIso: string;
    entry: BotSkillEntry;
}): string {
    const marker: GrokBotOriginMarker = {
        schemaVersion: BOT_MARKER_SCHEMA_VERSION,
        target: GROK_BOT_TARGET,
        plugin: args.plugin,
        source: args.source,
        mode: args.mode,
        canonicalPath: args.canonicalPath,
        superskillVersion: args.superskillVersion,
        installedAt: args.nowIso,
        hashes: hashEntry(args.entry),
    };
    return `${JSON.stringify(marker, null, 2)}\n`;
}

/**
 * Read + validate an existing ownership marker. Returns null when absent.
 * Throws {@link GrokBotPreflightError} when present but malformed (R4: fail,
 * never overwrite) or owned by a foreign target/plugin.
 */
export function readOriginMarker(
    workflowDir: string,
    plugin: string,
    options?: { anyPlugin?: boolean },
): GrokBotOriginMarker | null {
    const markerPath = join(workflowDir, BOT_ORIGIN_MARKER);
    if (!existsSync(markerPath)) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(markerPath, 'utf-8'));
    } catch (error) {
        throw new GrokBotPreflightError(
            `Workflow '${basename(workflowDir)}' has a malformed ${BOT_ORIGIN_MARKER}: ${String(error)} — ` +
                'remove it manually if it is no longer wanted; superskill will not overwrite it',
        );
    }
    const rec = parsed as Partial<GrokBotOriginMarker> | null;
    if (
        !rec ||
        rec.schemaVersion !== BOT_MARKER_SCHEMA_VERSION ||
        rec.target !== GROK_BOT_TARGET ||
        typeof rec.plugin !== 'string' ||
        rec.plugin.length === 0 ||
        !rec.source ||
        typeof rec.source !== 'object' ||
        (rec.source.channel !== 'bundled' && rec.source.channel !== 'marketplace') ||
        typeof rec.source.locator !== 'string' ||
        (rec.mode !== 'bridge' && rec.mode !== 'full') ||
        typeof rec.installedAt !== 'string' ||
        typeof rec.hashes !== 'object' ||
        rec.hashes === null
    ) {
        throw new GrokBotPreflightError(
            `Workflow '${basename(workflowDir)}' has an unsupported ${BOT_ORIGIN_MARKER} shape — ` +
                'remove it manually if it is no longer wanted; superskill will not overwrite it',
        );
    }
    if (options?.anyPlugin !== true && rec.plugin !== plugin) {
        throw new GrokBotPreflightError(
            `Workflow '${basename(workflowDir)}' is owned by plugin '${rec.plugin}', not '${plugin}' — ` +
                'superskill will not replace another plugin’s workflow',
        );
    }
    return rec as GrokBotOriginMarker;
}

/** True when every marker hash matches current file bytes (marker excluded). */
export function markerHashesCurrent(marker: GrokBotOriginMarker, dir: string): boolean {
    for (const [rel, expected] of Object.entries(marker.hashes)) {
        const abs = join(dir, rel);
        if (!existsSync(abs) || sha256File(abs) !== expected) return false;
    }
    // Extra untracked files also count as drift for doctor; replacement ignores them.
    for (const rel of listRegularFilesRel(dir)) {
        if (rel === BOT_ORIGIN_MARKER) continue;
        if (!(rel in marker.hashes)) return false;
    }
    return true;
}
