/**
 * Pi tool-name normalization.
 *
 * Extracted from the monolithic `pi-subagent.ts` so the mapper and install pipeline
 * can share the canonical mapping without importing Pi-subagent-specific logic.
 * Mirrors `common.sh:189-324`.
 */

/** Map Claude Code tool names to Pi tool names. Some expand to multiple tokens. */
const PI_TOOL_MAP: Record<string, string> = {
    Read: 'read',
    read: 'read',
    Write: 'write',
    write: 'write',
    Edit: 'edit',
    edit: 'edit',
    Bash: 'bash',
    bash: 'bash',
    Grep: 'grep',
    grep: 'grep',
    Glob: 'find, ls',
    glob: 'find, ls',
    Find: 'find',
    find: 'find',
    Ls: 'ls',
    LS: 'ls',
    ls: 'ls',
    Agent: 'subagent',
    agent: 'subagent',
    subagent: 'subagent',
    WebSearch: 'web_search, fetch_content, get_search_content',
    WebFetch: 'web_search, fetch_content, get_search_content',
    web_search: 'web_search',
    fetch_content: 'fetch_content',
    get_search_content: 'get_search_content',
    mcp: 'mcp',
};

/** Claude tools that have no Pi equivalent and are dropped. */
const DROPPED_TOOLS = new Set(['Skill', 'skill', 'Task', 'task', 'AskUserQuestion', 'askuserquestion']);

/** Expand a single Claude tool name to a deduplicated, comma-separated Pi tool list. */
export function expandPiToolName(raw: string): string {
    const trimmed = raw.trim().replace(/^["']|["']$/g, '');
    if (DROPPED_TOOLS.has(trimmed)) return '';
    if (trimmed.startsWith('mcp__') || trimmed.startsWith('mcp:')) return 'mcp';
    return PI_TOOL_MAP[trimmed] ?? '';
}

/** Parse a YAML list value (e.g. `[Read, Write]`) into an array of trimmed strings. */
export function parseToolsList(raw: string): string[] {
    const trimmed = raw.trim();
    const cleaned = trimmed.replace(/^\[|\]$/g, '');
    if (!cleaned.trim()) return [];
    return cleaned
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

/**
 * Normalize a raw tool-list string into a deduplicated Pi tool CSV.
 *
 * Accepts flow-style arrays (`[Read, Write]`), block-style arrays, and bare CSV.
 * Expands each token via {@link expandPiToolName}, deduplicates, joins with `, `.
 */
export function normalizePiToolList(raw: string): string {
    const parts = parseToolsList(raw);
    const mapped: string[] = [];
    for (const part of parts) {
        for (const token of expandPiToolName(part)
            .split(',')
            .map((t) => t.trim())) {
            if (token && !mapped.includes(token)) mapped.push(token);
        }
    }
    return mapped.join(', ');
}

/**
 * Rewrite the `allowed-tools:` frontmatter field in Pi format.
 *
 * Reads the current `allowed-tools:` value from frontmatter, normalizes each tool
 * via {@link normalizePiToolList}, and writes it back. Leaves body and other
 * frontmatter fields untouched. Mirrors `common.sh:269-324`.
 */
export function rewriteAllowedToolsForPi(content: string): string {
    const lines = content.split('\n');
    let inFrontmatter = false;
    let pastOpener = false;
    const out: string[] = [];

    for (const line of lines) {
        if (!pastOpener) {
            if (line.trim() === '---') {
                inFrontmatter = true;
                pastOpener = true;
                out.push(line);
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
            const match = /^allowed-tools:\s*(.*)$/.exec(line);
            if (match && match[1] !== undefined) {
                const normalized = normalizePiToolList(match[1]);
                out.push(normalized ? `allowed-tools: ${normalized}` : 'allowed-tools: ');
                continue;
            }
        }
        out.push(line);
    }
    return out.join('\n');
}
