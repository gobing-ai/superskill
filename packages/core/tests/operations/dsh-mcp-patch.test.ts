/**
 * dsh MCP loader patch (feature B811 R1–R5, task 1470).
 *
 * The failure modes, in the task's order: a secret VALUE written into the patch instead of a
 * `process.env` reference, an install that cannot be repeated byte-for-byte, a foreign loader or a
 * second server name destroyed by the merge, a dry-run that writes, an unparseable patch rewritten
 * instead of refused, and a missing directory left uncreated.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import {
    createDshMcpPatchAction,
    DSH_MCP_LOADER,
    type DshMcpServer,
    dshPatchPath,
    planDshMcpPatch,
} from '../../src/operations/dsh-mcp-patch';

/** The four variables `plugins/sp/mcp.json` forwards — names only, never values. */
const SERVER: DshMcpServer = {
    name: 'spur',
    command: 'spur',
    args: ['mcp', '--gateway'],
    envVars: ['SPUR_GATEWAY_PORT', 'SPUR_MCP_ENABLED', 'SPUR_MCP_AUTH_ENV', 'SPUR_MCP_TOKEN'],
};

let home: string;
beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dsh-patch-'));
});
afterEach(() => {
    rmSync(home, { recursive: true, force: true });
});

/** The patch text as written, for the assertions that read YAML back. */
function written(): string {
    return readFileSync(dshPatchPath(home), 'utf8');
}

/** Write one install through the action with a plain file writer. */
async function install(
    servers: readonly DshMcpServer[] = [SERVER],
): Promise<{ written: string[]; messages: string[] }> {
    const writes: string[] = [];
    const action = createDshMcpPatchAction({
        home,
        servers,
        writeTransactional: async (path, content) => {
            writes.push(path);
            writeFileSync(path, content);
        },
    });
    const result = await action.apply({
        target: 'dsh',
        plugin: 'sp',
        installRoot: home,
        stagingRoot: home,
        dryRun: false,
    });
    return { written: result.writtenFiles, messages: result.messages };
}

describe('1470 R2/AC1 — the absent patch is created with one loader entry', () => {
    test('creates the file and directory, and writes the server verbatim from the declaration', async () => {
        const result = await install();
        expect(result.written).toEqual([dshPatchPath(home)]);
        const text = written();
        const parsed = parseDocument(text);
        expect(parsed.errors).toEqual([]);
        const entries = parsed.contents as { items: Array<{ get(k: string, s?: boolean): unknown }> };
        expect(entries.items).toHaveLength(1);
        const entry = entries.items[0];
        expect(entry?.get('name')).toBe(DSH_MCP_LOADER);
        const config = entry?.get('config', true) as { get(k: string, s?: boolean): unknown };
        expect(config.get('serverName')).toBe('spur');
        expect(config.get('transport')).toBe('stdio');
        expect(config.get('command')).toBe('spur');
        expect((config.get('args', true) as { toJSON(): unknown }).toJSON()).toEqual(['mcp', '--gateway']);
    });

    test('every env var is a !!js process.env reference and no value is written', async () => {
        await install();
        const text = written();
        for (const name of SERVER.envVars ?? []) {
            expect(text).toContain(`${name}: !!js process.env.${name}`);
        }
        // Nothing that looks like an assigned value: every env line is a reference expression.
        for (const line of text.split('\n').filter((row) => row.trim().startsWith('SPUR_'))) {
            expect(line).toContain('!!js process.env.');
        }
    });

    test('a plugin with no env vars writes no env block at all', async () => {
        await install([{ name: 'spur', command: 'spur', args: ['mcp', '--gateway'] }]);
        expect(written()).not.toContain('env:');
    });
});

describe('1470 R4/AC1 — dry-run writes nothing, unparseable input is refused', () => {
    test('preview names the plan and leaves the filesystem alone', async () => {
        const action = createDshMcpPatchAction({
            home,
            servers: [SERVER],
            writeTransactional: async () => {
                throw new Error('preview attempted a write');
            },
        });
        const preview = await action.preview({
            target: 'dsh',
            plugin: 'sp',
            installRoot: home,
            stagingRoot: home,
            dryRun: true,
        });
        expect(preview.writtenFiles).toEqual([]);
        expect(preview.messages.join('\n')).toContain('dsh (dry-run): write');
        expect(preview.messages.join('\n')).toContain('serverName spur');
        // The directory was never created either.
        expect(() => written()).toThrow();
    });

    test('an unparseable patch is an actionable error and the file is left untouched', async () => {
        const path = dshPatchPath(home);
        mkdirSync(join(home, '.dsh', 'profiles', 'headless'), { recursive: true });
        const broken = '- name: [unclosed\n';
        writeFileSync(path, broken);
        await expect(install()).rejects.toThrow(/is not readable YAML/);
        expect(readFileSync(path, 'utf8')).toBe(broken);
    });

    test('a non-array root is refused rather than rewritten', async () => {
        const path = dshPatchPath(home);
        mkdirSync(join(home, '.dsh', 'profiles', 'headless'), { recursive: true });
        const mapping = 'name: spur\nconfig:\n  serverName: spur\n';
        writeFileSync(path, mapping);
        await expect(install()).rejects.toThrow(/must be a top-level YAML array/);
        expect(readFileSync(path, 'utf8')).toBe(mapping);
    });
});

describe('1470 R3/AC2 — reinstall is idempotent and preserves foreign entries', () => {
    test('a second identical install writes nothing and leaves the bytes alone', async () => {
        await install();
        const first = written();
        const second = await install();
        expect(second.written).toEqual([]);
        expect(written()).toBe(first);
    });

    test('a foreign loader and another server name keep their content and order', async () => {
        const path = dshPatchPath(home);
        mkdirSync(join(home, '.dsh', 'profiles', 'headless'), { recursive: true });
        const seed = [
            '# operator comment, preserved',
            '- name: "@deepseek-ai/dsh-mcp-client"',
            '  config:',
            '    serverName: other-server',
            '    transport: stdio',
            '    command: other',
            '- name: some-other-loader',
            '  config:',
            '    keep: me',
            '',
        ].join('\n');
        writeFileSync(path, seed);

        await install();
        const text = written();
        expect(text.startsWith('# operator comment, preserved')).toBe(true);
        const items = (parseDocument(text).contents as { items: unknown[] }).items;
        expect(items).toHaveLength(3);
        const names = items.map((item) =>
            (item as { get(k: string, s?: boolean): unknown }).get('name', true) === undefined
                ? undefined
                : (item as { get(k: string): unknown }).get('name'),
        );
        // Foreign entries keep their positions; the owned spur entry is appended, not interleaved.
        expect(names).toEqual([DSH_MCP_LOADER, 'some-other-loader', DSH_MCP_LOADER]);
        const first = items[0] as { get(k: string, s?: boolean): unknown };
        expect((first.get('config', true) as { get(k: string): unknown }).get('serverName')).toBe('other-server');
        const last = items[2] as { get(k: string, s?: boolean): unknown };
        expect((last.get('config', true) as { get(k: string): unknown }).get('serverName')).toBe('spur');
    });

    test('a stale owned entry is replaced in place, keeping its position', async () => {
        const path = dshPatchPath(home);
        mkdirSync(join(home, '.dsh', 'profiles', 'headless'), { recursive: true });
        writeFileSync(
            path,
            [
                '- name: "@deepseek-ai/dsh-mcp-client"',
                '  config:',
                '    serverName: spur',
                '    transport: stdio',
                '    command: stale-command',
                '- name: some-other-loader',
                '  config:',
                '    keep: me',
                '',
            ].join('\n'),
        );
        await install();
        const text = written();
        expect(text).toContain('command: "spur"');
        expect(text).not.toContain('stale-command');
        const items = (parseDocument(text).contents as { items: unknown[] }).items;
        expect(items).toHaveLength(2);
        expect((items[0] as { get(k: string): unknown }).get('command')).toBeUndefined();
        expect(
            (
                (items[0] as { get(k: string, s?: boolean): unknown }).get('config', true) as {
                    get(k: string): unknown;
                }
            ).get('command'),
        ).toBe('spur');
    });

    test('two plugins contribute one entry each, keyed by server name', async () => {
        await install([SERVER]);
        await install([SERVER, { name: 'spur-other', command: 'spur', args: ['mcp'] }]);
        const items = (parseDocument(written()).contents as { items: unknown[] }).items;
        expect(items).toHaveLength(2);
        const names = items.map((item) =>
            (
                (item as { get(k: string, s?: boolean): unknown }).get('config', true) as {
                    get(k: string): unknown;
                }
            ).get('serverName'),
        );
        expect(names).toEqual(['spur', 'spur-other']);
    });
});

describe('1470 R5 — nothing is read or written outside the patch file', () => {
    test('the plan needs only the patch text and the server declarations', () => {
        const plan = planDshMcpPatch({ existing: null, servers: [SERVER], path: 'cordis.patch.yml' });
        expect(plan.servers).toEqual(['spur']);
        expect(plan.changed).toBe(true);
        expect(plan.content).not.toContain('SPUR_MCP_TOKEN: SPUR_MCP_TOKEN');
    });
});
