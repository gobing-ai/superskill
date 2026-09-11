import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    BOT_SLASH_CAVEAT,
    type BotSkillEntry,
    botRegisterHandoffPath,
    type PostInstallContext,
    type TransactionalWrite,
} from '@gobing-ai/superskill-core';
import {
    BOT_REGISTER_ACTION_ID,
    createGrokBotRegisterAction,
    type GrokBotRegisterActionArgs,
} from '../../src/commands/install-post-actions';

function harness() {
    const dataRoot = mkdtempSync(join(tmpdir(), 'install-post-actions-'));
    const entries: BotSkillEntry[] = [
        {
            id: 'demo',
            description: 'Demo skill',
            skillMd: '---\nname: demo\n---\nDemo body.',
            files: new Map<string, string>(),
        },
    ];
    const writes: Array<{ path: string; content: string }> = [];
    const writeTransactional: TransactionalWrite = async (path, content) => {
        writes.push({ path, content });
    };
    const args: GrokBotRegisterActionArgs = {
        plugin: 'demo-plugin',
        entries,
        source: { channel: 'bundled', locator: 'skills/demo' },
        materialize: 'bridge',
        dataRoot,
        writeTransactional,
    };
    const context: PostInstallContext = {
        target: 'grok-bot',
        plugin: args.plugin,
        installRoot: dataRoot,
        stagingRoot: join(dataRoot, 'staging'),
        dryRun: false,
    };
    return { args, context, writes, cleanup: () => rmSync(dataRoot, { recursive: true, force: true }) };
}

describe('createGrokBotRegisterAction (task 0130 handoff action)', () => {
    it('previews without writing: no transactional write, empty writtenFiles, path and caveat reported', async () => {
        const { args, context, writes, cleanup } = harness();
        try {
            const action = createGrokBotRegisterAction(args);
            const result = await action.preview(context);
            expect(writes).toEqual([]);
            expect(result.writtenFiles).toEqual([]);
            expect(
                result.messages.some((message) => message.includes(botRegisterHandoffPath(args.dataRoot, args.plugin))),
            ).toBe(true);
            expect(result.messages).toContain(BOT_SLASH_CAVEAT);
            expect(
                result.messages
                    .filter((message) => message.includes('bootstrap'))
                    .every((message) => message.startsWith('prospective bootstrap (after install):')),
            ).toBe(true);
        } finally {
            cleanup();
        }
    });

    it('applies through the transactional writer at the deterministic handoff path', async () => {
        const { args, context, writes, cleanup } = harness();
        try {
            const action = createGrokBotRegisterAction(args);
            const result = await action.apply(context);
            expect(writes).toHaveLength(1);
            expect(writes[0]?.path).toBe(botRegisterHandoffPath(args.dataRoot, args.plugin));
            const handoff = JSON.parse(writes[0]?.content ?? '') as {
                schemaVersion: number;
                plugin: string;
                skills: Array<{ id: string }>;
            };
            expect(handoff.schemaVersion).toBe(1);
            expect(handoff.plugin).toBe('demo-plugin');
            expect(handoff.skills.map((skill) => skill.id)).toEqual(['demo']);
            expect(result.writtenFiles).toEqual([botRegisterHandoffPath(args.dataRoot, args.plugin)]);
            expect(result.messages).toContain(BOT_SLASH_CAVEAT);
        } finally {
            cleanup();
        }
    });

    it('keeps repeated applies byte-identical (deterministic handoff)', async () => {
        const { args, context, writes, cleanup } = harness();
        try {
            const action = createGrokBotRegisterAction(args);
            await action.apply(context);
            await action.apply(context);
            expect(writes).toHaveLength(2);
            expect(writes[0]?.content).toBe(writes[1]?.content);
        } finally {
            cleanup();
        }
    });

    it('exposes the stable action id', () => {
        const { args, cleanup } = harness();
        try {
            expect(BOT_REGISTER_ACTION_ID).toBe('grok-bot/register-handoff');
            expect(createGrokBotRegisterAction(args).id).toBe(BOT_REGISTER_ACTION_ID);
        } finally {
            cleanup();
        }
    });

    it('reports the resolved recovery-skill bootstrap when the selection includes cc-grok-bot-register (task 0132 R3)', async () => {
        const { args, context, cleanup } = harness();
        try {
            const selfArgs: GrokBotRegisterActionArgs = {
                ...args,
                entries: [
                    ...args.entries,
                    {
                        id: 'cc-grok-bot-register',
                        description: 'Recovery skill',
                        skillMd: '---\nname: cc-grok-bot-register\n---\nBody.',
                        files: new Map<string, string>(),
                    },
                ],
            };
            const result = await createGrokBotRegisterAction(selfArgs).apply(context);
            const text = result.messages.join(' ');
            expect(text).toContain(join(args.dataRoot, 'workflows', 'cc-grok-bot-register', 'SKILL.md'));
            expect(text).toContain('Shell tool');
            expect(text).toContain(botRegisterHandoffPath(args.dataRoot, args.plugin));
            expect(text).toContain(`--plugin ${args.plugin}`);
            expect(text).toContain('Consume only');
        } finally {
            cleanup();
        }
    });
});
