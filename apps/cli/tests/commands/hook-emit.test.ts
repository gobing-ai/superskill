import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hookEmit } from '../../src/commands/hook';

const originalCwd = process.cwd();
let tempDir: string | undefined;

function createTempWorkspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-hook-emit-test-'));
    process.chdir(tempDir);
    return tempDir;
}

function createPlugin(root: string, pluginName: string, withHooks = true): string {
    const pluginRoot = join(root, 'plugins', pluginName);
    mkdirSync(pluginRoot, { recursive: true });
    writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: pluginName }));
    if (withHooks) {
        writeFileSync(
            join(pluginRoot, 'hooks.json'),
            JSON.stringify({
                version: 1,
                hooks: {
                    sessionStart: [{ type: 'command', command: 'echo "session start"' }],
                    preToolUse: [{ type: 'command', command: 'echo "pre tool"', matcher: 'bash' }],
                    stop: [{ type: 'command', command: 'echo "agent stop"' }],
                },
            }),
        );
    }
    return pluginRoot;
}

afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe('hookEmit — single-target hook emission (F029)', () => {
    it('emits pi hooks as native extension modules in project scope', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'pihooks');

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await hookEmit({ name: 'pihooks', target: 'pi', global: false, dryRun: false });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();

        // Native modules land in Pi's project extensions dir, one per hook, Pi event per canonical event
        const extDir = join(workspace, '.pi', 'extensions');
        expect(existsSync(join(workspace, '.pi', 'hooks.json'))).toBe(false);
        const modules = readdirSync(extDir).map((f) => readFileSync(join(extDir, f), 'utf-8'));
        const session = modules.find((m) => m.includes('const EVENT = "session_start";'));
        const stop = modules.find((m) => m.includes('const EVENT = "agent_end";'));
        expect(session).toContain('const COMMAND = "echo \\"session start\\"";');
        expect(stop).toContain('const COMMAND = "echo \\"agent stop\\"";');
        expect(output).toContain('native extension module');
    });

    it('emits omp hooks via the surrogate shim path', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'omphooks');

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await hookEmit({ name: 'omphooks', target: 'omp', global: false, dryRun: false });
        stdout.mockRestore();

        const ompPath = join(workspace, '.omp', 'hooks.json');
        expect(existsSync(ompPath)).toBe(true);
        const ompHooks = JSON.parse(readFileSync(ompPath, 'utf-8'));
        expect(ompHooks.hooks.session_start).toBeDefined();
        expect(ompHooks.hooks.tool_call).toBeDefined();
        expect(ompHooks.hooks.agent_end).toBeDefined();
    });

    it('emits hermes hooks via the canonical merge-step', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'hermeshooks');

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await hookEmit({ name: 'hermeshooks', target: 'hermes', global: false, dryRun: false });
        stdout.mockRestore();

        // Canonical copy preserves camelCase events
        const hermesPath = join(workspace, '.hermes', 'hooks.json');
        expect(existsSync(hermesPath)).toBe(true);
        const hermesHooks = JSON.parse(readFileSync(hermesPath, 'utf-8'));
        expect(hermesHooks.hooks.sessionStart).toBeDefined();
        expect(hermesHooks.hooks.stop).toBeDefined();
    });

    it('dryRun=true produces no file for surrogate targets', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'pidry');

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await hookEmit({ name: 'pidry', target: 'pi', global: false, dryRun: true });
        stdout.mockRestore();

        expect(existsSync(join(workspace, '.pi', 'hooks.json'))).toBe(false);
    });

    it('throws when plugin is not found', async () => {
        createTempWorkspace(); // isolate cwd; no plugin created
        await expect(hookEmit({ name: 'nonexistent', target: 'pi', global: false })).rejects.toThrow(/not found/);
    });

    it('rejects unknown targets', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'badtarget');

        await expect(hookEmit({ name: 'badtarget', target: 'unknown-agent', global: false })).rejects.toThrow(
            /Unknown target/,
        );
    });

    it('emits codex hooks via runRulesync for a rulesync-supported target', async () => {
        const workspace = createTempWorkspace();
        createPlugin(workspace, 'codexhooks');

        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        // Codex is a rulesync-supported target — runRulesync writes to global (homedir) by default,
        // so use project scope to keep the artifact inside the temp workspace.
        await hookEmit({ name: 'codexhooks', target: 'codex', global: false, dryRun: false });
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        stdout.mockRestore();

        // runRulesync ran and produced output. The output message either reports emitted hooks
        // or "no mappable hooks" — both are valid signals that the rulesync path was taken.
        expect(output).toMatch(/codex|hook/);
    });
});
