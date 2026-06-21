import { parseFrontmatter } from '../content/frontmatter';
import { expandPiToolName, normalizePiToolList, parseToolsList } from './pi-tools';

/** @deprecated Use {@link expandPiToolName} from `pi-tools.ts` instead. Kept for backward compatibility. */
export function expandPiTool(raw: string): string {
    return expandPiToolName(raw);
}

/** Re-export from the canonical `pi-tools.ts` for backward compatibility. */
export { parseToolsList };

/** Extract colon-separated skill references from prose text. */
export function extractSkillsFromBody(body: string): string[] {
    const matches = body.matchAll(/\b([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)\b/gi);
    const skills = new Set<string>();
    for (const m of matches) {
        skills.add(`${m[1]}-${m[2]}`);
    }
    return [...skills];
}

/** Coerce a frontmatter value to string. Handles flow-style arrays (`[Read, Write]` → `"Read, Write"`). */
function asString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return '';
}

/** Build Pi runtime adaptation notes based on detected tools. */
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

/**
 * Convert a Skills 2.0 subagent file to the Pi native agent YAML format.
 */
export function convertToPiSubagent(content: string): string {
    let data: Record<string, unknown>;
    let body: string;
    try {
        const fm = parseFrontmatter(content);
        data = fm.data;
        body = fm.body.trim();
    } catch {
        return content;
    }

    // Extract tools → Pi CSV (uses the canonical normalizer from pi-tools.ts)
    const rawToolsStr = asString(data.tools);
    const rawTools = parseToolsList(rawToolsStr);
    const piTools = normalizePiToolList(rawToolsStr);

    // Extract skills from frontmatter → normalise colons
    const rawSkillsStr = asString(data.skills) || asString(data.skill);
    const explicitSkills = rawSkillsStr ? rawSkillsStr.split(',').map((s) => s.trim().replace(':', '-')) : [];

    // Fallback: scan body for skill references
    let skillsList = explicitSkills;
    if (skillsList.length === 0) {
        skillsList = extractSkillsFromBody(body);
    }
    const skillsCsv = skillsList.join(', ');

    // Model: drop "inherit"
    let model = asString(data.model);
    if (model === 'inherit') model = '';

    // Build Pi-native YAML frontmatter — pinned field order: name, description, tools, model, skill
    const piFields: string[] = [];
    piFields.push(`name: ${asString(data.name)}`);
    if (data.description) piFields.push(`description: ${asString(data.description)}`);
    if (piTools) piFields.push(`tools: ${piTools}`);
    if (model) piFields.push(`model: ${model}`);
    if (skillsCsv) piFields.push(`skill: ${skillsCsv}`);

    // Runtime notes
    const runtimeNotes = buildPiRuntimeNotes(rawTools, skillsCsv);
    const finalBody = runtimeNotes ? `${body}\n\n${runtimeNotes}` : body;

    return `---\n${piFields.join('\n')}\n---\n\n${finalBody}\n`;
}
