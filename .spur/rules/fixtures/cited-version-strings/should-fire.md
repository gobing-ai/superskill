<!-- should-fire (compound): each line carries the trigger half — a semver x.y.z
     token with no citation anchor on the same line — so the gate MUST report it. -->
Bun is pinned to 1.3.14 in this workspace.
Biome is pinned to 2.4.16.

<!-- residual-proof: the trigger half is present AND a slash-free
     manifest:line token follows. That token is NOT one of the shipped anchor
     shapes, so the anchor half is still firing here (measured, not assumed). -->
The runtime is pinned at package.json:42 to 1.3.14.
