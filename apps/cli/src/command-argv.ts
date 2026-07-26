/**
 * Split a command specification into argv without invoking a shell.
 *
 * Whitespace separates tokens outside quotes. Single and double quotes preserve
 * interior whitespace; backslash escapes the next character outside single quotes.
 * Empty quoted arguments are preserved.
 */
export function parseCommandArgv(spec: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let tokenStarted = false;

    for (let i = 0; i < spec.length; i++) {
        const char = spec[i];
        if (char === undefined) continue;

        if (quote === "'") {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            tokenStarted = true;
            continue;
        }

        if (char === '\\') {
            const next = spec[i + 1];
            if (next !== undefined) {
                current += next;
                tokenStarted = true;
                i++;
            } else {
                current += char;
                tokenStarted = true;
            }
            continue;
        }

        if (quote === '"') {
            if (char === quote) {
                quote = null;
            } else {
                current += char;
            }
            tokenStarted = true;
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            tokenStarted = true;
            continue;
        }

        if (/\s/.test(char)) {
            if (tokenStarted) {
                tokens.push(current);
                current = '';
                tokenStarted = false;
            }
            continue;
        }

        current += char;
        tokenStarted = true;
    }

    if (tokenStarted) tokens.push(current);
    return tokens;
}
