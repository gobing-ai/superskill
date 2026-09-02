# Design: Skill update notification — install manifest + `superskill update`

Feature B · ADR-035 (Accepted design) · 2026-08-31 · amended same day: hybrid version-first compare + release-workflow impact section (repo versioning infra verified: `check-publish-manifest` guard, `bump-ver`, publish.yml → prepublishOnly)

## Problem

Installed superskill capabilities are anonymous copies: no version, no source, no hashes. A plugin author shipping several versions per day is invisible to every consumer. Feedback (zh): “有时候对一个 skill 一天连续更新好几个版本，没有更新提醒机制，别人很难知道你更新了。”

## Approach

Pull model v1 (per brainstorm Approach A). Two pieces:

1. **Install-time provenance manifest** — every `superskill install` writes one manifest per target scope next to the installed capabilities.
2. **`superskill update` verb** — diffs installed manifests against upstream; `--check` reports, bare update re-installs.

## Manifest schema (DTO)

File: `<scopeRoot>/.superskill/manifests/<target>/<plugin>/.superskill-manifest.json`

`scopeRoot` is the explicit `outputRoot`, otherwise `$HOME` for global installs or cwd for project installs. The registry is plugin-keyed so two plugins sharing a target cannot overwrite each other, and one plugin can span skills/commands/agents/hooks without a singleton beside a skills root.

```ts
interface InstallSnapshot {
  files: Record<string, string>;  // slash-normalized relPath -> sha256 of file bytes
  canonicalHash: string;          // ADR-031 length-framed hash over the sorted path/content set
}

interface InstallManifest {
  schemaVersion: 1;
  plugin: string;
  target: string;
  channel: 'bundled' | 'marketplace';
  upstreamVersion: string;        // marketplace entry version, else plugin.json, else cliVersion (bundled)
  marketplaceLocator?: string;    // --marketplace verbatim, else a re-resolvable absolute local root
  resolvedRef?: string;           // GitHub Trees SHA from cold-cache materialization
  installedAt: string;            // ISO-8601 UTC
  superskillVersion: string;      // writer version, for diagnostics
  installed: InstallSnapshot;     // final bytes on disk for this plugin-target
  upstream: InstallSnapshot;      // resolved plugin source tree (equal-version local-marketplace compare)
}
```

- **Two snapshot domains:** installed hashes prove what landed; upstream hashes make ADR-035's equal-version local-marketplace comparison possible without rebuilding every target during `update --check`.
- **Per-file hash:** SHA-256 of the file bytes (`computeContentHash`).
- **`canonicalHash`:** ADR-031 length-framed framing over the sorted path/content set (`computeStructuredContentHash`). No new hash framing.
- **`upstreamVersion`:** the repo's release pipeline already guarantees a single version across `apps/cli/package.json` == `.claude-plugin/marketplace.json` == `plugins/cc/plugin.json` (guarded by `check-publish-manifest` on the real publish path, `publish.yml` → `prepublishOnly`), so the recorded version is a trustworthy compare signal.

## `superskill update` surface

```text
superskill update [plugin] [--check] [--targets <list>] [--marketplace <locator>] [--no-global]
```

- `--check` (default when no plugin named? **No** — explicit is better: bare `update` mutates, `--check` reports). Exit codes: `0` = up to date / updated; `1` = updates available (`--check` only); `2` = upstream unavailable for one or more plugins (still reports the rest).
- No plugin named → all plugins with manifests in the scanned scopes.
- `--marketplace` overrides the recorded locator (escape hatch for moved marketplaces); otherwise the manifest's locator is re-resolved through the ADR-034 three-way local probe / GitHub materialization (cache dir already keyed by locator).
- Output: per plugin — `up to date` | `stale: <n> file(s) changed: <relPaths…>` | `installed before manifest support - reinstall to adopt` | `upstream unavailable (<locator>)`.

## Diff algorithm (hybrid: version-first, hash-authoritative)

1. Discover manifests in scope dirs (absent manifest → pre-manifest branch).
2. **Channel dispatch.**
   - `bundled`: compare recorded `upstreamVersion` against the latest published npm version (`npm view @gobing-ai/superskill version`). Stale ⇒ report "superskill <latest-version> available (installed <recorded-version>)" — angle brackets literal in output; update = upgrade the global package (the bundle and CLI version-lock). No upstream re-hash.
   - `marketplace`: re-resolve the recorded locator → upstream plugin capability set + upstream `plugin.json`/`marketplace.json` version.
3. **Version compare** (marketplace channel): recorded `upstreamVersion` ≠ upstream version ⇒ stale (report version delta); report per-file changes from the `files` map diff.
4. **Hash tie-breaker:** versions equal ⇒ compare `canonicalHash`. This is the only truthful signal for local dev marketplaces (`--marketplace ../superskill` iterating without version bumps) and any same-version content drift.
5. Bare `update`: bundled ⇒ print the package-manager upgrade command; marketplace ⇒ re-run the existing install path for the plugin (manifest refresh falls out of R1 — no second writer).

## Release-workflow impact (build/release/publish)

No structural change needed — the existing pipeline is already exactly the primitive this feature consumes:

- Single-version invariant + `check-publish-manifest` guard fire on the real publish path (`publish.yml:46` → `prepublishOnly`); `bump-ver` keeps one command for all three version sites.
- **Additive, lands with the verb (task 0124 doc-sync):** `docs/help/release.md` post-release smoke (checklist item 5) gains one step — run `superskill update --check` against the fresh release to prove the notification path end-to-end.
- **Additive (task 0124 scope):** bundled-channel bare `update` prints the package-manager upgrade command rather than copying files — the bundle is version-locked to the CLI.
- Explicitly rejected: per-skill versions (needs its own bump+guard pipeline, no consumer; skills are verbatim plugin content) and a dedicated `latest.json` release asset (npm registry + marketplace HEAD already answer "latest").

## Back-compat

- No/corrupt manifest ⇒ pre-manifest guidance, exit 0 (R5/R7). Never fail the whole run for one bad plugin (R6 reports it and continues).
- No migration writer for old installs; "reinstall to adopt" is the migration.

## Module placement

- `packages/core/src/operations/install-manifest.ts` — schema, path derivation, snapshot hashing, validation, atomic read/write. Single writer, called by `executeInstall`.
- `apps/cli/src/commands/install.ts` — accumulates per-target receipts and writes the manifest before the success line. Dry-run writes no manifest; inventory/write failure is fatal.
- `packages/core/src/operations/update.ts` — discover/resolve/diff/report (task 0124). Depends on the exported DTO/path/read functions and the upstream snapshot; does not write manifests.
- `apps/cli/src/commands/update.ts` — Commander wiring (task 0124).
- No new workspace package; hashing via existing canonical-hash module; subprocess via ProcessExecutor (ADR-032) only if a git path needs it.

## Test plan

Unit (bun:test, following install test seams): manifest write on install; diff stale/up-to-date/pre-manifest/corrupt/unavailable; exit-code contract; CLI stdout via `process.stdout.write` spy (ADR-project convention). AC traceability: R1–R8 map 1:1 to these seams.

## Explicitly deferred

Release feed publishing (`updates.json`), in-agent banner hook, auto-update, transform-aware diffing.
