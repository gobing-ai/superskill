/**
 * Rewrite plugin-scoped skill references: `<pluginPrefix>:<name>` → `<pluginPrefix>-<name>`.
 *
 * Scoped to a single plugin prefix so `node:fs`, `bun:test`, `ts:*`, and placeholder
 * `plugin:command` colons from *other* contexts are never mangled. Mirrors the old
 * `common.sh:95-97` `PLUGIN_PREFIX` path. Replaces the legacy hardcoded `/(rd3|wt):/`
 * rewriter deleted in task 0045 R4.
 */
export function rewriteSkillReferences(content: string, pluginPrefix: string): string {
    if (!pluginPrefix || !content) return content;
    // Escape regex metacharacters in the plugin prefix (e.g. if it contained a `.`
    // or `+`), then anchor to a word boundary + colon + lowercase-hyphenated name.
    const escaped = pluginPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${escaped}):([a-z][a-z0-9-]*)`, 'gi');

    // Leave slash-command lines (`/plugin:cmd ...`) untouched — colon rewriting
    // would strip the `:` the slash-dialect translator needs, defeating it. Slash
    // commands are owned by translateSlashCommands, which must run on these lines
    // first; prose/frontmatter colon refs are rewritten here.
    return content
        .split('\n')
        .map((line) =>
            SLASH_COMMAND_LINE_RE.test(line)
                ? line
                : line.replace(re, (m, p1, p2, offset: number, s: string) =>
                      // Exempt version-pinned identifiers: a `<prefix>:<name>` token
                      // immediately followed by `@` (e.g. `sp:dogfood-testing@1.2`)
                      // is a protocol constant, not a skill reference - leave it
                      // untouched. Plain `sp:<name>` refs (no `@`) still flatten.
                      s[offset + m.length] === '@' ? m : `${p1}-${p2}`,
                  ),
        )
        .join('\n');
}

/** A standalone Claude-style slash-command line: `/plugin:command [args]`. */
const SLASH_COMMAND_LINE_RE = /^\s*\/[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+(\s|$)/;
