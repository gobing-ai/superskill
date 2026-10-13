# Spur Rules

This directory is the **single source of truth** for Spur's quality-gate ruleset.
It is self-contained and authoritative — `spur rule run` resolves all categories
and presets from local `.spur/rules/**/*.yaml` with no fallback to a global
install or to ts-libs.

## Categories

| Category | Dir | Purpose |
|---|---|---|
| `typescript` | `typescript/` | TypeScript tooling, output boundaries, biome-suppression ban, blocking-stdin ban, no `debugger` |
| `strict` | `strict/` | Opt-in strict rules (runtime boundaries, HTTP boundaries, structural) |
| `boundary` | `boundary/` | DB/DAO boundary enforcement |
| `structure` | `structure/` | File layout, protected files, no focused/skipped tests |
| `quality` | `quality/` | Post-test gates (coverage) |
| `docs` | `docs/` | Sourced-claims gate: a markdown line asserting a version string, or a time-anchored API claim, with no citation anchor on that line (`warning`; the scan itself lives in `scripts/builder.ts check-sourced-claims`, which sees fence and frontmatter state a rule-file regex cannot) |
| `surface` | `surface/` | CLI surface consistency (registerXxxCommand wiring, --json serialization) |

## Presets

| Preset | When | Extends |
|---|---|---|
| `recommended-pre-check` | Before tests | `typescript`, `structure`, `boundary`, `surface`, `docs` |
| `recommended-post-check` | After tests | `quality` |
| `strict-check` | Opt-in | `strict` |

## Relationship to the user layer

`docs/sourced-api-claims.yaml` is absorbed from `~/.config/spur/rules/docs/` rather than inherited at
run time. A preset `extends` resolves against **all** rules roots, but a category that exists only in
the user layer resolves to **zero rules and no error** — so an inherited-only dependency is a silent
false green on any machine whose user layer lacks the file. Keeping the file in-repo makes the
backstop real wherever the gate runs.

The scan is a `scripts/builder.ts check-sourced-claims` command, not a rule-file regex: a per-line
pattern cannot mask fenced code or a YAML frontmatter block, and the absorbed pattern's anchor set
rejected the `pkg@version` form the citation contract names. Those gaps produced 36 false positives
in the first repo-wide run. Defect classes live in the command; its labelled baseline and
residual-proof cases live in `scripts/tests/builder.test.ts`.

## Relationship to ts-libs

Rules originally authored in `ts-libs/.spur/rules/` were **absorbed and adapted**
(here, not copied verbatim). Each absorbed file carries an `Absorbed from
ts-libs/.spur/rules/...` header documenting what was re-scoped, omitted, or
tuned for Spur's app-repo layout. After absorption, ts-libs and spur-new
maintain their rulesets independently.

## Not absorbed (Spur-irrelevant)

- `typescript/esm-build-conventions` — governs ts-libs' library publish/dist
  flow. Spur apps don't publish libraries this way.
- `migration/rg-dialect` — one-time grep→rg migration helper.
- `migration/rg-migration` — one-time grep→rg migration helper.
