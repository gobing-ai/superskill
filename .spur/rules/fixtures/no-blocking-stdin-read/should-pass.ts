// Legitimate reads that must NOT fire: real file paths, and the non-blocking stdin reader.
import { readFileSync } from 'node:fs';

export function readConfig(path: string): string {
    return readFileSync(path, 'utf-8');
}

// A literal path that merely contains a 0 is not an fd-0 read.
export function readNumberedFile(): string {
    return readFileSync('./0.json', 'utf-8');
}

// The sanctioned replacement: idle-budget stream read, re-armed per chunk.
export async function readStdin(idleMs = 250): Promise<string> {
    return new Promise((resolve) => {
        let data = '';
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done = () => resolve(data);
        const arm = () => {
            if (timer !== undefined) clearTimeout(timer);
            timer = setTimeout(done, idleMs);
        };
        process.stdin.on('data', (chunk) => {
            data += chunk.toString();
            arm();
        });
        process.stdin.on('end', done);
        process.stdin.resume();
        arm();
    });
}
