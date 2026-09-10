import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    applyGrokBotDialect,
    BOT_ORIGIN_MARKER,
    BOT_SAND_DATA_ENV,
    botCanonicalSkillDir,
    botRegisterHandoffPath,
    buildBotRegisterHandoff,
    collectBotSkillEntries,
    emitGrokBotInstall,
    GROK_BOT_TARGET,
    inspectGrokBotTarget,
    markerHashesCurrent,
    parseBotSkillEntry,
    planGrokBotInstall,
    readOriginMarker,
    renderBridgePointer,
    resolveSandRoot,
} from '../../src/operations/grok-bot';
import { installManifestPath, readInstallManifest, writeInstallManifest } from '../../src/operations/install-manifest';

let tmp: string;
const savedSandData = process.env[BOT_SAND_DATA_ENV];

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'superskill-grok-bot-'));
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (savedSandData === undefined) delete process.env[BOT_SAND_DATA_ENV];
    else process.env[BOT_SAND_DATA_ENV] = savedSandData;
});

const SOURCE = { channel: 'bundled' as const, locator: '@gobing-ai/superskill' };

function entry(
    id: string,
    description = 'does things',
    files: Map<string, string> = new Map([['ref.md', '# ref\n']]),
): ReturnType<typeof collectBotSkillEntries>[number] {
    return { id, description, skillMd: `---\nname: ${id}\ndescription: ${description}\n---\n\nBody.\n`, files };
}

describe('resolveSandRoot (R2)', () => {
    it('SAND_DATA absolute existing dir wins with source env', () => {
        const root = join(tmp, 'sand');
        mkdirSync(root);
        const r = resolveSandRoot({ sandData: root, homeDir: tmp });
        expect(r.dataRoot).toBe(realpathSync(root));
        expect(r.source).toBe('env');
        expect(r.workflowsDir).toBe(join(realpathSync(root), 'workflows'));
        expect(r.creatable).toBe(false);
    });

    it('SAND_DATA missing + createMissing reports creatable with writable ancestor', () => {
        const r = resolveSandRoot({ sandData: join(tmp, 'new', 'sand-data'), homeDir: tmp, createMissing: true });
        expect(r.creatable).toBe(true);
        expect(r.source).toBe('env');
    });

    it('SAND_DATA missing without createMissing throws', () => {
        expect(() => resolveSandRoot({ sandData: join(tmp, 'gone'), homeDir: tmp })).toThrow(/does not exist/);
    });

    it('rejects relative, URL, ssh-style, and blank SAND_DATA with actionable messages', () => {
        expect(() => resolveSandRoot({ sandData: 'rel/path', homeDir: tmp })).toThrow(/absolute host path/);
        expect(() => resolveSandRoot({ sandData: 'https://x/y', homeDir: tmp })).toThrow(/URL/);
        expect(() => resolveSandRoot({ sandData: 'box@host:/home/box/sand-data', homeDir: tmp })).toThrow(
            /remote host locator/,
        );
        expect(() => resolveSandRoot({ sandData: '   ', homeDir: tmp })).toThrow(/blank/);
    });

    it('falls back to existing <home>/sand-data and qualifying <home>/agent-data', () => {
        mkdirSync(join(tmp, 'sand-data'));
        expect(resolveSandRoot({ homeDir: tmp }).source).toBe('sand-data');
        const home2 = join(tmp, 'h2');
        mkdirSync(join(home2, 'agent-data', 'workflows'), { recursive: true });
        expect(resolveSandRoot({ homeDir: home2 }).source).toBe('agent-data');
    });

    it('never creates fallback aliases: bare agent-data or no alias throws with the host guidance', () => {
        const home3 = join(tmp, 'h3');
        mkdirSync(join(home3, 'agent-data'), { recursive: true });
        expect(() => resolveSandRoot({ homeDir: home3 })).toThrow(
            /run on the Grok Bot host or set SAND_DATA to an explicit host-accessible absolute path/,
        );
        expect(existsSync(join(home3, 'sand-data'))).toBe(false);
    });

    it('fails a dangling symlink instead of following it', () => {
        const link = join(tmp, 'sand-data');
        symlinkSync(join(tmp, 'nope'), link);
        expect(() => resolveSandRoot({ homeDir: tmp })).toThrow(/broken symlink/);
    });

    it('rejects a root resolving into a protected Sand tree (managed-skills/plugins/plugin-skills)', () => {
        for (const name of ['managed-skills', 'plugins', 'plugin-skills']) {
            const protectedDir = join(tmp, `root-${name}`, name);
            mkdirSync(protectedDir, { recursive: true });
            expect(() => resolveSandRoot({ sandData: protectedDir, homeDir: tmp })).toThrow(/protected Sand tree/);
            // A symlinked path resolving into the protected tree is also rejected.
            const link = join(tmp, `link-${name}`);
            symlinkSync(protectedDir, link);
            expect(() => resolveSandRoot({ sandData: link, homeDir: tmp })).toThrow(/protected Sand tree/);
        }
        // A missing (creatable) protected-named root is rejected before creation.
        expect(() =>
            resolveSandRoot({ sandData: join(tmp, 'fresh', 'managed-skills'), homeDir: tmp, createMissing: true }),
        ).toThrow(/protected Sand tree/);
    });
});

describe('applyGrokBotDialect (R3)', () => {
    it('rewrites /skill:<id> to /<id> across prose, code fences, and inline code', () => {
        const input = [
            'Run /skill:cc-skill-add first.',
            '```',
            '/skill:sp-dev-run 0128',
            '```',
            'Inline `/skill:x` and bare skill:x stay.',
        ].join('\n');
        const out = applyGrokBotDialect(input);
        expect(out).toContain('/cc-skill-add first');
        expect(out).toContain('/sp-dev-run 0128');
        expect(out).toContain('`/x`');
        expect(out).toContain('bare skill:x stay');
    });
});

function writeSkill(
    dir: string,
    id: string,
    opts: { name?: string; description?: string; body?: string } = {},
): string {
    const skillDir = join(dir, id);
    mkdirSync(skillDir, { recursive: true });
    const name = opts.name ?? id;
    const description = opts.description ?? 'desc';
    writeFileSync(
        join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${description}\n---\n\n${opts.body ?? `Use /skill:${id} now.`}\n`,
    );
    writeFileSync(join(skillDir, 'ref.md'), '# ref\n');
    return skillDir;
}

describe('parseBotSkillEntry / collectBotSkillEntries (R4)', () => {
    it('validates name==id and nonempty description, collects support files', () => {
        const skills = join(tmp, 'skills');
        writeSkill(skills, 'demo-a');
        const e = parseBotSkillEntry(join(skills, 'demo-a'));
        expect(e.id).toBe('demo-a');
        expect(e.files.get('ref.md')).toBe('# ref\n');
        expect(e.skillMd).toContain('/demo-a now');
        expect(e.skillMd).not.toContain('/skill:demo-a');
    });

    it('rejects name mismatch, empty description, and missing SKILL.md', () => {
        const skills = join(tmp, 'skills');
        writeSkill(skills, 'a', { name: 'b' });
        writeSkill(skills, 'c', { description: '   ' });
        mkdirSync(join(skills, 'd'));
        expect(() => parseBotSkillEntry(join(skills, 'a'))).toThrow(/does not match directory id/);
        expect(() => parseBotSkillEntry(join(skills, 'c'))).toThrow(/empty description/);
        expect(() => parseBotSkillEntry(join(skills, 'd'))).toThrow(/missing SKILL\.md/);
        expect(collectBotSkillEntries(join(tmp, 'nope'))).toEqual([]);
    });
});

describe('ownership markers (R4)', () => {
    it('round-trips through plan→emit→read with matching hashes', async () => {
        const dataRoot = join(tmp, 'root');
        mkdirSync(dataRoot);
        const entries = [entry('w1')];
        const res = resolveSandRoot({ sandData: dataRoot, homeDir: tmp });
        planGrokBotInstall({
            entries,
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            prune: false,
            materialize: 'bridge',
        });
        await emitGrokBotInstall({
            entries,
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        const marker = readOriginMarker(join(res.workflowsDir, 'w1'), 'sp');
        expect(marker?.mode).toBe('bridge');
        expect(marker?.canonicalPath).toBe(join(botCanonicalSkillDir(res.dataRoot, 'w1'), 'SKILL.md'));
        const canonicalPath = marker?.canonicalPath;
        if (typeof canonicalPath !== 'string') throw new Error('marker missing canonicalPath');
        expect(existsSync(canonicalPath)).toBe(true);
    });

    it('throws on malformed or foreign markers and on unmarked workflows', () => {
        const wf = join(tmp, 'workflows', 'w1');
        mkdirSync(wf, { recursive: true });
        writeFileSync(join(wf, 'SKILL.md'), '---\nname: w1\ndescription: d\n---\nx');
        writeFileSync(join(wf, BOT_ORIGIN_MARKER), '{not json');
        expect(() => readOriginMarker(wf, 'sp')).toThrow(/malformed/);
        writeFileSync(join(wf, BOT_ORIGIN_MARKER), JSON.stringify({ schemaVersion: 1, target: 'other' }));
        expect(() => readOriginMarker(wf, 'sp')).toThrow(/unsupported/);
        rmSync(join(wf, BOT_ORIGIN_MARKER));
        expect(() =>
            planGrokBotInstall({
                entries: [entry('w1')],
                resolution: { dataRoot: tmp, workflowsDir: join(tmp, 'workflows'), source: 'env', creatable: false },
                plugin: 'sp',
                source: SOURCE,
                prune: false,
                materialize: 'bridge',
            }),
        ).toThrow(/without a .* marker/);
    });
});

describe('plan + emit (R4/R5)', () => {
    it('bridge writes canonical + thin pointer; prune removes obsolete owned workflows only', async () => {
        const dataRoot = join(tmp, 'root');
        mkdirSync(dataRoot);
        const res = resolveSandRoot({ sandData: dataRoot, homeDir: tmp });
        const first = [entry('keep'), entry('old')];
        await emitGrokBotInstall({
            entries: first,
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        expect(existsSync(join(res.workflowsDir, 'old', 'SKILL.md'))).toBe(true);

        const plan = planGrokBotInstall({
            entries: [entry('keep')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            prune: true,
            materialize: 'bridge',
        });
        expect(plan.owned).toEqual([{ id: 'keep', kind: 'replace' }]);
        expect(plan.pruneCandidates).toContainEqual({ id: 'old', kind: 'workflow' });
        expect(plan.pruneCandidates).toContainEqual({ id: 'old', kind: 'canonical' });

        await emitGrokBotInstall({
            entries: [entry('keep')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-02T00:00:00Z',
            prune: true,
            pruneCandidates: plan.pruneCandidates,
        });
        expect(existsSync(join(res.workflowsDir, 'old'))).toBe(false);
        expect(existsSync(botCanonicalSkillDir(dataRoot, 'old'))).toBe(false);
        expect(existsSync(join(res.workflowsDir, 'keep', 'SKILL.md'))).toBe(true);
        // Thin pointer carries canonical frontmatter + relative path.
        const pointer = readFileSync(join(res.workflowsDir, 'keep', 'SKILL.md'), 'utf-8');
        expect(pointer).toContain('name: keep');
        expect(pointer).toContain('canonical: ');
    });

    it('full mode writes everything under workflows/<id>', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root2'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        expect(existsSync(join(res.workflowsDir, 'w1', 'ref.md'))).toBe(true);
        expect(existsSync(join(res.dataRoot, '.superskill', 'grok-bot'))).toBe(false);
    });

    it('skips foreign-owned workflows during prune without deleting them', async () => {
        const dataRoot = join(tmp, 'root3');
        const res = resolveSandRoot({ sandData: dataRoot, homeDir: tmp, createMissing: true });
        mkdirSync(join(res.workflowsDir, 'foreign'), { recursive: true });
        writeFileSync(join(res.workflowsDir, 'foreign', 'SKILL.md'), '---\nname: foreign\ndescription: d\n---\nx');
        writeFileSync(
            join(res.workflowsDir, 'foreign', BOT_ORIGIN_MARKER),
            JSON.stringify({
                schemaVersion: 1,
                target: GROK_BOT_TARGET,
                plugin: 'other',
                source: SOURCE,
                mode: 'full',
                canonicalPath: null,
                superskillVersion: 'x',
                installedAt: 'x',
                hashes: {},
            }),
        );
        const plan = planGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            prune: true,
            materialize: 'bridge',
        });
        expect(plan.skippedForeign).toEqual(['foreign']);
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: true,
            pruneCandidates: plan.pruneCandidates,
        });
        expect(existsSync(join(res.workflowsDir, 'foreign'))).toBe(true);
    });
});

describe('mode switch cleanup (R6)', () => {
    it('bridge→full removes the obsolete canonical tree and keeps the full workflow', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        expect(existsSync(botCanonicalSkillDir(res.dataRoot, 'w1'))).toBe(true);
        const plan = planGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            prune: false,
            materialize: 'full',
        });
        expect(plan.pruneCandidates).toContainEqual({ id: 'w1', kind: 'canonical' });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-02T00:00:00Z',
            prune: true,
            pruneCandidates: plan.pruneCandidates,
        });
        expect(existsSync(botCanonicalSkillDir(res.dataRoot, 'w1'))).toBe(false);
        const skillMd = readFileSync(join(res.workflowsDir, 'w1', 'SKILL.md'), 'utf-8');
        expect(skillMd).toContain('Body.');
        expect(readOriginMarker(join(res.workflowsDir, 'w1'), 'sp')?.mode).toBe('full');
    });
});

describe('replace/prune conflict gate (R6)', () => {
    it('refuses to replace a locally modified owned workflow', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        writeFileSync(join(res.workflowsDir, 'w1', 'ref.md'), '# local edit\n');
        expect(() =>
            planGrokBotInstall({
                entries: [entry('w1')],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                prune: false,
                materialize: 'bridge',
            }),
        ).toThrow(/locally modified/);
    });

    it('refuses to prune a stale owned workflow with unowned extras', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('old')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        writeFileSync(join(res.workflowsDir, 'old', 'notes.md'), 'mine\n');
        expect(() =>
            planGrokBotInstall({
                entries: [entry('keep')],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                prune: true,
                materialize: 'bridge',
            }),
        ).toThrow(/locally modified/);
        expect(existsSync(join(res.workflowsDir, 'old', 'notes.md'))).toBe(true);
    });

    it('refuses to replace a bridge workflow whose canonical tree drifted', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        writeFileSync(join(botCanonicalSkillDir(res.dataRoot, 'w1'), 'SKILL.md'), 'hacked\n');
        expect(() =>
            planGrokBotInstall({
                entries: [entry('w1')],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                prune: false,
                materialize: 'bridge',
            }),
        ).toThrow(/locally modified/);
    });
});

describe('emission rollback (R6/R8)', () => {
    it('restores prior workflows and canonical files when the receipt write fails', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        const priorCanonical = readFileSync(join(botCanonicalSkillDir(res.dataRoot, 'w1'), 'SKILL.md'), 'utf-8');
        // Simulate an updated recipe whose receipt write fails mid-install.
        await expect(
            emitGrokBotInstall({
                entries: [entry('w1', 'updated', new Map([['ref.md', '# v2\n']]))],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                materialize: 'bridge',
                superskillVersion: '0.0.0-test',
                nowIso: '2026-01-02T00:00:00Z',
                prune: false,
                pruneCandidates: [],
                finalize: () => {
                    throw new Error('receipt write exploded');
                },
            }),
        ).rejects.toThrow(/receipt write exploded/);
        expect(readFileSync(join(botCanonicalSkillDir(res.dataRoot, 'w1'), 'SKILL.md'), 'utf-8')).toBe(priorCanonical);
        expect(existsSync(join(res.workflowsDir, 'w1', BOT_ORIGIN_MARKER))).toBe(true);
    });

    it('restores pruned workflows when a later emission step fails', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('keep'), entry('old')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        const plan = planGrokBotInstall({
            entries: [entry('keep')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            prune: true,
            materialize: 'bridge',
        });
        await expect(
            emitGrokBotInstall({
                entries: [entry('keep')],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                materialize: 'full',
                superskillVersion: '0.0.0-test',
                nowIso: '2026-01-02T00:00:00Z',
                prune: true,
                pruneCandidates: plan.pruneCandidates,
                finalize: () => {
                    throw new Error('receipt write exploded');
                },
            }),
        ).rejects.toThrow(/receipt write exploded/);
        expect(existsSync(join(res.workflowsDir, 'old', 'SKILL.md'))).toBe(true);
    });
});

describe('inspectGrokBotTarget (R6 doctor)', () => {
    it('reports unresolved roots with available=false and the host guidance', () => {
        const report = inspectGrokBotTarget({ homeDir: join(tmp, 'empty-home') });
        expect(report.target).toBe(GROK_BOT_TARGET);
        expect(report.available).toBe(false);
        expect(report.issues[0]?.code).toBe('root-unresolved');
        expect(report.issues[0]?.message).toContain('run on the Grok Bot host');
    });

    it('missing workflows dir on a resolved root is available (first-install state)', () => {
        mkdirSync(join(tmp, 'sand'));
        const report = inspectGrokBotTarget({ sandData: join(tmp, 'sand'), homeDir: tmp });
        expect(report.available).toBe(true);
        expect(report.issues).toEqual([]);
    });

    it('flags marker-missing, canonical-missing, and drift per workflow', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'sand'), homeDir: tmp, createMissing: true });
        // Owned bridge workflow.
        await emitGrokBotInstall({
            entries: [entry('ok')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        // Unmarked foreign workflow.
        const unmarked = join(res.workflowsDir, 'unmarked');
        mkdirSync(unmarked);
        writeFileSync(join(unmarked, 'SKILL.md'), '---\nname: unmarked\ndescription: d\n---\nx');
        const report = inspectGrokBotTarget({ sandData: join(tmp, 'sand'), homeDir: tmp });
        expect(report.available).toBe(false);
        expect(report.issues.map((i) => i.code)).toContain('marker-missing');
        // Break the canonical resource → canonical-missing.
        rmSync(botCanonicalSkillDir(res.dataRoot, 'ok'), { recursive: true, force: true });
        const report2 = inspectGrokBotTarget({ sandData: join(tmp, 'sand'), homeDir: tmp });
        expect(report2.issues.map((i) => i.code)).toContain('canonical-missing');
    });
});

describe('grok-bot receipt (R7)', () => {
    it('manifest with grokBot field round-trips at installManifestPath(sandRoot, grok-bot, plugin)', () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'sand'), homeDir: tmp, createMissing: true });
        const path = writeInstallManifest(res.dataRoot, GROK_BOT_TARGET, 'sp', {
            schemaVersion: 1,
            plugin: 'sp',
            target: GROK_BOT_TARGET,
            channel: 'bundled',
            upstreamVersion: '1.0.0',
            installedAt: '2026-01-01T00:00:00Z',
            superskillVersion: '0.0.0-test',
            installed: { files: {}, canonicalHash: 'a'.repeat(64) },
            upstream: { files: {}, canonicalHash: 'b'.repeat(64) },
            grokBot: { materialize: 'bridge' },
        });
        expect(path).toContain(join('.superskill', 'manifests', GROK_BOT_TARGET, 'sp'));
        const manifest = readInstallManifest(installManifestPath(res.dataRoot, GROK_BOT_TARGET, 'sp'));
        expect(manifest?.grokBot).toEqual({ materialize: 'bridge' });
    });

    it('rejects invalid grokBot materialize values', () => {
        expect(() =>
            writeInstallManifest(tmp, GROK_BOT_TARGET, 'sp', {
                schemaVersion: 1,
                plugin: 'sp',
                target: GROK_BOT_TARGET,
                channel: 'bundled',
                upstreamVersion: '1.0.0',
                installedAt: '2026-01-01T00:00:00Z',
                superskillVersion: '0.0.0-test',
                installed: { files: {}, canonicalHash: 'a'.repeat(64) },
                upstream: { files: {}, canonicalHash: 'b'.repeat(64) },
                grokBot: { materialize: 'surprise' as 'bridge' },
            }),
        ).toThrow(/materialize must be bridge or full/);
    });
});

describe('bridge pointer rendering', () => {
    it('keeps description frontmatter and points at the canonical SKILL.md', () => {
        const pointer = renderBridgePointer(
            entry('w1', 'line one line two'),
            join('/x', '.superskill', 'grok-bot', 'skills', 'w1'),
            join('/x', 'workflows', 'w1'),
        );
        expect(pointer).toContain('name: w1');
        expect(pointer).toContain('line one line two');
        expect(pointer).toMatch(/canonical: \.\.\/\.\.\/\.superskill\/grok-bot\/skills\/w1\/SKILL\.md/);
        // R3 (task 0130): pointer body carries the invocation intent for host consumers.
        expect(pointer).toContain('read and follow the canonical skill at');
        expect(pointer).toContain('Pass any user arguments through unchanged');
    });
});

describe('registration handoff (task 0130)', () => {
    const HANDOFF_WIRING =
        (res: ReturnType<typeof resolveSandRoot>): Parameters<typeof emitGrokBotInstall>[0]['postActions'] =>
        (write) => ({
            actions: [
                {
                    id: 'grok-bot/register-handoff',
                    preview: () => ({ writtenFiles: [], messages: ['preview'] }),
                    apply: () => {
                        const handoff = buildBotRegisterHandoff({
                            plugin: 'sp',
                            entries: [entry('w1')],
                            source: SOURCE,
                            materialize: 'bridge',
                            dataRoot: res.dataRoot,
                        });
                        const path = botRegisterHandoffPath(res.dataRoot, 'sp');
                        // Mirrors the CLI wiring: write inside the emission transaction.
                        return (async () => {
                            await write(path, `${JSON.stringify(handoff, null, 2)}\n`);
                            return { writtenFiles: [path], messages: [`handoff prepared at ${path}`] };
                        })();
                    },
                },
            ],
            stagingRoot: '/staging',
        });

    it('writes a deterministic handoff inside the emission and reports it after success', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        const emitted = await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
            postActions: HANDOFF_WIRING(res),
        });
        const path = botRegisterHandoffPath(res.dataRoot, 'sp');
        expect(emitted.postInstall.writtenFiles).toEqual([path]);
        expect(emitted.postInstall.messages.join(' ')).toContain(path);
        const first = readFileSync(path, 'utf-8');
        const handoff = JSON.parse(first);
        expect(handoff.schemaVersion).toBe(1);
        expect(handoff.target).toBe('grok-bot');
        expect(handoff.plugin).toBe('sp');
        expect(handoff.materialize).toBe('bridge');
        expect(handoff.skills).toHaveLength(1);
        expect(handoff.skills[0].recipePath).toBe(
            join(realpathSync(res.dataRoot), '.superskill', 'grok-bot', 'skills', 'w1', 'SKILL.md'),
        );
        // Bridge body reads the distinct canonical recipe explicitly.
        expect(handoff.skills[0].body).toContain(handoff.skills[0].recipePath);
        expect(handoff.skills[0].frontmatter).toEqual({ name: 'w1', description: 'does things' });
        expect(handoff.skills[0].resources).toEqual({ 'ref.md': '# ref\n' });
        // Deterministic: identical batch → byte-identical handoff.
        const emitted2 = await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-02T00:00:00Z',
            prune: false,
            pruneCandidates: [],
            postActions: HANDOFF_WIRING(res),
        });
        expect(readFileSync(botRegisterHandoffPath(res.dataRoot, 'sp'), 'utf-8')).toBe(first);
        expect(emitted2.postInstall.messages.join(' ')).not.toContain('registered');
    });

    it('rolls the handoff back with the catalog when a post-install action fails', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'bridge',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        const priorCanonical = readFileSync(join(botCanonicalSkillDir(res.dataRoot, 'w1'), 'SKILL.md'), 'utf-8');
        await expect(
            emitGrokBotInstall({
                entries: [entry('w1', 'updated')],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                materialize: 'bridge',
                superskillVersion: '0.0.0-test',
                nowIso: '2026-01-02T00:00:00Z',
                prune: false,
                pruneCandidates: [],
                postActions: (write) => ({
                    actions: [
                        {
                            id: 'boom',
                            preview: () => ({ writtenFiles: [], messages: [] }),
                            apply: () =>
                                write(join(tmp, 'never.json'), '{}').then(() => {
                                    throw new Error('action exploded');
                                }),
                        },
                    ],
                    stagingRoot: '/staging',
                }),
            }),
        ).rejects.toThrow(/post-install action 'boom' failed for target 'grok-bot': action exploded/);
        expect(existsSync(join(tmp, 'never.json'))).toBe(false);
        expect(existsSync(botRegisterHandoffPath(res.dataRoot, 'sp'))).toBe(false);
        expect(readFileSync(join(botCanonicalSkillDir(res.dataRoot, 'w1'), 'SKILL.md'), 'utf-8')).toBe(priorCanonical);
    });

    it('rolls the handoff back when the receipt write fails after actions', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await expect(
            emitGrokBotInstall({
                entries: [entry('w1')],
                resolution: res,
                plugin: 'sp',
                source: SOURCE,
                materialize: 'bridge',
                superskillVersion: '0.0.0-test',
                nowIso: '2026-01-01T00:00:00Z',
                prune: false,
                pruneCandidates: [],
                postActions: HANDOFF_WIRING(res),
                finalize: () => {
                    throw new Error('receipt write exploded');
                },
            }),
        ).rejects.toThrow(/receipt write exploded/);
        expect(existsSync(botRegisterHandoffPath(res.dataRoot, 'sp'))).toBe(false);
    });

    it('rejects full-mode records whose body self-references the replaced workflow file', () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        const workflowPath = join(res.workflowsDir, 'w1', 'SKILL.md');
        expect(() =>
            buildBotRegisterHandoff({
                plugin: 'sp',
                entries: [{ ...entry('w1'), skillMd: `---\nname: w1\ndescription: d\n---\nRead ${workflowPath}.\n` }],
                source: SOURCE,
                materialize: 'full',
                dataRoot: res.dataRoot,
            }),
        ).toThrow(/self-references its replacement target/);
    });

    it('rejects full-mode self-reference via the unresolved symlinked-root form', () => {
        // On a symlinked Sand root the canonical guard sees the realpath'd path;
        // a body citing the unresolved absolute form must be rejected too.
        const realRoot = join(tmp, 'real-root');
        mkdirSync(realRoot, { recursive: true });
        const linkRoot = join(tmp, 'link-root');
        symlinkSync(realRoot, linkRoot, 'dir');
        const unresolvedWorkflowPath = join(linkRoot, 'workflows', 'w1', 'SKILL.md');
        expect(() =>
            buildBotRegisterHandoff({
                plugin: 'sp',
                entries: [
                    {
                        ...entry('w1'),
                        skillMd: `---\nname: w1\ndescription: d\n---\nRead ${unresolvedWorkflowPath}.\n`,
                    },
                ],
                source: SOURCE,
                materialize: 'full',
                dataRoot: linkRoot,
            }),
        ).toThrow(/self-references its replacement target/);
    });

    it('full-mode records preserve a host write round-trip: applying bodies keeps markers current', async () => {
        const res = resolveSandRoot({ sandData: join(tmp, 'root'), homeDir: tmp, createMissing: true });
        await emitGrokBotInstall({
            entries: [entry('w1')],
            resolution: res,
            plugin: 'sp',
            source: SOURCE,
            materialize: 'full',
            superskillVersion: '0.0.0-test',
            nowIso: '2026-01-01T00:00:00Z',
            prune: false,
            pruneCandidates: [],
        });
        const handoff = buildBotRegisterHandoff({
            plugin: 'sp',
            entries: [entry('w1')],
            source: SOURCE,
            materialize: 'full',
            dataRoot: res.dataRoot,
        });
        const record = handoff.skills.at(0);
        if (!record) throw new Error('expected one skill record');
        expect(record.recipePath).toBe(join(realpathSync(res.dataRoot), 'workflows', 'w1', 'SKILL.md'));
        // Preserving host write: bytes come from the record, not the on-disk recipe.
        writeFileSync(record.recipePath, record.body, 'utf-8');
        const marker = readOriginMarker(join(res.workflowsDir, 'w1'), 'sp');
        if (!marker) throw new Error('expected origin marker');
        expect(markerHashesCurrent(marker, join(res.workflowsDir, 'w1'))).toBe(true);
    });

    it('doctor reports slash registry unknown with guidance, without affecting availability', async () => {
        const root = join(tmp, 'root');
        mkdirSync(root, { recursive: true });
        process.env[BOT_SAND_DATA_ENV] = root;
        const report = inspectGrokBotTarget({ sandData: root, homeDir: tmp });
        expect(report.slashRegistry.status).toBe('unknown');
        expect(report.slashRegistry.handoffDir).toBe(join(realpathSync(root), '.superskill', 'grok-bot', 'register'));
        expect(report.slashRegistry.guidance.join(' ')).toMatch(/Plugins > Yours/);
        expect(report.available).toBe(true); // empty root is healthy; slashRegistry never affects availability
    });
});
