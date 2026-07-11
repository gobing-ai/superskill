/** Quote a YAML string value, escaping backslashes, double quotes, and line breaks.
 *  Callers emit the result on a single `key: value` frontmatter line, so newlines
 *  must become `\n` escapes — a literal line break inside the quotes produces an
 *  unparseable YAML block (multi-line agent descriptions hit this). */
export function quoteYaml(value: string): string {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
    return `"${escaped}"`;
}
