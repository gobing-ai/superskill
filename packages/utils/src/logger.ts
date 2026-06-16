/** Minimal structured-output utility for CLI apps. */
const encoder = new TextEncoder();

/** Structured-output logger for CLI apps. */
export const logger = {
    info(...args: unknown[]): void {
        const line = `${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
        Bun.write(Bun.stdout, encoder.encode(line));
    },
    error(...args: unknown[]): void {
        const line = `${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
        Bun.write(Bun.stderr, encoder.encode(line));
    },
    /** Write without trailing newline. */
    out(text: string): void {
        Bun.write(Bun.stdout, encoder.encode(text));
    },
};
