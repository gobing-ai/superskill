/**
 * Minimal SKILL.md frontmatter parser. Only supports YAML (the `---`
 * delimiter). Does NOT support `---js` / `---javascript` to avoid the
 * eval()-based RCE in gray-matter's built-in JS engine.
 *
 * `parseFrontmatter` is ported verbatim (behavior-identical) from
 * vercel-labs/skills (vendors/skills/src/frontmatter.ts).
 * Copyright (c) 2026 Vercel, Inc. MIT License — see vendors/skills/LICENSE.
 */
import { parse as parseYaml } from 'yaml';

/**
 * A SKILL.md frontmatter parse that satisfies the interop contract:
 * `name` and `description` are both present strings.
 */
export interface ParsedSkillFrontmatter {
    /** Skill name from frontmatter (required string). */
    name: string;
    /** Skill description from frontmatter (required string). */
    description: string;
    /** Full parsed frontmatter mapping, including extra keys. */
    data: Record<string, unknown>;
    /** Markdown body after the frontmatter block. */
    content: string;
}

/**
 * Split raw SKILL.md content into its YAML frontmatter mapping and markdown
 * body. Returns `{ data: {}, content: raw }` when there is no `---` block.
 */
export function parseFrontmatter(raw: string): {
    data: Record<string, unknown>;
    content: string;
} {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: raw };
    const data = (parseYaml(match[1] ?? '') as Record<string, unknown>) ?? {};
    return { data, content: match[2] ?? '' };
}

/**
 * Parse SKILL.md content and validate the interop contract: `name` and
 * `description` must both be present and be strings (the same check the
 * vendor applies at every discovery site). Returns null when the contract
 * is not met — callers skip the skill, matching vendor behavior.
 */
export function parseSkillFrontmatter(raw: string): ParsedSkillFrontmatter | null {
    const { data, content } = parseFrontmatter(raw);
    if (typeof data.name !== 'string' || typeof data.description !== 'string') return null;
    return { name: data.name, description: data.description, data, content };
}
