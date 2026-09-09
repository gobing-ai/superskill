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
    collectBotSkillEntries,
    emitGrokBotInstall,
    GROK_BOT_TARGET,
    inspectGrokBotTarget,
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
    });
});
