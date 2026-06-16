---
feature_id: F006
title: Marketplace manifest resolver
phase: 1
status: planned
depends_on: []
deliverables:
  - apps/cli/src/marketplace.ts
  - apps/cli/tests/marketplace.test.ts
created: 2026-06-16
---

# F006 — Marketplace manifest resolver

## What

Resolve a `<plugin>` name to its plugin-root directory by reading a Claude Code `.claude-plugin/marketplace.json` manifest, per ADR-011. Backs the `--marketplace` flag on `superskill install`.

## Why

`superskill install` currently assumes `plugins/<name>/`. The marketplace manifest is Claude Code's own plugin-root locator (`plugins[].source` + `metadata.pluginRoot`); resolving through it makes superskill consistent with upstream and supports installing plugins from any repo's marketplace, not just a local `plugins/` dir.

## Change

### `marketplace.ts`

- `marketplaceSchema` (zod, `passthrough`): `{ name, owner?:{name,email?}, metadata?:{pluginRoot?}, plugins:[{name, source, …}] }`. Verified against Claude Code docs + `cc-agents/.claude-plugin/marketplace.json`.
- `resolvePlugin(marketplacePath: string | undefined, pluginName: string): { pluginRoot: string }`
  - Locate manifest: explicit `marketplacePath` (file or its dir) → `.claude-plugin/marketplace.json` in CWD → throw "no marketplace found" (caller may then fall back to `plugins/<name>/`).
  - Marketplace root = the dir containing `.claude-plugin/` (NOT `.claude-plugin/` itself).
  - Match `plugins[].name === pluginName`; `pluginRoot = join(marketplaceRoot, metadata.pluginRoot ?? '', source)`.
- **Phase 1 scope: string relative-path `source` only.** Object sources (`github`/`url`/`git-subdir`/`npm`) → throw "remote sources not yet supported" (deferred, 01). `source` not starting `./`, or `../`-escaping the marketplace root → throw (invariant 7).
- Validate `<pluginRoot>/plugin.json` exists.

### Tests

- `marketplace.test.ts`: resolves a real-shaped fixture manifest → correct absolute `pluginRoot`; honors `metadata.pluginRoot`; rejects object sources, `../` escapes, unknown plugin names with distinct messages; missing manifest signals fall-through (not a hard error).

## Acceptance

```
import { resolvePlugin } from './marketplace';

# Given a fixture marketplace at <root>/.claude-plugin/marketplace.json
#   with { plugins: [{ name: 'rd3', source: './plugins/rd3' }] }
resolvePlugin('<root>', 'rd3')
// → { pluginRoot: '<root>/plugins/rd3' }

# metadata.pluginRoot prefixing
#   { metadata: { pluginRoot: './plugins' }, plugins: [{ name: 'rd3', source: 'rd3' }] }
// → { pluginRoot: '<root>/plugins/rd3' }

# Remote source rejected
#   { plugins: [{ name: 'x', source: { source: 'github', repo: 'a/b' } }] }
resolvePlugin('<root>', 'x')
// → throws "remote sources not yet supported"

# Unknown plugin
resolvePlugin('<root>', 'nope')
// → throws "Plugin 'nope' not found in marketplace '<name>'"
```
