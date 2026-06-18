import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDbAdapter, type DbAdapter } from '@gobing-ai/ts-db';
import { getDBPath } from '../content/paths';
import { evaluations, proposals } from './schema';

export { getDBPath };

/**
 * Open (or create) the superskill SQLite store.
 *
 * Creates the database directory if needed, then creates the evaluations and
 * proposals tables via `adapter.exec(createTableSql)`. Idempotent — the
 * generated DDL uses `CREATE TABLE IF NOT EXISTS`.
 *
 * @param opts  Optional project root override.
 * @returns     A connected `DbAdapter`.
 */
export async function openStore(opts?: { projectRoot?: string }): Promise<DbAdapter> {
    const url = getDBPath(opts);

    if (url !== ':memory:') {
        const dir = dirname(url);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }

    const adapter = await createDbAdapter({ driver: 'bun-sqlite', url });

    // Create our tables via adapter.exec — NOT applyMigrations (which targets ts-db's own embedded tables)
    await adapter.exec(evaluations.createTableSql);
    await adapter.exec(proposals.createTableSql);

    // Migrate existing databases: add scorer + rubric_version columns if absent (F022).
    // New/in-memory DBs get these from createTableSql; this handles pre-F022 on-disk DBs.
    await migrateEvaluations(adapter);

    return adapter;
}

/**
 * Add F022 columns (`scorer`, `rubric_version`) to an existing `evaluations` table if absent.
 * Idempotent — no-op when columns already exist. Uses the adapter facade (ADR-014 compliant).
 */
async function migrateEvaluations(adapter: DbAdapter): Promise<void> {
    const cols = await adapter.queryAll<{ name: string }>('PRAGMA table_info(evaluations)');
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('scorer')) {
        await adapter.exec('ALTER TABLE evaluations ADD COLUMN scorer TEXT');
    }
    if (!names.has('rubric_version')) {
        await adapter.exec('ALTER TABLE evaluations ADD COLUMN rubric_version INTEGER');
    }
}
