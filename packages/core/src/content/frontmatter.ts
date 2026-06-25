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
 * Parse a markdown string with YAML frontmatter.
 *
 * @throws {FrontmatterError} if the content lacks a `---` opener, closer, or the YAML is unparseable.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
    if (!/^---\r?\n/.test(content)) {
        throw new FrontmatterError('Missing frontmatter: content must start with ---');
    }

    // Closer must be a bare `---` line: `\n---` followed by end-of-string or newline,
    // so body lines like `---draft` are not mistaken for the delimiter.
    const closerMatch = content.slice(4).match(/\r?\n---(?=\r?\n|$)/);
    if (closerMatch?.index === undefined) {
        throw new FrontmatterError('Missing frontmatter closing delimiter (---)');
    }
    const closerIdx = closerMatch.index + 4;

    const raw = content.slice(4, closerIdx);
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

    const body = content.slice(closerIdx + 4);
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
    const newFm = doc.toString();
    return `---\n${newFm}---${body}`;
}
