---
schema_version: 1
name: Stamp staged plugin scripts with version and per-file hashes
status: backlog
template: standard
created_at: 2026-09-26T17:13:28.242Z
updated_at: "2026-09-26T17:13:28.917Z"

---

## 0149. Stamp staged plugin scripts with version and per-file hashes

### Background

`superskill install <plugin>` stages plugin scripts into `.agents/scripts/<plugin>/`, either global (`~/.agents/scripts/`) or project-level with `--no-global`. The staging is done by `stagePluginScripts` (`apps/cli/src/commands/install.ts:1906`), which `rmSync`s the dest and runs `copyDirectory`. It writes **no stamp**. The staged dir records neither the plugin's version nor the source it came from. `superskill script path <plugin> <rel> --json` (`apps/cli/src/commands/script-path.ts`) returns only `{plugin, rel, path, source: project|global}`.

The per-target install provenance manifest (`InstallManifestV1`, `install.ts:~2566`: `upstreamVersion`, `marketplaceLocator`, `resolvedRef`, `superskillVersion`, `installedAt`) already exists, but it is written per target and does not cover the shared scripts root.

Consumer impact (spur-new task 0960, 2026-09-26): spur now resolves pipeline scripts only through `superskill script path sp …` and records a run-scoped `.spur/run/<runId>-script-root.json`. With no version on disk, spur can only record a self-computed digest of the script set. It cannot say "plugin sp 0.3.92 from gobing-ai/spur@<ref>". Diagnosing a stale or mixed install, as in knowledge-kit where 23 scripts had drifted, then needs manual diffing.

### Requirements

- [ ] R1. `stagePluginScripts` writes `.agents/scripts/<plugin>/.superskill-stamp.json` after copying: `{ schemaVersion: 1, plugin, upstreamVersion, marketplaceLocator?, resolvedRef?, superskillVersion, installedAt, files: { <relPath>: <sha256> } }`. The values come from the same resolution the install provenance manifest uses. The stamp is not written on `--dry-run`.
- [ ] R2. `superskill script path <plugin> <rel> --json` adds `stamp: { upstreamVersion, resolvedRef?, installedAt } | null`, read from the resolved root's stamp. A missing or unreadable stamp yields `null` and is never an error.
- [ ] R3. A new `superskill script verify <plugin> [--project|--global] [--json]` recomputes the file hashes against the stamp. It exits non-zero listing added, removed and changed files, and exits 0 when they match.
- [ ] R4. The stamp is excluded from the staged file count and from `script path` candidate resolution. `rel` can never resolve to `.superskill-stamp.json`.

### Acceptance Criteria

- [ ] AC1 — After `superskill install sp`, the stamp exists with the plugin version and a hash for every staged file (req: R1)
- [ ] AC2 — `script path --json` reports the stamp's version, and reports `stamp: null` for a pre-stamp install (req: R2)
- [ ] AC3 — Editing one staged file makes `script verify` exit non-zero and name that file; a fresh install verifies clean (req: R3)
- [ ] AC4 — `script path sp .superskill-stamp.json` does not resolve, and the staged count is unchanged (req: R4)

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

### Design

<!-- Chosen approach, key tradeoffs, invariants, and impacted surfaces. Keep snippets short. -->

### Plan

- [ ] 1. Thread the install resolution (`upstreamVersion`, `marketplaceLocator`, `resolvedRef`) into `stagePluginScripts`; write the stamp after `copyDirectory` (R1).
- [ ] 2. Extend `script-path.ts` JSON output with `stamp` and exclude the stamp filename from resolution (R2, R4).
- [ ] 3. Add the `script verify` verb, reusing the stamp reader (R3).
- [ ] 4. Tests in `apps/cli/tests/commands/` covering fresh install, dry-run (no stamp), pre-stamp install (`null`), drift detection, and the stamp being non-resolvable.
- [ ] 5. Update the script-staging design doc and CLI help. Notify spur-new: 0960's `script-root.json` can then record `stamp.upstreamVersion` alongside its digest.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

<!-- Links to features, docs, ADRs, related tasks, or external references. -->

### History
