/** Quote a YAML string value, escaping backslashes and double quotes. */
export function quoteYaml(value: string): string {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}
