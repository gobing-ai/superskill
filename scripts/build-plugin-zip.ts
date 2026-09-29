import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

function readVersion(path: string): string {
    const { version } = JSON.parse(readFileSync(path, 'utf-8')) as { version?: unknown };
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error(`Invalid version in ${path}`);
    }
    return version;
}

export function buildPluginZip(root = ROOT): string {
    const version = readVersion(join(root, 'plugins', 'cc', 'plugin.json'));
    const cliVersion = readVersion(join(root, 'apps', 'cli', 'package.json'));
    if (version !== cliVersion) {
        throw new Error(`Plugin version ${version} differs from CLI version ${cliVersion}`);
    }

    const dist = join(root, 'dist');
    mkdirSync(dist, { recursive: true });
    const output = join(dist, `superskill-codex-plugin-${version}.zip`);
    rmSync(output, { force: true });

    const result = Bun.spawnSync(
        ['zip', '-q', '-X', '-r', output, 'cc/plugin.json', 'cc/assets', 'cc/skills', 'cc/README.md'],
        { cwd: join(root, 'plugins'), stdout: 'pipe', stderr: 'pipe' },
    );
    if (result.exitCode !== 0) {
        rmSync(output, { force: true });
        throw new Error(`Plugin ZIP build failed: ${new TextDecoder().decode(result.stderr).trim()}`);
    }
    return output;
}

if (import.meta.main) {
    console.log(buildPluginZip());
}
