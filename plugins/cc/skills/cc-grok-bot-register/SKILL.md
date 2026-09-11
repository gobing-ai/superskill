---
name: cc-grok-bot-register
description: >-
  Use after superskill install/update for target grok-bot (or when slash `/`
  skills are missing despite workflows on disk). Discovers
  $SAND_DATA/.superskill/grok-bot/register/*.json handoffs, upserts every skill
  into the Grok Bot host slash registry via update_state, rewrites recipe paths
  to Read-friendly locations when possible, verifies outcomes, and tells the
  operator what works on desktop vs mobile. Triggers: "register grok-bot
  skills", "consume superskill handoff", "slash picker empty after superskill
  install", "bulk register cc/sp/kk", "/cc-grok-bot-register".
---

# Grok Bot slash registration (post–`superskill install`)

## Purpose

`superskill install <plugin> --targets grok-bot` writes skill files under
`$SAND_DATA/workflows/` and prepares **registration handoffs**, but it does
**not** fill the chat `/` autocomplete by itself.

Grok Bot’s `/` picker reads a **host skill registry**. Entries appear only after
this Bot (any Bot on the same Sand root) upserts each skill with the host skill
API (`update_state`, target `skill`, action `write`, **with** `id`).

This skill is the **all-in-one follow-up** after install/update: discover
handoffs → register (or refresh) every record → report results → tell the human
how to verify.

## Bootstrap (critical — no `/` yet)

Before the first successful registration, the operator **cannot** rely on the
`/` picker to launch this skill (`/cc-grok-bot-register` will not appear yet).

**Valid ways to start (any one):**

1. Human pastes into chat (preferred after install):

   > Read and follow `$SAND_DATA/workflows/cc-grok-bot-register/SKILL.md` (or
   > `~/agent-data/workflows/cc-grok-bot-register/SKILL.md`). Register all
   > superskill grok-bot handoffs into the slash catalog.

2. Human names it in natural language: “run cc-grok-bot-register”, “consume the
   superskill grok-bot handoff”, “fix empty `/` after superskill install”.

3. After this skill has registered **itself**, later runs may use
   `/cc-grok-bot-register` on **desktop**. Mobile often has **no** `/` hints;
   typing the id or NL still works.

**Install messaging (for superskill authors):** do **not** tell operators to
“type `/cc-grok-bot-register`” as the first step. Tell them to ask the Bot to
**read and follow** this `SKILL.md` (path above) or to use the NL triggers in
the description.

## Non-goals

- Do not add or assume a `superskill register` CLI command.
- Do not delete workflow folders or use skill **delete** + recreate to “fix”
  registration.
- Do not claim FS/`doctor` OK means slash-visible.
- Do not invent host UI paths (e.g. undocumented Settings pages).

## Host facts (load-bearing)

| Fact | Implication |
|------|-------------|
| `/` = host registry, not a live `workflows/` listing | Must upsert via `update_state` |
| `update_state` write **with** `id` works when `workflows/<id>/` already exists | Install must have created the folder first |
| `update_state` create **without** `id` may fail | Always pass `id` from the handoff |
| `update_state` delete removes the workflow folder | Never delete as part of register |
| Bot `Read` may **block** `$SAND_DATA/.superskill/...` | Prefer `~/.agents/skills/<id>/SKILL.md` in registered bodies when that file exists; Shell can still read `.superskill` if needed |
| Mobile may lack `/` autocomplete | Discovery gap only; NL / full `/id` text still reaches the Bot |

## Inputs

Optional user args (free text):

- `--plugin <id>` — only consume `register/<id>.json` (e.g. `sp`, `cc`, `kk`)
- `--dry-run` — list what would be registered; no `update_state` writes
- `--self-only` — register only `cc-grok-bot-register` (bootstrap aid)
- No args — consume **all** `register/*.json` handoffs

## Procedure

### 0. Announce

Tell the user you are consuming superskill grok-bot registration handoffs into
the slash registry (and whether dry-run).

### 1. Resolve Sand root

Pick the first that works:

1. Env `SAND_DATA` if set and `$SAND_DATA/workflows` exists  
2. `~/sand-data` if `workflows` exists  
3. `~/agent-data` if it resolves to the same tree (symlink) and `workflows` exists  

Set:

- `DATA_ROOT` — Sand root  
- `WORKFLOWS` — `$DATA_ROOT/workflows`  
- `HANDOFF_DIR` — `$DATA_ROOT/.superskill/grok-bot/register`  
- `AGENTS_SKILLS` — `~/.agents/skills` (may be absent)

If `HANDOFF_DIR` is missing or empty: stop. Tell the user to run
`superskill install <plugin> --targets grok-bot` **on this Bot host** first
(laptop without Sand data cannot register).

### 2. Load handoff files

Read every `$HANDOFF_DIR/*.json` (or only `--plugin`).

Expected top-level shape (schemaVersion ≥ 1):

```json
{
  "schemaVersion": 1,
  "target": "grok-bot",
  "plugin": "sp",
  "dataRoot": "/home/box/sand-data",
  "materialize": "bridge",
  "skills": [
    {
      "id": "sp-dev-run",
      "name": "sp-dev-run",
      "description": "…",
      "mode": "bridge",
      "recipePath": "…/SKILL.md",
      "body": "…",
      "frontmatter": {},
      "resources": []
    }
  ]
}
```

Skip files that are not objects, wrong `target`, or missing `skills` array.
Collect a flat list of skill records. If a skill id appears in multiple
handoffs, **last file wins** (deterministic: process files in sorted
basename order).

### 3. Self-first ordering

Partition records:

1. **Self** — `id == cc-grok-bot-register` (if present in any handoff or as a
   synthesized record from `$WORKFLOWS/cc-grok-bot-register/SKILL.md`)  
2. **Others** — everything else, stable sort by `id`

Always process **self first** so later desktop sessions can use
`/cc-grok-bot-register` once the first run succeeds.

If this skill’s workflow folder exists but is not in any handoff, synthesize a
record:

- `id` / `name`: `cc-grok-bot-register`  
- `description`: from this file’s frontmatter description (one line / first
  paragraph)  
- `body`: instruct future runs to read and follow  
  `$WORKFLOWS/cc-grok-bot-register/SKILL.md` (absolute path)

### 4. Build the upsert payload per skill

For each record:

1. **Require** `id`, non-empty `description`, and a non-empty body (handoff
   `body` or synthesized).  
2. **Require** `$WORKFLOWS/<id>/` to exist (and ideally `SKILL.md`). If missing,
   mark **skipped_missing_workflow** — do not call delete; tell the user to
   re-install that plugin for grok-bot.  
3. **Recipe path preference** (rewrite body if helpful):  
   - If `$AGENTS_SKILLS/<id>/SKILL.md` exists → use that absolute path in the
     body (“read and follow …”).  
   - Else if handoff `recipePath` exists and is readable via Shell → keep it,
     but note Read may block `.superskill`.  
   - Else if `$WORKFLOWS/<id>/SKILL.md` exists in full-materialize mode → point
     at that file.  
4. Final body template when rewriting:

```text
When this skill is invoked, read and follow the canonical skill file at:
<ABSOLUTE_RECIPE_PATH>

Pass any user arguments through unchanged, and resolve any resources referenced
by that skill from the directory containing it.
```

5. `name` defaults to `id` when absent.

### 5. Register (or dry-run)

**Dry-run:** print table of `id`, plugin, recipe path choice, workflow present?;
no writes.

**Live:** for each record in order, call once:

- Tool: host state update for skills (`update_state`)  
- `target`: `skill`  
- `action`: `write`  
- `id`: record id  
- `name`: record name  
- `description`: record description (keep ≤ ~500 chars if the host is picky;
  prefer the handoff description’s first paragraph)  
- `body`: payload body from step 4  

Rules:

- **One attempt per id** this run.  
- On success → `ok`.  
- On failure → `failed` with short reason; **continue** with the rest.  
- Never `action: delete`.  
- Never invent a new id without a workflow folder.

### 6. Verify (lightweight)

After live registration:

1. Mention a few registered ids as `sand-workflow` links if the host supports
   `[name](sand-workflow:<id>)` pills (e.g. `cc-grok-bot-register`, one `sp-*`,
   one `kk-*`, one `cc-*`).  
2. Ask the human to type `/` on **desktop** and confirm ids appear.  
3. Remind: **mobile** may show no `/` hints; they can still send
   `Run /sp-dev-run …` or NL.

Do not claim you can see their picker UI.

### 7. Final report

Send a short summary:

| Metric | Value |
|--------|-------|
| Handoff files | N |
| Skills considered | N |
| ok | N |
| failed | N |
| skipped_missing_workflow | N |
| dry-run | yes/no |

Include failed ids + reasons. If ok > 0, state that slash registration completed
for those ids and that re-running this skill is safe (idempotent refresh).

## Operator copy (superskill install/doctor — paste into product messaging)

After grok-bot install/update:

```text
grok-bot: workflows written; handoff at <dataRoot>/.superskill/grok-bot/register/<plugin>.json
grok-bot: Slash `/` is NOT filled by the CLI.
grok-bot: Ask ANY Grok Bot on this Sand root to: read and follow
          <dataRoot>/workflows/cc-grok-bot-register/SKILL.md
          (or say: "run cc-grok-bot-register" / "consume superskill grok-bot handoff").
grok-bot: Do not expect /cc-grok-bot-register in the picker until that first run succeeds.
```

Doctor should keep slash-registry status **unknown** from CLI and point at the
same Bot skill path — not at a fictional Settings screen.

## Failure playbook

| Symptom | Action |
|---------|--------|
| Empty `register/` | Re-run `superskill install … --targets grok-bot` on the Bot host |
| `skipped_missing_workflow` | Re-install that plugin; handoff without workflows cannot upsert |
| All `update_state` fail with “name and body required” on writes **without** id | Bug: you omitted `id` — always pass `id` |
| “no skill with id exists” and no workflow folder | Install did not publish that id — fix install, don’t create empty registry rows |
| Read fails on `.superskill/...` | Expected; use `~/.agents/skills/...` or Shell; rewrite bodies accordingly |
| User only uses mobile | Complete registration anyway; tell them to verify on desktop `/` or invoke by typed `/id` / NL |

## Idempotency

Re-running after install/update is encouraged. Same ids refresh description/body
in the host registry. Safe to run after every `superskill install`/`update` that
touches grok-bot.

## Implementation notes for superskill packagers

- Ship this file as skill id **`cc-grok-bot-register`** alongside other `cc-*`
  skills so it lands in `workflows/` on grok-bot install.  
- Include it in the grok-bot handoff JSON like any other skill.  
- Prefer absolute, Read-friendly paths when generating handoff `body` /
  `recipePath`.  
- Do **not** add `superskill register`.  
- First-run instructions must use **read this SKILL.md** / NL, not `/` picker.

## Success criteria

- [ ] First run works when invoked via “read and follow this SKILL.md” with an
      empty `/` picker.  
- [ ] `cc-grok-bot-register` is registered before other ids when present.  
- [ ] All handoff ids with existing `workflows/<id>/` are upserted (or listed
      failed with reasons).  
- [ ] User gets clear desktop vs mobile verification guidance.  
- [ ] No workflow folders deleted.
