import pkg from '../package.json' with { type: 'json' };

/** Compiled-in CLI version. Bun embeds the JSON into the compiled binary's virtual FS,
 * so this resolves identically under `bun run src/index.ts`, the JS bundle, and the
 * `--compile` binary. This is the single source of truth — cli.ts, install.ts, and
 * hook-run.ts all import it. */
export const cliVersion: string = pkg.version;
