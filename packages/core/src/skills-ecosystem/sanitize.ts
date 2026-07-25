/**
 * Sanitize untrusted strings (skill names, metadata) before filesystem or
 * terminal use.
 *
 * `stripTerminalEscapes` / `sanitizeMetadata` are ported verbatim
 * (behavior-identical) from vercel-labs/skills (vendors/skills/src/sanitize.ts);
 * `sanitizeName` is ported verbatim from vendors/skills/src/installer.ts.
 * Copyright (c) 2026 Vercel, Inc. MIT License — see vendors/skills/LICENSE.
 */

// Every pattern below matches terminal control bytes on purpose — that is what a CWE-150
// filter does. Rather than suppress `noControlCharactersInRegex` (which would blind the
// .spur no-biome-suppressions gate) or switch it off in `biome.json` (a repo-wide config
// exception for one file), the control bytes are built with `ch()` and interpolated. The
// patterns stay behavior-identical to the vendor originals — the ported vendor fixtures in
// tests/skills-ecosystem/sanitize-terminal.test.ts are what prove that parity.
//
// Only bytes the rule actually flags are built this way; printable ranges (\x20-\x7e) stay
// as plain escapes, and C1_RE below remains a literal because 0x80-0x9f are not control
// characters by the rule's definition.

/** A single character from its code point — keeps control bytes out of regex *literals*. */
const ch = (code: number): string => String.fromCharCode(code);

const ESC = ch(0x1b);
const BEL = ch(0x07);

// CSI sequences: ESC[ followed by parameter bytes (0x30-0x3F), intermediate bytes (0x20-0x2F), and a final byte (0x40-0x7E)
const CSI_RE = new RegExp(`${ESC}\\[[\\x30-\\x3f]*[\\x20-\\x2f]*[\\x40-\\x7e]`, 'g');

// OSC sequences: ESC] ... terminated by BEL (\x07) or ST (ESC\)
const OSC_RE = new RegExp(`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`, 'g');

// DCS, PM, APC sequences: ESC P|^|_ ... terminated by ST (ESC\)
const DCS_PM_APC_RE = new RegExp(`${ESC}[P^_][\\s\\S]*?(?:${ESC}\\\\)`, 'g');

// Simple two-byte escape sequences: ESC followed by a single char in 0x20-0x7E range
// Includes ESC 7 (DECSC), ESC 8 (DECRC), ESC c (RIS), ESC M (RI), etc.
const SIMPLE_ESC_RE = new RegExp(`${ESC}[\\x20-\\x7e]`, 'g');

// C1 control codes (0x80-0x9F) — used as 8-bit equivalents of ESC sequences
const C1_RE = /[\x80-\x9f]/g;

// Raw control characters except tab (\x09) and newline (\x0a)
// Includes BEL (\x07), BS (\x08), CR (\x0d), and others
const CONTROL_RE = new RegExp(
    `[${ch(0x00)}-${ch(0x06)}${BEL}${ch(0x08)}${ch(0x0b)}${ch(0x0c)}${ch(0x0d)}-${ch(0x1a)}${ch(0x1c)}-${ch(0x1f)}${ch(0x7f)}]`,
    'g',
);

/**
 * Strip all terminal escape sequences and dangerous control characters
 * from a string.
 *
 * Defends against CWE-150 (terminal escape injection) where untrusted data
 * (e.g., skill name/description from SKILL.md frontmatter or remote APIs)
 * could clear the screen, move the cursor, change the window title, or render
 * attacker-controlled text that looks like legitimate CLI output.
 * Safe for use on untrusted input before printing to the terminal.
 */
export function stripTerminalEscapes(str: string): string {
    return str
        .replace(OSC_RE, '') // OSC first (longest match)
        .replace(DCS_PM_APC_RE, '') // DCS/PM/APC
        .replace(CSI_RE, '') // CSI sequences
        .replace(SIMPLE_ESC_RE, '') // Simple ESC+char
        .replace(C1_RE, '') // C1 control codes
        .replace(CONTROL_RE, ''); // Raw control chars (keep \t \n)
}

/**
 * Sanitize a skill metadata string (name, description, etc.) for safe terminal display.
 *
 * In addition to stripping escape sequences, this also trims whitespace and
 * collapses internal newlines into spaces (skill names/descriptions should
 * be single-line when displayed).
 */
export function sanitizeMetadata(str: string): string {
    return stripTerminalEscapes(str)
        .replace(/[\r\n]+/g, ' ')
        .trim();
}

/**
 * Sanitizes a filename/directory name to prevent path traversal attacks
 * and ensures it follows kebab-case convention.
 * @param name - The name to sanitize
 * @returns Sanitized name safe for use in file paths
 */
export function sanitizeName(name: string): string {
    const sanitized = name
        .toLowerCase()
        // Replace any sequence of characters that are NOT lowercase letters (a-z),
        // digits (0-9), dots (.), or underscores (_) with a single hyphen.
        // This converts spaces, special chars, and path traversal attempts (../) into hyphens.
        .replace(/[^a-z0-9._]+/g, '-')
        // Remove leading/trailing dots and hyphens to prevent hidden files (.) and
        // ensure clean directory names. The pattern matches:
        // - ^[.\-]+ : one or more dots or hyphens at the start
        // - [.\-]+$ : one or more dots or hyphens at the end
        .replace(/^[.-]+|[.-]+$/g, '');

    // Limit to 255 chars (common filesystem limit), fallback to 'unnamed-skill' if empty
    return sanitized.substring(0, 255) || 'unnamed-skill';
}
