# Spur Rules

This directory is the **single source of truth** for Spur's quality-gate ruleset.
It is self-contained and authoritative — `spur rule run` resolves all categories
and presets from local `.spur/rules/**/*.yaml` with no fallback to a global
install or to ts-libs.

## Categories

| Category | Dir | Purpose |
|---|---|---|
| `typescript` | `typescript/` | TypeScript tooling, output boundaries, biome-suppression ban, no `debugger` |
| `strict` | `strict/` | Opt-in strict rules (runtime boundaries, HTTP boundaries, structural) |
| `boundary` | `boundary/` | DB/DAO boundary enforcement |
| `structure` | `structure/` | File layout, protected files, no focused/skipped tests |
| `quality` | `quality/` | Post-test gates (coverage) |
| `surface` | `surface/` | CLI surface consistency (registerXxxCommand wiring, --json serialization) |

## Presets

| Preset | When | Extends |
|---|---|---|
| `recommended-pre-check` | Before tests | `typescript`, `structure`, `boundary`, `surface` |
| `recommended-post-check` | After tests | `quality` |
| `strict-check` | Opt-in | `strict` |

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
