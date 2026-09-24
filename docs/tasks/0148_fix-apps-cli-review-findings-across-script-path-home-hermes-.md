---
schema_version: 1
name: Fix apps CLI review findings across script-path home, hermes ownership, symlink hits, and skill counts
status: todo
template: issue
created_at: 2026-09-24T03:13:34.345Z
updated_at: "2026-09-24T03:15:48.603Z"
feature_id: H1

priority: P1
ac_numbering: task-local
ac_altitude: task-local
estimate_hours: 5
---

## 0148. Fix apps CLI review findings across script-path home, hermes ownership, symlink hits, and skill counts

### Background

This task came out of an advisory `/sp-dev-review apps --agent inline --focus all` run on 2026-09-23. Path mode, so the review wrote no verdict artifact and applied no fixes. `--fix` on that command is a deprecated no-op. Every anchor below was re-read on `main@09ad0cd` before this task was written. The reproductions were one `bun -e` process that imported `resolveScriptPath` and evaluated the ownership predicate. The app test suite was not re-run.

Scope is `apps/cli/src` plus the two docs that describe the global script root. Feature H1 owns `superskill script path` and install-time script staging. The Hermes receipt predicate and the verbose skill count live in `install.ts` and are part of this same review batch. They are task-local (`ac_altitude: task-local`). Do not add them to `docs/features/H1_portable-plugin-scripts-via-install-time-staging.md`.

| ID | Req | Severity | Area | One-line finding |
| --- | --- | --- | --- | --- |
| F1 | R1 | major | `apps/cli/src/commands/script-path.ts:91` | Global lookup uses `os.homedir()`. Install, update, and doctor use `resolveHomeDir()`, which prefers `HOME_DIR`. A script staged under `HOME_DIR` is invisible to `script path` |
| C1 | R1 | major | `apps/cli/src/commands/install.ts:2559` and `apps/cli/src/commands/update.ts:807` | Home resolution is copied, and `script path` never calls the copy. This is the same defect as F1 |
| F2 | R2 | major | `apps/cli/src/commands/install.ts:2383-2387` | Hermes ownership walks every segment of the absolute path, so an ancestor named `<plugin>-…` marks another plugin's skill as owned |
| F3 | R3 | minor | `apps/cli/src/commands/script-path.ts:111-115` | `statSync` follows links, so a symlink to a file outside `.agents/scripts` counts as a regular file |
| F4 | R4 | minor | `apps/cli/src/commands/install.ts:2564-2568` | `countSkillsInDir` calls `statSync` with no catch. A dangling symlink throws, and `--verbose` can fail an install that already wrote |

Out of scope. Do not change them:

- OMP stage-B cache selection stays lexicographic, not semver. `docs/03_ARCHITECTURE.md` and `apps/cli/tests/commands/install-omp-helpers.test.ts:213-221` both lock `2.9.7` over `2.10.0`.
- `apps/cli/src/commands/doctor.ts:4` already imports `resolveHomeDir` from `./install`. Leave that import.
- `pluginPrefixedEntries` (`apps/cli/src/commands/install.ts:2438`) only reads names inside one directory. It is not the ancestor bug. Do not change it.
- `copyDirectory` (`apps/cli/src/commands/install.ts:2341`) already skips symlinks via `lstatSync`. Do not change it.
- No new file, no new dependency, no ADR. `resolveHomeDir` stays in `apps/cli/src/commands/install.ts`.

Delegation notes:

- The defaults in `### Q&A` are binding. Do not reopen them during implementation.
- Implement in the phase order in `### Plan`. One atomic conventional commit per phase, on a feature branch, never on `main`.
- F1 and C1 are one fix. Do not leave a third home helper behind in `update.ts`.
- Re-read every `file:line` at the start of each phase. Earlier phases move lines in `install.ts`.
- Before editing, read `.spur/context/pitfalls.md` and `.spur/context/buglog.md`.

### Requirements

- [ ] R1. (F1 and C1, major) `resolveScriptPath` (`apps/cli/src/commands/script-path.ts:88-123`) must use the same home as install. Today line 91 is `const home = opts.home ?? homedir()`. `resolveHomeDir` (`apps/cli/src/commands/install.ts:2559-2560`) is `getEnvVar('HOME_DIR') ?? homedir()`. Global install stages scripts at `join(outputRoot, '.agents', 'scripts', pluginName)` (`apps/cli/src/commands/install.ts:1887`), and global `outputRoot` is `resolveHomeDir()` (`apps/cli/src/commands/install.ts:629`). Replace the script-path default with `opts.home ?? resolveHomeDir()`, imported from `./install`. When `opts.home` is passed, ignore `HOME_DIR`. Delete the private `resolveHomeDir` at `apps/cli/src/commands/update.ts:807-808` and the now-unused `homedir` import in that file, and add `resolveHomeDir` to the existing `./install` import (`apps/cli/src/commands/update.ts:39-47`). `apps/cli/src/commands/doctor.ts:4` already imports it. Do not add a new module. Do not read `process.env` in `script-path.ts`. Reproduced on `09ad0cd`: with `HOME_DIR` set to a directory that contains `.agents/scripts/cc/only-home-dir.mjs`, `resolveScriptPath({ plugin: 'cc', rel: 'only-home-dir.mjs', forceGlobal: true })` returned `null`. The same relative file was found when `home` was passed explicitly.
- [ ] R2. (F2, major) `isPluginOwnedPath` (`apps/cli/src/commands/install.ts:2383-2387`) must judge the name under the Hermes skills directory, not every ancestor of the absolute path. Today `parts.some((part) => part === plugin || part.startsWith(plugin + '-'))` is true for a parent directory such as `cc-work` when the plugin is `cc`. The only caller is the Hermes copy filter at `apps/cli/src/commands/install.ts:990-992`, whose `dest` is `join(outputRoot, '.hermes', 'skills')` (`apps/cli/src/commands/install.ts:983`). Change the signature to `isPluginOwnedPath(absPath: string, plugin: string, skillsRoot: string): boolean`. Compute `relative(skillsRoot, absPath)`. If that relative path is empty, starts with `..`, or is absolute, return false. Otherwise take the first segment after splitting on `/` or `\`. Return true only when that segment equals `plugin` or starts with `plugin + '-'`. Export the function and put the TSDoc immediately above the export so `every-export-has-tsdoc` stays green. The existing Hermes receipt expectations in `apps/cli/tests/commands/install-manifest.test.ts:311-337` must still hold: `demo-a/SKILL.md` and `demo-notes.md` are recorded, and `demo-link.md` is not. Reproduced predicate: the absolute path whose segments are `tmp`, `cc-work`, `.hermes`, `skills`, `other-plugin`, `SKILL.md` is owned by plugin `cc` today, and the same tail under `tmp/work` is not.
- [ ] R3. (F3, minor) `resolveScriptPath` must not treat a symlink as a regular file. The comment at `apps/cli/src/commands/script-path.ts:111-112` says only a regular file counts. The check at `:114` is `statSync`, which follows links. Use `lstatSync`. If the candidate is a symbolic link, skip it and try the next root. If it is a directory, skip it (the existing test at `apps/cli/tests/commands/script-path.test.ts:136` stays a miss). If it is a regular file, return it. Do not `realpath` the link and accept the target. A project symlink and a global regular file for the same `rel`: the project candidate is skipped and the global regular file is returned. Two symlinks and no regular file: return `null` (CLI exit 2). Reproduced: a project file `linked.mjs` that is a symlink to a file outside `.agents/scripts` was returned as a hit.
- [ ] R4. (F4, minor) `countSkillsInDir` (`apps/cli/src/commands/install.ts:2564-2571`) must not throw, and must not follow symlinks. It is called from the verbose install summary at `apps/cli/src/commands/install.ts:916` after rulesync has written. Replace `statSync` with `lstatSync` inside a per-entry `try/catch` that `continue`s. `lstatSync` reports a symlink as not a directory, so a symlink to a skill directory is not counted and a dangling symlink does not throw. A real directory whose child is `SKILL.md` is still counted. Export the function with the TSDoc immediately above the export. Do not change `copyDirectory`.
- [ ] R5. (docs and gates) In the same commit as R1, state the global root in both surface docs. In `docs/04_DESIGN.md` next to the `script path` row at `:245`, say the global root is `resolveHomeDir()` (`HOME_DIR` when set, otherwise the OS home), the same home `superskill install` uses, and that only a non-symlink regular file counts. In `docs/help/how_to_organize_scripts_for_plugin_development.md:51-56`, replace the global-root bullet and the `script-path.ts:80-120` citation with the post-edit line range of `resolveScriptPath`, and say the same `HOME_DIR` rule. Do not rewrite the rest of that guide. All gates must pass on the final tree: `bun run lint`, `bun run test` (coverage at least 90% lines and functions), `bun run build`, and `bun run spur-check`. No test is skipped, `.skip`'d, or weakened. `git status` shows only files named in `### Plan`.

### Acceptance Criteria

- [ ] AC1 — `HOME_DIR` is the global root when `home` is omitted (req: R1). In `apps/cli/tests/commands/script-path.test.ts`, set `HOME_DIR` with `setEnvVar` from `@gobing-ai/superskill-core` to a temp directory that contains `.agents/scripts/cc/only-home-dir.mjs`, and do not pass `home`. `resolveScriptPath({ plugin: 'cc', rel: 'only-home-dir.mjs', projectRoot: <empty project>, forceGlobal: true })` returns that file with `source: 'global'`. `afterEach` restores the previous `HOME_DIR`, including removing it when it was unset. The test fails on `09ad0cd` because line 91 calls `homedir()`.
- [ ] AC2 — An explicit `home` beats `HOME_DIR` (req: R1). Residual-proof: set `HOME_DIR` to directory A, which contains `.agents/scripts/cc/from-env.mjs`, and pass `home: B`, which contains `.agents/scripts/cc/from-opt.mjs`. `resolveScriptPath` for `from-opt.mjs` with `forceGlobal: true` returns B's file. `resolveScriptPath` for `from-env.mjs` with the same `home: B` returns `null`. Both halves are present: the env var is set, and the option is set to a different directory.
- [ ] AC3 — Existing script-path cases stay (req: R1, R3). The tests at `apps/cli/tests/commands/script-path.test.ts:35` (project wins), `:44` (global when project is absent), `:82` (`forceGlobal`), `:96` (`forceProject`), `:108` through `:129` (unsafe `rel` and plugin), and `:136` (a directory is a miss) pass without changing their expectations.
- [ ] AC4 — An ancestor named `<plugin>-…` does not own a foreign skill (req: R2). A direct call, skills root `/tmp/cc-work/.hermes/skills` is not required to exist: `isPluginOwnedPath('/tmp/cc-work/.hermes/skills/other-plugin/SKILL.md', 'cc', '/tmp/cc-work/.hermes/skills')` is `false`. The same function with skills root `/tmp/work/.hermes/skills` and path `/tmp/work/.hermes/skills/other-plugin/SKILL.md` is `false`. A path that escapes the skills root (`/tmp/cc-work/.hermes/skills/../outside/cc-foo.md` with that skills root) is `false`.
- [ ] AC5 — Names under the skills root still count (req: R2). With skills root `/tmp/work/.hermes/skills`, these are `true` for plugin `demo`: `.../skills/demo-a/SKILL.md`, `.../skills/demo-notes.md`, and `.../skills/demo/SKILL.md`. `.../skills/other-plugin/demo-notes.md` is `false` because the first segment is `other-plugin`, not the file basename. The Hermes manifest test at `apps/cli/tests/commands/install-manifest.test.ts:311-337` passes unchanged.
- [ ] AC6 — A symlink is not a script hit (req: R3). In `apps/cli/tests/commands/script-path.test.ts`, a project candidate `linked.mjs` that is a symlink to a regular file outside `.agents/scripts` makes `resolveScriptPath` with `forceProject: true` return `null`. The same `rel` with a regular file at the global root and `forceProject` unset returns the global file with `source: 'global'`. The directory case at `:136` still returns `null`.
- [ ] AC7 — Skill counting survives symlinks (req: R4). `countSkillsInDir` on a temp directory that contains one real subdirectory with `SKILL.md`, one symlink to that subdirectory, and one dangling symlink returns `1` and does not throw. An empty directory returns `0`. A missing directory returns `0`.
- [ ] AC8 — Update uses the install helper (req: R1). `rg -n "function resolveHomeDir" apps/cli/src` returns exactly one hit, `apps/cli/src/commands/install.ts`. `apps/cli/src/commands/update.ts` imports `resolveHomeDir` from `./install` and does not import `homedir`. `apps/cli/src/commands/doctor.ts:4` is unchanged.
- [ ] AC9 — The surface docs name the same home (req: R5). `docs/04_DESIGN.md` at the `script path` row states `HOME_DIR` and that a symlink is not a hit. `docs/help/how_to_organize_scripts_for_plugin_development.md` global-root bullet states the same rule and cites the post-edit `resolveScriptPath` range, not `script-path.ts:80-120`.
- [ ] AC10 — The gates pass (req: R5). `bun run lint`, `bun run test`, `bun run build`, and `bun run spur-check` each exit 0. Coverage stays at or above 90% lines and 90% functions. The focused loop during implementation is `bun test apps/cli/tests/commands/script-path.test.ts apps/cli/tests/commands/install-manifest.test.ts apps/cli/tests/commands/update.test.ts apps/cli/tests/commands/doctor.test.ts`, then the full gates once at the end.

### Q&A

These defaults are binding for implementation. The operator may override them before the task moves to `wip`.

**Q1. F1: should `script path` keep using `os.homedir()` because `HOME_DIR` is only a test seam?**
A: No. `apps/cli/src/commands/install.ts:2551-2560` documents `HOME_DIR` as the home rulesync uses. Global install stages scripts under that home (`apps/cli/src/commands/install.ts:629` and `:1887`). `update.ts` and `doctor.ts` already follow it. `script path` is the remaining reader. When `HOME_DIR` is unset, `resolveHomeDir()` is `homedir()`, so users who do not set it see no change.

**Q2. F1: why not a new `home.ts` module?**
A: One exported function already exists. `apps/cli/src/commands/doctor.ts:4` imports it from `./install`. `update.ts` already imports from `./install`. `script-path.ts` does not create a cycle: `install.ts` does not import `script-path.ts`. A new file would be a fourth place to update.

**Q3. F1: what wins when both `opts.home` and `HOME_DIR` are set?**
A: `opts.home`. The existing tests pass `home` and must not start reading the environment. AC2 locks that.

**Q4. F2: why not keep scanning the absolute path and only ignore the temp-dir prefix?**
A: The temp directory is not special. Any ancestor named `<plugin>-something` has the same bug, including a checkout at `~/cc-work` while installing plugin `cc`. The skills root is known at the only call site. Segments above it are not names of installed skills.

**Q5. F2: should a nested file named `demo-notes.md` inside `other-plugin/` still count?**
A: No. Only the first segment under the skills root counts. That is the skill directory, or a file sitting directly in the skills root (`demo-notes.md` in the Hermes receipt test). A basename match deeper in another skill would record that skill as this plugin's.

**Q6. F3: should a symlink to a regular file be realpathed and accepted when the target is still under `.agents/scripts`?**
A: No. The candidate itself must be a regular file. `copyDirectory` already refuses to stage symlinks. Accepting one at lookup time reopens the path the lexical `..` check closed. Skip the symlink and try the next root.

**Q7. F4: should a symlink to a directory that contains `SKILL.md` be counted?**
A: No. Count real directories only. The link is not a second skill, and following it is what makes `statSync` throw on a dangling link. A real directory listed beside the link is counted once.

**Q8. Is an ADR required?**
A: No. `HOME_DIR` is already the install home. This task makes `script path` and `update` call that function, and it narrows two filesystem checks. Nothing in `docs/00_ADR.md` is superseded. Do not edit `docs/03_ARCHITECTURE.md`. The OMP lexicographic rule there stays.

**Q9. Should these scenarios be added to feature H1?**
A: No. H1's ship scenarios stay the ones already in `docs/features/H1_portable-plugin-scripts-via-install-time-staging.md`. This task is `ac_altitude: task-local`. Hermes ownership and the skill count are install behavior included because they were in the same apps review. They are not new H1 ship criteria.

### Design

**Scope guard.** Production edits stay inside `apps/cli/src/commands/script-path.ts`, `apps/cli/src/commands/install.ts`, and `apps/cli/src/commands/update.ts`, plus the two doc sentences in R5. Tests stay inside `apps/cli/tests/commands/script-path.test.ts`, `apps/cli/tests/commands/install-manifest.test.ts` (unchanged expectations, plus direct predicate calls if that file already imports install helpers; otherwise put the predicate and count tests in `apps/cli/tests/commands/install.test.ts`), and no new test file unless those two cannot import the new exports. `apps/cli/src/commands/doctor.ts` is not edited. If a cycle appears or `packages/core` must change, stop and report.

#### D1 — F1 and C1, one home (R1)

In `resolveScriptPath`, delete the `homedir` import if it becomes unused.

```typescript
import { resolveHomeDir } from './install';

const home = opts.home ?? resolveHomeDir();
```

`runScriptPathAction` keeps passing `overrides?.home` and does not grow a second default. The CLI action in `registerScriptPath` does not pass `home`, so production uses the default above.

In `apps/cli/src/commands/update.ts`, add `resolveHomeDir` to the import from `./install` and delete the local function at `:807-808`. Remove `homedir` from the `node:os` import if nothing else in the file uses it. The four call sites at `:153`, `:154`, and `:532` stay calls, now bound to the import.

Rejected: reading `HOME_DIR` inside `script-path.ts` with `getEnvVar`. That is a third copy of the fallback.

#### D2 — F2, skills-root ownership (R2)

```typescript
/**
 * True when the first path segment of `absPath` under `skillsRoot` is `plugin`
 * or starts with `plugin-`. Ancestors of `skillsRoot` do not count. A path that
 * escapes `skillsRoot` is not owned.
 */
export function isPluginOwnedPath(absPath: string, plugin: string, skillsRoot: string): boolean {
    const rel = relative(skillsRoot, absPath);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false;
    const name = rel.split(/[/\\]/).filter((segment) => segment.length > 0)[0] ?? '';
    return name === plugin || name.startsWith(`${plugin}-`);
}
```

The TSDoc block sits in the source immediately above the export, with no blank line and no `//` comment between them. At `apps/cli/src/commands/install.ts:990-992`, pass `dest` as `skillsRoot`. `relative`, `isAbsolute` are already imported at `install.ts:16`.

Rejected: filtering with `basename` only. That would drop `demo-a/SKILL.md`, whose basename is `SKILL.md`, and the Hermes test requires that file.

#### D3 — F3, symlink miss (R3)

```typescript
let st: ReturnType<typeof lstatSync>;
try {
    st = lstatSync(candidate.path);
} catch {
    continue;
}
if (st.isSymbolicLink() || !st.isFile()) continue;
return candidate;
```

Import `lstatSync`. Drop `statSync` if it becomes unused. Do not add `realpathSync`.

#### D4 — F4, skill count (R4)

```typescript
/**
 * Count real child directories of `skillsDir` that contain `SKILL.md`.
 * Symlinks are skipped. A stat failure on one entry is skipped. A missing
 * `skillsDir` returns 0.
 */
export function countSkillsInDir(skillsDir: string): number {
    if (!existsSync(skillsDir)) return 0;
    let count = 0;
    for (const entry of readdirSync(skillsDir)) {
        const entryPath = join(skillsDir, entry);
        try {
            const st = lstatSync(entryPath);
            if (!st.isDirectory()) continue;
        } catch {
            continue;
        }
        if (existsSync(join(entryPath, 'SKILL.md'))) count++;
    }
    return count;
}
```

`lstatSync().isDirectory()` is false for a symlink, including a symlink to a directory. The verbose call at `:916` stays `countSkillsInDir(skillsDir)`.

#### D5 — docs (R5)

One sentence on the `script path` row in `docs/04_DESIGN.md:245`, and a replacement of the global-root bullet in `docs/help/how_to_organize_scripts_for_plugin_development.md:54`. After the code edit, re-read `resolveScriptPath` and put that line range in the help citation. Do not leave `:80-120`.

### Plan

Each phase is one atomic conventional commit on a feature branch (never on `main`). Write the failing test first, then the fix. After each phase, run `bun test apps/cli/tests/commands/script-path.test.ts apps/cli/tests/commands/install-manifest.test.ts apps/cli/tests/commands/update.test.ts apps/cli/tests/commands/doctor.test.ts` and `bun run lint`. Before starting, read `.spur/context/pitfalls.md` and `.spur/context/buglog.md`. Re-read every `file:line` in this task at the start of each phase. The anchors were taken at `09ad0cd`.

- [ ] P0. Setup: `git switch -c fix/0148-apps-cli-review-findings`, then `spur task update 0148 wip`. Confirm `resolveHomeDir` is still `apps/cli/src/commands/install.ts:2559` and that `apps/cli/src/commands/install.ts` does not import `script-path.ts`.
- [ ] P1. R1, D1. Tests AC1–AC3 first in `apps/cli/tests/commands/script-path.test.ts`. Then the `script-path.ts` default and the `update.ts` import swap (AC8). Commit `fix(cli): resolve script path and update home through resolveHomeDir`.
- [ ] P2. R2, D2. Tests AC4 and AC5 first, calling the exported predicate. Then the signature change and the Hermes call site. Run the existing Hermes receipt test at `apps/cli/tests/commands/install-manifest.test.ts:311`. Commit `fix(cli): judge hermes ownership under the skills root`.
- [ ] P3. R3 and R4, D3 and D4. Tests AC6 and AC7 first. Then `lstatSync` in `resolveScriptPath` and `countSkillsInDir`. Commit `fix(cli): skip symlinks in script path lookup and skill counts`.
- [ ] P4. R5, D5. Update `docs/04_DESIGN.md:245` and `docs/help/how_to_organize_scripts_for_plugin_development.md:51-56` in the same commit, with the post-edit line range. Commit `docs(cli): document script path home and regular-file rule`.
- [ ] P5. Full gates (AC10): `bun run lint && bun run test && bun run build && bun run spur-check`, then `git status`. If coverage drops below 90%, add behavior tests. Never lower the threshold.
- [ ] P6. Bookkeeping:
  - Append F1 and F2 to `.spur/context/buglog.md` with date, file, root cause, fix, and tags `cli`, `script-path`, `install`, `home`.
  - Append one `.spur/context/pitfalls.md` line: do not call `os.homedir()` for a superskill global root, and do not treat an ancestor path segment as a plugin-owned name.
  - No new source file, so `.spur/context/anatomy.md` does not gain a file row. Append a row to `.spur/context/memory.md`.
  - Replace `### Solution` with the per-phase change map. Leave `### Testing` and `### Review` for `/sp-dev-verify 0148` and `/sp-dev-review 0148`.

Stop and ask the operator if any of these happens:

- Importing `resolveHomeDir` from `./install` into `script-path.ts` creates a cycle.
- AC5's first-segment rule makes `apps/cli/tests/commands/install-manifest.test.ts:311-337` fail.
- `apps/cli/src/commands/update.ts` still needs `homedir` for a call that is not `resolveHomeDir`.
- A Q&A default is infeasible.

### Root Cause

- **F1 (R1).** `resolveScriptPath` (`apps/cli/src/commands/script-path.ts:91`) defaults `home` to `homedir()` from `node:os`. That function honors `HOME`, not `HOME_DIR`. `resolveHomeDir` (`apps/cli/src/commands/install.ts:2559-2560`) was added so install and rulesync inspect the same directory. Global install then stages scripts under that directory (`apps/cli/src/commands/install.ts:629` and `:1887`). `script path` was not switched when the helper landed, so a `HOME_DIR` sandbox receives the files and the lookup looks at the OS home. Reproduced: `forceGlobal: true` and no `home` option returned `null` for a file that existed only under `HOME_DIR`.
- **C1 (R1).** The helper was copied instead of shared. `apps/cli/src/commands/update.ts:807-808` repeats the one-liner even though that file already imports from `./install` (`apps/cli/src/commands/update.ts:39-47`). `apps/cli/src/commands/doctor.ts:4` imports the install export. `script-path.ts` calls neither. Two copies stayed in sync with each other and the third caller drifted.
- **F2 (R2).** `isPluginOwnedPath` (`apps/cli/src/commands/install.ts:2383-2387`) splits the absolute path and accepts the file when any segment equals `plugin` or starts with `plugin-`. The Hermes filter (`apps/cli/src/commands/install.ts:990-992`) was meant to drop skills that do not belong to this plugin. A parent directory named `cc-work` satisfies `startsWith('cc-')` for plugin `cc`, so `other-plugin/SKILL.md` is recorded. The manifest tests create workspaces with `mkdtempSync` under a `superskill-install-manifest-` prefix (`apps/cli/tests/commands/install-manifest.test.ts:36`), and the plugin in that test is `demo`, so the ancestor does not start with `demo-` and the bug stays hidden.
- **F3 (R3).** `apps/cli/src/commands/script-path.ts:114` uses `statSync`. `stat` follows a symlink, and `isFile()` is then true for a link to a file. The comment on `:111-112` says only a regular file counts. `lstat` would report the symlink and the function would skip it. The lexical `..` rejection in `isUnsafeRel` (`apps/cli/src/commands/script-path.ts:47-53`) does not see a link. Reproduced: `linked.mjs` pointing at a file outside `.agents/scripts` was returned as a hit.
- **F4 (R4).** `countSkillsInDir` (`apps/cli/src/commands/install.ts:2568`) calls `statSync` on every `readdir` entry and does not catch. A dangling symlink throws `ENOENT`. The verbose summary at `apps/cli/src/commands/install.ts:916` runs after rulesync has written, so the throw fails the command on an install that already landed files. `stat` also follows a symlink to a directory and would count the target. `copyDirectory` in the same file already uses `lstatSync` and skips links (`apps/cli/src/commands/install.ts:2355`).

### Solution

Pre-implementation map. The implementer replaces the "pending" clause of each bullet at the end of P6 with the post-edit line. Do not claim a gate passed unless that command's output is in `### Testing`. The citations below are the `09ad0cd` sites the change map starts from.

- P1 pending. Start at `apps/cli/src/commands/script-path.ts:91` and `apps/cli/src/commands/update.ts:807`. Import `resolveHomeDir` from `apps/cli/src/commands/install.ts:2559`. Tests in `apps/cli/tests/commands/script-path.test.ts`. AC1–AC3 and AC8. No deviation yet. `apps/cli/src/commands/script-path.ts` must not import `homedir` when the default is `resolveHomeDir`.
- P2 pending. Start at `apps/cli/src/commands/install.ts:2383` and the call at `apps/cli/src/commands/install.ts:990`. AC4 and AC5. The Hermes test `apps/cli/tests/commands/install-manifest.test.ts:311` stays green. No deviation yet.
- P3 pending. Start at `apps/cli/src/commands/script-path.ts:114` and `apps/cli/src/commands/install.ts:2564`. AC6 and AC7. No deviation yet.
- P4 pending. Start at `docs/04_DESIGN.md:245` and `docs/help/how_to_organize_scripts_for_plugin_development.md:51`. AC9. The help citation is the post-edit range of `resolveScriptPath`, not `apps/cli/src/commands/script-path.ts:80`. No deviation yet.
- P5 pending. Gates named in `### Plan`. AC10. No files beyond this list.

The implementer keeps this bullet shape and replaces "pending" with the commit subject and the new line numbers.

### Testing

Not run yet. `/sp-dev-verify 0148` replaces this section from a fresh run. The evidence bar, anchored at `apps/cli/tests/commands/script-path.test.ts:35` and `apps/cli/tests/commands/install-manifest.test.ts:311`, is:

- For each of AC1–AC9, the test name or the `rg` command, with a pass count or the `rg` output. A description of the code is not evidence.
- AC8 is `rg -n "function resolveHomeDir" apps/cli/src` showing one hit at `apps/cli/src/commands/install.ts`.
- AC10 is the four full commands from `### Plan` P5, each with its exit code, pasted from the run that just finished. A green unit file does not stand in for `bun run spur-check`.
- Coverage line: the `bun run test` summary's line and function percentages, both at or above 90. If the report has no percentage, say so and paste the command output. Do not invent a number.

Pre-existing failures, if any, get their own line with the command and the first error. They are not marked fixed by this task.

### Review

Not reviewed post-implementation. `/sp-dev-review 0148` replaces this section. The input review's open rows, anchored at `apps/cli/src/commands/script-path.ts:91`, are:

When this section is written it must contain a findings table with columns Priority, Dimension, Location, Finding, and Disposition. Disposition is `fixed in <commit>` or `still open`. One row per id below. A closed row cites the test name from `### Testing`.

- F1 `HOME_DIR` invisible to `script path`. Correctness. `apps/cli/src/commands/script-path.ts` `resolveScriptPath`.
- C1 duplicated home helper. Architecture. `apps/cli/src/commands/update.ts` no longer defines `resolveHomeDir`. The disposition says `apps/cli/src/commands/install.ts` is the only definition.
- F2 Hermes ownership uses ancestors. Correctness. `apps/cli/src/commands/install.ts` `isPluginOwnedPath`.
- F3 symlink counted as a regular file. Correctness. `apps/cli/src/commands/script-path.ts` uses `lstatSync`.
- F4 verbose skill count throws on a dangling symlink. Correctness. `apps/cli/src/commands/install.ts` `countSkillsInDir`.

If the post-implementation review finds a new issue, add a row. Do not delete an F-row or the C1 row. `blocker` or `major` left `still open` means this task is not ready for `done`.

### References

- Origin: advisory `/sp-dev-review apps --agent inline --focus all` on 2026-09-23. Path mode. `--fix` was a no-op. No verdict file was written. Anchors re-read on `main@09ad0cd` while authoring this task.
- Reproductions from that review, to be replaced by AC1–AC7:
  - `resolveScriptPath` with `forceGlobal: true`, no `home`, and `HOME_DIR` pointing at a tree that held `.agents/scripts/cc/only-home-dir.mjs` returned `null`.
  - The same resolver returned a project path ending in `linked.mjs` when that name was a symlink to a file outside `.agents/scripts`.
  - The ownership predicate returned true for an absolute path with segments `tmp`, `cc-work`, `.hermes`, `skills`, `other-plugin`, `SKILL.md` and plugin `cc`, and false for the same tail under `tmp/work`.
- Source anchors at `09ad0cd`:
  - `apps/cli/src/commands/script-path.ts:1` (`statSync` import), `:47-53` (`isUnsafeRel`), `:88-123` (`resolveScriptPath`), `:111-115` (regular-file check)
  - `apps/cli/src/commands/install.ts:16` (`relative`, `isAbsolute`), `:629` (global `outputRoot`), `:916` (verbose count call), `:983` (Hermes dest), `:990-992` (ownership filter), `:1887` (script staging dest), `:2341-2355` (`copyDirectory` skips symlinks), `:2383-2387` (`isPluginOwnedPath`), `:2438` (`pluginPrefixedEntries`, do not edit), `:2551-2571` (`resolveHomeDir`, `countSkillsInDir`)
  - `apps/cli/src/commands/update.ts:39-47` (existing `./install` import), `:153-154` and `:532` (`resolveHomeDir` call sites), `:807-808` (local copy to delete)
  - `apps/cli/src/commands/doctor.ts:4` (already correct; do not edit)
  - `apps/cli/tests/commands/script-path.test.ts:14-33` (tree setup), `:35`, `:44`, `:82`, `:96`, `:108-136`
  - `apps/cli/tests/commands/install-manifest.test.ts:35-39` (temp dir prefix), `:311-337` (Hermes receipt)
  - `apps/cli/tests/commands/install-omp-helpers.test.ts:213-221` (lexicographic stage B, out of scope)
  - `docs/04_DESIGN.md:245`
  - `docs/help/how_to_organize_scripts_for_plugin_development.md:51-56`
  - `docs/03_ARCHITECTURE.md` OMP receipt paragraph (lexicographic stage B, do not edit)
  - `docs/features/H1_portable-plugin-scripts-via-install-time-staging.md` (ship scenarios, not extended by this task)
- Conventions: `AGENTS.md` testing section (a residual-proof negative carries both halves and is labeled). AC2 is that negative for the home option. `docs/99_PROJECT_CONSTITUTION.md` same-commit doc sync: R5 updates `docs/04_DESIGN.md` because `script path`'s global root changes. No ADR.
- Sibling tasks: `0146` is the packages/core review batch. `0147` is the `plugins/cc` review batch. Neither overlaps these files. Do not edit them.

### History
