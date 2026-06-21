import { walkFrontmatter } from './frontmatter-walk';
import { rewriteSkillReferences } from './rewrite-references';

/**
 * Adapt a Claude Code command `.md` file into a Skills 2.0 skill directory entry.
 *
 * Mirrors `commands.sh:128-217` / `skills.sh:339-363`. The adaptation:
 *
 * - Injects `name: <expectedName>` as the first frontmatter field (replaces existing `name:`)
 * - Sets `disable-model-invocation: true` (commands only — prevents LLM invocation on load)
 * - Normalizes `argument-hint` to a double-quoted YAML string
 * - Normalizes `allowed-tools` from bare CSV to a YAML-style `[a, b, c]` array
 * - Rewrites `pluginPrefix:name` → `pluginPrefix-name` references
 *
 * If the source has no frontmatter, a minimal stub is generated.
 */
export function adaptCommandToSkill(source: string, expectedName: string, pluginPrefix: string): string {
    let result: string;
    if (source.startsWith('---')) {
        result = normalizeCommandFrontmatter(source, expectedName);
    } else {
        // No frontmatter — derive a description from the first non-heading line
        const firstLine = source
            .split('\n')
            .slice(0, 5)
            .find((l) => l.trim() && !l.startsWith('#'));
        const description = firstLine?.trim() || `${expectedName} command`;
        result = `---\nname: ${expectedName}\ndescription: "${description}"\ndisable-model-invocation: true\n---\n\n${source}`;
    }
    return rewriteSkillReferences(result, pluginPrefix);
}

/**
 * Inject `name`, set `disable-model-invocation`, normalize argument-hint / allowed-tools.
 *
 * Mirrors the awk logic in `commands.sh:128-189` / `skills.sh:276-337`.
 * `disable-model-invocation: true` is injected for command-as-skill files only
 * (Refinement #6) — at the closer, unless the source already declares it.
 */
function normalizeCommandFrontmatter(content: string, expectedName: string): string {
    return walkFrontmatter(content, {
        expectedName,
        lineRules: [
            {
                // Normalize argument-hint: ensure double-quoted YAML string
                test: (line) => /^argument-hint:\s*/.test(line),
                rewrite: (line) => `argument-hint: ${quoteYaml(line.slice(line.indexOf(':') + 1).trim())}`,
            },
            {
                // Normalize allowed-tools: bare CSV → [a, b, c]; leave existing arrays as-is
                test: (line) => /^allowed-tools:\s*/.test(line),
                rewrite: (line) => {
                    const value = line.slice(line.indexOf(':') + 1).trim();
                    if (value.startsWith('[')) return line;
                    const parts = value
                        .split(/,\s*/)
                        .map((p) => p.trim())
                        .filter(Boolean);
                    return `allowed-tools: [${parts.join(', ')}]`;
                },
            },
        ],
        closerInjection: {
            lines: ['disable-model-invocation: true'],
            shouldInject: (seen) => !seen.some((l) => /^disable-model-invocation:\s*/.test(l)),
        },
        fallbackBlock: `---\nname: ${expectedName}\ndisable-model-invocation: true\n---`,
    });
}

/** Quote a YAML string value, escaping backslashes and double quotes. */
function quoteYaml(value: string): string {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}
