---
doc: fixture
version: 9.9.9
---
<!-- should-pass (residual-proof): the trigger half — a semver token — is present on every line
     below, and so is an anchor half. Dropping the anchor from any one line makes it fire, which is
     what makes these negatives carry the compound rather than a bare half. -->

Bun is pinned to 1.3.14 (see https://bun.sh/docs/installation).
Biome is pinned to 2.4.16 — docs/04_DESIGN.md:120.
Bun is pinned to 1.3.14 at package.json:42.
Bun is pinned to 1.3.14 at .prototools:1.
The library is pinned to `rulesync@8.28.1`.

<!-- The `version:` field in the frontmatter above is metadata, not a claim: no citation could ever
     satisfy it, so the scan masks the whole frontmatter block. -->

<!-- A fenced block is a manifest excerpt or command example; bare versions are legitimate there. -->
```json
{ "yaml": "^2.9.0", "zod": "^3.25.0" }
```

<!-- KNOWN RESIDUAL, disclosed not certified: a version that equals one of this repo's own release
     tags is treated as own-history. The source for `0.3.26` is that release's git tag. An
     *unscoped* external name whose version collides with an own tag is indistinguishable here. -->
Superskill 0.3.26 printed that row.
