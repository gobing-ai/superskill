import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontmatter } from '../../src/content/frontmatter';
import {
    applyGrokBotDegradation,
    type BotSkillEntry,
    collectBotSkillEntries,
    filterGrokBotEntries,
    GrokBotPreflightError,
    mapPluginToRulesync,
    parseBotSkillEntry,
    parseRuntimeRequires,
    readInstallManifest,
} from '../../src/index';
import { _validateContent } from '../../src/operations/validate';

let tempDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'superskill-requires-'));
});

afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
});

describe('parseRuntimeRequires (task 0162 R1/AC1)', () => {
    it('sorts and de-duplicates a list, and accepts a bare string as a one-item list', () => {
        expect(parseRuntimeRequires(['cli:spur', 'hooks'])).toEqual({ requires: ['cli:spur', 'hooks'], invalid: [] });
        expect(parseRuntimeRequires(['local-fs', 'local-fs'])).toEqual({ requires: ['local-fs'], invalid: [] });
        expect(parseRuntimeRequires('subagents')).toEqual({ requires: ['subagents'], invalid: [] });
        expect(parseRuntimeRequires(undefined)).toEqual({ requires: [], invalid: [] });
    });

    it('reports a bad token, a non-string item, and a non-list/non-string value', () => {
        expect(parseRuntimeRequires(['cli:Spur'])).toEqual({ requires: [], invalid: ['cli:Spur'] });
        expect(parseRuntimeRequires(['network'])).toEqual({ requires: [], invalid: ['network'] });
        expect(parseRuntimeRequires([42])).toEqual({ requires: [], invalid: ['42'] });
        expect(parseRuntimeRequires(42)).toEqual({ requires: [], invalid: ['number'] });
        expect(parseRuntimeRequires(null)).toEqual({ requires: [], invalid: ['null'] });
    });

    it('keeps the valid half of a mixed list and reports only the invalid entries', () => {
        expect(parseRuntimeRequires(['hooks', 'cli:Spur', 'cli:spur'])).toEqual({
            requires: ['cli:spur', 'hooks'],
            invalid: ['cli:Spur'],
        });
    });
});

describe('validate recognizes requires (task 0162 R2/AC1)', () => {
    const skill = (requires: string): string =>
        `---\nname: a\ndescription: Does a thing\n${requires}---\n\nBody text.\n`;

    it('accepts valid tokens with no unknown-key warning and no requires finding', () => {
        for (const value of [
            'requires: [cli:spur, hooks]',
            'requires: "subagents"',
            'requires: [local-fs, local-fs]',
        ]) {
            const result = _validateContent('skill', skill(`${value}\n`), { strict: true });
            expect(result.findings.filter((finding) => finding.field === 'requires')).toEqual([]);
            expect(result.valid).toBe(true);
        }
    });

    it('reports one error finding per invalid token or value', () => {
        for (const [value, token] of [
            ['requires: [cli:Spur]', 'cli:Spur'],
            ['requires: [network]', 'network'],
            ['requires: 42', 'number'],
        ] as const) {
            const result = _validateContent('skill', skill(`${value}\n`), { strict: true });
            const findings = result.findings.filter((finding) => finding.field === 'requires');
            expect(findings.length).toBe(1);
            expect(findings[0]?.severity).toBe('error');
            expect(findings[0]?.message).toContain(token);
            expect(result.valid).toBe(false);
        }
    });

    it('recognizes requires on commands and agents too, never on hooks', () => {
        const command = _validateContent(
            'command',
            '---\ndescription: Does a thing\nrequires: [cli:spur]\n---\n\nBody.\n',
            {
                strict: true,
            },
        );
        expect(command.findings.filter((finding) => finding.field === 'requires')).toEqual([]);
        const agent = _validateContent(
            'agent',
            '---\nname: a\ndescription: Does a thing\nmodel: sonnet\ntools: [Read]\nrequires: [bogus]\n---\n\nBody.\n',
            { strict: true },
        );
        expect(agent.findings.filter((finding) => finding.field === 'requires').length).toBe(1);
    });
});

describe('requires survives the mapper for every entity kind (task 0162 R3/AC2)', () => {
    function stageFixture(requiresValue: string): string {
        const pluginRoot = join(tempDir, 'plugins', 'demo');
        for (const dir of ['skills', 'commands', 'agents']) mkdirSync(join(pluginRoot, dir), { recursive: true });
        writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'demo' }));
        writeFileSync(
            join(pluginRoot, 'skills', 'a.md'),
            `---\nname: a\ndescription: Skill a\n${requiresValue}---\n\nSkill body.\n`,
        );
        writeFileSync(
            join(pluginRoot, 'commands', 'c.md'),
            `---\ndescription: Command c\n${requiresValue}---\n\nCommand body.\n`,
        );
        writeFileSync(
            join(pluginRoot, 'agents', 'g.md'),
            `---\nname: g\ndescription: Agent g\nmodel: sonnet\ntools: [Read]\n${requiresValue}---\n\nAgent body.\n`,
        );
        const outputDir = join(tempDir, 'staging');
        mapPluginToRulesync(pluginRoot, 'demo', outputDir, { features: ['skills', 'commands', 'subagents'] });
        return join(outputDir, 'skills');
    }

    it('carries [cli:spur] on the staged skill, command and subagent entries', () => {
        const entries = collectBotSkillEntries(stageFixture('requires: [cli:spur]\n'));
        expect(entries.map((entry) => entry.id)).toEqual(['demo-a', 'demo-c', 'demo-g']);
        for (const entry of entries) expect(entry.requires).toEqual(['cli:spur']);
    });

    it('leaves requires empty when the entity declares none', () => {
        const entries = collectBotSkillEntries(stageFixture(''));
        for (const entry of entries) expect(entry.requires).toEqual([]);
    });

    it('fails the grok-bot preflight naming the id and the bad token, before any write', () => {
        const skillsDir = stageFixture('requires: [bogus]\n');
        let thrown: unknown;
        try {
            collectBotSkillEntries(skillsDir);
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(GrokBotPreflightError);
        expect((thrown as Error).message).toContain('demo-a');
        expect((thrown as Error).message).toContain('bogus');
    });
});

describe('grok-bot runtime-requirement filtering (task 0162 R4/AC3-AC4)', () => {
    function entry(id: string, requires: BotSkillEntry['requires']): BotSkillEntry {
        // The staged SKILL.md carries `requires:` because the mapper passes the key through (R3).
        const declares = requires.length === 0 ? '' : `requires: [${requires.join(', ')}]\n`;
        return {
            id,
            description: `Skill ${id} does things`,
            skillMd: `---\nname: ${id}\ndescription: Skill ${id} does things\n${declares}---\n\nBody of ${id}.\n`,
            files: new Map([['ref.md', Buffer.from('# ref\n', 'utf-8')]]),
            requires,
        };
    }

    const entries = (): BotSkillEntry[] => [
        entry('a-cli', ['cli:spur']),
        entry('b-hooks', ['hooks']),
        entry('c-none', []),
        entry('d-both', ['cli:spur', 'subagents']),
    ];

    it('excludes unmet entries by default and reports sorted decisions', () => {
        const result = filterGrokBotEntries(entries(), { provides: ['cli:spur'], unmet: 'exclude' });
        expect(result.entries.map((item) => item.id)).toEqual(['a-cli', 'c-none']);
        expect(result.decisions).toEqual([
            { id: 'b-hooks', action: 'excluded', unmet: ['hooks'] },
            { id: 'd-both', action: 'excluded', unmet: ['subagents'] },
        ]);
    });

    it('keeps every entry under degrade, labelling only the unmet ones', () => {
        const result = filterGrokBotEntries(entries(), { provides: [], unmet: 'degrade' });
        expect(result.entries.map((item) => item.id)).toEqual(['a-cli', 'b-hooks', 'c-none', 'd-both']);
        expect(result.decisions.map((decision) => decision.id)).toEqual(['a-cli', 'b-hooks', 'd-both']);
        const degraded = result.entries.find((item) => item.id === 'd-both');
        expect(degraded?.description).toContain('[degraded on Grok Bot: needs cli:spur, subagents]');
        const parsed = parseFrontmatter(degraded?.skillMd ?? '');
        expect(parsed.data.description).toContain('[degraded on Grok Bot: needs cli:spur, subagents]');
        expect(parsed.data.name).toBe('d-both');
        expect(parsed.data.requires).toEqual(['cli:spur', 'subagents']);
        expect(parsed.body.trimStart().split('\n')[0]).toBe(
            '> **Grok Bot:** degraded — expects cli:spur, subagents, not declared as provided on this Bot.',
        );
        // The id and file set are unchanged: markers hash the delivered bytes.
        expect(degraded?.files).toEqual(entries()[3]?.files);
    });

    it('leaves a fully provided entry byte-identical', () => {
        const result = filterGrokBotEntries(entries(), {
            provides: ['cli:spur', 'subagents', 'hooks'],
            unmet: 'degrade',
        });
        expect(result.decisions).toEqual([]);
        const original = entries()[3];
        expect(result.entries[3]?.skillMd).toBe(original?.skillMd as string);
        expect(result.entries[3]?.description).toBe(original?.description as string);
    });

    it('rewrites a block-scalar description without disturbing other frontmatter or the body', () => {
        const content = '---\nname: x\ntools: [Read]\ndescription: >-\n  Folded one\n  folded two\n---\n\nBody line.\n';
        const degraded = applyGrokBotDegradation(
            { id: 'x', description: 'Folded one folded two', skillMd: content, files: new Map(), requires: ['hooks'] },
            ['hooks'],
        );
        const parsed = parseFrontmatter(degraded.skillMd);
        expect(parsed.data.description).toBe('Folded one folded two [degraded on Grok Bot: needs hooks]');
        expect(parsed.data.tools).toEqual(['Read']);
        expect(parsed.body).toContain('Body line.');
        // The folded continuation lines are gone, replaced by one scalar.
        expect(degraded.skillMd).not.toContain('\n  Folded one');
    });

    it('parses requires off a written degraded SKILL.md without failing install', () => {
        const degraded = applyGrokBotDegradation(entry('a-cli', ['cli:spur']), ['cli:spur']);
        const dir = join(tempDir, 'a-cli');
        mkdirSync(dir, { recursive: true });
        // The degraded write keeps `requires:` verbatim, so a reinstall re-parses it cleanly.
        writeFileSync(join(dir, 'SKILL.md'), degraded.skillMd);
        const reparsed = parseBotSkillEntry(dir);
        expect(reparsed.requires).toEqual(['cli:spur']);
        expect(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).toContain('requires: [cli:spur]');
        expect(degraded.description).toContain('degraded');
    });
});

describe('manifest records the filter options additively (task 0162 R5)', () => {
    const snapshot = { files: {}, canonicalHash: '0'.repeat(64) };
    const receipt = (grokBot: Record<string, unknown>): string => {
        const path = join(tempDir, 'manifest.json');
        writeFileSync(
            path,
            JSON.stringify({
                schemaVersion: 1,
                plugin: 'demo',
                target: 'grok-bot',
                channel: 'bundled',
                upstreamVersion: '1.0.0',
                installedAt: '2026-11-04T00:00:00.000Z',
                superskillVersion: '0.0.0',
                installed: snapshot,
                upstream: snapshot,
                grokBot,
            }),
        );
        return path;
    };

    it('reads a receipt with provides/unmet and rejects an invalid shape on read', () => {
        expect(
            readInstallManifest(receipt({ materialize: 'full', provides: ['cli:spur'], unmet: 'degrade' })).grokBot,
        ).toEqual({ materialize: 'full', provides: ['cli:spur'], unmet: 'degrade' });
        // Pre-0162 receipts stay valid and keep the default policy.
        expect(readInstallManifest(receipt({ materialize: 'bridge' })).grokBot).toEqual({ materialize: 'bridge' });
        expect(() => readInstallManifest(receipt({ materialize: 'full', provides: ['network'] }))).toThrow(
            /grokBot\.provides must be a list of runtime requirements/,
        );
        expect(() => readInstallManifest(receipt({ materialize: 'full', unmet: 'maybe' }))).toThrow(
            /grokBot\.unmet must be exclude or degrade/,
        );
    });
});
