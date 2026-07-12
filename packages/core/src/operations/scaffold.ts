import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { assertSafePathSegment } from '../content/identity';
import type { ContentType } from '../content/types';
import agentDefaultTemplate from '../templates/agent/default.md' with { type: 'text' };
import agentMinimalTemplate from '../templates/agent/minimal.md' with { type: 'text' };
import agentSpecialistTemplate from '../templates/agent/specialist.md' with { type: 'text' };
import agentStandardTemplate from '../templates/agent/standard.md' with { type: 'text' };
import commandDefaultTemplate from '../templates/command/default.md' with { type: 'text' };
import commandPluginTemplate from '../templates/command/plugin.md' with { type: 'text' };
import commandSimpleTemplate from '../templates/command/simple.md' with { type: 'text' };
import commandWorkflowTemplate from '../templates/command/workflow.md' with { type: 'text' };
import magentDefaultTemplate from '../templates/magent/default.md' with { type: 'text' };
import skillDefaultTemplate from '../templates/skill/default.md' with { type: 'text' };
import skillPatternTemplate from '../templates/skill/pattern.md' with { type: 'text' };
import skillReferenceTemplate from '../templates/skill/reference.md' with { type: 'text' };
import skillTechniqueTemplate from '../templates/skill/technique.md' with { type: 'text' };

/** Options for the scaffold operation. */
export interface ScaffoldOptions {
    /** Description to substitute for `<!-- DESCRIPTION -->`. Defaults to `''`. */
    description?: string;
    /** Target platform to substitute for `<!-- TARGET -->`. Defaults to `'claude'`. */
    target?: string;
    /** Output directory. Defaults to `process.cwd()`. */
    output?: string;
    /** Overwrite existing files. */
    force?: boolean;
    /**
     * Template tier name (e.g. `minimal` / `standard` / `specialist`). Resolves `<type>/<tier>.md`
     * from the built-in `packages/core/src/templates` directory.
     */
    template?: string;
    /** Comma-separated or array tool names to pre-populate frontmatter `tools:`. */
    tools?: string[] | string;
    /**
     * Invocation mode (skill type only): `'user'` emits `disable-model-invocation: true`
     * plus a one-line human-facing description guidance block; `'model'` (default) emits
     * trigger-rich description guidance. No-op for non-skill types.
     */
    invocationMode?: 'user' | 'model';
}

const PLACEHOLDER_NAME = '<!-- NAME -->';
const PLACEHOLDER_DESCRIPTION = '<!-- DESCRIPTION -->';
const PLACEHOLDER_TARGET = '<!-- TARGET -->';
const PLACEHOLDER_BODY = '<!-- BODY -->';
const PLACEHOLDER_TOOLS = '<!-- TOOLS -->';

/** Parse a `--tools` value (string list or comma-separated string) into a clean array. */
function parseList(value: string[] | string | undefined): string[] {
    if (value === undefined) return [];
    if (Array.isArray(value)) {
        return value.map((v) => v.trim()).filter((v) => v.length > 0);
    }
    return value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
}

/** Render an array as a YAML inline array string (`[a, b, c]` or `[]`). */
function toYamlArray(items: string[]): string {
    return `[${items.join(', ')}]`;
}

/**
 * Substitute `<!-- VARIABLE -->` placeholders in a template string.
 *
 * Replacements:
 * - `<!-- NAME -->` → `vars.name`
 * - `<!-- DESCRIPTION -->` → `vars.description ?? ''`
 * - `<!-- TARGET -->` → `vars.target ?? 'claude'`
 * - `<!-- BODY -->` → `vars.body ?? ''`
 * - `<!-- TOOLS -->` → YAML inline array of tools (e.g. `[Read, Write]`) or `[]`
 */
function substituteVars(
    template: string,
    vars: {
        name: string;
        description: string;
        target: string;
        body: string;
        tools: string[];
    },
): string {
    return template
        .replaceAll(PLACEHOLDER_NAME, vars.name)
        .replaceAll(PLACEHOLDER_DESCRIPTION, vars.description)
        .replaceAll(PLACEHOLDER_TARGET, vars.target)
        .replaceAll(PLACEHOLDER_BODY, vars.body)
        .replaceAll(PLACEHOLDER_TOOLS, toYamlArray(vars.tools));
}

/**
 * Override or insert a frontmatter list key with an explicit value. Type-agnostic: scans
 * only the leading YAML block (between the first two `---` fences). If the key exists, its
 * line is rewritten to the rendered YAML array; if absent, the key is inserted before the
 * closing fence. No-op when `items` is empty (preserves the template's own default).
 */
function mergeFrontmatterList(content: string, key: string, items: string[]): string {
    if (items.length === 0) return content;
    // Find YAML fences by line-anchored match (not substring scan), so a --- HR
    // in the body is never misidentified as the closing fence (F3 fix).
    const fenceRe = /^---$/gm;
    const matches = [...content.matchAll(fenceRe)];
    if (matches.length < 2) return content;
    const openPos = matches[0]?.index ?? 0;
    const closePos = matches[1]?.index ?? 0;
    // Frontmatter body: after the opening --- line, before the closing --- line.
    const fmStart = openPos + 3; // skip past "---"
    const fmBody = content.slice(fmStart, closePos);
    const yamlValue = toYamlArray(items);
    const pattern = new RegExp(`^${key}:.*$`, 'm');
    let newFmBody: string;
    if (pattern.test(fmBody)) {
        newFmBody = fmBody.replace(pattern, `${key}: ${yamlValue}`);
    } else {
        newFmBody = `${fmBody}${key}: ${yamlValue}\n`;
    }
    return content.slice(0, fmStart) + newFmBody + content.slice(closePos);
}

/**
 * Override or insert a frontmatter scalar key with an explicit raw value (e.g.
 * `disable-model-invocation: true`). Same fence-scanning approach as
 * {@link mergeFrontmatterList} (line-anchored `---` fences so a body HR is never
 * mistaken for the closing fence), but for a single scalar rather than an array.
 */
function mergeFrontmatterScalar(content: string, key: string, value: string): string {
    const fenceRe = /^---$/gm;
    const matches = [...content.matchAll(fenceRe)];
    if (matches.length < 2) return content;
    const openPos = matches[0]?.index ?? 0;
    const closePos = matches[1]?.index ?? 0;
    const fmStart = openPos + 3;
    const fmBody = content.slice(fmStart, closePos);
    const pattern = new RegExp(`^${key}:.*$`, 'm');
    let newFmBody: string;
    if (pattern.test(fmBody)) {
        newFmBody = fmBody.replace(pattern, `${key}: ${value}`);
    } else {
        newFmBody = `${fmBody}${key}: ${value}\n`;
    }
    return content.slice(0, fmStart) + newFmBody + content.slice(closePos);
}

/** Built-in templates are text imports so Bun embeds them in bundles and standalone executables. */
const BUILTIN_TEMPLATES: Partial<Record<ContentType, Record<string, string>>> = {
    agent: {
        default: agentDefaultTemplate,
        minimal: agentMinimalTemplate,
        specialist: agentSpecialistTemplate,
        standard: agentStandardTemplate,
    },
    command: {
        default: commandDefaultTemplate,
        plugin: commandPluginTemplate,
        simple: commandSimpleTemplate,
        workflow: commandWorkflowTemplate,
    },
    magent: { default: magentDefaultTemplate },
    skill: {
        default: skillDefaultTemplate,
        pattern: skillPatternTemplate,
        reference: skillReferenceTemplate,
        technique: skillTechniqueTemplate,
    },
};

/**
 * Resolve the template content for a given type and optional tier.
 *
 * Resolution order:
 * 1. `~/.superskill/templates/<type>/<tier>.md` (user override) — when `tier` is given
 * 2. Bundled `<type>/<tier>.md` text (built-in) — when `tier` is given
 * 3. `~/.superskill/templates/<type>/default.md` (user override) — fallback
 * 4. Bundled `<type>/default.md` text (built-in) — always exists
 *
 * Built-in `default.md` always exists; resolution never falls through.
 * An explicit tier that resolves to no file (user or built-in) throws a clear error.
 */
function resolveTemplate(type: ContentType, tier?: string): string {
    const homeDir = process.env.HOME ?? homedir();
    const tierName = tier?.trim();
    if (tierName) assertSafePathSegment(tierName, 'template tier');

    // Tier-specific resolution.
    if (tierName && tierName !== 'default') {
        const userTierPath = join(homeDir, '.superskill', 'templates', type, `${tierName}.md`);
        if (existsSync(userTierPath)) {
            return readFileSync(userTierPath, 'utf-8');
        }
        const builtInTemplate = BUILTIN_TEMPLATES[type]?.[tierName];
        if (builtInTemplate) return builtInTemplate;
        throw new Error(
            `Unknown template tier "${tierName}" for type "${type}". ` +
                `No user override (~/.superskill/templates/${type}/${tierName}.md) ` +
                `or built-in template found. Omit --template to use the default tier.`,
        );
    }

    // Default tier resolution (unchanged behavior for the no-`--template` path).
    const userPath = join(homeDir, '.superskill', 'templates', type, 'default.md');
    if (existsSync(userPath)) {
        return readFileSync(userPath, 'utf-8');
    }
    const defaultTemplate = BUILTIN_TEMPLATES[type]?.default;
    if (defaultTemplate) return defaultTemplate;
    // Unreachable in practice: default.md always ships alongside the package.
    throw new Error(`No built-in default template found for type "${type}".`);
}

/**
 * Scaffold a new content file from a resolved template.
 *
 * @param type  Content type: `'skill' | 'command' | 'agent' | 'magent'`.
 * @param name  Content name used in `<!-- NAME -->` substitution and filename.
 * @param opts  Optional description, target, output directory, tier, skills, tools, and force flag.
 * @returns     The resolved absolute path of the created file.
 */
export async function scaffold(type: ContentType, name: string, opts: ScaffoldOptions = {}): Promise<string> {
    const validTypes: ContentType[] = ['skill', 'command', 'agent', 'magent'];
    if (!validTypes.includes(type)) {
        throw new Error(`Unknown content type: "${type}". Expected one of: ${validTypes.join(', ')}`);
    }
    // Reject unsafe names that could escape the output directory (F1 fix).
    assertSafePathSegment(name, 'content name');

    const template = resolveTemplate(type, opts.template);
    let content = substituteVars(template, {
        name,
        description: opts.description ?? '',
        target: opts.target ?? 'claude',
        body: '',
        tools: parseList(opts.tools),
    });

    // When --tools are provided, override the corresponding frontmatter key
    // using the type's canonical field name (F2 fix).
    // agent → tools: ; skill/command/magent → allowed-tools:
    const toolField = type === 'agent' ? 'tools' : 'allowed-tools';
    content = mergeFrontmatterList(content, toolField, parseList(opts.tools));

    // Invocation axis (R3/task 0070): skill-only. `invocationMode: 'user'` emits
    // `disable-model-invocation: true` plus a one-line human-facing description
    // guidance comment; `'model'` (default, and the no-op for every other type)
    // emits trigger-rich description guidance instead. This is scaffold-time
    // GUIDANCE only — it never overwrites an explicit --description; it only
    // injects the frontmatter key and, when no description was supplied, a
    // placeholder comment describing the shape the author should write.
    if (type === 'skill' && opts.invocationMode === 'user') {
        content = mergeFrontmatterScalar(content, 'disable-model-invocation', 'true');
        if (!opts.description) {
            content = content.replace(
                /^description: *$/m,
                'description: # One-line, human-facing: what this does, no trigger phrasing (user picks this skill directly)',
            );
        }
    } else if (type === 'skill' && !opts.description) {
        content = content.replace(
            /^description: *$/m,
            'description: # Trigger-rich: front-load the identity phrase, one branch per genuine "use when" case',
        );
    }

    const outDir = opts.output ?? cwd();
    mkdirSync(outDir, { recursive: true });

    // Skills are directory-based: write <name>/SKILL.md inside a directory.
    // All other types remain flat <name>.md files.
    const filePath = type === 'skill' ? join(outDir, name, 'SKILL.md') : join(outDir, `${name}.md`);
    if (type === 'skill') {
        mkdirSync(join(outDir, name), { recursive: true });
    }

    if (existsSync(filePath) && !opts.force) {
        throw new Error(`${filePath} already exists — pass --force to overwrite`);
    }

    writeFileSync(filePath, content, 'utf-8');
    return filePath;
}
