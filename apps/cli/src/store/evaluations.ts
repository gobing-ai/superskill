import { type DbAdapter, EntityDao } from '@gobing-ai/ts-db';
import { evaluations } from './schema';

/** Serialized score for one evaluation dimension. */
export interface EvaluationDimension {
    score: number;
    note: string;
    hard?: number;
    holdout_n?: number;
    train_n?: number;
}

/** Input shape for inserting an evaluation record. */
export interface EvaluationInput {
    content_type: string;
    content_name: string;
    target_agent: string;
    operation: 'evaluate' | 'refine' | 'evolve';
    aggregate: number;
    dimensions: Record<string, EvaluationDimension>;
    file_hash?: string;
    /** Scoring method: 'heuristic' (default) or 'rubric'. F022 scorer seam. */
    scorer?: string;
    /** Rubric version stamped on rubric-scored rows. Null/absent for heuristic rows. */
    rubric_version?: number;
}
/** Full evaluation row as returned from the store. */
export interface Evaluation extends EvaluationInput {
    id: number;
    /** Epoch milliseconds (ts-db standardColumns createdAt). */
    created_at: number;
}

type EvaluationFilter =
    | { col: typeof evaluations.table.content_type; op: 'eq'; value: string }
    | { col: typeof evaluations.table.content_name; op: 'eq'; value: string }
    | { col: typeof evaluations.table.createdAt; op: 'gte'; value: number };

/** Data access object for the evaluations table. */
export class EvaluationDao extends EntityDao<typeof evaluations.table, typeof evaluations.table.id> {
    constructor(adapter: DbAdapter) {
        super(adapter, evaluations.table, evaluations.table.id, 'evaluations', {
            insertSchema: evaluations.insertSchema,
        });
    }

    /** Insert a new evaluation record. `dimensions` is JSON-serialized. Implementation enforces append-only. */
    async insertEvaluation(record: EvaluationInput): Promise<number> {
        const row = await this.create({
            content_type: record.content_type,
            content_name: record.content_name,
            target_agent: record.target_agent,
            operation: record.operation,
            aggregate: record.aggregate,
            dimensions: JSON.stringify(record.dimensions),
            ...(record.file_hash !== undefined ? { file_hash: record.file_hash } : {}),
            ...(record.scorer !== undefined ? { scorer: record.scorer } : {}),
            ...(record.rubric_version !== undefined ? { rubric_version: record.rubric_version } : {}),
        } as Parameters<EvaluationDao['create']>[0]);
        return row.id;
    }

    /** Get all evaluations for a given content type and name, newest first. */
    async getEvaluations(
        contentType: string,
        contentName: string,
        opts: { from?: number } = {},
    ): Promise<Evaluation[]> {
        const filters: EvaluationFilter[] = [
            { col: evaluations.table.content_type, op: 'eq' as const, value: contentType },
            { col: evaluations.table.content_name, op: 'eq' as const, value: contentName },
        ];
        if (opts.from !== undefined) {
            filters.push({ col: evaluations.table.createdAt, op: 'gte' as const, value: opts.from });
        }

        const rows = await this.list({
            where: {
                and: filters,
            },
            orderBy: [{ col: evaluations.table.createdAt, dir: 'desc' as const }],
        });
        return rows.map((r) => deserializeEvaluation(r as unknown as Record<string, unknown>));
    }

    /** Get the most recent evaluation for a content type/name, or null if none. */
    async getLatestEvaluation(contentType: string, contentName: string): Promise<Evaluation | null> {
        const rows = await this.list({
            where: {
                and: [
                    { col: evaluations.table.content_type, op: 'eq' as const, value: contentType },
                    { col: evaluations.table.content_name, op: 'eq' as const, value: contentName },
                ],
            },
            orderBy: [{ col: evaluations.table.createdAt, dir: 'desc' as const }],
            limit: 1,
        });
        return rows.length > 0 ? deserializeEvaluation(rows[0] as unknown as Record<string, unknown>) : null;
    }
}

/** Deserialize a raw row: parse the JSON `dimensions` column. */
function deserializeEvaluation(row: Record<string, unknown>): Evaluation {
    return {
        id: row.id as number,
        content_type: row.content_type as string,
        content_name: row.content_name as string,
        target_agent: row.target_agent as string,
        operation: row.operation as EvaluationInput['operation'],
        aggregate: row.aggregate as number,
        dimensions: JSON.parse(row.dimensions as string),
        file_hash: (row.file_hash as string | null) ?? undefined,
        scorer: (row.scorer as string | null) ?? undefined,
        rubric_version: (row.rubric_version as number | null) ?? undefined,
        created_at: row.createdAt as number,
    };
}
