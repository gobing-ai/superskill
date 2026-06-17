---
feature_id: F018
title: Slash-command disposition + hooks.json fix
phase: 3
status: planned
depends_on: [F016]
deliverables:
  - plugins/cc/commands/*.md (rewrite 17, delete 8)
  - plugins/cc/hooks/hooks.json
created: 2026-06-17
---

# F018 — Slash-command disposition + `hooks.json` fix

## What

Two things:

1. **Disposition of all 25 slash commands** (design §3): rewrite the 17 that map to a CLI verb so
   their body delegates to `superskill <type> <op>`; delete the 8 orphans that map to no CLI verb.
2. **Fix `plugins/cc/hooks/hooks.json`** (design §4.4): it wires SessionStart/PreToolUse/Stop hooks
   to `skills/{indexed-context,tasks,anti-hallucination}` — **none of which exist** in
   `plugins/cc/`, so a fresh session start fails a hook. Strip the dangling entries.

## Why

The embedded scripts are gone (F019); commands that call them must either delegate to the CLI or be
removed. There is **no `add`/`adapt`/`emit`/`package`/`migrate` CLI verb** (verified:
`rg "'add'|'adapt'|'emit'|'package'|'migrate'" apps/cli/src/commands/*.ts` → no hits), so `*-add`
rewrites to `scaffold` and the orphans are deleted. The broken `hooks.json` is a critical install
defect — it breaks the session lifecycle for anyone installing the plugin.

## Change

### 3.1 — Rewrite to a CLI verb (17 commands)

Each keeps its **current file name** (so `/cc:agent-add` slash spelling is preserved); only the body
delegates to bare `superskill`. Renaming files to verb names (`agent-scaffold`) is out of scope
(optional Phase 4 ergonomics).

| Command files | `superskill` verb invoked |
|---------------|---------------------------|
| `agent-add`, `command-add`, `magent-add`, `skill-add` | `<type> scaffold` |
| `agent-evaluate`, `command-evaluate`, `magent-evaluate`, `skill-evaluate` | `<type> evaluate` |
| `agent-refine`, `command-refine`, `magent-refine`, `skill-refine` | `<type> refine` |
| `agent-evolve`, `command-evolve`, `magent-evolve`, `skill-evolve` | `<type> evolve` |
| `hook-validate` | `hook validate` |

> **`hook-validate` is transitional.** Phase 3 keeps + rewrites it (one of the 17). **Phase 4 P4-D3
> deletes it** (validate is hidden behind evaluate/refine/evolve; no `*-validate` slash command).
> Do not treat the 17/8 split as steady-state — after Phase 4 the surface is 16 commands. Do **not**
> add the four missing `*-validate` commands here (that earlier idea is superseded by P4-D3).

`<type>` per file prefix: `agent-*` → `superskill agent`, `skill-*` → `superskill skill`,
`command-*` → `superskill command`, `hook-*` → `superskill hook`, `magent-*` → `superskill magent`.

### 3.2 — Delete (8 orphans, no CLI verb)

`agent-adapt`, `command-adapt`, `magent-adapt`, `hook-emit`, `hook-list`, `hook-setup`,
`skill-migrate`, `skill-package`.

> Deleting these removes user-facing entry points to capabilities the CLI does not yet have (D3).
> Phase 5 restores `skill package`, `skill migrate`, hook `emit`, and the `adapt`→install pipeline
> once the CLI gains the verbs. Capability parity is **tracked** (Phase 5), not silently lost
> (design invariant #5).

### 4.4 — Fix `hooks.json`

The current file references three skills that do not exist in `plugins/cc/`
(`find plugins/cc -type d -name indexed-context` → empty). Resolution (design records both;
**Phase 3 ships (a)**):

- **(a) Strip** the dangling SessionStart/PreToolUse/Stop entries → leave an empty/minimal valid
  `hooks.json` (e.g. `{}` or `{ "hooks": {} }` matching the schema the file currently uses).
  Simplest; zero runtime risk. **Default choice.**
- **(b) Re-point** to skills that actually ship — only if those three skills are deliberately
  vendored into `plugins/cc/`. They are not, so (a) applies.

Confirm the resulting file is valid JSON and that a fresh `claude` session start (or the schema
validator) does not fail on it.

### Constraints

- **Command body shape** — match the existing command-file convention (frontmatter +
  `argument-hint`/`allowed-tools` + body). Read one current command file (e.g. `agent-evaluate.md`)
  before rewriting so the rewritten body matches structure, not just content (R5/R7).
- **No invented flags** — only emit flags the CLI registers. `evolve` accepts
  `--from`/`--propose-only`/`--accept`/`--reject`/`--target`; `evaluate` accepts
  `--json`/`--save`/`--target`; `scaffold` accepts `--description`/`--target`/`--output`/`--force`;
  `refine` accepts `--auto`/`--save`/`--target`; `validate` accepts `--strict`/`--json`/`--target`.

## Acceptance

```bash
# 17 survivors exist and delegate; 8 orphans gone
ls plugins/cc/commands/ | wc -l                                   # → 17
rg -L "agent-adapt|command-adapt|magent-adapt|hook-emit|hook-list|hook-setup|skill-migrate|skill-package" \
  <(ls plugins/cc/commands/)                                      # → none of the 8 present

# Survivors delegate to superskill (no embedded scripts)
rg "bun .*scripts/.*\.ts" plugins/cc/commands/                    # → no output
rg "superskill (agent|skill|command|hook|magent) " plugins/cc/commands/ | wc -l  # → ≥17

# hooks.json valid + carries no dangling skill refs
cat plugins/cc/hooks/hooks.json | bun -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' && echo OK
rg "indexed-context|/tasks/|anti-hallucination" plugins/cc/hooks/hooks.json  # → no output
```
