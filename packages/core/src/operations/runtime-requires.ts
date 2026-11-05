/**
 * `requires:` frontmatter contract (task 0162 / feature D1 P2).
 *
 * An entity (skill, command or subagent) declares the runtime it needs; the
 * grok-bot install then excludes or degrades what this Bot cannot serve. The
 * token set is closed on purpose: annotations live in three repos
 * (cc 0163, sp 1291, kk 0342) and only a closed grammar stays checkable.
 */

/** Runtime an entity's instructions depend on. `cli:<name>` shells out to `<name>`. */
export type RuntimeRequirement = 'hooks' | 'subagents' | 'local-fs' | `cli:${string}`;

/** Requirement tokens with no argument. */
export const RUNTIME_REQUIREMENT_KEYWORDS = ['hooks', 'subagents', 'local-fs'] as const;

/** `cli:<name>` grammar; `<name>` is a command name, never a shell fragment. */
export const RUNTIME_REQUIREMENT_CLI_RE = /^cli:[a-z0-9][a-z0-9._-]*$/;

/** Requirement field name in frontmatter. */
export const RUNTIME_REQUIRES_KEY = 'requires';

/** True for a syntactically valid requirement token. */
export function isRuntimeRequirement(value: string): value is RuntimeRequirement {
    if ((RUNTIME_REQUIREMENT_KEYWORDS as readonly string[]).includes(value)) return true;
    return RUNTIME_REQUIREMENT_CLI_RE.test(value);
}

/** Describe the closed grammar for error messages. */
export const RUNTIME_REQUIREMENT_GRAMMAR = 'hooks, subagents, local-fs or cli:<name>';

/**
 * Parse a `requires:` frontmatter value.
 *
 * Accepts a YAML list of strings or a single string (treated as a one-item list).
 * Valid tokens are de-duplicated and sorted so two spellings of the same set
 * produce identical catalogs. Anything else is reported in `invalid`: an item
 * for a bad token, the JS type name when the whole value is neither a string nor
 * a list.
 */
export function parseRuntimeRequires(value: unknown): { requires: RuntimeRequirement[]; invalid: string[] } {
    if (value === undefined) return { requires: [], invalid: [] };
    let items: unknown[];
    if (typeof value === 'string') items = [value];
    else if (Array.isArray(value)) items = value;
    else return { requires: [], invalid: [value === null ? 'null' : typeof value] };

    const invalid: string[] = [];
    const valid = new Set<RuntimeRequirement>();
    for (const item of items) {
        if (typeof item !== 'string') {
            invalid.push(item === null ? 'null' : String(item));
            continue;
        }
        if (isRuntimeRequirement(item)) valid.add(item);
        else invalid.push(item);
    }
    return { requires: [...valid].sort(), invalid };
}
