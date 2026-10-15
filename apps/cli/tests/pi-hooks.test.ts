import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEnvVar } from '@gobing-ai/superskill-core';
import {
    buildPiHookModule,
    emitPiNativeHooks,
    listPiHookModules,
    PI_HOOK_BANNER,
    piExtensionsDir,
    prunePiHookModules,
    prunePiShimHooks,
} from '../src/pi-hooks';

/**
 * Native Pi hook adapter (ADR-039): the generator, and the generated extension driven through a
 * harness that mirrors Pi 1.2.0's extension API (`pi.on`, `pi.sendMessage`, `ctx.hasUI`,
 * `ctx.ui.confirm/notify`, `ctx.cwd`, `ctx.sessionManager.getSessionId`).
 */

const FIXTURE = join(import.meta.dir, 'fixtures', 'pi-hooks', 'pi-hook-fixture.mjs');

let dir: string;
beforeEach(() => {
    // `hook-run-plugin-` prefix: bunfig's coverage ignore keeps temp fixtures out of the report.
    dir = mkdtempSync(join(tmpdir(), 'hook-run-plugin-pi-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function writeHooks(config: object): string {
    const rulesync = join(dir, '.rulesync');
    mkdirSync(rulesync, { recursive: true });
    writeFileSync(join(rulesync, 'hooks.json'), JSON.stringify(config));
    return rulesync;
}

const cmd = (hook: string, timeout?: number) => ({
    type: 'command',
    command: `superskill hook run acme ${hook}`,
    ...(timeout ? { timeout } : {}),
});

describe('emitPiNativeHooks — generation', () => {
    it('reports a plugin without hooks.json or without hooks', () => {
        const opts = { dryRun: false, global: true };
        expect(emitPiNativeHooks(join(dir, 'none'), dir, opts, 'acme')).toMatchObject({
            emitted: false,
            count: 0,
            files: [],
            message: 'pi: no hooks in plugin',
        });
        expect(emitPiNativeHooks(writeHooks({ version: 1 }), dir, opts, 'acme').message).toBe('pi: no hooks in plugin');
    });

    it('writes one module per mappable hook into the global extensions dir, Pi events per canonical event', () => {
        const rulesync = writeHooks({
            hooks: {
                PreToolUse: [{ matcher: 'Write|Edit', hooks: [cmd('guard', 5)] }],
                PostToolUse: [{ matcher: 'Bash', hooks: [cmd('audit')] }],
                Stop: [{ hooks: [cmd('settle')] }],
                UserPromptSubmit: [cmd('prompt')],
                SessionStart: [cmd('start')],
                SessionEnd: [cmd('end')],
                PreCompact: [cmd('compact')],
                Notification: [cmd('notify')],
                SubagentStop: [{ hooks: [{ type: 'prompt', prompt: 'x' }] }],
            },
        });
        const result = emitPiNativeHooks(rulesync, dir, { dryRun: false, global: true }, 'acme');
        const extDir = join(dir, '.pi', 'agent', 'extensions');
        expect(result).toMatchObject({ target: 'pi', emitted: true, count: 7, path: extDir });
        expect(result.message).toContain('7 hook(s) emitted as native extension module(s)');
        expect(readdirSync(extDir).sort()).toEqual([
            'superskill-acme-audit.ts',
            'superskill-acme-compact.ts',
            'superskill-acme-end.ts',
            'superskill-acme-guard.ts',
            'superskill-acme-prompt.ts',
            'superskill-acme-settle.ts',
            'superskill-acme-start.ts',
        ]);
        const events = Object.fromEntries(
            readdirSync(extDir).map((f) => [
                f,
                readFileSync(join(extDir, f), 'utf-8').match(/^const EVENT = (.+);$/m)?.[1],
            ]),
        );
        expect(events).toEqual({
            'superskill-acme-audit.ts': '"tool_result"',
            'superskill-acme-compact.ts': '"session_before_compact"',
            'superskill-acme-end.ts': '"session_shutdown"',
            'superskill-acme-guard.ts': '"tool_call"',
            'superskill-acme-prompt.ts': '"input"',
            'superskill-acme-settle.ts': '"agent_end"',
            'superskill-acme-start.ts': '"session_start"',
        });
        const guard = readFileSync(join(extDir, 'superskill-acme-guard.ts'), 'utf-8');
        expect(guard).toContain(PI_HOOK_BANNER);
        expect(guard).toContain('// Plugin: acme');
        expect(guard).toContain('const MATCHER = "Write|Edit";');
        expect(guard).toContain('const TIMEOUT_MS = 5000;');
        expect(guard).toContain('const COMMAND = "superskill hook run acme guard";');
        expect(guard).toContain('shell: true');
        expect(guard).toContain("SUPERSKILL_HOOK_HOST: 'pi'");
        expect(readFileSync(join(extDir, 'superskill-acme-settle.ts'), 'utf-8')).toContain('const TIMEOUT_MS = 60000;');
        expect(guard).not.toMatch(/%%[A-Z_]+%%/);
    });

    it("maps rulesync's beforeSubmitPrompt (the installed name of UserPromptSubmit) to Pi's input event", () => {
        // `superskill install` stages hooks through the mapper, which renames UserPromptSubmit.
        const rulesync = writeHooks({ hooks: { beforeSubmitPrompt: [cmd('prompt')] } });
        const { files } = emitPiNativeHooks(rulesync, dir, { dryRun: false, global: true }, 'acme');
        const source = readFileSync(files[0] as string, 'utf-8');
        expect(source).toContain('const EVENT = "input";');
        expect(source).toContain('const CANONICAL_EVENT = "UserPromptSubmit";');
    });

    it('uses <root>/.pi/extensions for a project install and writes nothing in dry-run', () => {
        const rulesync = writeHooks({ hooks: { Stop: [cmd('settle')] } });
        const dry = emitPiNativeHooks(rulesync, dir, { dryRun: true, global: false }, 'acme');
        expect(dry.files).toEqual([join(dir, '.pi', 'extensions', 'superskill-acme-settle.ts')]);
        expect(existsSync(join(dir, '.pi'))).toBe(false);
        emitPiNativeHooks(rulesync, dir, { dryRun: false, global: false }, 'acme');
        expect(existsSync(dry.files[0] as string)).toBe(true);
        expect(piExtensionsDir('/h', true)).toBe(join('/h', '.pi', 'agent', 'extensions'));
    });

    it('names repeated stems deterministically and derives a stem from non-superskill commands', () => {
        const rulesync = writeHooks({
            hooks: {
                PreToolUse: [cmd('guard'), { matcher: 'Bash', hooks: [cmd('guard')] }],
                Stop: [
                    { type: 'command', command: 'bash ./scripts/check.sh' },
                    { type: 'command', command: 'echo "*"' },
                ],
            },
        });
        const { files } = emitPiNativeHooks(rulesync, dir, { dryRun: false, global: true }, 'my.plugin');
        expect(files.map((f) => f.split('/').pop())).toEqual([
            'superskill-myplugin-guard.ts',
            'superskill-myplugin-guard-2.ts',
            'superskill-myplugin-check.ts',
            'superskill-myplugin-hook.ts',
        ]);
    });

    it('reports no mappable hooks, and skips hooks the per-target policy keeps off Pi', () => {
        const rulesync = writeHooks({
            hooks: {
                Notification: [cmd('notify')],
                Stop: [{ type: 'command', command: 'superskill hook run cc anti-hallucination' }],
            },
        });
        expect(emitPiNativeHooks(rulesync, dir, { dryRun: false, global: true }, 'cc')).toMatchObject({
            emitted: false,
            count: 0,
            message: 'pi: no mappable hooks',
        });
    });

    it('replaces only its own plugin modules on reinstall and prunes its legacy shim entries', () => {
        const extDir = join(dir, '.pi', 'agent', 'extensions');
        mkdirSync(extDir, { recursive: true });
        writeFileSync(join(extDir, 'superskill-acme-old.ts'), `${PI_HOOK_BANNER}\n// Plugin: acme\n`);
        writeFileSync(join(extDir, 'superskill-other-x.ts'), `${PI_HOOK_BANNER}\n// Plugin: other\n`);
        writeFileSync(join(extDir, 'mine.ts'), '// Plugin: acme\n');
        writeFileSync(join(extDir, 'notes.md'), PI_HOOK_BANNER);
        mkdirSync(join(extDir, 'dir.ts'));
        writeFileSync(
            join(dir, '.pi', 'agent', 'hooks.json'),
            JSON.stringify({
                hooks: {
                    agent_end: ['superskill hook run acme settle', { command: 'superskill hook run other s' }],
                    tool_call: ['superskill hook run acme guard'],
                },
            }),
        );
        emitPiNativeHooks(
            writeHooks({ hooks: { Stop: [cmd('settle')] } }),
            dir,
            { dryRun: false, global: true },
            'acme',
        );
        expect(readdirSync(extDir).sort()).toEqual([
            'dir.ts',
            'mine.ts',
            'notes.md',
            'superskill-acme-settle.ts',
            'superskill-other-x.ts',
        ]);
        expect(JSON.parse(readFileSync(join(dir, '.pi', 'agent', 'hooks.json'), 'utf-8'))).toEqual({
            hooks: { agent_end: [{ command: 'superskill hook run other s' }] },
        });
    });
});

describe('Pi module ownership helpers', () => {
    it('lists nothing for a missing dir and lists/prunes owned modules only', () => {
        expect(listPiHookModules(join(dir, 'missing'), 'acme')).toEqual([]);
        writeFileSync(join(dir, 'a.ts'), `${PI_HOOK_BANNER}\n// Plugin: acme\n`);
        writeFileSync(join(dir, 'b.ts'), `${PI_HOOK_BANNER}\n// Plugin: acme-two\n`);
        expect(prunePiHookModules(dir, 'acme')).toEqual([join(dir, 'a.ts')]);
        expect(readdirSync(dir)).toEqual(['b.ts']);
    });

    it('prunePiShimHooks: leaves absent, unparseable, hook-less and unowned configs alone', () => {
        expect(prunePiShimHooks(dir, false, 'acme')).toBe(false);
        const path = join(dir, '.pi', 'hooks.json');
        mkdirSync(join(dir, '.pi'));
        writeFileSync(path, '{nope');
        expect(prunePiShimHooks(dir, false, 'acme')).toBe(false);
        writeFileSync(path, '{"hooks":null}');
        expect(prunePiShimHooks(dir, false, 'acme')).toBe(false);
        writeFileSync(path, '{"hooks":{"agent_end":["superskill hook run other s"]}}');
        expect(prunePiShimHooks(dir, false, 'acme')).toBe(false);
        writeFileSync(path, '{"extra":1,"hooks":{"agent_end":["superskill hook run acme s"]}}');
        expect(prunePiShimHooks(dir, false, 'acme')).toBe(true);
        expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ extra: 1, hooks: {} });
    });

    it('keeps comment interpolations on one line', () => {
        const source = buildPiHookModule('acme\nx', {
            piEvent: 'agent_end',
            canonicalEvent: 'Stop',
            matcher: 'a\nb',
            command: 'echo one\nprocess.exit(1)',
            name: 'h',
        });
        expect(source).toContain('// Plugin: acme x');
        expect(source).toContain('matcher a b)');
        expect(source).toContain('// Command: echo one process.exit(1)');
    });
});

// ── The generated extension, driven through a Pi API harness ────────────────────

interface HarnessStep {
    event: Record<string, unknown>;
    hasUI?: boolean;
    /** What `ctx.ui.confirm` answers. */
    confirm?: boolean;
    /** Build a self-referencing event (JSON.stringify fails). */
    circular?: boolean;
}

interface HarnessRun {
    outcomes: unknown[];
    sent: Array<{ message: Record<string, unknown>; options: Record<string, unknown> }>;
    confirms: Array<{ title: string; message: string }>;
    notes: Array<{ message: string; type: string }>;
    events: string[];
}

/**
 * Load a generated module in a fresh Bun process and replay `steps` through it with a fake `pi`
 * and `ctx` shaped like Pi 1.2.0's ExtensionAPI / ExtensionContext (same surface as 0.85.1). A subprocess, not an
 * in-process import, keeps the generated file out of this run's coverage instrumentation.
 */
function drive(modulePath: string, steps: HarnessStep[]): HarnessRun {
    const driver = `
const mod = await import(${JSON.stringify(modulePath)});
const handlers = new Map();
const sent = [];
const confirms = [];
const notes = [];
mod.default({
    on: (name, fn) => handlers.set(name, fn),
    sendMessage: (message, options) => sent.push({ message, options }),
});
const outcomes = [];
for (const step of ${JSON.stringify(steps)}) {
    const ctx = {
        hasUI: step.hasUI ?? false,
        cwd: ${JSON.stringify(dir)},
        sessionManager: { getSessionId: () => 'sess-1' },
        ui: {
            confirm: async (title, message) => { confirms.push({ title, message }); return step.confirm ?? false; },
            notify: (message, type) => notes.push({ message, type }),
        },
    };
    const event = step.event;
    if (step.circular) event.self = event;
    const handler = handlers.get(event.type);
    outcomes.push(handler ? ((await handler(event, ctx)) ?? null) : 'no-handler');
}
console.log(JSON.stringify({ outcomes, sent, confirms, notes, events: [...handlers.keys()] }));
`;
    const proc = Bun.spawnSync([process.execPath, '-e', driver], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { PATH: getEnvVar('PATH') ?? '', FIXTURE_DIR: dir },
    });
    if (proc.exitCode !== 0) throw new Error(`driver failed: ${proc.stderr.toString()}`);
    return JSON.parse(proc.stdout.toString().trim().split('\n').pop() ?? '{}') as HarnessRun;
}

/** Generate a module for one canonical event whose command is the fixture in `mode`. */
function generate(event: string, mode: string, extra: { matcher?: string; timeout?: number; command?: string } = {}) {
    const command = extra.command ?? `${process.execPath} ${FIXTURE} ${mode}`;
    const rulesync = writeHooks({
        hooks: {
            [event]: [
                {
                    matcher: extra.matcher ?? '*',
                    hooks: [{ type: 'command', command, ...(extra.timeout ? { timeout: extra.timeout } : {}) }],
                },
            ],
        },
    });
    const { files } = emitPiNativeHooks(rulesync, join(dir, 'home'), { dryRun: false, global: true }, 'acme');
    return files[0] as string;
}

function calls(): Array<{ payload: Record<string, unknown>; host: string; event: string; cwd: string }> {
    const path = join(dir, 'calls.jsonl');
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf-8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
}

const bash = { type: 'tool_call', toolCallId: 't1', toolName: 'bash', input: { command: 'rm -rf /' } };

describe('generated Pi extension — PreToolUse (tool_call)', () => {
    it('blocks on deny and hands the hook the Pi event, host pi, the canonical event, cwd and session', () => {
        const run = drive(generate('PreToolUse', 'deny'), [{ event: bash }]);
        expect(run.events).toEqual(['tool_call']);
        expect(run.outcomes).toEqual([{ block: true, reason: 'nope' }]);
        const [call] = calls();
        expect(call?.host).toBe('pi');
        expect(call?.event).toBe('PreToolUse');
        expect(call?.payload).toMatchObject({ ...bash, sessionId: 'sess-1' });
        expect(call?.cwd).toBe(dir);
    });

    it('asks through ctx.ui.confirm: approve allows, decline blocks, no UI blocks', () => {
        const run = drive(generate('PreToolUse', 'ask'), [
            { event: bash, hasUI: true, confirm: true },
            { event: bash, hasUI: true, confirm: false },
            { event: bash, hasUI: false },
        ]);
        expect(run.confirms).toEqual([
            { title: 'acme/ask: allow bash?', message: 'sure?' },
            { title: 'acme/ask: allow bash?', message: 'sure?' },
        ]);
        expect(run.outcomes).toEqual([
            null,
            { block: true, reason: 'Declined by user: sure?' },
            { block: true, reason: 'sure? (confirmation required, but Pi has no interactive UI in this mode)' },
        ]);
    });

    it('reads a legacy Claude-native ask and a bare ask/deny, ignoring an updatedInput rewrite', () => {
        expect(drive(generate('PreToolUse', 'claude-ask'), [{ event: bash, hasUI: true }]).confirms[0]?.message).toBe(
            'legacy ask',
        );
        expect(drive(generate('PreToolUse', 'ask-bare'), [{ event: bash, hasUI: true }]).confirms[0]?.message).toBe(
            'Confirmation requested by acme/ask-bare',
        );
        expect(drive(generate('PreToolUse', 'deny-bare'), [{ event: bash }]).outcomes).toEqual([
            { block: true, reason: 'Blocked by acme/deny-bare' },
        ]);
        expect(drive(generate('PreToolUse', 'claude-rewrite'), [{ event: bash }]).outcomes).toEqual([null]);
    });

    it('blocks on exit 2 with the stderr reason (else a default)', () => {
        expect(drive(generate('PreToolUse', 'exit2'), [{ event: bash }]).outcomes).toEqual([
            { block: true, reason: 'blocked by exit code' },
        ]);
        expect(drive(generate('PreToolUse', 'exit2-silent'), [{ event: bash }]).outcomes).toEqual([
            { block: true, reason: 'Blocked by acme/exit2-silent' },
        ]);
    });

    it('fails open on allow, plain text, a crash, a timeout, a missing command and an unserializable event', () => {
        for (const mode of ['allow', 'silent', 'text', 'null', 'crash']) {
            expect(drive(generate('PreToolUse', mode), [{ event: bash }]).outcomes).toEqual([null]);
        }
        const started = Date.now();
        expect(drive(generate('PreToolUse', 'sleep', { timeout: 1 }), [{ event: bash }]).outcomes).toEqual([null]);
        expect(Date.now() - started).toBeLessThan(4500);
        expect(
            drive(generate('PreToolUse', 'deny', { command: 'superskill-no-such-binary hook run acme x' }), [
                { event: bash },
            ]).outcomes,
        ).toEqual([null]);
        expect(drive(generate('PreToolUse', 'deny'), [{ event: { ...bash }, circular: true }]).outcomes).toEqual([
            null,
        ]);
    }, 20_000);

    it('matches the canonical matcher against the Pi tool name and its canonical name, skipping others', () => {
        const module = generate('PreToolUse', 'deny', { matcher: 'Glob|Write' });
        const run = drive(module, [
            { event: { ...bash } },
            { event: { type: 'tool_call', toolName: 'find', input: {} } },
            { event: { type: 'tool_call', toolName: 'write', input: {} } },
            { event: { type: 'tool_call', toolName: 'mcp_tool', input: {} } },
        ]);
        expect(run.outcomes).toEqual([null, { block: true, reason: 'nope' }, { block: true, reason: 'nope' }, null]);
        expect(calls()).toHaveLength(2);
    });
});

describe('generated Pi extension — Stop (agent_end) continuation', () => {
    it('queues the reason as a follow-up that triggers a turn, and flags the next Stop stop_hook_active', () => {
        const end = { type: 'agent_end', messages: [{ role: 'assistant', content: 'done' }] };
        const run = drive(generate('Stop', 'block'), [{ event: end }, { event: end }]);
        expect(run.outcomes).toEqual([null, null]);
        expect(run.sent).toEqual([
            {
                message: { customType: 'superskill-hook', content: 'keep going', display: true },
                options: { deliverAs: 'followUp', triggerTurn: true },
            },
            {
                message: { customType: 'superskill-hook', content: 'keep going', display: true },
                options: { deliverAs: 'followUp', triggerTurn: true },
            },
        ]);
        expect(calls().map((c) => c.payload.stop_hook_active)).toEqual([false, true]);
        expect(calls()[0]?.event).toBe('Stop');
    });

    it('an allow or ask on Stop lets the agent stop', () => {
        const end = { type: 'agent_end', messages: [] };
        expect(drive(generate('Stop', 'allow'), [{ event: end }]).sent).toEqual([]);
        expect(drive(generate('Stop', 'ask'), [{ event: end }]).sent).toEqual([]);
    });
});

describe('generated Pi extension — other events', () => {
    it('PostToolUse: appends the block reason to the tool result content, keeping structuredContent', () => {
        const result = { type: 'tool_result', toolName: 'bash', input: {}, content: [{ type: 'text', text: 'out' }] };
        // Pi 1.x: a tool with an outputSchema also reports structuredContent, which a content-only
        // replacement would drop.
        const structured = { ...result, structuredContent: { exitCode: 0 } };
        const run = drive(generate('PostToolUse', 'block'), [
            { event: result },
            { event: { type: 'tool_result', toolName: 'bash', input: {} } },
            { event: structured },
        ]);
        expect(run.outcomes).toEqual([
            {
                content: [
                    { type: 'text', text: 'out' },
                    { type: 'text', text: '[acme/block] keep going' },
                ],
            },
            { content: [{ type: 'text', text: '[acme/block] keep going' }] },
            {
                content: [
                    { type: 'text', text: 'out' },
                    { type: 'text', text: '[acme/block] keep going' },
                ],
                structuredContent: { exitCode: 0 },
            },
        ]);
    });

    it('UserPromptSubmit: a block handles the input and notifies; extension-sourced input is skipped', () => {
        const run = drive(generate('UserPromptSubmit', 'deny'), [
            { event: { type: 'input', text: 'hi', source: 'interactive' }, hasUI: true },
            { event: { type: 'input', text: 'continue', source: 'extension' }, hasUI: true },
        ]);
        expect(run.outcomes).toEqual([{ action: 'handled' }, null]);
        expect(run.notes).toEqual([{ message: 'nope', type: 'warning' }]);
        expect(calls()).toHaveLength(1);
        expect(calls()[0]?.event).toBe('UserPromptSubmit');
    });

    it('session events: a block only notifies when a UI exists', () => {
        const run = drive(generate('SessionStart', 'deny'), [
            { event: { type: 'session_start', reason: 'startup' }, hasUI: true },
            { event: { type: 'session_start', reason: 'startup' }, hasUI: false },
        ]);
        expect(run.outcomes).toEqual([null, null]);
        expect(run.notes).toEqual([{ message: 'nope', type: 'warning' }]);
    });
});
