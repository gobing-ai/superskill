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

marketplace.ts: zod marketplaceSchema { name, owner?, metadata?:{pluginRoot?}, plugins:[{name, source}] } (passthrough). resolvePlugin(marketplacePath|undefined, pluginName) -> { pluginRoot } absolute. Locate: --marketplace (file or dir) -> CWD .claude-plugin/marketplace.json -> signal fall-through. Marketplace root = dir containing .claude-plugin/ (NOT .claude-plugin/ itself). pluginRoot = join(root, metadata.pluginRoot ?? '', source). Phase 1: string relative-path source only (must start ./); object sources github/url/git-subdir/npm -> throw 'remote sources not yet supported' (deferred); ../-escape -> throw (invariant 7). Validate <pluginRoot>/plugin.json. Distinct error messages per failure. Schema verified vs Claude Code docs + cc-agents marketplace.json.


### Q&A



### Design


Resolution order: `--marketplace <path>` (file or its dir) → `.claude-plugin/marketplace.json` in CWD → signal fall-through so F004 can use the `plugins/<name>/` scan. Marketplace **root** = the dir containing `.claude-plugin/`, NOT `.claude-plugin/` itself — `cc-agents/.claude-plugin/marketplace.json` + `"source":"./plugins/rd3"` → `cc-agents/plugins/rd3`. `pluginRoot = join(root, metadata.pluginRoot ?? '', source)`. Phase 1 accepts string relative-path `source` only; object sources and `../`-escapes throw with distinct messages (invariant 7, ADR-011). Validate `<pluginRoot>/plugin.json`. Schema (zod, passthrough) verified vs Claude Code docs (code.claude.com/docs/en/plugin-marketplaces) and `/Users/robin/projects/cc-agents/.claude-plugin/marketplace.json`. Test fixture: a minimal `.claude-plugin/marketplace.json` under `apps/cli/tests/fixtures/`.


### Solution

- `marketplace.ts`: zod schema for marketplace.json, `resolvePlugin()` with 3-tier resolution (--marketplace → CWD .claude-plugin/ → null for fallback), `listResolvablePlugins()`. Phase 1 rejects remote sources and ../-escapes.


### Plan

1. Create marketplace.ts with zod schema + resolvePlugin + listResolvablePlugins
2. Create marketplace.test.ts (6 tests)
3. Export types and functions


### Review



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References


