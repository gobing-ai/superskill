import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    addSkills,
    cleanAndCreateDir,
    getEnvVar,
    removeEnvVar,
    setEnvVar,
    writeGlobalLock,
} from '@gobing-ai/superskill-core';
import { Command } from 'commander';
import {
    handleSkillAdd,
    handleSkillList,
    handleSkillRemove,
    handleSkillUpdate,
    registerSkill,
} from '../../src/commands/skill';

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
    const saved = new Map<string, string | undefined>(HOME_OVERRIDE_VARS.map((k) => [k, getEnvVar(k)]));
    setEnvVar('HOME', testHome);
    for (const key of HOME_OVERRIDE_VARS) {
        if (key !== 'HOME') {
            removeEnvVar(key);
        }
    }
    try {
        await fn(testHome);
    } finally {
        for (const [key, value] of saved) {
            if (value === undefined) {
                removeEnvVar(key);
            } else {
                setEnvVar(key, value);
            }
        }
        await rm(testHome, { recursive: true, force: true });
    }
}

/**
 * Spy on process.stdout.write + process.stderr.write and stub process.exit.
 * Handlers terminate via runOperation; echoError writes to stderr (not stdout),
 * so both streams must be captured to prevent output leaking into the test runner.
 * Returns { output (stdout), stderr, exitCode }.
 */
async function captureOutput(
    fn: () => Promise<void>,
): Promise<{ output: string; stderr: string; exitCode: number | undefined }> {
    let output = '';
    let stderr = '';
    let exitCode: number | undefined;
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    const originalExit = process.exit;
    process.stdout.write = (chunk: string | Uint8Array) => {
        output += chunk.toString();
        return true;
    };
    process.stderr.write = (chunk: string | Uint8Array) => {
        stderr += chunk.toString();
        return true;
    };
    process.exit = ((code?: number) => {
        exitCode = code ?? 0;
    }) as typeof process.exit;
    try {
        await fn();
    } finally {
        process.stdout.write = originalStdout;
        process.stderr.write = originalStderr;
        process.exit = originalExit;
    }
    return { output, stderr, exitCode };
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

            const { output, exitCode } = await captureOutput(() =>
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

            const { output, exitCode } = await captureOutput(() =>
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

            const removed = await captureOutput(() =>
                handleSkillRemove(['rm-src'], { global: true, json: true, homeDir: testHome }),
            );
            expect(removed.exitCode).toBe(0);
            expect(removed.output).toContain('"success": true');
            expect(existsSync(join(testHome, '.agents/skills/rm-src'))).toBe(false);

            const unknown = await captureOutput(() =>
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

            const noop = await captureOutput(() =>
                handleSkillUpdate(['up-src'], { global: true, json: true, homeDir: testHome }),
            );
            expect(noop.exitCode).toBe(0);
            expect(noop.output).toContain('"success": true');
            expect(noop.output).toContain('"updated": false');
            expect(noop.output).toContain('Already up to date');

            writeFileSync(join(sourceDir, 'SKILL.md'), `${skillMd('Up Src')}\nv2\n`);
            const changed = await captureOutput(() =>
                handleSkillUpdate(['up-src'], { global: true, json: true, homeDir: testHome }),
            );
            expect(changed.output).toContain('"updated": true');

            const empty = await captureOutput(() =>
                handleSkillUpdate([], { global: true, json: true, homeDir: testHome }),
            );
            expect(empty.output).toContain('"success": true');

            const missing = await captureOutput(() =>
                handleSkillUpdate(['missing-skill'], { global: true, json: true, homeDir: testHome }),
            );
            expect(missing.exitCode).toBe(1);
            expect(missing.output).toContain('"success": false');
            expect(missing.output).toContain('missing-skill: Not found in lock file');
        });
    });

    it('handleSkillAdd prints text output for --list and install modes', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'text-skill');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Text Skill'));

            const listed = await captureOutput(() =>
                handleSkillAdd(sourceDir, { global: true, list: true, homeDir: testHome }),
            );
            expect(listed.exitCode).toBe(0);
            expect(listed.output).toContain('Discovered 1 skill(s)');
            expect(listed.output).toContain('text-skill');

            const installed = await captureOutput(() => handleSkillAdd(sourceDir, { global: true, homeDir: testHome }));
            expect(installed.exitCode).toBe(0);
            expect(installed.output).toContain('Installed 1 skill(s):');
            expect(installed.output).toContain('text-skill');
        });
    });

    it('handleSkillAdd exits 1 when the source yields no skills', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'empty-src');
            await cleanAndCreateDir(sourceDir);

            const text = await captureOutput(() => handleSkillAdd(sourceDir, { global: true, homeDir: testHome }));
            expect(text.exitCode).toBe(1);

            const json = await captureOutput(() =>
                handleSkillAdd(sourceDir, { global: true, json: true, homeDir: testHome }),
            );
            expect(json.exitCode).toBe(1);
            expect(json.output).toContain('"success": false');
        });
    });

    it('handleSkillList, handleSkillUpdate, and handleSkillRemove print text output', async () => {
        await withIsolatedHome(async (testHome) => {
            const emptyList = await captureOutput(() => handleSkillList({ global: true, homeDir: testHome }));
            expect(emptyList.output).toContain('No global skills installed.');

            const sourceDir = join(testHome, 'txt-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Txt Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });

            const list = await captureOutput(() => handleSkillList({ global: true, homeDir: testHome }));
            expect(list.output).toContain('Installed global skills (1):');
            expect(list.output).toContain('txt-src');

            const upd = await captureOutput(() => handleSkillUpdate(['txt-src'], { global: true, homeDir: testHome }));
            expect(upd.output).toContain('Up to date');

            const rmOut = await captureOutput(() =>
                handleSkillRemove(['txt-src'], { global: true, homeDir: testHome }),
            );
            expect(rmOut.output).toContain('Removed 1 skill(s):');
            expect(existsSync(join(testHome, '.agents/skills/txt-src'))).toBe(false);
        });
    });
});

describe('skill-verbs.ts - skill update --check and honest summary (F8 task 0134)', () => {
    it('handleSkillUpdate --check reports stale, exits 1, and writes nothing', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'chk-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Chk Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });

            writeFileSync(join(sourceDir, 'SKILL.md'), `${skillMd('Chk Src')}\nv2\n`);
            const lockPath = join(testHome, '.agents/.skill-lock.json');
            const lockBefore = readFileSync(lockPath, 'utf-8');
            const canonicalBefore = readFileSync(join(testHome, '.agents/skills/chk-src/SKILL.md'), 'utf-8');

            const { output, exitCode } = await captureOutput(() =>
                handleSkillUpdate(['chk-src'], { global: true, check: true, homeDir: testHome }),
            );

            expect(exitCode).toBe(1);
            expect(output).toContain('chk-src: Stale (Upstream hash differs)');
            // Read-only proof: lock file and skill directory are byte-identical.
            expect(readFileSync(lockPath, 'utf-8')).toBe(lockBefore);
            expect(readFileSync(join(testHome, '.agents/skills/chk-src/SKILL.md'), 'utf-8')).toBe(canonicalBefore);
        });
    });

    it('handleSkillUpdate --check reports up to date and exits 0', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'cur-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Cur Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });

            const { output, exitCode } = await captureOutput(() =>
                handleSkillUpdate(['cur-src'], { global: true, check: true, homeDir: testHome }),
            );

            expect(exitCode).toBe(0);
            expect(output).toContain('cur-src: Up to date (Already up to date)');
        });
    });

    it('handleSkillUpdate --check --json emits rows and summary', async () => {
        await withIsolatedHome(async (testHome) => {
            const sourceDir = join(testHome, 'json-src');
            await cleanAndCreateDir(sourceDir);
            writeFileSync(join(sourceDir, 'SKILL.md'), skillMd('Json Src'));
            await addSkills(sourceDir, { global: true, homeDir: testHome });
            writeFileSync(join(sourceDir, 'SKILL.md'), `${skillMd('Json Src')}\nv2\n`);

            const { output, exitCode } = await captureOutput(() =>
                handleSkillUpdate(['json-src'], { global: true, check: true, json: true, homeDir: testHome }),
            );

            const payload = JSON.parse(output) as {
                rows: Array<{ name: string; status: string }>;
                summary: Record<string, number>;
            };
            expect(payload.rows[0]?.name).toBe('json-src');
            expect(payload.rows[0]?.status).toBe('stale');
            expect(payload.summary).toEqual({ total: 1, stale: 1, current: 0, unchecked: 0, unavailable: 0 });
            expect(exitCode).toBe(1);
        });
    });

    it('handleSkillUpdate --check exits 2 for unavailable rows', async () => {
        await withIsolatedHome(async (testHome) => {
            const { output, exitCode } = await captureOutput(() =>
                handleSkillUpdate(['missing-skill'], { global: true, check: true, homeDir: testHome }),
            );
            expect(exitCode).toBe(2);
            expect(output).toContain('missing-skill: unavailable: Not found in lock file');
        });
    });

    it('handleSkillUpdate --check exits 0 for unchecked rows (unsupported source type, task 0135 R5)', async () => {
        await withIsolatedHome(async (testHome) => {
            const now = new Date().toISOString();
            await writeGlobalLock(
                {
                    version: 3,
                    skills: {
                        'git-skill': {
                            source: 'https://gitlab.com/acme/repo.git',
                            sourceType: 'gitlab',
                            sourceUrl: 'https://gitlab.com/acme/repo.git',
                            ref: 'release',
                            skillPath: 'skills/wanted/SKILL.md',
                            skillFolderHash: 'stored-hash',
                            installedAt: now,
                            updatedAt: now,
                        },
                    },
                },
                {},
                testHome,
            );
            const { output, exitCode } = await captureOutput(() =>
                handleSkillUpdate([], { global: true, check: true, homeDir: testHome }),
            );
            expect(exitCode).toBe(0);
            expect(output).toContain('git-skill: unchecked:');
        });
    });

    it('handleSkillUpdate text header counts only changed skills', async () => {
        await withIsolatedHome(async (testHome) => {
            const a = join(testHome, 'cnt-a');
            await cleanAndCreateDir(a);
            writeFileSync(join(a, 'SKILL.md'), skillMd('Cnt A'));
            const b = join(testHome, 'cnt-b');
            await cleanAndCreateDir(b);
            writeFileSync(join(b, 'SKILL.md'), skillMd('Cnt B'));
            await addSkills(a, { global: true, homeDir: testHome });
            await addSkills(b, { global: true, homeDir: testHome });

            const noop = await captureOutput(() => handleSkillUpdate([], { global: true, homeDir: testHome }));
            expect(noop.exitCode).toBe(0);
            expect(noop.output).toContain('Updated 0 skill(s), 2 up to date:');
            expect(noop.output).not.toContain('Updated 2 skill(s)');

            writeFileSync(join(a, 'SKILL.md'), `${skillMd('Cnt A')}\nv2\n`);
            const changed = await captureOutput(() => handleSkillUpdate([], { global: true, homeDir: testHome }));
            expect(changed.output).toContain('Updated 1 skill(s), 1 up to date:');
            expect(changed.output).toContain('cnt-a: Updated');
            expect(changed.output).toContain('cnt-b: Up to date');
        });
    });

    it('skill add/remove/update help renders the --yes default exactly once; update registers --check', () => {
        const program = new Command();
        registerSkill(program);
        const skillCmd = program.commands.find((cmd) => cmd.name() === 'skill');
        expect(skillCmd).toBeDefined();
        for (const verbName of ['add', 'remove', 'update']) {
            const verb = skillCmd?.commands.find((cmd) => cmd.name() === verbName);
            expect(verb).toBeDefined();
            const yesLine = verb
                ?.helpInformation()
                .split('\n')
                .find((line) => line.includes('--yes'));
            expect(yesLine).toBeDefined();
            expect(yesLine?.match(/\(default: true\)/g)).toHaveLength(1);
        }
        const update = skillCmd?.commands.find((cmd) => cmd.name() === 'update');
        expect(update?.options.map((option) => option.long)).toContain('--check');
    });
});
