import { describe, expect, it } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    detectInstalledTargetAgents,
    getTargetAgentConfig,
    TARGET_AGENTS,
    TARGET_TIERS,
} from '../../src/skills-ecosystem/agents';
import { TARGETS } from '../../src/targets';

describe('agents.ts - Target bridge & Tier assignment', () => {
    it('assigns correct tiers to all 9 targets', () => {
        expect(TARGET_TIERS.codex).toBe('direct');
        expect(TARGET_TIERS.pi).toBe('direct');
        expect(TARGET_TIERS.omp).toBe('direct');

        expect(TARGET_TIERS.claude).toBe('symlink');
        expect(TARGET_TIERS.opencode).toBe('symlink');
        expect(TARGET_TIERS['antigravity-cli']).toBe('symlink');
        expect(TARGET_TIERS['antigravity-ide']).toBe('symlink');

        expect(TARGET_TIERS.hermes).toBe('translate');
        expect(TARGET_TIERS.grok).toBe('translate');
    });

    it('exposes all 9 superskill targets in TARGET_AGENTS', () => {
        for (const target of TARGETS) {
            const config = TARGET_AGENTS[target];
            expect(config).toBeDefined();
            expect(config.target).toBe(target);
            expect(config.tier).toBe(TARGET_TIERS[target]);
        }
    });

    it('respects environment overrides for config directories', () => {
        const fakeHome = join(tmpdir(), `test-agents-env-${Date.now()}`);
        const customCodex = join(fakeHome, 'custom-codex');
        const customClaude = join(fakeHome, 'custom-claude');
        const customHermes = join(fakeHome, 'custom-hermes');
        const customGrok = join(fakeHome, 'custom-grok');

        const env = {
            CODEX_HOME: customCodex,
            CLAUDE_CONFIG_DIR: customClaude,
            HERMES_HOME: customHermes,
            GROK_HOME: customGrok,
        };

        const codexConfig = getTargetAgentConfig('codex', { homeDir: fakeHome, env });
        expect(codexConfig.globalSkillsDir).toBe(join(customCodex, 'skills'));

        const claudeConfig = getTargetAgentConfig('claude', { homeDir: fakeHome, env });
        expect(claudeConfig.globalSkillsDir).toBe(join(customClaude, 'skills'));

        const hermesConfig = getTargetAgentConfig('hermes', { homeDir: fakeHome, env });
        expect(hermesConfig.globalSkillsDir).toBe(join(customHermes, 'skills'));

        const grokConfig = getTargetAgentConfig('grok', { homeDir: fakeHome, env });
        expect(grokConfig.globalSkillsDir).toBe(join(customGrok, 'skills'));
    });

    it('probes installed agents correctly', () => {
        const fakeHome = join(tmpdir(), `test-agents-probe-${Date.now()}`);
        mkdirSync(join(fakeHome, '.claude'), { recursive: true });
        mkdirSync(join(fakeHome, '.hermes'), { recursive: true });

        const installed = detectInstalledTargetAgents({ homeDir: fakeHome, env: {} });
        expect(installed).toContain('claude');
        expect(installed).toContain('hermes');
        expect(installed).not.toContain('grok');
    });
});
