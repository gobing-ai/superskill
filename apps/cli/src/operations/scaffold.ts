import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cwd } from 'node:process';
import type { ContentType } from '../content/types';

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
}

const PLACEHOLDER_NAME = '<!-- NAME -->';
const PLACEHOLDER_DESCRIPTION = '<!-- DESCRIPTION -->';
const PLACEHOLDER_TARGET = '<!-- TARGET -->';
const PLACEHOLDER_BODY = '<!-- BODY -->';

/**
 * Substitute `<!-- VARIABLE -->` placeholders in a template string.
 *
 * Replacements:
 * - `<!-- NAME -->` → `vars.name`
 * - `<!-- DESCRIPTION -->` → `vars.description ?? ''`
 * - `<!-- TARGET -->` → `vars.target ?? 'claude'`
 * - `<!-- BODY -->` → `vars.body ?? ''`
 */
function substituteVars(
    template: string,
    vars: { name: string; description: string; target: string; body: string },
): string {
    return template
        .replaceAll(PLACEHOLDER_NAME, vars.name)
        .replaceAll(PLACEHOLDER_DESCRIPTION, vars.description)
        .replaceAll(PLACEHOLDER_TARGET, vars.target)
        .replaceAll(PLACEHOLDER_BODY, vars.body);
}

/**
 * Resolve the template content for a given type.
 *
 * Resolution order:
 * 1. `~/.superskill/templates/<type>/default.md` (user override)
 * 2. `<pkg>/templates/<type>/default.md` (built-in)
 *
 * Built-in default.md always exists; resolution never falls through.
 */
function resolveTemplate(type: ContentType): string {
    const homeDir = process.env.HOME ?? homedir();
    const userPath = join(homeDir, '.superskill', 'templates', type, 'default.md');
    if (existsSync(userPath)) {
        return readFileSync(userPath, 'utf-8');
    }
    // Dev mode: templates live under src/ relative to this module (operations/ → src/templates/)
    const devPath = join(import.meta.dir, '..', 'templates', type, 'default.md');
    if (existsSync(devPath)) {
        return readFileSync(devPath, 'utf-8');
    }
    // Production: templates are copied alongside the binary at the package root
    const prodPath = join(import.meta.dir, '..', '..', 'templates', type, 'default.md');
    return readFileSync(prodPath, 'utf-8');
}

/**
 * Scaffold a new content file from a resolved template.
 *
 * @param type  Content type: `'skill' | 'command' | 'agent' | 'hook' | 'magent'`.
 * @param name  Content name used in `<!-- NAME -->` substitution and filename.
 * @param opts  Optional description, target, output directory, and force flag.
 * @returns     The resolved absolute path of the created file.
 */
export async function scaffold(type: ContentType, name: string, opts: ScaffoldOptions = {}): Promise<string> {
    const validTypes: ContentType[] = ['skill', 'command', 'agent', 'hook', 'magent'];
    if (!validTypes.includes(type)) {
        throw new Error(`Unknown content type: "${type}". Expected one of: ${validTypes.join(', ')}`);
    }

    const template = resolveTemplate(type);
    const content = substituteVars(template, {
        name,
        description: opts.description ?? '',
        target: opts.target ?? 'claude',
        body: '',
    });

    const outDir = opts.output ?? cwd();
    mkdirSync(outDir, { recursive: true });
    const filePath = join(outDir, `${name}.md`);

    if (existsSync(filePath) && !opts.force) {
        throw new Error(`${filePath} already exists — pass --force to overwrite`);
    }

    writeFileSync(filePath, content, 'utf-8');
    return filePath;
}
