import { describe, expect, it } from 'bun:test';
import { parseCommandArgv } from '../src/command-argv';

describe('parseCommandArgv', () => {
    it('preserves quoted whitespace and removes quote delimiters', () => {
        expect(parseCommandArgv("bash -c 'echo hello world'")).toEqual(['bash', '-c', 'echo hello world']);
        expect(parseCommandArgv('tool "two words" tail')).toEqual(['tool', 'two words', 'tail']);
    });

    it('preserves empty quoted arguments and escaped whitespace', () => {
        expect(parseCommandArgv('tool "" end')).toEqual(['tool', '', 'end']);
        expect(parseCommandArgv('tool two\\ words')).toEqual(['tool', 'two words']);
    });

    it('keeps a trailing backslash and tolerates an unmatched quote', () => {
        expect(parseCommandArgv('tool tail\\')).toEqual(['tool', 'tail\\']);
        expect(parseCommandArgv("tool 'unfinished value")).toEqual(['tool', 'unfinished value']);
    });
});
