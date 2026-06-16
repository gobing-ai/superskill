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

    return adapter;
}
