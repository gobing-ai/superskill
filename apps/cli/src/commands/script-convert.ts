import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { echo, echoError } from '@gobing-ai/ts-utils';
import type { Command } from 'commander';

const NODE_SHEBANG = '#!/usr/bin/env node';

/**
 * Bun globals that survive `Bun.build({ target: 'node' })`, mapped to their Node replacement.
 * `target: 'node'` rewrites module resolution but does NOT polyfill the `Bun.*` global namespace, so
 * any surviving reference dies under Node with `ReferenceError: Bun is not defined`. Convert rejects
 * them rather than emitting a twin that cannot run.
 */
const BUN_GLOBAL_NODE_EQUIVALENTS: Record<string, string> = {
    argv: 'process.argv.slice(2)',
    env: 'process.env',
    file: 'node:fs (readFileSync / createReadStream)',
    write: 'node:fs (writeFileSync)',
    spawn: 'node:child_process (spawn)',
    spawnSync: 'node:child_process (spawnSync)',
    $: 'node:child_process (execFileSync)',
    sleep: 'node:timers/promises (setTimeout)',
    stdin: 'process.stdin',
    stdout: 'process.stdout',
    stderr: 'process.stderr',
};

/** One surviving `Bun.<prop>` reference in the bundled output. */
export interface BunGlobalUse {
    /** Property name, e.g. `argv`. */
    prop: string;
    /** 1-based line number in the BUNDLED text (not the source). */
    line: number;
    /** Trimmed bundled line, so the author can locate the symbol. */
    text: string;
}

const BUN_GLOBAL_RE = /\bBun\s*\.\s*([A-Za-z_$][\w$]*)/g;

/**
 * Scan bundled output for surviving `Bun.*` references. Textual scan over the bundled text; a string
 * literal containing `Bun.` is a false positive the author resolves by renaming it (cost of
 * stripping literals/comments first is real code for a case that has never occurred).
 * ponytail: textual scan — strip string literals before scanning if a false positive ever bites.
 */
export function findBunGlobals(bundled: string): BunGlobalUse[] {
    const uses: BunGlobalUse[] = [];
    for (const [i, line] of bundled.split('\n').entries()) {
        // matchAll clones the regex, so lastIndex reuse across lines is safe.
        const matches = [...line.matchAll(BUN_GLOBAL_RE)];
        for (const m of matches) {
            uses.push({ prop: m[1] ?? '', line: i + 1, text: line.trim() });
        }
    }
    return uses;
}

/** Outcome of converting one script to its portable twin. */
export interface ConvertedTwin {
    /** Absolute source `.ts` path. */
    src: string;
    /** Absolute output `.mjs` path. */
    out: string;
    /** Bytes written. */
    bytes: number;
}

/**
 * Bundle a plugin-script `.ts` into a portable ESM `.mjs` twin that runs under bare Node on any
 * install target (no Bun, no `type:module` package.json). This is the build step of the plugin-script
 * lifecycle (`script path` resolves, `script run` executes, `script convert` BUILDS the twin).
 *
 * Post-process, learned from exercising Bun's bundler:
 * - Bun preserves the source `#!/usr/bin/env bun` shebang as the output's first line → force it to
 *   `node` (replace, not prepend — a `#!` on line 2 is a SyntaxError under Node).
 * - Bun rewrites `if (import.meta.main) …` to an `__require.main == __require.module` /
 *   `require.main == module` guard that references Bun's `__require` shim (undefined under Node) and
 *   doesn't hold for the bundled entry anyway → `main()` never runs (or throws). The twin is only
 *   ever executed directly (never imported — callers import the `.ts`), so drop the whole
 *   `if (<main-guard>)` clause and run `main()` unconditionally. Matches both the braced
 *   (`if (g) { … }`) and one-line (`if (g) …;`) shapes.
 *
 * Writes only `outPath` + a temp dir it cleans up → unit-testable.
 */
export async function convertScriptToPortableTwin(srcPath: string, outPath: string): Promise<ConvertedTwin> {
    const tmpDir = mkdtempSync(join(tmpdir(), 'superskill-convert-'));
    try {
        const res = await Bun.build({ entrypoints: [srcPath], target: 'node', outdir: tmpDir, format: 'esm' });
        if (!res.success) {
            const logs = (res.logs ?? []).map(String).join('; ');
            throw new Error(`bun build failed for ${srcPath}${logs ? `: ${logs}` : ''}`);
        }
        const produced = join(tmpDir, basename(srcPath).replace(/\.[cm]?[tj]sx?$/, '.js'));
        let bundled = readFileSync(produced, 'utf-8');
        const lines = bundled.split('\n');
        if (lines[0]?.startsWith('#!')) lines[0] = NODE_SHEBANG;
        else lines.unshift(NODE_SHEBANG);
        bundled = lines.join('\n').replace(/if\s*\(\s*\S*main\s*={2,3}\s*\S*module\s*\)\s*/g, '');
        // Reject any surviving `Bun.*` reference BEFORE writing — the twin must run under bare Node,
        // so a bundle still calling Bun globals is a broken artifact, not a success. Scanning the
        // post-processed text (the exact bytes that would be written) and throwing before
        // `writeFileSync` is what makes "no .mjs left behind" true without cleanup code.
        const bunUses = findBunGlobals(bundled);
        if (bunUses.length > 0) {
            const seen = new Set<string>();
            const hints: string[] = [];
            for (const u of bunUses) {
                if (seen.has(u.prop)) continue;
                seen.add(u.prop);
                const equiv =
                    BUN_GLOBAL_NODE_EQUIVALENTS[u.prop] ?? 'no Node equivalent recorded — replace with a Node built-in';
                hints.push(`  Bun.${u.prop} (bundled line ${u.line}: ${u.text}) → ${equiv}`);
            }
            throw new Error(
                'Bun globals survive the bundle — the twin would die under Node with "ReferenceError: Bun is not defined".\n' +
                    `Not written: ${outPath}\n` +
                    hints.join('\n') +
                    `\nReplace them in ${srcPath}, then re-run script convert.`,
            );
        }
        writeFileSync(outPath, bundled);
        return { src: srcPath, out: outPath, bytes: bundled.length };
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
}

/**
 * Register `superskill script convert <plugin> <rel>` on the `script` group. `<rel>` is required:
 * which `.ts` are portable `script path` entrypoints is a policy decision (the file alone can't tell
 * you — e.g. `ah_guard.ts` carries a shebang but is the hook engine, invoked via `hook run`, not a
 * `script path` target), so the author names the file(s) explicitly.
 */
export function registerScriptConvert(program: Command, ci?: { exit(code: number): never }): void {
    const exitFn = ci?.exit ?? process.exit;
    const existing = program.commands.find((c) => c.name() === 'script');
    const group = existing ?? program.command('script').description('Plugin script utilities (run, path, convert)');

    group
        .command('convert <plugin> <rel>')
        .description(
            'Build a portable .mjs twin from a plugin script .ts (Node-runnable on any install target). ' +
                "Reusable across plugins — superskill's own `build:scripts` runs this command for its cc plugin.",
        )
        .option('--out <path>', 'output path (default: <src>.mjs beside the source)')
        .option('--dry-run', 'report what would be written; write nothing')
        .option('--json', 'machine-readable output')
        .action(async (plugin: string, rel: string, options: { out?: string; dryRun?: boolean; json?: boolean }) => {
            const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
            const src = join(projectRoot, 'plugins', plugin, 'scripts', rel);
            if (!existsSync(src)) {
                echoError(`Source not found: plugins/${plugin}/scripts/${rel}`);
                exitFn(1);
            }
            const out = options.out ?? src.replace(/\.[cm]?[tj]sx?$/, '.mjs');
            if (options.dryRun) {
                echo(`${src} → ${out} (dry-run)`);
                return;
            }
            try {
                const result = await convertScriptToPortableTwin(src, out);
                if (options.json) echo(JSON.stringify({ converted: [result] }));
                else echo(`✓ ${src} → ${out} (${result.bytes} bytes)`);
            } catch (err) {
                // Message to stderr, nothing to stdout (a machine consumer reads exit code + empty stdout).
                echoError((err as Error).message);
                exitFn(1);
            }
        });
}
