import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Command } from 'commander';
import { isGlobalSilent, setGlobalSilent } from '../../../../plugins/cc/scripts/anti-hallucination/logger';
import { main as sourceMain } from '../../../../plugins/cc/scripts/anti-hallucination/validate_response';
import { registerScriptRun, scriptRun } from '../../src/commands/script-run';
import { cliVersion } from '../../src/version';

/**
 * `superskill script run <plugin> <script-id>` — the non-hook script dispatcher (task 0087).
 * Mirrors the `hook run` contract: registry resolution, fail-open unknown ids, exit codes from
 * the runner. The `cc/validate-response` adapter must preserve the source script's contract
 * byte-for-byte: RESPONSE_TEXT env first, else stdin; empty input passes; stdout is the
 * `{ok, reason, issues?}` result JSON; exit 0/1 (validation-CLI semantics, never hook exit 2).
 */

const COMPLIANT =
    'According to the official documentation at https://api.example.com, the API method is ' +
    'getUser(id: string): User. **Confidence**: HIGH. Source: https://api.example.com/docs';

const VIOLATION =
    'The API endpoint returns user data as JSON with proper error handling for all edge cases ' +
    'and the library method works reliably in production deployments everywhere.';

const SHORT_PASS = 'Done.';

function capture(plugin: string, scriptId: string, input: { stdinText?: string; env: NodeJS.ProcessEnv }) {
    const chunks: string[] = [];
    const errChunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);
    // biome-ignore lint/suspicious/noExplicitAny: stdout.write overload shim for capture
    (process.stdout.write as any) = (chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
    };
    // biome-ignore lint/suspicious/noExplicitAny: stderr.write overload shim for capture
    (process.stderr.write as any) = (chunk: unknown) => {
        errChunks.push(String(chunk));
        return true;
    };
    try {
        const code = scriptRun(plugin, scriptId, input);
        return { code, out: chunks.join(''), err: errChunks.join('') };
    } finally {
        process.stdout.write = original;
        process.stderr.write = originalErr;
    }
}

afterEach(() => {
    mock.restore();
    delete Bun.env.RESPONSE_TEXT;
});

describe('script run — registration', () => {
    it('registers the script group with a run subcommand on the program', () => {
        const program = new Command();
        registerScriptRun(program);
        const group = program.commands.find((c) => c.name() === 'script');
        expect(group).toBeDefined();
        const run = group?.commands.find((c) => c.name() === 'run');
        expect(run).toBeDefined();
        expect(run?.usage()).toContain('<plugin>');
        expect(run?.usage()).toContain('<script-id>');
    });

    it('satisfies the cli-register-pattern convention (registerXxx export)', () => {
        // The re-enabled surface rule requires `export function register\w+\(` per command file.
        expect(typeof registerScriptRun).toBe('function');
        expect(registerScriptRun.name).toMatch(/^register\w+$/);
    });

    it('bare `script` group action lists registered ids', async () => {
        const program = new Command();
        program.exitOverride();
        registerScriptRun(program);
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        await program.parseAsync(['node', 'superskill', 'script']);
        const output = stdout.mock.calls.map((c) => String(c[0])).join('');
        expect(output).toContain('cc/validate-response');
        expect(output).toContain('superskill script run <plugin> <script-id>');
    });
});

describe('script run — unknown id fails open', () => {
    it('unknown script id exits 0 with a stderr warning naming id, version, and known scripts', () => {
        const { code, out, err } = capture('cc', 'no-such-script', { env: {} });
        expect(code).toBe(0);
        expect(out).toBe('');
        expect(err).toContain("unknown script 'cc no-such-script'");
        expect(err).toContain(cliVersion);
        expect(err).toContain('cc/validate-response');
    });

    it('unknown plugin exits 0 with a stderr warning', () => {
        const { code, err } = capture('zz', 'validate-response', { env: {} });
        expect(code).toBe(0);
        expect(err).toContain("unknown script 'zz validate-response'");
    });
});

describe('cc/validate-response adapter', () => {
    it('RESPONSE_TEXT env with compliant text exits 0 with ok:true result JSON', () => {
        const { code, out } = capture('cc', 'validate-response', { env: { RESPONSE_TEXT: COMPLIANT } });
        expect(code).toBe(0);
        const result = JSON.parse(out.trim());
        expect(result.ok).toBe(true);
        expect(typeof result.reason).toBe('string');
    });

    it('stdin with compliant text exits 0', () => {
        const { code, out } = capture('cc', 'validate-response', { env: {}, stdinText: COMPLIANT });
        expect(code).toBe(0);
        expect(JSON.parse(out.trim()).ok).toBe(true);
    });

    it('RESPONSE_TEXT takes precedence over stdin when both are present', () => {
        const { code, out } = capture('cc', 'validate-response', {
            env: { RESPONSE_TEXT: COMPLIANT },
            stdinText: VIOLATION,
        });
        expect(code).toBe(0);
        expect(JSON.parse(out.trim()).ok).toBe(true);
    });

    it('violation text exits 1 with ok:false and issues', () => {
        const { code, out } = capture('cc', 'validate-response', { env: { RESPONSE_TEXT: VIOLATION } });
        expect(code).toBe(1);
        const result = JSON.parse(out.trim());
        expect(result.ok).toBe(false);
        expect(Array.isArray(result.issues)).toBe(true);
    });

    it('empty input (no env, undefined stdin) exits 0 with the no-text pass JSON', () => {
        const { code, out } = capture('cc', 'validate-response', { env: {} });
        expect(code).toBe(0);
        expect(out.trim()).toBe('{"ok":true,"reason":"No response text provided"}');
    });

    it('short text passes without requiring citations', () => {
        const { code, out } = capture('cc', 'validate-response', { env: { RESPONSE_TEXT: SHORT_PASS } });
        expect(code).toBe(0);
        expect(JSON.parse(out.trim()).ok).toBe(true);
    });
});

describe('script run — CLI action seams', () => {
    function exitSpy(): { calls: number[] } {
        const calls: number[] = [];
        spyOn(process, 'exit').mockImplementation(((code?: number) => {
            calls.push(code ?? 0);
            throw new Error(`exit:${code ?? 0}`);
        }) as typeof process.exit);
        return { calls };
    }

    it('run action feeds injected readInput into the dispatcher and exits with its code', async () => {
        const program = new Command();
        program.exitOverride();
        registerScriptRun(program, () => COMPLIANT);
        const spy = exitSpy();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        await expect(
            program.parseAsync(['node', 'superskill', 'script', 'run', 'cc', 'validate-response']),
        ).rejects.toThrow('exit:0');
        expect(spy.calls).toEqual([0]);
    });

    it('run action without readInput uses the TTY-guarded reader (empty stdin → pass)', async () => {
        const program = new Command();
        program.exitOverride();
        registerScriptRun(program);
        const spy = exitSpy();
        spyOn(process.stdout, 'write').mockImplementation(() => true);
        // bun test stdin is not a TTY and sits at EOF — readStdinGuarded returns undefined,
        // which is the empty-input pass path (exit 0).
        await expect(
            program.parseAsync(['node', 'superskill', 'script', 'run', 'cc', 'validate-response']),
        ).rejects.toThrow('exit:0');
        expect(spy.calls).toEqual([0]);
    });

    it('TTY stdin yields undefined stdinText (never blocks on interactive terminals)', async () => {
        const program = new Command();
        program.exitOverride();
        registerScriptRun(program);
        const spy = exitSpy();
        const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
        const origTty = process.stdin.isTTY;
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        try {
            await expect(
                program.parseAsync(['node', 'superskill', 'script', 'run', 'cc', 'validate-response']),
            ).rejects.toThrow('exit:0');
        } finally {
            Object.defineProperty(process.stdin, 'isTTY', { value: origTty, configurable: true });
        }
        expect(spy.calls).toEqual([0]);
        const out = stdout.mock.calls.map((c) => String(c[0])).join('');
        expect(out).toContain('"ok":true');
    });
});

describe('cc/validate-response — parity with the source script (AC3)', () => {
    /**
     * Invokes the source `main()` with RESPONSE_TEXT set (stdin path avoided — test stdin may be
     * a TTY) and captures console.log bytes, then asserts the adapter produces the identical
     * exit code AND stdout bytes. Any output drift fails CI here, not an agent in the field.
     */
    function captureSource(text: string): { code: number; out: string } {
        // Write via Bun.env, not process.env: main() reads Bun.env, and a prior file may have
        // reassigned process.env wholesale (splitting the alias) — see install-omp-helpers.
        Bun.env.RESPONSE_TEXT = text;
        const logs: string[] = [];
        const origLog = console.log;
        // The plugin's own tests toggle logger.setGlobalSilent — a leaked `true` would silence
        // main()'s output here (module state survives mock.restore). Force + restore explicitly.
        const priorSilent = isGlobalSilent();
        setGlobalSilent(false);
        console.log = (...args: unknown[]) => {
            logs.push(args.map(String).join(' '));
        };
        try {
            return { code: sourceMain(), out: `${logs.join('\n')}\n` };
        } finally {
            console.log = origLog;
            setGlobalSilent(priorSilent);
            delete Bun.env.RESPONSE_TEXT;
        }
    }

    it('identical exit code and stdout bytes for compliant text', () => {
        const source = captureSource(COMPLIANT);
        const adapter = capture('cc', 'validate-response', { env: { RESPONSE_TEXT: COMPLIANT } });
        expect(adapter.code).toBe(source.code);
        expect(adapter.out).toBe(source.out);
    });

    it('identical exit code and stdout bytes for violation text', () => {
        const source = captureSource(VIOLATION);
        const adapter = capture('cc', 'validate-response', { env: { RESPONSE_TEXT: VIOLATION } });
        expect(adapter.code).toBe(source.code);
        expect(adapter.out).toBe(source.out);
    });

    it('identical exit code and stdout bytes for empty input', () => {
        const source = captureSource('');
        const adapter = capture('cc', 'validate-response', { env: {} });
        expect(adapter.code).toBe(source.code);
        expect(adapter.out).toBe(source.out);
    });
});
