<!-- should-pass (residual-proof): every anchored line below carries BOTH the
     trigger half (a semver token) and an anchor half, so the gate must stay
     quiet. Dropping the anchor from any line makes it fire — that is what makes
     these negatives carry the compound rather than a bare half. -->
Bun is pinned to 1.3.14 (see https://bun.sh/docs/installation).
Biome is pinned to 2.4.16 — docs/04_DESIGN.md:120.
Bun is pinned to 1.3.14 at ./package.json:42.

<!-- baseline negatives (bare half only): no semver x.y.z token at all, so
     these lock the baseline only and certify nothing about the anchor half. -->
Loopback is 127.0.0.1 in this example.
The build number is 1.2.3.4 here.
