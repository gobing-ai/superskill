import { describe, expect, it } from 'bun:test';
import {
    TARGET_GLOBAL_SKILLS_RELDIR,
    TARGET_SKILLS_RELDIR,
    TARGET_TO_AGENT_NAME,
    TARGET_TO_RULESYNC,
    TARGET_TO_RULESYNC_HOOKS,
    TARGETS,
} from '../src/targets';

describe('targets', () => {
    it('TARGETS covers 9 agents', () => {
        expect(TARGETS).toHaveLength(9);
        expect(TARGETS).toContain('claude');
        expect(TARGETS).toContain('codex');
        expect(TARGETS).toContain('pi');
        expect(TARGETS).toContain('omp');
        expect(TARGETS).toContain('opencode');
        expect(TARGETS).toContain('antigravity-cli');
        expect(TARGETS).toContain('antigravity-ide');
        expect(TARGETS).toContain('hermes');
        expect(TARGETS).toContain('grok');
    });

    it('TARGET_TO_RULESYNC maps rulesync-supported targets to ToolTarget strings', () => {
        expect(TARGET_TO_RULESYNC.codex).toBe('codexcli');
        // codex, pi, omp all read '~/.agents/skills/' natively → share rulesync's codexcli
        // target (ADR-010 amendment 2026-06-23). Antigravity does NOT — its CLI reads
        // '~/.gemini/antigravity-cli/skills/' and its IDE reads '~/.gemini/config/skills/',
        // so each routes to its own rulesync generator (task 0072).
        expect(TARGET_TO_RULESYNC.pi).toBe('codexcli');
        expect(TARGET_TO_RULESYNC.opencode).toBe('opencode');
        expect(TARGET_TO_RULESYNC['antigravity-cli']).toBe('antigravity-cli');
        expect(TARGET_TO_RULESYNC['antigravity-ide']).toBe('antigravity-ide');
    });

    it('TARGET_TO_RULESYNC excludes targets handled outside rulesync', () => {
        expect(TARGET_TO_RULESYNC).not.toHaveProperty('claude');
        expect(TARGET_TO_RULESYNC).not.toHaveProperty('omp');
        expect(TARGET_TO_RULESYNC).not.toHaveProperty('hermes');
        expect(TARGET_TO_RULESYNC).not.toHaveProperty('grok');
    });

    it('TARGET_TO_AGENT_NAME bridges every Target to an AgentName', () => {
        for (const target of TARGETS) {
            expect(TARGET_TO_AGENT_NAME).toHaveProperty(target);
            expect(typeof TARGET_TO_AGENT_NAME[target]).toBe('string');
        }
    });

    it('omp maps to canonical omp AgentName (speaks Pi slash dialect)', () => {
        expect(TARGET_TO_AGENT_NAME.omp).toBe('omp');
    });

    it('targets with canonical AgentName ids map 1:1', () => {
        expect(TARGET_TO_AGENT_NAME.claude).toBe('claude');
        expect(TARGET_TO_AGENT_NAME.codex).toBe('codex');
        expect(TARGET_TO_AGENT_NAME.pi).toBe('pi');
        expect(TARGET_TO_AGENT_NAME.omp).toBe('omp');
        expect(TARGET_TO_AGENT_NAME.opencode).toBe('opencode');
        expect(TARGET_TO_AGENT_NAME['antigravity-cli']).toBe('antigravity-cli');
        expect(TARGET_TO_AGENT_NAME.hermes).toBe('hermes');
        expect(TARGET_TO_AGENT_NAME.grok).toBe('grok');
    });

    it('antigravity-ide (not in AgentName) bridges to opencode fallback', () => {
        expect(TARGET_TO_AGENT_NAME['antigravity-ide']).toBe('opencode');
    });

    it('grok is absent from rulesync skill reldir maps (native plugin peer of claude/omp)', () => {
        expect(TARGET_SKILLS_RELDIR).not.toHaveProperty('grok');
        expect(TARGET_GLOBAL_SKILLS_RELDIR).not.toHaveProperty('grok');
        expect(TARGET_TO_RULESYNC_HOOKS).not.toHaveProperty('grok');
    });
});
