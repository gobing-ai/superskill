---
feature_id: F020
title: Binary-on-PATH + Phase 3 verification
phase: 3
status: planned
depends_on: [F016, F017, F018, F019]
deliverables:
  - apps/cli/package.json (verify bin name; no change expected)
  - docs runbook note for build + link/publish path
created: 2026-06-17
---

# F020 — Binary-on-PATH + Phase 3 verification

## What

Establish and **exercise** the path by which the global `superskill` binary resolves on PATH (design
D2), so the rewritten plugin commands (F017/F018) actually run, and then run the Phase 3 exit gate
(design §6). This is the closing feature — it proves the whole consolidation works end to end.

## Why

F017/F018 made every skill/command call bare `superskill <type> <op>`. If `superskill` does not
resolve on PATH, every one of those invocations fails at runtime — the single thing that can
silently make the entire phase non-functional. D2 locks the mechanism; this feature verifies it and
confirms all design §6 invariants hold.

## Change

### Binary resolution (D2 — locked)

Verified facts:
- `apps/cli/package.json` `bin` is `{ "superskill": "dist/index.js" }` (bin **name** is
  `superskill`; **target** is the built `dist/index.js`).
- The package publishes as `@gobing-ai/superskill` (v0.1.3 live).

Mechanism:
- **Dev** — `bun run build` (emits `dist/`), then `bun link` from `apps/cli`. After this,
  `which superskill` resolves and bare `superskill ...` runs.
- **Consumers** — `npm i -g @gobing-ai/superskill`.

No code change is expected in `package.json` (bin is already correct). If `bun link` does not expose
the `superskill` name (e.g. because `bin` target points at an unbuilt path), the fix is to ensure
`bun run build` runs first — **not** to repoint `bin` to `src/index.ts` (the `.ts` entry runs only
under Bun; consumers on Node need `dist/`).

### Runbook note

Document the dev link + consumer install steps where a developer will find them (a short note in the
plugin README or a `docs/` runbook). Keep it to the two commands above — no new tooling.

### Phase 3 exit gate (design §6 — run all)

```bash
# 1. Namespace consistency (F016)
rg "rd3" plugins/cc/                                              # → zero hits

# 2. No embedded execution (F017/F018)
rg "bun .*scripts/.*\.ts" plugins/cc/                            # → zero hits

# 3. Embedded dirs gone (F019)
find plugins/cc -type d \( -name scripts -o -name templates -o -name tests \
   -o -name emitters -o -name schema \)                          # → empty

# 4. hooks.json clean (F018)
rg "indexed-context|/tasks/|anti-hallucination" plugins/cc/hooks/hooks.json  # → none; file valid

# 5. Command surface (F018): 17 survivors delegate, 8 orphans gone
ls plugins/cc/commands/ | wc -l                                  # → 17

# 6. Binary resolves + runs (D2)
bun run build && (cd apps/cli && bun link)
which superskill                                                 # → resolves
superskill agent validate <sample-file>                         # → runs (exit 0/1/2, not "command not found")

# 7. Root verification gate
bun run lint && bun run test && bun run build
git status -s                                                    # → only intentional changes
```

### Constraints

- This feature **gates on F016–F019** — it cannot pass until the rename, rewrites, deletions, and
  hooks fix are all in. Run it last.
- If the root gate (`bun run test`) surfaces a failure, it must be in plugin-adjacent surface only —
  Phase 3 touches no CLI source, so a CLI test regression indicates an accidental out-of-scope edit
  (R3 violation) and must be reverted, not patched.

## Acceptance

All 7 gate blocks above pass. Specifically: `which superskill` resolves after `bun run build` +
`bun link`; a bare `superskill agent validate <file>` runs against a sample; `bun run lint/test/build`
are green; `git status` shows only intentional `plugins/cc/` (+ doc/runbook) changes.
