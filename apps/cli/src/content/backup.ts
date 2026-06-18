import { rmSync } from 'node:fs';

/**
 * Create a `.bak` copy of `filePath`. If a `.bak` already exists, suffix it with a
 * timestamp so the original backup is preserved. Returns the backup path.
 *
 * Used by `refine` (interactive quit) and `evolve` (gate-fail restore) — the shared
 * primitive for "undo a destructive write" (R6 of the double-loop gate, design §4).
 */
export async function backupFile(filePath: string): Promise<string> {
    let backupPath = `${filePath}.bak`;
    if (await Bun.file(backupPath).exists()) {
        const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        backupPath = `${filePath}.bak.${ts}`;
    }
    await Bun.write(backupPath, Bun.file(filePath));
    return backupPath;
}

/**
 * Restore `originalPath` from `backupPath`, then delete the backup so no residue
 * remains. Used by `refine` (quit) and `evolve` (gate fail) to roll back a write.
 */
export async function restoreFromBackup(backupPath: string, originalPath: string): Promise<void> {
    await Bun.write(originalPath, Bun.file(backupPath));
    // R12: delete the backup after a successful restore so quit leaves no residue.
    rmSync(backupPath, { force: true });
}
