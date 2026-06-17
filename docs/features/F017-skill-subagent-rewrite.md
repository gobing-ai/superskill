---
feature_id: F017
title: Skill + expert-subagent rewrite → superskill
phase: 3
status: planned
depends_on: [F016]
deliverables:
  - plugins/cc/skills/cc-agents/SKILL.md
  - plugins/cc/skills/cc-skills/SKILL.md
  - plugins/cc/skills/cc-commands/SKILL.md
  - plugins/cc/skills/cc-hooks/SKILL.md
  - plugins/cc/skills/cc-magents/SKILL.md
  - plugins/cc/agents/expert-agent.md
  - plugins/cc/agents/expert-skill.md
  - plugins/cc/agents/expert-command.md
  - plugins/cc/agents/expert-hook.md
  - plugins/cc/agents/expert-magent.md
created: 2026-06-17
---

# F017 — Skill + expert-subagent rewrite → `superskill`

## What

Rewrite the 5 `SKILL.md` files and 5 `expert-*.md` subagent definitions so every lifecycle
operation invokes the global **`superskill <type> <op>`** binary (design D2) instead of
`bun scripts/*.ts`. Remove the "Hybrid Workflow Architecture / scripts" framing and the
`adapt`/`package`/`migrate` operation rows (those capabilities are deleted in Phase 3 per D3;
restoration tracked in Phase 5).

## Why

The plugin is being converted from a self-contained bundle of embedded scripts into a thin plugin
that delegates to the CLI built in Phases 1–2 (design Goal). The skills and expert agents are the
agent-facing instructions; until they call `superskill` instead of `bun scripts/scaffold.ts`, the
plugin still depends on embedded code that F019 deletes. This feature makes the instructions
reference only capabilities the CLI actually has.

## Change

### Invocation mapping (design §2 — verified against the real CLI surface)

Every script invocation in the SKILL.md/agent bodies maps as follows. **Bare `superskill`** — no
path, no `bun run` (D2 locked: dev resolves via `bun link`, consumers via
`npm i -g @gobing-ai/superskill`).

| Old local invocation | New `superskill` invocation | Notes |
|----------------------|-----------------------------|-------|
| `bun scripts/scaffold.ts <name> --path <dir> --template <tier>` | `superskill <type> scaffold <name> --output <dir>` | No `--template` tier flag on the CLI; drop it. |
| `bun scripts/validate.ts <path>` | `superskill <type> validate <nameOrPath>` | `--strict`, `--json`, `--target` available. |
| `bun scripts/evaluate.ts <path> --scope <scope>` | `superskill <type> evaluate <nameOrPath> --save` | ⚠ Behavior change: `--scope` has no CLI equivalent; `--save` controls persistence. |
| `bun scripts/refine.ts <path> --eval` | `superskill <type> refine <nameOrPath> --auto --save` | `--auto` skips interactive prompts. |
| `bun scripts/evolve.ts <path> --propose` | `superskill <type> evolve <name> --propose-only` | |
| `bun scripts/evolve.ts <path> --apply <id>` | `superskill <type> evolve <name> --accept <id>` | |

> Operations with **no CLI replacement** (deleted per D3): cross-platform `adapt`, hook `emit`,
> abstract-hook schema/lint, skill `package`, skill `migrate`. **Remove their rows/sections
> entirely** from the SKILL.md operation tables and agent routing tables — do not leave a "coming
> soon" stub. Phase 5 restores them as CLI verbs.

### 5 × `SKILL.md` (deliverables)

For each of `cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents`:

- Rewrite **Quick Start**, **Operations**, and **Operation Workflow** sections to invoke
  `superskill <type> <op>` per the mapping table.
- Remove the `scripts/*.ts` references and the "Hybrid Workflow Architecture / scripts" framing.
- Drop the `adapt`/`package`/`migrate` operation rows.
- Remove `references/` link lines pointing at files F019 deletes (e.g. `scripts-usage.md`).
- `<type>` is the skill's own type: `cc-agents` → `superskill agent <op>`, `cc-skills` →
  `superskill skill <op>`, `cc-commands` → `superskill command <op>`, `cc-hooks` →
  `superskill hook <op>`, `cc-magents` → `superskill magent <op>`.

> **`cc-hooks` special case:** its only surviving CLI verb is `hook validate` (plus scaffold). The
> `emit`/schema/lint workflows are deleted (D3) — remove those sections. Cross-platform hook
> authoring returns in Phase 5; this SKILL.md should not promise it.

### 5 × `expert-*.md` (deliverables)

For each of `expert-agent`, `expert-skill`, `expert-command`, `expert-hook`, `expert-magent`:

- Update prompt instructions, the **Skill Invocation** table, and operation-routing tables to
  reference `cc:cc-<type>` and `superskill <type> <op>`.
- Fix hardcoded `plugins/rd3/skills/...` paths → `plugins/cc/skills/...`. (F016 already swapped the
  `rd3`→`cc` string; confirm none survive — `rg "plugins/rd3" plugins/cc/agents/` → empty.)
- Update `skills:` frontmatter to reference `cc:cc-<type>`.
- Remove routing rows for deleted operations (`adapt`/`emit`/`package`/`migrate`).

### Constraints

- **Surgical** — change only invocation/routing lines and the deleted-op rows. Do not rewrite prose
  that is still accurate, do not restructure section order, do not "improve" wording (R3/R7).
- **No new capabilities** — the SKILL.md must not document a CLI flag that does not exist. Cross-
  check every flag against `apps/cli/src/commands/*.ts` registrations before writing it.

## Acceptance

```bash
# No script-runner invocations remain in skills/agents
rg "bun .*scripts/.*\.ts" plugins/cc/skills/ plugins/cc/agents/   # → no output

# All invocations use bare superskill
rg "superskill (agent|skill|command|hook|magent) (scaffold|validate|evaluate|refine|evolve)" \
   plugins/cc/skills/ plugins/cc/agents/                          # → hits in each file

# No references to deleted operations
rg "\b(adapt|package|migrate)\b.*operation|emit-.*\.sh|hook-linter" plugins/cc/skills/ # → none

# No stale rd3 paths
rg "plugins/rd3/" plugins/cc/agents/                              # → no output

# Skill frontmatter references cc:cc-<type>
rg "cc:cc-(agents|skills|commands|hooks|magents)" plugins/cc/agents/  # → hits
```
