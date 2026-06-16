---
name: Marketplace manifest resolver
description: Marketplace manifest resolver
status: Done
created_at: 2026-06-16T06:20:41.483Z
updated_at: 2026-06-16T07:22:55.427Z
folder: docs/tasks
type: task
feature-id: F006
priority: high
estimated_hours: 2
tags: ["marketplace","resolver","plugin","foundation"]
impl_progress:
  planning: pending
  design: pending
  implementation: pending
  review: pending
  testing: pending
---

## 0006. Marketplace manifest resolver

### Background

superskill install must resolve a <plugin> name to its root dir. Claude Code's marketplace.json (plugins[].source + metadata.pluginRoot) is the canonical locator. Backs the --marketplace flag (ADR-011). Independent of F001/F002; unblocks F004.


### Requirements

- [x] **R1**: `marketplace.ts` defines a Zod marketplace schema for `{ name, owner?, metadata?: { pluginRoot? }, plugins: [{ name, source }] }` and allows forward-compatible unknown fields. → **MET** | Evidence: `apps/cli/src/marketplace.ts:5` plugin entry schema, `apps/cli/src/marketplace.ts:13` marketplace schema; test evidence `apps/cli/tests/marketplace.test.ts:13`.
- [x] **R2**: `resolvePlugin(marketplacePath | undefined, pluginName)` returns an absolute `{ pluginRoot }` for a matching local marketplace plugin. → **MET** | Evidence: `apps/cli/src/marketplace.ts:55`; test evidence `apps/cli/tests/marketplace.test.ts:13`.
- [x] **R3**: Resolution order supports explicit `--marketplace` file/dir, CWD `.claude-plugin/marketplace.json`, and `null` fall-through for caller fallback. → **MET** | Evidence: `apps/cli/src/marketplace.ts:58`, `apps/cli/src/marketplace.ts:68`, `apps/cli/src/marketplace.ts:76`; test evidence `apps/cli/tests/marketplace.test.ts:57`.
- [x] **R4**: Marketplace root is the directory containing `.claude-plugin/`, not `.claude-plugin/`; `pluginRoot` is resolved from `marketplaceRoot`, optional `metadata.pluginRoot`, and `source`. → **MET** | Evidence: `apps/cli/src/marketplace.ts:115`; test evidence `apps/cli/tests/marketplace.test.ts:36`.
- [x] **R5**: Phase 1 rejects non-local or object sources with “Remote sources not yet supported”. → **MET** | Evidence: `apps/cli/src/marketplace.ts:97`, `apps/cli/src/marketplace.ts:103`; test evidence `apps/cli/tests/marketplace.test.ts:75`, `apps/cli/tests/marketplace.test.ts:89`.
- [x] **R6**: `../` escaping sources are rejected distinctly. → **MET** | Evidence: `apps/cli/src/marketplace.ts:110`; test evidence `apps/cli/tests/marketplace.test.ts:105`.
- [x] **R7**: Resolved plugin roots must contain `plugin.json`. → **MET** | Evidence: `apps/cli/src/marketplace.ts:122`.
- [x] **R8**: Distinct failure behaviors exist for missing manifest, missing plugin, invalid JSON/schema, remote source, path escape, and missing `plugin.json`. → **MET** | Evidence: `apps/cli/src/marketplace.ts:65`, `apps/cli/src/marketplace.ts:85`, `apps/cli/src/marketplace.ts:91`, `apps/cli/src/marketplace.ts:97`, `apps/cli/src/marketplace.ts:110`, `apps/cli/src/marketplace.ts:122`; tests cover the main user-facing branches in `apps/cli/tests/marketplace.test.ts`.


### Q&A



### Design


Resolution order: `--marketplace <path>` (file or its dir) → `.claude-plugin/marketplace.json` in CWD → signal fall-through so F004 can use the `plugins/<name>/` scan. Marketplace **root** = the dir containing `.claude-plugin/`, NOT `.claude-plugin/` itself — `cc-agents/.claude-plugin/marketplace.json` + `"source":"./plugins/rd3"` → `cc-agents/plugins/rd3`. `pluginRoot = join(root, metadata.pluginRoot ?? '', source)`. Phase 1 accepts string relative-path `source` only; object sources and `../`-escapes throw with distinct messages (invariant 7, ADR-011). Validate `<pluginRoot>/plugin.json`. Schema (zod, passthrough) verified vs Claude Code docs (code.claude.com/docs/en/plugin-marketplaces) and `/Users/robin/projects/cc-agents/.claude-plugin/marketplace.json`. Test fixture: a minimal `.claude-plugin/marketplace.json` under `apps/cli/tests/fixtures/`.


### Solution

Implemented and verified the marketplace resolver contract in `apps/cli/src/marketplace.ts`.

Verification fix applied: the marketplace schema now accepts Claude Code’s documented owner object, preserves unknown marketplace/plugin fields with `.passthrough()`, and models plugin `source` as `string | object`. Object sources still remain unsupported in Phase 1, but they now reach `resolvePlugin()` and throw the required “Remote sources not yet supported” message instead of failing with a generic Zod validation error.

Regression tests were added in `apps/cli/tests/marketplace.test.ts` for absolute plugin root resolution, `metadata.pluginRoot` prefixing, passthrough owner/top-level fields, and object-source rejection.


### Plan

1. Re-read task 0006, ADR-011, and the local resolver implementation.
2. Compare implementation and tests against Claude Code marketplace schema/source behavior.
3. Fix schema/error-path drift and missing tests.
4. Run focused resolver tests.
5. Run full verification gates: `bun run autofix`, `bun run spur-check`, `bun run build`.
6. Update task 0006 with traceability and review verdict.


### Review

Verification verdict: PASS after fix.

#### Fixed Finding P2: Object marketplace sources failed before the required remote-source error

`apps/cli/src/marketplace.ts` previously typed `plugins[].source` as `z.string()`, so object sources such as `{ "source": "github", "repo": "owner/repo" }` failed during schema parsing with a generic Zod error. Task 0006 requires object sources (`github`, `url`, `git-subdir`, `npm`) to throw “Remote sources not yet supported” as a distinct Phase 1 deferral.

Fix: `pluginEntrySchema` now accepts `source: string | object`, while `resolvePlugin()` explicitly rejects non-string sources with the required remote-source message. The same edit corrected schema drift by accepting the documented `owner` object and allowing unknown top-level/plugin-entry fields via `.passthrough()`.

Regression coverage: `apps/cli/tests/marketplace.test.ts` now covers object-source rejection, `metadata.pluginRoot` prefixing, absolute plugin root evidence, and passthrough-compatible marketplace fields.

SECU review found no remaining P1/P2 issues in the F006 scope.


### Testing

Passed:

- `bun test apps/cli/tests/marketplace.test.ts`
- `bun run autofix`
- `bun run spur-check`
- `bun run build`

`bun run spur-check` result: 113 tests passing across 14 files, 0 failures, 215 assertions. Aggregate coverage: 99.17% functions and 98.60% lines.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


