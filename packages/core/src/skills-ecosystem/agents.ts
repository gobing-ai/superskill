import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TARGETS, type Target } from '../targets';

/**
 * Installation tier defining how skills are delivered to a target agent.
 * - `direct`: agent natively reads the universal `.agents/skills` folder (installs land there
 *   once; see ADR-010 amendment). The `skillsDir`/`globalSkillsDir` fields below stay
 *   vendor-faithful (vercel-labs/skills agent table) — they model where `npx skills`
 *   installs per agent, which is interop data, not superskill's own landing path.
 * - `symlink`: target directory contains symlinks pointing to canonical skills.
 * - `translate`: target requires dialect/format transformation.
 */
export type InstallTier = 'direct' | 'symlink' | 'translate';

/**
 * Configuration and path resolution probe for a target agent.
 */
export interface TargetAgentConfig {
    target: Target;
    displayName: string;
    tier: InstallTier;
    skillsDir: string;
    globalSkillsDir: string;
    detectInstalled: (opts?: { homeDir?: string; env?: Record<string, string | undefined> }) => boolean;
}

/**
 * Tier mapping for superskill's 9 canonical target agents.
 */
export const TARGET_TIERS: Record<Target, InstallTier> = {
    codex: 'direct',
    pi: 'direct',
    omp: 'direct',
    claude: 'symlink',
    opencode: 'symlink',
    'antigravity-cli': 'symlink',
    'antigravity-ide': 'symlink',
    hermes: 'translate',
    grok: 'translate',
};

/**
 * Resolve target agent configurations with environment variable overrides and home directory probes.
 */
export function getTargetAgentConfig(
    target: Target,
    opts?: { homeDir?: string; env?: Record<string, string | undefined> },
): TargetAgentConfig {
    const env = opts?.env ?? process.env;
    const home = opts?.homeDir ?? homedir();
    const configHome = env.XDG_CONFIG_HOME?.trim() || join(home, '.config');

    const codexHome = env.CODEX_HOME?.trim() || join(home, '.codex');
    const claudeHome = env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
    const hermesHome = env.HERMES_HOME?.trim() || join(home, '.hermes');
    const grokHome = env.GROK_HOME?.trim() || join(home, '.grok');

    switch (target) {
        case 'claude':
            return {
                target: 'claude',
                displayName: 'Claude Code',
                tier: 'symlink',
                skillsDir: '.claude/skills',
                globalSkillsDir: join(claudeHome, 'skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    const e = dOpts?.env ?? env;
                    const cHome = e.CLAUDE_CONFIG_DIR?.trim() || join(h, '.claude');
                    return existsSync(cHome);
                },
            };
        case 'codex':
            return {
                target: 'codex',
                displayName: 'Codex',
                tier: 'direct',
                skillsDir: '.agents/skills',
                globalSkillsDir: join(codexHome, 'skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    const e = dOpts?.env ?? env;
                    const cxHome = e.CODEX_HOME?.trim() || join(h, '.codex');
                    return existsSync(cxHome) || existsSync('/etc/codex');
                },
            };
        case 'pi':
            return {
                target: 'pi',
                displayName: 'Pi',
                tier: 'direct',
                skillsDir: '.pi/skills',
                globalSkillsDir: join(home, '.pi/agent/skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    return existsSync(join(h, '.pi/agent')) || existsSync(join(h, '.pi'));
                },
            };
        case 'omp':
            return {
                target: 'omp',
                displayName: 'Oh My Pi',
                tier: 'direct',
                skillsDir: '.agents/skills',
                globalSkillsDir: join(configHome, 'omp/skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    const e = dOpts?.env ?? env;
                    const cfg = e.XDG_CONFIG_HOME?.trim() || join(h, '.config');
                    return existsSync(join(cfg, 'omp')) || existsSync(join(h, '.omp'));
                },
            };
        case 'opencode':
            return {
                target: 'opencode',
                displayName: 'OpenCode',
                tier: 'symlink',
                skillsDir: '.opencode/skills',
                globalSkillsDir: join(configHome, 'opencode/skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    const e = dOpts?.env ?? env;
                    const cfg = e.XDG_CONFIG_HOME?.trim() || join(h, '.config');
                    return existsSync(join(cfg, 'opencode'));
                },
            };
        case 'antigravity-cli':
            return {
                target: 'antigravity-cli',
                displayName: 'Antigravity CLI',
                tier: 'symlink',
                skillsDir: '.agents/skills',
                globalSkillsDir: join(home, '.gemini/antigravity-cli/skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    return existsSync(join(h, '.gemini/antigravity-cli'));
                },
            };
        case 'antigravity-ide':
            return {
                target: 'antigravity-ide',
                displayName: 'Antigravity IDE',
                tier: 'symlink',
                skillsDir: '.agents/skills',
                globalSkillsDir: join(home, '.gemini/config/skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    return existsSync(join(h, '.gemini/config'));
                },
            };
        case 'hermes':
            return {
                target: 'hermes',
                displayName: 'Hermes Agent',
                tier: 'translate',
                skillsDir: '.hermes/skills',
                globalSkillsDir: join(hermesHome, 'skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    const e = dOpts?.env ?? env;
                    const hHome = e.HERMES_HOME?.trim() || join(h, '.hermes');
                    return existsSync(hHome);
                },
            };
        case 'grok':
            return {
                target: 'grok',
                displayName: 'Grok Build',
                tier: 'translate',
                skillsDir: '.grok/skills',
                globalSkillsDir: join(grokHome, 'skills'),
                detectInstalled: (dOpts) => {
                    const h = dOpts?.homeDir ?? home;
                    const e = dOpts?.env ?? env;
                    const gHome = e.GROK_HOME?.trim() || join(h, '.grok');
                    return existsSync(gHome);
                },
            };
    }
}

/**
 * Map of target configs for all 9 supported superskill targets.
 */
export const TARGET_AGENTS: Record<Target, TargetAgentConfig> = TARGETS.reduce(
    (acc, target) => {
        acc[target] = getTargetAgentConfig(target);
        return acc;
    },
    {} as Record<Target, TargetAgentConfig>,
);

/**
 * Detect which target agents are installed on the local system.
 */
export function detectInstalledTargetAgents(opts?: {
    homeDir?: string;
    env?: Record<string, string | undefined>;
}): Target[] {
    return TARGETS.filter((t) => getTargetAgentConfig(t, opts).detectInstalled(opts));
}
