// Every form below blocks forever on a silent-but-open stdin pipe. The rule must fire on each.
import { readFileSync, readSync } from 'node:fs';

export function viaFdZero(): string {
    return readFileSync(0, 'utf-8') as string;
}

export function viaFdZeroNoEncoding(): Buffer {
    return readFileSync(0);
}

export function viaDevStdin(): string {
    return readFileSync('/dev/stdin', 'utf-8') as string;
}

export function viaReadSync(buf: Buffer): number {
    return readSync(0, buf, 0, buf.length, null);
}
