import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DbAdapter } from '@gobing-ai/ts-db';
import { getDBPath, openStore } from '../../src/store/db';

describe('openStore', () => {
    let testDir: string;

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
    });

    it('creates tables idempotently', async () => {
        testDir = mkdtempSync(join(tmpdir(), 'superskill-test-'));

        const adapter: DbAdapter = await openStore({ projectRoot: testDir });
        expect(adapter).toBeDefined();

        const rows = await adapter.queryAll<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf%' ORDER BY name",
        );
        const names = rows.map((r) => r.name);
        expect(names).toContain('evaluations');
        expect(names).toContain('proposals');

        // Idempotent: second call should succeed without error.
        const adapter2 = await openStore({ projectRoot: testDir });
        expect(adapter2).toBeDefined();
        adapter2.close();
        adapter.close();
    });

    it('re-exports getDBPath', () => {
        expect(getDBPath).toBeFunction();
    });
});
