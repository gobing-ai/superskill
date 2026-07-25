/**
 * Shared types for the skills-ecosystem interop module.
 *
 * Ported from vercel-labs/skills (vendors/skills/src/types.ts).
 * Copyright (c) 2026 Vercel, Inc. MIT License — see vendors/skills/LICENSE.
 * Only the subset of vendor types consumed by the ported parser/sanitizer
 * code is carried here; the vendor's agent table lives in agents.ts (task 0099).
 */

/**
 * A parsed skill source: where to fetch a skill (or set of skills) from.
 */
export interface ParsedSource {
    type: 'github' | 'gitlab' | 'git' | 'local' | 'well-known';
    url: string;
    subpath?: string;
    localPath?: string;
    ref?: string;
    /** Skill name extracted from @skill syntax (e.g., owner/repo@skill-name) */
    skillFilter?: string;
}
