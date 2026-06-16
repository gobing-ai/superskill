import { readFileSync } from 'node:fs';

/**
 * Compute SHA-256 hex digest of a file.
 *
 * @param filePath  Absolute or relative path to the file.
 * @returns         64-character lowercase hex string.
 * @throws          ENOENT when the file does not exist.
 */
export function hashContent(filePath: string): string {
    const bytes = readFileSync(filePath);
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(bytes as Uint8Array);
    return hasher.digest('hex');
}
