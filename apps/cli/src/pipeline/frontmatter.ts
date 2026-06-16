/** Inject a `name` field into markdown YAML frontmatter when it is missing. */
export function normalizeFrontmatter(content: string, name: string): string {
    if (!content.startsWith('---\n')) {
        return `---\nname: ${name}\n---\n\n${content}`;
    }

    const end = content.indexOf('\n---', 4);
    if (end === -1) {
        return content;
    }

    const frontmatter = content.slice(4, end);
    if (/^name\s*:/m.test(frontmatter)) {
        return content;
    }

    return `---\nname: ${name}\n${content.slice(4)}`;
}
