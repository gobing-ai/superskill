import { parseFrontmatter } from '../content/frontmatter';
import { walkFrontmatter } from './frontmatter-walk';
import { normalizePiToolList, parseToolsList } from './pi-tools';
import { rewritePluginTreeMarkdownLinks } from './rewrite-plugin-tree-links';
import { rewriteSkillReferences } from './rewrite-references';
import { quoteYaml } from './yaml-utils';

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
        result = `---\nname: ${expectedName}\ndescription: ${quoteYaml(description)}\n---\n\n${source}`;
    }
    return rewritePluginTreeMarkdownLinks(rewriteSkillReferences(result, pluginPrefix), pluginPrefix);
}

/**
 * Inject `name` into subagent frontmatter. Does NOT add `disable-model-invocation`
 * (subagents stay model-invocable — Refinement #6).
 */
function normalizeSubagentFrontmatter(content: string, expectedName: string): string {
    return walkFrontmatter(content, {
        expectedName,
        fallbackBlock: `---\nname: ${expectedName}\n---`,
    });
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
    if (model.toLowerCase() === 'inherit') model = '';

    // Skills: explicit frontmatter first, then body scan (filtered to existing skills)
    const skillsList = resolvePiSkills(data, body, pluginPrefix, skillExists);
    const skillsCsv = skillsList.join(', ');

    // Build Pi-native YAML frontmatter — field order: name, description, tools, model, skill
    const fields: string[] = [`name: ${expectedName}`];
    if (description) fields.push(`description: ${quoteYaml(description)}`);
    if (piTools) fields.push(`tools: ${piTools}`);
    if (model) fields.push(`model: ${quoteYaml(model)}`);
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

// ── Codex native agents ─────────────────────────────────────────────────────

/**
 * Binary model-tier partition for Codex native agents.
 *
 * Per-agent `model` and `model_reasoning_effort` keys follow the schema observed in
 * real-world Codex agent TOML files and the spawn-time tool parameters confirmed in
 * codex-cli 0.146.0. Whether Codex honors file-level model keys at spawn is now
 * verified (task 0112, codex-cli 0.147.0): the official subagents contract states
 * file-level `model`/`model_reasoning_effort` take precedence, and a scratch-home
 * probe confirmed custom-agent directory discovery.
 * Rather than forwarding raw Claude `model:` values (`sonnet`/`opus`/`inherit`),
 * which are Claude-scoped, the adapter maps a declarative `model-tier:` frontmatter
 * field to a fixed Codex model + reasoning-effort pair. Two tiers only - judgment
 * (deliberation, design, review) and execution (coding, mechanical work).
 * Model slugs pinned to the `codex debug models` catalog of codex-cli 0.146.0 (2026-08-02).
 *
 * Default tier when `model-tier:` is absent: `execution` (most subagents are doers).
 */
export const CODEX_MODEL_TIERS = {
    judgment: { model: 'gpt-5.6-sol', model_reasoning_effort: 'medium' },
    execution: { model: 'gpt-5.6-luna', model_reasoning_effort: 'max' },
} as const;

/** Valid Codex model-tier keys, each mapping to a per-agent `model` + `model_reasoning_effort` pair. */
export type CodexModelTier = keyof typeof CODEX_MODEL_TIERS;

/**
 * Adapt a Claude Code subagent `.md` file into the Codex native agent TOML format.
 *
 * Emits files following the `~/.codex/agents/*.toml` convention. Directory discovery
 * is now verified (task 0112, codex-cli 0.147.0): custom agents load as standalone
 * TOML files under `~/.codex/agents/` or `.codex/agents/` with no per-agent
 * `[agents.<name>]` registration. The adapter emits a TOML document
 * with this key order:
 *
 * 1. `name` - the expected (dispatch-name) agent identifier
 * 2. `description` - from frontmatter, or synthesized from the first body line
 * 3. `model` - resolved from `CODEX_MODEL_TIERS` via the `model-tier:` frontmatter field
 * 4. `model_reasoning_effort` - paired with the model
 * 5. `developer_instructions` - the agent body (skill references rewritten)
 *
 * Raw Claude `model:` values are never forwarded - they are Claude-scoped. The
 * `model-tier:` field (`judgment` | `execution`) is the only model signal honored;
 * an unknown value throws. When absent, `execution` is assumed.
 *
 * `developer_instructions` uses a TOML literal block (`'''`) when the body contains
 * no `'''` sequence, falling back to a multiline basic string (`"""`) otherwise.
 * An empty body is backfilled from the description so Codex never sees a blank
 * instructions field.
 */
export function adaptSubagentToCodex(source: string, expectedName: string, pluginPrefix: string): string {
    let data: Record<string, unknown>;
    let body: string;
    try {
        const fm = parseFrontmatter(source);
        data = fm.data;
        body = fm.body.trim();
    } catch {
        data = {};
        body = source.trim();
    }

    // Description: from frontmatter, else first non-heading body line, else fallback.
    let description = asString(data.description);
    if (!description) {
        const firstLine = body
            .split('\n')
            .slice(0, 5)
            .find((l) => l.trim() && !l.startsWith('#'));
        description = firstLine?.trim() || `${expectedName} subagent`;
    }

    // Body: rewrite plugin:skill references; backfill from description if empty.
    let adaptedBody = rewriteSkillReferences(body, pluginPrefix).trim();
    if (!adaptedBody) {
        adaptedBody = description;
    }

    // Resolve model tier. Unknown declared value throws; absent defaults to execution.
    const declaredTier = asString(data['model-tier']);
    let tier: CodexModelTier;
    if (declaredTier) {
        if (declaredTier !== 'judgment' && declaredTier !== 'execution') {
            throw new Error(
                `Agent "${expectedName}" declares unknown model-tier "${declaredTier}". Valid values: judgment, execution.`,
            );
        }
        tier = declaredTier;
    } else {
        tier = 'execution';
    }
    const tierMapping = CODEX_MODEL_TIERS[tier];

    // Emit TOML in pinned key order.
    const lines: string[] = [];
    lines.push(`name = ${tomlBasicString(expectedName)}`);
    lines.push(`description = ${tomlBasicString(description)}`);
    lines.push(`model = ${tomlBasicString(tierMapping.model)}`);
    lines.push(`model_reasoning_effort = ${tomlBasicString(tierMapping.model_reasoning_effort)}`);

    if (!adaptedBody.includes("'''")) {
        lines.push(`developer_instructions = '''`);
        lines.push(adaptedBody);
        lines.push(`'''`);
    } else {
        lines.push(`developer_instructions = ${tomlMultilineBasicString(adaptedBody)}`);
    }

    return `${lines.join('\n')}\n`;
}

/** Escape a string as a TOML basic string: `"..."` with backslash/quote/control escaping. */
function tomlBasicString(value: string): string {
    let escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
    // Escape remaining C0 control characters (excluding already-handled \r \n \t) as \uXXXX.
    // TOML also requires escaping DEL (U+007F) in basic strings.
    escaped = escaped.replace(/[\s\S]/g, (ch) => {
        const code = ch.charCodeAt(0);
        if ((code < 0x20 && ch !== '\r' && ch !== '\n' && ch !== '\t') || code === 0x7f) {
            return `\\u${code.toString(16).padStart(4, '0')}`;
        }
        return ch;
    });
    return `"${escaped}"`;
}

/** Escape a string as a TOML multiline basic string: `"""..."""` with `"""` -> `""\"` escaping. */
function tomlMultilineBasicString(value: string): string {
    const escaped = value.replace(/"""/g, '""\\"');
    return `"""\n${escaped}\n"""`;
}
