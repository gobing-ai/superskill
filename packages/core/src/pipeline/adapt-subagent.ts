import { parseFrontmatter } from '../content/frontmatter';
import { normalizePiToolList, parseToolsList } from './pi-tools';
import { rewriteSkillReferences } from './rewrite-references';

/** Coerce a frontmatter value to string (handles flow-style arrays). */
function asString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return '';
}

/**
 * Adapt a Claude Code subagent `.md` file into a Skills 2.0 skill directory entry.
 *
 * Mirrors `subagents.sh:285-331`. The adaptation:
 *
 * - Injects `name: <expectedName>` as the first frontmatter field (replaces existing `name:`)
 * - Preserves description, tools, model, skills, color, and all other fields
 * - Does NOT set `disable-model-invocation` — subagents must remain model-invocable (Refinement #6)
 * - Rewrites `pluginPrefix:name` → `pluginPrefix-name` references
 *
 * If the source has no frontmatter, a minimal stub is generated.
 */
export function adaptSubagentToSkill(source: string, expectedName: string, pluginPrefix: string): string {
    let result: string;
    if (source.startsWith('---')) {
        result = normalizeSubagentFrontmatter(source, expectedName);
    } else {
        const firstLine = source
            .split('\n')
            .slice(0, 5)
            .find((l) => l.trim() && !l.startsWith('#'));
        const description = firstLine?.trim() || `${expectedName} subagent`;
        result = `---\nname: ${expectedName}\ndescription: "${description}"\n---\n\n${source}`;
    }
    return rewriteSkillReferences(result, pluginPrefix);
}

/**
 * Inject `name` into subagent frontmatter. Does NOT add `disable-model-invocation`
 * (subagents stay model-invocable — Refinement #6).
 */
function normalizeSubagentFrontmatter(content: string, expectedName: string): string {
    const lines = content.split('\n');
    const out: string[] = [];
    let inFrontmatter = false;
    let pastOpener = false;
    let injectedName = false;

    for (const line of lines) {
        if (!pastOpener) {
            if (line.trim() === '---') {
                inFrontmatter = true;
                pastOpener = true;
                out.push(line);
                out.push(`name: ${expectedName}`);
                injectedName = true;
                continue;
            }
            out.push(line);
            continue;
        }
        if (inFrontmatter) {
            if (line.trim() === '---') {
                inFrontmatter = false;
                out.push(line);
                continue;
            }
            // Skip existing name: (we already injected the correct one)
            if (/^name:\s*/.test(line)) continue;
            out.push(line);
            continue;
        }
        out.push(line);
    }
    if (!injectedName) {
        return `---\nname: ${expectedName}\n---\n\n${content}`;
    }
    return out.join('\n');
}

/**
 * Adapt a Claude Code subagent `.md` file into the Pi native agent YAML format.
 *
 * Mirrors `subagents.sh:452-510`. Field order is pinned: `name, description, tools,
 * model, skill` (Refinement #4). Skills discovered from the body are filtered to
 * those that actually exist (per `skillExists`) to prevent phantom entries.
 *
 * @param source         Raw subagent markdown content
 * @param expectedName   The `cc-<name>` canonical name
 * @param pluginPrefix   Plugin prefix (e.g. `cc`) for reference rewriting
 * @param skillExists    Predicate returning true when a bare skill name resolves
 *                       to a real skill directory in the plugin (filters phantom
 *                       body-discovered skills). Callers supply the default FS
 *                       implementation; tests inject a pure predicate.
 */
export function adaptSubagentToPi(
    source: string,
    expectedName: string,
    pluginPrefix: string,
    skillExists: (bareName: string) => boolean,
): string {
    let data: Record<string, unknown>;
    let body: string;
    try {
        const fm = parseFrontmatter(source);
        data = fm.data;
        body = fm.body.trim();
    } catch {
        // No parseable frontmatter — emit a minimal Pi agent
        const minimal = `---\nname: ${expectedName}\n---\n\n${source}`;
        return rewriteSkillReferences(minimal, pluginPrefix);
    }

    // Tools → Pi CSV
    const rawToolsStr = asString(data.tools);
    const piTools = normalizePiToolList(rawToolsStr);

    // Description (preserve multi-line if present in original frontmatter)
    const description = asString(data.description) || `${expectedName} subagent`;

    // Model: drop "inherit"
    let model = asString(data.model);
    if (model === 'inherit') model = '';

    // Skills: explicit frontmatter first, then body scan (filtered to existing skills)
    const skillsList = resolvePiSkills(data, body, pluginPrefix, skillExists);
    const skillsCsv = skillsList.join(', ');

    // Build Pi-native YAML frontmatter — field order: name, description, tools, model, skill
    const fields: string[] = [`name: ${expectedName}`];
    if (description) fields.push(`description: ${description}`);
    if (piTools) fields.push(`tools: ${piTools}`);
    if (model) fields.push(`model: ${model}`);
    if (skillsCsv) fields.push(`skill: ${skillsCsv}`);

    const runtimeNotes = buildPiRuntimeNotes(parseToolsList(rawToolsStr), skillsCsv);
    const finalBody = runtimeNotes ? `${body}\n\n${runtimeNotes}` : body;

    const result = `---\n${fields.join('\n')}\n---\n\n${finalBody}\n`;
    return rewriteSkillReferences(result, pluginPrefix);
}

/**
 * Resolve the `skill:` list for a Pi agent.
 *
 * 1. Explicit frontmatter `skills`/`skill` field (colon→hyphen normalized)
 * 2. Fallback: scan body for `plugin:name` references, filter to skills that
 *    pass `skillExists(bareName)` (Refinement #4). The predicate decouples this
 *    pipeline module from the filesystem so both branches are unit-testable
 *    without a real plugin directory.
 */
function resolvePiSkills(
    data: Record<string, unknown>,
    body: string,
    pluginPrefix: string,
    skillExists: (bareName: string) => boolean,
): string[] {
    const rawSkillsStr = asString(data.skills) || asString(data.skill);
    if (rawSkillsStr) {
        // Explicit frontmatter skills — normalize colons but don't existence-filter
        // (explicit declarations are authoritative)
        const seen = new Set<string>();
        const out: string[] = [];
        for (const s of rawSkillsStr.split(',')) {
            const normalized = s.trim().replace(/:/g, '-');
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized);
                out.push(normalized);
            }
        }
        return out;
    }

    // Body scan — filter to skills that exist per the injected predicate (Refinement #4)
    const prefix = `${pluginPrefix}:`;
    const seen = new Set<string>();
    const out: string[] = [];

    const matches = body.matchAll(/\b([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)\b/gi);
    for (const m of matches) {
        const fullRef = `${m[1]}-${m[2]}`;
        // Only refs scoped to this plugin, and only those that resolve to a real skill dir
        if (`${m[1]}:${m[2]}`.startsWith(prefix) && !seen.has(fullRef)) {
            // Old subagents.sh:365-383 checks plugins/<plugin>/skills/<normalized#${PLUGIN}->
            // i.e. strip the plugin prefix from the full ref to get the bare skill dir name
            const dirName = fullRef.startsWith(`${pluginPrefix}-`) ? fullRef.slice(pluginPrefix.length + 1) : fullRef;
            if (skillExists(dirName)) {
                seen.add(fullRef);
                out.push(fullRef);
            }
        }
    }
    return out;
}

/** Build Pi runtime adaptation notes based on detected tools. Mirrors `subagents.sh:388-450`. */
function buildPiRuntimeNotes(rawTools: string[], skillsCsv: string): string {
    const toolSet = new Set(rawTools.map((t) => t.trim()));
    const sections: string[] = [];

    if ((toolSet.has('Skill') || toolSet.has('skill')) && skillsCsv) {
        sections.push(
            `- Skills in \`skill:\` are injected into this prompt. Treat any mention of a Skill tool as applying those injected skills directly: \`${skillsCsv}\`.\n`,
        );
    }
    if (toolSet.has('Agent') || toolSet.has('agent') || toolSet.has('subagent')) {
        sections.push("- Any mention of an Agent tool or agent delegation maps to Pi's `subagent` tool.\n");
    }
    if (toolSet.has('AskUserQuestion') || toolSet.has('askuserquestion')) {
        sections.push(
            '- Any AskUserQuestion-style step should be handled by asking the user directly in the conversation.\n',
        );
    }
    if (toolSet.has('Task') || toolSet.has('task')) {
        sections.push('- Any Task tool reference should be handled with repository files or CLI workflows.\n');
    }
    if (toolSet.has('Glob') || toolSet.has('glob')) {
        sections.push("- File discovery maps to Pi's `find` and `ls` tools instead of Claude-style Glob.\n");
    }
    if (
        toolSet.has('WebSearch') ||
        toolSet.has('WebFetch') ||
        toolSet.has('web_search') ||
        rawTools.some((t) => t.startsWith('mcp__'))
    ) {
        sections.push(
            '- Web research maps to Pi web-access style tools (`web_search`, `fetch_content`, `get_search_content`). Install `pi-web-access` if you want those capabilities available.\n',
        );
    }

    if (sections.length === 0) return '';
    return `## Pi Runtime Adaptation\n\n${sections.join('\n')}`;
}
