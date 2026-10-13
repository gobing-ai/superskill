---
doc: fixture
version: 9.9.9
---
<!-- should-pass (residual-proof): the trigger half — a semver token — is present on every line
     below, and so are the other two halves: a citation anchor and the document's confidence
     declaration. Dropping any one half from any line makes it fire, which is what makes these
     negatives carry the compound rather than a bare half. -->

Confidence: HIGH — pinned versions checked against the files named on each line.

Bun is pinned to 1.3.14 (see https://bun.sh/docs/installation).
Biome is pinned to 2.4.16 — docs/04_DESIGN.md:120.
Bun is pinned to 1.3.14 at package.json:42.
Bun is pinned to 1.3.14 at .prototools:1.
The library is pinned to `rulesync@8.28.1`.

<!-- The `version:` field in the frontmatter above is metadata, not a claim: no citation could ever
     satisfy it, so the scan masks the whole frontmatter block. A frontmatter `confidence:` field is
     the other accepted declaration form (it is what the CLI-managed corpus carries); prose is used
     here so the body form is exercised too. -->

<!-- A fenced block is a manifest excerpt or command example; bare versions are legitimate there —
     and a declaration shown inside one is an example, not this document's own declaration. -->
```json
{ "yaml": "^2.9.0", "zod": "^3.25.0" }
```

<!-- KNOWN RESIDUAL, disclosed not certified: a version that equals one of this repo's own release
     tags is treated as own-history. The source for `0.3.26` is that release's git tag. An
     *unscoped* external name whose version collides with an own tag is indistinguishable here. -->
Superskill 0.3.26 printed that row.
