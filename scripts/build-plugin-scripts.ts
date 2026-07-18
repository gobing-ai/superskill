#!/usr/bin/env bun
/**
 * In-repo build entry for portable plugin-script twins. A thin wrapper over the shared
 * {@link convertScriptToPortableTwin} — the SAME engine `superskill script convert` exposes to
 * every plugin author (so external plugins don't need this file; they run the CLI). This script lets
 * the superskill repo regenerate its own twins without a full CLI boot. Run via `bun run
 * build:scripts` (wired into `build`); re-run when a listed source or its engine deps change.
 */
import { join } from 'node:path';
import { convertScriptToPortableTwin } from '../apps/cli/src/commands/script-convert';

const root = join(import.meta.dir, '..');
// [plugin, rel-under-plugins/<plugin>/scripts/] — entrypoint .ts files that need a portable twin.
const sources: Array<[string, string]> = [['cc', 'anti-hallucination/validate_response.ts']];

for (const [plugin, rel] of sources) {
    const src = join(root, 'plugins', plugin, 'scripts', rel);
    const out = src.replace(/\.ts$/, '.mjs');
    await convertScriptToPortableTwin(src, out);
    console.log(`✓ ${src} → ${out}`);
}
