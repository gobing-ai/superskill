import { describe, expect, it } from 'bun:test';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addSkills, cleanAndCreateDir } from '@gobing-ai/superskill-core';
import { handleSkillAdd, handleSkillList, handleSkillRemove, handleSkillUpdate } from '../../src/commands/skill';

/**
 * Env vars that redirect agent config/lock dirs. Cleared inside withIsolatedHome so a test
 * run can never read from or write to the real user HOME (R4: no live HOME writes).
 */
const HOME_OVERRIDE_VARS = [
    'HOME',
    'CLAUDE_CONFIG_DIR',
    'CODEX_HOME',
    'HERMES_HOME',
    'GROK_HOME',
    'XDG_CONFIG_HOME',
    'XDG_STATE_HOME',
];

/** Run fn with an isolated temp HOME; restores every overridden env var afterwards. */
async function withIsolatedHome(fn: (testHome: string) => Promise<void>): Promise<void> {
    const testHome = await mkdtemp(join(tmpdir(), 'cli-verbs-home-'));
    const saved = new Map<string, string | undefined>(HOME_OVERRIDE_VARS.map((k) => [k, process.env[k]]));
    process.env.HOME = testHome;
    for (const key of HOME_OVERRIDE_VARS) {
        if (key !== 'HOME') {
            delete process.env[key];
        }
    }
    try {
        await fn(testHome);
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        await rm(testHome, { recursive: true, force: true });
    }
}

/**
 * Spy on process.stdout.write and stub process.exit (handlers terminate via runOperation,
 * whose try/catch would swallow a thrown sentinel and remap it to exit 1 — so the stub
 * records instead of throwing). Returns everything written plus the requested exit code.
 */
async function captureStdout(fn: () => Promise<void>): Promise<{ output: string; exitCode: number | undefined }> {
    let output = '';
    let exitCode: number | undefined;
    const originalWrite = process.stdout.write;
    const originalExit = process.exit;
    process.stdout.write = (chunk: string | Uint8Array) => {
        output += chunk.toString();
        return true;
    };
    process.exit = ((code?: number) => {
        exitCode = code ?? 0;
    }) as typeof process.exit;
    try {
        await fn();
    } finally {
        process.stdout.write = originalWrite;
        process.exit = originalExit;
    }
    return { output, exitCode };
}

function skillMd(name: string): string {
    return `---\nname: ${name}\ndescription: test fixture\n---\n# ${name}`;
}

describe('skill-verbs.ts - CLI command handlers for skill add/list/remove/update', () => {
    it('handleSkillAdd prints JSON envelope and writes nothing in --dry-run', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'cli-skill');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('CLI Skill'));

            const { output, exitCode } = await captureStdout(() =>
                handleSkillAdd(sourceDir, {
                    global: true,
                    json: true,
                    dryRun: true,
                    homeDir: testHome,
                }),
            );

            expect(exitCode).toBe(0);
            expect(output).toContain('"success": true');
            expect(output).toContain('cli-skill');
            // --dry-run proves zero writes: no canonical dir, no lock file.
            expect(existsSync(join(testHome, '.agents'))).toBe(false);
        });
    });

    it('handleSkillList outputs JSON envelope for installed skills', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'list-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('List Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });

            const { output, exitCode } = await captureStdout(() =>
                handleSkillList({ global: true, json: true, homeDir: testHome }),
            );

            expect(exitCode).toBe(0);
            expect(output).toContain('"success": true');
            expect(output).toContain('"skills":');
            expect(output).toContain('list-src');
        });
    });

    it('handleSkillRemove deletes an installed skill and tolerates unknown names', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'rm-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Rm Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });
            expect(existsSync(join(testHome, '.agents/skills/rm-src'))).toBe(true);

            const removed = await captureStdout(() =>
                handleSkillRemove(['rm-src'], { global: true, json: true, homeDir: testHome }),
            );
            expect(removed.exitCode).toBe(0);
            expect(removed.output).toContain('"success": true');
            expect(existsSync(join(testHome, '.agents/skills/rm-src'))).toBe(false);

            const unknown = await captureStdout(() =>
                handleSkillRemove(['non-existent-skill'], { global: true, json: true, homeDir: testHome }),
            );
            expect(unknown.output).toContain('"success": true');
        });
    });

    it('handleSkillUpdate reports no-op for unchanged skills and updates changed ones', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'up-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Up Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });

            const noop = await captureStdout(() =>
                handleSkillUpdate(['up-src'], { global: true, json: true, homeDir: testHome }),
            );
            expect(noop.exitCode).toBe(0);
            expect(noop.output).toContain('"success": true');
            expect(noop.output).toContain('"updated": false');
            expect(noop.output).toContain('Already up to date');

            writeFileSync(join(sourceDir, 'SKILL.md'), `${skillMd('Up Src')}\nv2\n`);
            const changed = await captureStdout(() =>
                handleSkillUpdate(['up-src'], { global: true, json: true, homeDir: testHome }),
            );
            expect(changed.output).toContain('"updated": true');

            const empty = await captureStdout(() =>
                handleSkillUpdate([], { global: true, json: true, homeDir: testHome }),
            );
            expect(empty.output).toContain('"success": true');
        });
    });

    it('handleSkillAdd prints text output for --list and install modes', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'text-skill');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Text Skill'));

            const listed = await captureStdout(() =>
                handleSkillAdd(sourceDir, { global: true, list: true, homeDir: testHome }),
            );
            expect(listed.exitCode).toBe(0);
            expect(listed.output).toContain('Discovered 1 skill(s)');
            expect(listed.output).toContain('text-skill');

            const installed = await captureStdout(() => handleSkillAdd(sourceDir, { global: true, homeDir: testHome }));
            expect(installed.exitCode).toBe(0);
            expect(installed.output).toContain('Installed 1 skill(s):');
            expect(installed.output).toContain('text-skill');
        });
    });

    it('handleSkillAdd exits 1 when the source yields no skills', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'empty-src');
            await cleanAndCreateDir(sourceDir);

            const text = await captureStdout(() => handleSkillAdd(sourceDir, { global: true, homeDir: testHome }));
            expect(text.exitCode).toBe(1);

            const json = await captureStdout(() =>
                handleSkillAdd(sourceDir, { global: true, json: true, homeDir: testHome }),
            );
            expect(json.exitCode).toBe(1);
            expect(json.output).toContain('"success": false');
        });
    });

    it('handleSkillList, handleSkillUpdate, and handleSkillRemove print text output', async () => {
        await withIsolatedHome(async (testHome) => {
            const emptyList = await captureStdout(() => handleSkillList({ global: true, homeDir: testHome }));
            expect(emptyList.output).toContain('No global skills installed.');

            const sourceDir = join(testHome, 'txt-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Txt Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });

            const list = await captureStdout(() => handleSkillList({ global: true, homeDir: testHome }));
            expect(list.output).toContain('Installed global skills (1):');
            expect(list.output).toContain('txt-src');

            const upd = await captureStdout(() => handleSkillUpdate(['txt-src'], { global: true, homeDir: testHome }));
            expect(upd.output).toContain('Up to date');

            const rmOut = await captureStdout(() =>
                handleSkillRemove(['txt-src'], { global: true, homeDir: testHome }),
            );
            expect(rmOut.output).toContain('Removed 1 skill(s):');
            expect(existsSync(join(testHome, '.agents/skills/txt-src'))).toBe(false);
        });
    });
});
