<!-- should-fire (compound): every line below carries the trigger half — a semver x.y.z token with
     NO citation anchor on the same line — and the document carries no confidence declaration
     either, so the gate MUST report each line. The reported reason names both missing halves. -->
Bun is pinned to 1.3.14 in this workspace.
Biome is pinned to 2.4.16.
The SDK is pinned to 3.0.0 for this example.

<!-- The declaration half fires on its own, without the anchor half: an anchored claim in a document
     that declares no confidence is a finding whose reason names the declaration only. -->
Bun is pinned to 1.3.14 at package.json:42.
