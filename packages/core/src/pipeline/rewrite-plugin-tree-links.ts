/**
 * Rewrite plugin-tree relative markdown links to flattened-dest sibling skill paths.
 *
 * On the source plugin tree, command/agent bodies reference companion skill files with
 * repo-relative paths that resolve against the preserved plugin tree:
 *
 * - `../skills/<name>/…`        (from a command/agent .md one level under `commands/` or `agents/`)
 * - `plugins/<plugin>/skills/<name>/…` (root-relative, from a top-level README or doc)
 *
 * After `superskill install` flattens commands/agents onto a shared skills root
 * (`~/.agents/skills/<plugin>-<name>/SKILL.md`), those links no longer resolve: the
 * dest-correct sibling is `../<plugin>-<name>/…`. This rewriter fixes the flattened
 * dest bodies so agents find the companion skill files this same install wrote.
 *
 * **Native exemption (R2):** this must NEVER run on native plugin-tree dests (claude,
 * grok, omp). They install the full plugin tree from `pluginRoot` directly and keep
 * resolving `../skills/<name>/…` against it. The seam is structural: the mapper output
 * (`.rulesync/`) only feeds flattened dests via rulesync; native installs read the raw
 * source tree. So calling this from `adaptCommandToSkill` / `adaptSubagentToSkill`
 * (mapper-time) is already gated to flattened dests — no per-target flag needed.
 *
 * Leaves untouched: `node:fs` / `bun:test` protocol colons, `plugin:name` colon refs
 * (owned by {@link rewriteSkillReferences}), already-dest `../<plugin>-<name>/…` paths,
 * and links to repos other than the installing plugin.
 */
export function rewritePluginTreeMarkdownLinks(content: string, pluginName: string): string {
    if (!pluginName || !content) return content;
    const escaped = pluginName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. `../skills/<name>/…` → `../<plugin>-<name>/…`
    //    Only matches a sibling `skills/<name>` path segment, not arbitrary `skills` words.
    const relativeRe = /(\.\.\/)skills\/([a-z0-9][a-z0-9-]*)(?=[/)\]#"`]|$)/gi;

    // 2. `plugins/<plugin>/skills/<name>/…` → `../<plugin>-<name>/…`
    //    Root-relative paths from top-level docs/READMEs collapse to the same dest-sibling form.
    const pluginsRe = new RegExp(`plugins\\/${escaped}\\/skills\\/([a-z0-9][a-z0-9-]*)(?=[\\/)\\]#"\`]|$)`, 'gi');

    return content
        .split('\n')
        .map((line) => {
            const rel = line.replace(
                relativeRe,
                (_m, dotdot: string, name: string) => `${dotdot}${pluginName}-${name}`,
            );
            return rel.replace(pluginsRe, (_m, name: string) => `../${pluginName}-${name}`);
        })
        .join('\n');
}
