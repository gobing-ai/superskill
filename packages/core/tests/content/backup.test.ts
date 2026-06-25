import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupFile, restoreFromBackup } from '../../src/content/backup';

describe('backupFile', () => {
    let tmpDir: string;

    function setup() {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-backup-test-'));
    }

    function teardown() {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }

    function writeTemp(name: string, content: string): string {
        const p = join(tmpDir, name);
        mkdirSync(tmpDir, { recursive: true });
        writeFileSync(p, content);
        return p;
    }

    it('creates .bak copy when no backup exists', async () => {
        setup();
        try {
            const filePath = writeTemp('test.md', 'original content');
            const backupPath = await backupFile(filePath);

            expect(backupPath).toBe(`${filePath}.bak`);
            const content = await Bun.file(backupPath).text();
            expect(content).toBe('original content');
        } finally {
            teardown();
        }
    });

    it('appends timestamp suffix when .bak already exists', async () => {
        setup();
        try {
            const filePath = writeTemp('test.md', 'original');

            // Create a pre-existing .bak
            writeFileSync(`${filePath}.bak`, 'old backup');

            const backupPath = await backupFile(filePath);

            // Should have a timestamp suffix, not the plain .bak
            expect(backupPath).not.toBe(`${filePath}.bak`);
            expect(backupPath).toMatch(/\.bak\.\d{4}-\d{2}-\d{2}T\d{6}/);

            // The new backup content matches original
            const content = await Bun.file(backupPath).text();
            expect(content).toBe('original');

            // The old .bak is still there
            expect(await Bun.file(`${filePath}.bak`).exists()).toBe(true);
        } finally {
            teardown();
        }
    });

    it('backup file content matches original exactly', async () => {
        setup();
        try {
            const multiLine = 'line 1\nline 2\nline 3\n';
            const filePath = writeTemp('test.md', multiLine);
            const backupPath = await backupFile(filePath);

            const content = await Bun.file(backupPath).text();
            expect(content).toBe(multiLine);
        } finally {
            teardown();
        }
    });

    it('handles empty file backup', async () => {
        setup();
        try {
            const filePath = writeTemp('test.md', '');
            const backupPath = await backupFile(filePath);

            const content = await Bun.file(backupPath).text();
            expect(content).toBe('');
        } finally {
            teardown();
        }
    });
});

describe('restoreFromBackup', () => {
    let tmpDir: string;

    function setup() {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-restore-test-'));
    }

    function teardown() {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }

    function writeTemp(name: string, content: string): string {
        const p = join(tmpDir, name);
        mkdirSync(tmpDir, { recursive: true });
        writeFileSync(p, content);
        return p;
    }

    it('restores original from backup and deletes backup', async () => {
        setup();
        try {
            const originalPath = writeTemp('test.md', 'modified');
            const backupPath = writeTemp('test.md.bak', 'original content');

            await restoreFromBackup(backupPath, originalPath);

            // Original is restored to backup content
            const restored = await Bun.file(originalPath).text();
            expect(restored).toBe('original content');

            // Backup is deleted
            expect(await Bun.file(backupPath).exists()).toBe(false);
        } finally {
            teardown();
        }
    });

    it('throws when backup does not exist', async () => {
        setup();
        try {
            const originalPath = writeTemp('test.md', 'unchanged');
            const missingBackup = join(tmpDir, 'nonexistent.bak');

            await expect(restoreFromBackup(missingBackup, originalPath)).rejects.toThrow('Backup file not found');

            // Original file is untouched
            expect(await Bun.file(originalPath).exists()).toBe(true);
            const content = await Bun.file(originalPath).text();
            expect(content).toBe('unchanged');
        } finally {
            teardown();
        }
    });

    it('restores empty backup content', async () => {
        setup();
        try {
            const originalPath = writeTemp('test.md', 'data');
            const backupPath = writeTemp('test.md.bak', '');

            await restoreFromBackup(backupPath, originalPath);

            const restored = await Bun.file(originalPath).text();
            expect(restored).toBe('');

            expect(await Bun.file(backupPath).exists()).toBe(false);
        } finally {
            teardown();
        }
    });
});
