import type { Document } from 'yaml';
import { parseDocument, parse as parseYaml } from 'yaml';

/** Error thrown when frontmatter is missing, empty, or unparseable. */
export class FrontmatterError extends Error {
    constructor(
        message: string,
        public override readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'FrontmatterError';
    }
}

/** Parsed frontmatter result with typed data, body text, and raw frontmatter string. */
export interface ParsedFrontmatter {
    /** YAML-parsed data object. */
    data: Record<string, unknown>;
    /** Content after the closing `---` delimiter. */
    body: string;
    /** Raw frontmatter text between `---` delimiters (no leading/trailing `---`). */
    raw: string;
}

/**
 * CRLF-safe bounds of a frontmatter block, or `null` when the content has none.
 *
 * Indices are offsets into the original content string:
 * - `rawStart` — first byte after the opening `---` line (start of YAML).
 * - `rawEnd` — first byte of the closing `---` line (end of YAML).
 * - `bodyStart` — first byte after the closing `---` line (start of body).
 */
export interface FrontmatterBounds {
    rawStart: number;
    rawEnd: number;
    bodyStart: number;
}

/**
 * Locate the frontmatter block in `content`, handling both LF and CRLF endings.
 *
 * A block opens with a `---` line at the very start and closes at the next bare
 * `---` line (followed by end-of-string or a newline, so `---draft` body text is
 * not mistaken for the delimiter). Returns `null` when there is no opener or no
 * matching closer.
 *
 * This is the single primitive every frontmatter consumer should use; hand-rolled
 * delimiter matching has shipped two CRLF bugs already (2026-07-11).
 */
export function findFrontmatterBounds(content: string): FrontmatterBounds | null {
    const opener = content.match(/^---\r?\n/);
    if (!opener) return null;
    const rawStart = opener[0].length;
    const closerMatch = content.slice(rawStart).match(/\r?\n---(?=\r?\n|$)/);
    if (closerMatch?.index === undefined) return null;
    const rawEnd = closerMatch.index + rawStart;
    const bodyStart = rawEnd + closerMatch[0].length;
    return { rawStart, rawEnd, bodyStart };
}

/**
 * Parse a markdown string with YAML frontmatter.
 *
 * @throws {FrontmatterError} if the content lacks a `---` opener, closer, or the YAML is unparseable.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
    const hasOpener = /^---\r?\n/.test(content);
    const bounds = findFrontmatterBounds(content);
    if (!bounds) {
        throw new FrontmatterError(
            hasOpener
                ? 'Missing frontmatter closing delimiter (---)'
                : 'Missing frontmatter: content must start with ---',
        );
    }

    const raw = content.slice(bounds.rawStart, bounds.rawEnd);
    if (raw.trim() === '') {
        throw new FrontmatterError('Frontmatter is empty');
    }

    let data: unknown;
    try {
        data = parseYaml(raw);
    } catch (e) {
        throw new FrontmatterError('Failed to parse frontmatter YAML', e);
    }

    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new FrontmatterError('Frontmatter must be a YAML mapping (object)');
    }

    const body = content.slice(bounds.bodyStart);
    return { data: data as Record<string, unknown>, body, raw };
}

/**
 * Round-trip a content string through yaml.Document so that comments and key order survive.
 *
 * @param content  The full file content with `---` frontmatter.
 * @param mutate   Callback that receives a mutable `yaml.Document` for the frontmatter.
 * @returns        The full content string with mutated frontmatter.
 */
export function applyFrontmatterChange(content: string, mutate: (doc: Document) => void): string {
    const { data, body, raw } = parseFrontmatter(content);
    // Re-parse the raw frontmatter as a Document to preserve comments/key-order
    const doc = parseDocument(raw);
    // Seed it with current data so any key already present survives
    for (const [key, value] of Object.entries(data)) {
        if (!doc.has(key)) {
            doc.set(key, value);
        }
    }
    mutate(doc);
    // yaml emits LF only. Parsing is CRLF-aware, so echoing LF delimiters here would hand back
    // a CRLF file with an LF frontmatter block — the mixed-ending bug this module exists to avoid.
    const eol = raw.includes('\r\n') || body.startsWith('\r\n') ? '\r\n' : '\n';
    const newFm = eol === '\r\n' ? doc.toString().replace(/\r?\n/g, '\r\n') : doc.toString();
    return `---${eol}${newFm}---${body}`;
}
