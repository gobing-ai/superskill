---
feature_id: F016
title: Namespace migration (rd3 → cc) + companion configs
phase: 3
status: planned
depends_on: []
deliverables:
  - plugins/cc/** (string migration across ~123 files containing 'rd3')
created: 2026-06-17
---

# F016 — Namespace migration (`rd3` → `cc`) + companion configs

## What

A global string migration across `plugins/cc/`: every `rd3` reference becomes `cc`. Skill
**directory names stay** as `cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents`
(design D4) — only references change. After this feature, `rg "rd3" plugins/cc/` returns **zero**
hits (design §6 invariant #1).

This is a pure rename — no behavior change, no file moves, no deletions. It must land **first**
because every downstream rewrite (F017 SKILL.md, F018 commands) targets the final `cc:cc-*` names.

## Why

The plugin is registered as `cc` in `.claude-plugin/marketplace.json` (verified: `name: "cc"`,
`source: "./plugins/cc"`), but ~123 files still carry the old `rd3` namespace inherited from the
source corpus (`cc-agents/plugins/rd3/`). User-facing prompts referencing `/rd3:agent-add` or
`rd3:cc-agents` are broken — those skills resolve under the `cc` plugin now. Namespace consistency
is design invariant #1.

## Change

### Reference classes to migrate (design §1.1)

| Reference class | Old form | New form | Where it appears |
|-----------------|----------|----------|------------------|
| Skill invocation | `rd3:cc-agents` | `cc:cc-agents` | SKILL.md, expert agents, command bodies |
| Slash-command callouts | `/rd3:agent-add` | `/cc:agent-add` | command examples, agent routing tables |
| Repo path references | `plugins/rd3/skills/...` | `plugins/cc/skills/...` | `agents/expert-agent.md`, command bodies |
| Companion config values | `metadata.openclaw`, `agents/openai.yaml` | `rd3`-bearing values → `cc` | every skill dir |
| `SKILL.md` `metadata` frontmatter | `author: rd3-*`, version strings | aligned to `cc` | frontmatter |

> The slash-command **verb** mapping (`/rd3:agent-add` → which `superskill` verb) is **not** this
> feature's concern — F018 owns command-body rewrites. F016 only swaps the `rd3:`/`/rd3:` **prefix**
> to `cc:`/`/cc:` everywhere it literally appears. A `/rd3:agent-add` becomes `/cc:agent-add`
> (filename-preserving); whether that command later delegates or is deleted is F018's disposition.

### Migration procedure

1. **Inventory** — `rg -l "rd3" plugins/cc/ | sort` (expect ~123 files). Capture the list as the
   work scope; the count is the regression target.
2. **Substitute** — replace `rd3` → `cc` across those files. Two literal forms dominate:
   - `rd3:` → `cc:` (skill-invocation and slash-prefix forms; covers `rd3:cc-agents`,
     `/rd3:agent-add`).
   - `plugins/rd3/` → `plugins/cc/` (path references).
   - Bare `rd3` tokens in companion configs / frontmatter / prose → `cc`.
   Use `sg`/`rg`-driven replacement, file by file, reviewing each hunk — a blind global
   `s/rd3/cc/g` is acceptable **only** after confirming no `rd3` substring is load-bearing inside a
   longer identifier that should survive (e.g. a URL, a third-party package name). Grep first:
   `rg "rd3" plugins/cc/ -o | sort -u` to enumerate the distinct surrounding tokens before
   substituting.
3. **Companion configs** (design §1.2) — `metadata.openclaw` blocks and `agents/openai.yaml` files
   ship per skill for non-Claude platforms and embed the skill description/version with `rd3`
   values. Rename their `rd3`-bearing values in lockstep. (Whether companion generation should move
   into `superskill install` is a Phase 4 question — **not** decided here; just rename the values.)

### What must NOT change

- **Directory names** — `cc-agents/`, `cc-skills/`, etc. stay (D4). Do not rename dirs to `agents/`.
- **CLI source** — nothing under `apps/cli/` is touched; this is plugin-only.
- **Behavior** — no logic, no operation semantics, no file structure changes. Pure string swap.

## Acceptance

```bash
# Invariant — zero rd3 references survive (design §6 #1)
rg "rd3" plugins/cc/                 # → no output (exit 1)

# Slash + skill prefixes migrated
rg "/rd3:|rd3:cc-" plugins/cc/        # → no output

# Path references migrated
rg "plugins/rd3/" plugins/cc/         # → no output

# Directory names preserved (D4)
ls plugins/cc/skills/                 # → cc-agents cc-commands cc-hooks cc-magents cc-skills

# No CLI source touched
git diff --name-only apps/cli/        # → empty
```
