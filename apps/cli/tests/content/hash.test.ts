import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashContent } from '../../src/content/hash';

describe('hashContent', () => {
    let tmpDir: string;

    function setup() {
        tmpDir = mkdtempSync(join(tmpdir(), 'superskill-hash-test-'));
    }

    function teardown() {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }

    it('returns a 64-character hex string', () => {
        setup();
        try {
            const filePath = join(tmpDir, 'test.md');
            writeFileSync(filePath, 'hello world');
            const hash = hashContent(filePath);
            expect(hash).toHaveLength(64);
            expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
        } finally {
            teardown();
        }
    });

    it('returns same hash for identical content', () => {
        setup();
        try {
            const fileA = join(tmpDir, 'a.md');
            const fileB = join(tmpDir, 'b.md');
            writeFileSync(fileA, 'same content');
            writeFileSync(fileB, 'same content');
            expect(hashContent(fileA)).toBe(hashContent(fileB));
        } finally {
            teardown();
        }
    });

    it('returns different hash for different content', () => {
        setup();
        try {
            const fileA = join(tmpDir, 'a.md');
            const fileB = join(tmpDir, 'b.md');
            writeFileSync(fileA, 'content A');
            writeFileSync(fileB, 'content B');
            expect(hashContent(fileA)).not.toBe(hashContent(fileB));
        } finally {
            teardown();
        }
    });

    it('throws ENOENT for non-existent file', () => {
        expect(() => hashContent('/nonexistent/path/file.md')).toThrow();
    });
});
