import { defineTable, integer, standardColumns, text } from '@gobing-ai/ts-db/schema';
import { real } from 'drizzle-orm/sqlite-core';

/**
 * Evaluation records — append-only in practice (callers always insert, never update).
 * Uses `standardColumns` (created_at + updated_at) to satisfy EntityDao's EntityTable constraint.
 */
export const evaluations = defineTable('evaluations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    content_type: text('content_type').notNull(),
    content_name: text('content_name').notNull(),
    target_agent: text('target_agent').notNull(),
    operation: text('operation').notNull(),
    aggregate: real('aggregate').notNull(),
    dimensions: text('dimensions').notNull(),
    file_hash: text('file_hash'),
    /** Scoring method: 'heuristic' (default) or 'rubric' (F022 scorer seam). Null for pre-F022 rows. */
    scorer: text('scorer'),
    /** Rubric version stamped on rubric-scored rows. Null for heuristic rows. */
    rubric_version: integer('rubric_version'),
    ...standardColumns,
});

/** Proposal records — mutable lifecycle (draft → accepted | rejected). */
export const proposals = defineTable('proposals', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    content_type: text('content_type').notNull(),
    content_name: text('content_name').notNull(),
    baseline_id: integer('baseline_id'),
    proposal_json: text('proposal_json').notNull(),
    status: text('status').notNull().default('draft'),
    applied_at: text('applied_at'),
    verify_id: integer('verify_id'),
    ...standardColumns,
});
