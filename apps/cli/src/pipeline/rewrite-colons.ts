/**
 * Replace colon-separated references in prose text.
 * `rd3:foo` → `rd3-foo`, `wt:bar` → `wt-bar`.
 *
 * Applied to all targets for all content types before rulesync generation.
 */
export function rewriteColonRefs(content: string): string {
    return content.replace(/\b(rd3|wt):([a-z][a-z0-9-]*)\b/gi, (_match, prefix, name) => `${prefix}-${name}`);
}
