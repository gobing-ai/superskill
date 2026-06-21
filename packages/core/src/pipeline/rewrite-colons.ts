/**
 * @deprecated Use {@link rewriteSkillReferences} from `rewrite-references.ts` instead.
 *
 * This function hardcodes `/(rd3|wt):/` — it silently skips `cc:`, `sp:`, and every
 * other plugin. The scoped `rewriteSkillReferences(content, pluginPrefix)` is the
 * correct replacement (mirrors old `common.sh:95-97` `PLUGIN_PREFIX` path).
 *
 * Kept for backward compatibility with existing tests and the adapt-parity test.
 */
export function rewriteColonRefs(content: string): string {
    return content.replace(/\b(rd3|wt):([a-z][a-z0-9-]*)\b/gi, (_match, prefix, name) => `${prefix}-${name}`);
}
