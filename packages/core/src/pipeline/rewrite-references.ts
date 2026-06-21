/**
 * Rewrite plugin-scoped skill references: `<pluginPrefix>:<name>` → `<pluginPrefix>-<name>`.
 *
 * Scoped to a single plugin prefix so `node:fs`, `bun:test`, `ts:*`, and placeholder
 * `plugin:command` colons from *other* contexts are never mangled. Mirrors the old
 * `common.sh:95-97` `PLUGIN_PREFIX` path.
 *
 * Use this instead of the legacy {@link rewriteColonRefs} which hardcodes `/(rd3|wt):/`.
 */
export function rewriteSkillReferences(content: string, pluginPrefix: string): string {
    if (!pluginPrefix || !content) return content;
    // Escape regex metacharacters in the plugin prefix (e.g. if it contained a `.`
    // or `+`), then anchor to a word boundary + colon + lowercase-hyphenated name.
    const escaped = pluginPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${escaped}):([a-z][a-z0-9-]*)`, 'gi');
    return content.replace(re, '$1-$2');
}
