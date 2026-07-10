import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateOmpHookModules } from '../../src/omp-hooks';

function makeTempDir(): string {
    return mkdtempSync(join(tmpdir(), 'superskill-omp-hooks-test-'));
}

/** Narrow `string | undefined` to `string`, failing the test if absent. */
function requireString(value: string | undefined, label: string): string {
    if (value === undefined) throw new Error(`expected ${label} to be defined`);
    return value;
}

function writeHooksJson(dir: string, config: object): string {
    const { writeFileSync } = require('node:fs');
    const path = join(dir, 'hooks.json');
    writeFileSync(path, JSON.stringify(config));
    return path;
}

describe('generateOmpHookModules', () => {
    it('returns a no-op result when hooks.json is absent', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(0);
            expect(result.files).toEqual([]);
            expect(result.message).toBe('omp hooks: no hooks.json in plugin');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('returns a no-op result when hooks.json fails to parse', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            const { writeFileSync } = require('node:fs');
            writeFileSync(join(sourceDir, 'hooks.json'), '{ not valid json');
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(0);
            expect(result.message).toBe('omp hooks: failed to parse hooks.json');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('returns a no-op result when no hooks are mappable', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    // 'unknownEvent' has no CANONICAL_TO_PI_EVENT mapping → dropped
                    unknownEvent: [{ type: 'command', command: 'echo hi' }],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(0);
            expect(result.message).toBe('omp hooks: no mappable hooks');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('maps preToolUse → tool_call and writes to hooks/pre/', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    preToolUse: [
                        {
                            matcher: 'Bash',
                            hooks: [{ type: 'command', command: 'superskill hook run demo anti-hallucination' }],
                        },
                    ],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(1);
            expect(result.files).toHaveLength(1);

            // File written to hooks/pre/
            const file = requireString(result.files[0], 'result.files[0]');
            expect(file).toContain(join('hooks', 'pre'));
            expect(file).toEndWith('.js');
            expect(existsSync(file)).toBe(true);

            // Module content: event + matcher guard + block logic
            const content = readFileSync(file, 'utf-8');
            expect(content).toContain("pi.on('tool_call'");
            expect(content).toContain("event.toolName !== 'Bash'");
            expect(content).toContain('{ block: true');
            expect(content).toContain('module.exports = (pi) =>');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('maps postToolUse → tool_result and writes to hooks/post/ (no block logic)', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    postToolUse: [
                        {
                            matcher: 'Bash',
                            hooks: [{ type: 'command', command: 'superskill hook run demo post-bash' }],
                        },
                    ],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(1);
            const file = requireString(result.files[0], 'result.files[0]');
            expect(file).toContain(join('hooks', 'post'));

            const content = readFileSync(file, 'utf-8');
            expect(content).toContain("pi.on('tool_result'");
            // post events are NOT blockable → no block logic
            expect(content).not.toContain('{ block: true');
            // matcher guard only added for blockable (tool_call) events
            expect(content).not.toContain('event.toolName');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('maps sessionStart → session_start to hooks/pre/, sessionEnd → session_shutdown to hooks/post/', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    sessionStart: [{ hooks: [{ type: 'command', command: 'superskill hook run demo on-start' }] }],
                    sessionEnd: [{ hooks: [{ type: 'command', command: 'superskill hook run demo on-end' }] }],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(2);

            const preFiles = result.files.filter((f) => f.includes(join('hooks', 'pre')));
            const postFiles = result.files.filter((f) => f.includes(join('hooks', 'post')));
            expect(preFiles).toHaveLength(1);
            expect(postFiles).toHaveLength(1);

            const startContent = readFileSync(requireString(preFiles[0], 'preFiles[0]'), 'utf-8');
            expect(startContent).toContain("pi.on('session_start'");

            const endContent = readFileSync(requireString(postFiles[0], 'postFiles[0]'), 'utf-8');
            expect(endContent).toContain("pi.on('session_shutdown'");
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('maps stop → agent_end to hooks/post/ and preCompact → session_before_compact to hooks/pre/', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    stop: [{ hooks: [{ type: 'command', command: 'superskill hook run demo on-stop' }] }],
                    preCompact: [{ hooks: [{ type: 'command', command: 'superskill hook run demo on-compact' }] }],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(2);

            const stopFile = result.files.find((f) => f.includes(join('hooks', 'post')));
            const compactFile = result.files.find((f) => f.includes(join('hooks', 'pre')));
            expect(stopFile).toBeDefined();
            expect(compactFile).toBeDefined();

            expect(readFileSync(stopFile as string, 'utf-8')).toContain("pi.on('agent_end'");
            expect(readFileSync(compactFile as string, 'utf-8')).toContain("pi.on('session_before_compact'");
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('derives hook module filename from the last token of the command', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    preToolUse: [
                        {
                            matcher: 'Bash',
                            hooks: [{ type: 'command', command: 'superskill hook run demo anti-hallucination' }],
                        },
                    ],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.files[0]).toEndWith('anti-hallucination.js');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('emits valid CommonJS: module.exports = (pi) => { pi.on(...) }', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    preToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo test' }] }],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            const content = readFileSync(requireString(result.files[0], 'result.files[0]'), 'utf-8');

            // Smoke-test: the generated code is syntactically valid CommonJS
            // that exports a factory function.
            expect(content).toContain('const { spawnSync } = require');
            expect(content).toContain('module.exports = (pi) => {');
            expect(content).toContain('pi.on(');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('handles flat hook entries (no nested hooks[] array)', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    preToolUse: [
                        // Flat format: command directly on the entry, no nested hooks[]
                        { matcher: 'Write', type: 'command', command: 'superskill hook run demo guard' },
                    ],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(1);
            const content = readFileSync(requireString(result.files[0], 'result.files[0]'), 'utf-8');
            expect(content).toContain("event.toolName !== 'Write'");
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('skips entries with type !== "command"', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            writeHooksJson(sourceDir, {
                hooks: {
                    preToolUse: [
                        {
                            matcher: '*',
                            hooks: [
                                { type: 'prompt', command: 'ignored prompt hook' },
                                { type: 'command', command: 'superskill hook run demo real' },
                            ],
                        },
                    ],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(1);
            expect(result.files[0]).toEndWith('real.js');
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });

    it('deduplicates colliding hook names with a random suffix', () => {
        const sourceDir = makeTempDir();
        const installPath = makeTempDir();
        try {
            // Two hooks with the same derived name ('guard') but different matchers
            writeHooksJson(sourceDir, {
                hooks: {
                    preToolUse: [
                        { matcher: 'Write', hooks: [{ type: 'command', command: 'superskill hook run demo guard' }] },
                        { matcher: 'Edit', hooks: [{ type: 'command', command: 'superskill hook run demo guard' }] },
                    ],
                },
            });
            const result = generateOmpHookModules(sourceDir, installPath);
            expect(result.count).toBe(2);
            // One file is guard.js, the other gets a random suffix
            const names = result.files.map((f) => f.split('/').pop());
            const baseName = names.find((n) => n === 'guard.js');
            const suffixedName = names.find((n) => n !== 'guard.js' && n?.startsWith('guard-'));
            expect(baseName).toBeDefined();
            expect(suffixedName).toBeDefined();
        } finally {
            rmSync(sourceDir, { recursive: true, force: true });
            rmSync(installPath, { recursive: true, force: true });
        }
    });
});
