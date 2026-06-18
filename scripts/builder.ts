#!/usr/bin/env bun

/**
 * Build/release helper for the superskill CLI.
 *
 * Usage:
 *   bun scripts/builder.ts bump-ver <version>            bump, commit, tag locally
 *   bun scripts/builder.ts bump-ver <version> --push     bump + push commit + tag
 *   bun scripts/builder.ts drop-tags <version>           delete local tag for version
 *   bun scripts/builder.ts drop-tags <version> --remote  delete local + remote tag
 *   bun scripts/builder.ts postbuild <outfile>           prepend bun shebang to a bundle
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { $ } from 'bun';

const ROOT = resolve(import.meta.dirname, '..');
const PKG_PATH = resolve(ROOT, 'apps/cli/package.json');
const PKG_NAME = '@gobing-ai/superskill';

const [command, ...args] = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const shouldPush = args.includes('--push');
const isRemote = args.includes('--remote');

function fail(msg: string): never {
    console.error(msg);
    process.exit(1);
}

async function bumpVersion(ver: string) {
    if (!/^\d+\.\d+\.\d+(-.+)?$/.test(ver)) {
        fail(`Invalid version: ${ver}. Use semver (e.g. 0.1.0, 0.2.0-beta.1).`);
    }

    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));
    const oldVer = pkg.version;

    pkg.version = ver;
    // 4-space indent to match biome.json (indentWidth 4); 2 spaces fails `bun run lint`.
    writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 4)}\n`);

    const tag = `${PKG_NAME}-v${ver}`;

    console.log(`Bumped ${PKG_NAME}: ${oldVer} → ${ver}`);
    await $`git add ${PKG_PATH}`;
    await $`git commit -m ${`chore: release ${PKG_NAME} v${ver}`}`;
    await $`git tag -a ${tag} -m ${`${PKG_NAME} v${ver}`}`;

    console.log(`\nTag: ${tag}`);

    if (shouldPush) {
        console.log('Pushing commit and tag…');
        await $`git push origin main`;
        await $`git push origin ${tag}`;
        console.log('Pushed main and tag. Publish workflow will trigger on the tag push.');
        return;
    }

    console.log('Publish workflow will trigger on tag push. To push now:');
    console.log(`  git push origin main && git push origin ${tag}`);
}

async function dropTags(ver: string) {
    const tag = `${PKG_NAME}-v${ver}`;
    console.log(`Dropping local tag: ${tag}`);
    await $`git tag -d ${tag}`.nothrow();

    if (isRemote) {
        console.log(`Dropping remote tag: ${tag}`);
        await $`git push origin :refs/tags/${tag}`.nothrow();
    }
}

/**
 * Ensure a bundle starts with a `#!/usr/bin/env bun` shebang so the bin entry
 * is directly executable. Idempotent: `bun build --target bun` already emits
 * the shebang, so only prepend when missing (otherwise a duplicate shebang on
 * line 2 causes a syntax error at runtime).
 */
async function postbuild(outfile: string) {
    const content = await Bun.file(outfile).text();
    if (content.startsWith('#!/usr/bin/env bun\n')) return;
    await Bun.write(outfile, `#!/usr/bin/env bun\n${content}`);
}

try {
    switch (command) {
        case 'bump-ver':
        case 'bump-version': {
            if (!version) fail('Usage: bun scripts/builder.ts bump-ver <version> [--push]');
            await bumpVersion(version);
            break;
        }
        case 'drop-tags': {
            if (!version) fail('Usage: bun scripts/builder.ts drop-tags <version> [--remote]');
            await dropTags(version);
            break;
        }
        case 'postbuild': {
            const outfile = args[0];
            if (!outfile) fail('Usage: bun scripts/builder.ts postbuild <outfile>');
            await postbuild(outfile);
            break;
        }
        default:
            fail(`Unknown command: ${command}\nUsage: bun scripts/builder.ts <bump-ver|drop-tags|postbuild> [args]`);
    }
} catch (err) {
    fail(err instanceof Error ? err.message : String(err));
}
