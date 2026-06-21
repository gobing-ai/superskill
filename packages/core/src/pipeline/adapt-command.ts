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
 * `disable-model-invocation: true` is injected right after the opening `---` line
 * for command-as-skill files only (Refinement #6).
 */
function normalizeCommandFrontmatter(content: string, expectedName: string): string {
    const lines = content.split('\n');
    const out: string[] = [];
    let inFrontmatter = false;
    let pastOpener = false;
    let injectedName = false;
    const injectedDisable = false;
    let sawDisableModelInvocation = false;

    for (const line of lines) {
        if (!pastOpener) {
            if (line.trim() === '---') {
                inFrontmatter = true;
                pastOpener = true;
                out.push(line);
                // Inject name immediately after the opening delimiter
                out.push(`name: ${expectedName}`);
                injectedName = true;
                continue;
            }
            out.push(line);
            continue;
        }

        if (inFrontmatter) {
            if (line.trim() === '---') {
                // Closing delimiter — inject disable-model-invocation if not already present
                if (!injectedDisable && !sawDisableModelInvocation) {
                    out.push('disable-model-invocation: true');
                }
                inFrontmatter = false;
                out.push(line);
                continue;
            }
            // Skip existing name: (we already injected the correct one)
            if (/^name:\s*/.test(line)) continue;
            // Track if disable-model-invocation already exists
            if (/^disable-model-invocation:\s*/.test(line)) {
                sawDisableModelInvocation = true;
                out.push(line);
                continue;
            }
            // Normalize argument-hint: ensure double-quoted YAML string
            if (/^argument-hint:\s*/.test(line)) {
                const value = line.slice(line.indexOf(':') + 1).trim();
                out.push(`argument-hint: ${quoteYaml(value)}`);
                continue;
            }
            // Normalize allowed-tools: bare CSV → [a, b, c]
            if (/^allowed-tools:\s*/.test(line)) {
                const value = line.slice(line.indexOf(':') + 1).trim();
                if (value.startsWith('[')) {
                    out.push(line);
                    continue;
                }
                const parts = value
                    .split(/,\s*/)
                    .map((p) => p.trim())
                    .filter(Boolean);
                out.push(`allowed-tools: [${parts.join(', ')}]`);
                continue;
            }
            out.push(line);
            continue;
        }
        out.push(line);
    }

    // Safety: if we somehow never hit the opener, append the name
    if (!injectedName) {
        return `---\nname: ${expectedName}\ndisable-model-invocation: true\n---\n\n${content}`;
    }
    return out.join('\n');
}

/** Quote a YAML string value, escaping backslashes and double quotes. */
function quoteYaml(value: string): string {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
}
