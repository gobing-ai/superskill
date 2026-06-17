/**
 * Post-build: prepend `#!/usr/bin/env bun` shebang to the bundled CLI entry.
 * Bun build outputs plain JS; a shebang makes the bin entry directly executable.
 *
 * Usage: bun scripts/postbuild.ts <outfile>
 */
const outfile = process.argv[2];
if (!outfile) {
    console.error('Usage: bun scripts/postbuild.ts <outfile>');
    process.exit(1);
}
const content = await Bun.file(outfile).text();
await Bun.write(outfile, `#!/usr/bin/env bun\n${content}`);
