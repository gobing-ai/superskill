import { describe, expect, it } from 'bun:test';
import { translateSlashCommands } from '../../src/pipeline/slash-command';

describe('translateSlashCommands', () => {
    it('translates Claude-style slash commands to Codex dialect', () => {
        expect(translateSlashCommands('/rd3:dev-run docs/tasks/0003.md', 'codex')).toBe(
            '$rd3-dev-run docs/tasks/0003.md',
        );
    });

    it('translates Claude-style slash commands to Pi dialect', () => {
        expect(translateSlashCommands('/rd3:dev-run 0003', 'pi')).toBe('/skill:rd3-dev-run 0003');
    });

    it('uses TARGET_TO_AGENT_NAME so omp speaks Pi dialect', () => {
        expect(translateSlashCommands('/rd3:dev-run 0003', 'omp')).toBe('/skill:rd3-dev-run 0003');
    });

    it('uses default slash dialect for non-claude/codex/pi bridge targets', () => {
        expect(translateSlashCommands('/rd3:dev-run 0003', 'antigravity-cli')).toBe('/rd3-dev-run 0003');
        expect(translateSlashCommands('/rd3:dev-run 0003', 'hermes')).toBe('/rd3-dev-run 0003');
    });

    it('leaves non-slash-command lines unchanged', () => {
        expect(translateSlashCommands('Use rd3:dev-run in prose.', 'codex')).toBe('Use rd3:dev-run in prose.');
    });

    it('translates each standalone command line', () => {
        expect(translateSlashCommands('/rd3:dev-run\n/wt:publish-to-x', 'codex')).toBe(
            '$rd3-dev-run\n$wt-publish-to-x',
        );
    });
});
