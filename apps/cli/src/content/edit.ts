import { applyFrontmatterChange } from './frontmatter';

/**
 * A structured mutation to apply to a content file.
 *
 * - `kind: 'frontmatter'` — set a key in the YAML frontmatter. Routes through
 *   `applyFrontmatterChange` to preserve comments and key order.
 * - `kind: 'text'` — locate the first occurrence of `current` in the body and
 *   replace it with `proposed`. Throws if `current` is not found.
 */
export type Change =
    | { kind: 'frontmatter'; key: string; value: unknown }
    | { kind: 'text'; current: string; proposed: string };

/**
 * Apply a single structured change to markdown content.
 *
 * @param content  Full file content with `---` frontmatter.
 * @param change   The mutation to apply.
 * @returns        The content string with the change applied.
 * @throws         If `kind: 'text'` and `current` is not found in the body.
 */
export function applyChange(content: string, change: Change): string {
    if (change.kind === 'frontmatter') {
        return applyFrontmatterChange(content, (doc) => {
            doc.set(change.key, change.value);
        });
    }

    // kind: 'text' — locate exact match of `current` and replace with `proposed`
    const idx = content.indexOf(change.current);
    if (idx === -1) {
        throw new Error(`Text change target not found in content: "${change.current.slice(0, 80)}"`);
    }
    return content.slice(0, idx) + change.proposed + content.slice(idx + change.current.length);
}
