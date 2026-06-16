import { type DbAdapter, EntityDao } from '@gobing-ai/ts-db';
import { proposals } from './schema';

/** Input shape for inserting a proposal record. */
export interface ProposalInput {
    content_type: string;
    content_name: string;
    baseline_id?: number;
    proposal_json: object;
}

/** Full proposal row as returned from the store. */
export interface Proposal extends ProposalInput {
    id: number;
    status: 'draft' | 'accepted' | 'rejected';
    applied_at: string | null;
    verify_id: number | null;
    /** Epoch milliseconds (ts-db standardColumns createdAt). */
    created_at: number;
    /** Epoch milliseconds (ts-db standardColumns updatedAt). */
    updated_at: number;
}

/** Options for updating proposal status. */
export interface UpdateProposalStatusOpts {
    applied_at?: string;
    verify_id?: number;
}

/** Data access object for the proposals table. */
export class ProposalDao extends EntityDao<typeof proposals.table, typeof proposals.table.id> {
    constructor(adapter: DbAdapter) {
        super(adapter, proposals.table, proposals.table.id, 'proposals', {
            insertSchema: proposals.insertSchema,
        });
    }

    /** Insert a new proposal. `proposal_json` is JSON-serialized. Status set to `'draft'`. */
    async insertProposal(record: ProposalInput): Promise<number> {
        const row = await this.create({
            content_type: record.content_type,
            content_name: record.content_name,
            baseline_id: record.baseline_id ?? null,
            proposal_json: JSON.stringify(record.proposal_json),
            status: 'draft',
        });
        return row.id;
    }

    /** Update the status of a proposal by id, optionally setting `applied_at` and `verify_id`. */
    async updateProposalStatus(id: number, status: Proposal['status'], opts?: UpdateProposalStatusOpts): Promise<void> {
        const data: Record<string, unknown> = { status };
        if (opts?.applied_at !== undefined) data.applied_at = opts.applied_at;
        if (opts?.verify_id !== undefined) data.verify_id = opts.verify_id;
        await this.update(id, data);
    }

    /** Get all proposals for a given content type and name. */
    async getProposals(contentType: string, contentName: string): Promise<Proposal[]> {
        const rows = await this.list({
            where: {
                and: [
                    { col: proposals.table.content_type, op: 'eq' as const, value: contentType },
                    { col: proposals.table.content_name, op: 'eq' as const, value: contentName },
                ],
            },
        });
        return rows.map((r) => deserializeProposal(r as unknown as Record<string, unknown>));
    }

    /** Get all proposals with status `'draft'` across all content types. */
    async getPendingProposals(): Promise<Proposal[]> {
        const rows = await this.list({
            where: { col: proposals.table.status, op: 'eq' as const, value: 'draft' },
        });
        return rows.map((r) => deserializeProposal(r as unknown as Record<string, unknown>));
    }
}

/** Deserialize a raw row: parse the JSON `proposal_json` column. */
function deserializeProposal(row: Record<string, unknown>): Proposal {
    return {
        id: row.id as number,
        content_type: row.content_type as string,
        content_name: row.content_name as string,
        baseline_id: (row.baseline_id as number | null) ?? undefined,
        proposal_json: JSON.parse(row.proposal_json as string),
        status: row.status as Proposal['status'],
        applied_at: (row.applied_at as string | null) ?? null,
        verify_id: (row.verify_id as number | null) ?? null,
        created_at: row.createdAt as number,
        updated_at: row.updatedAt as number,
    };
}
