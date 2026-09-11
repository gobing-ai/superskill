---
name: grok-bot-register
description: >-
  Use after superskill install/update for target grok-bot (or when slash `/`
  skills are missing despite workflows on disk). Discovers
  $SAND_DATA/.superskill/grok-bot/register/*.json handoffs, upserts every skill
  into the Grok Bot host slash registry via update_state while preserving each
  handoff's Bot-owned canonical recipe paths, verifies outcomes, and tells the
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
   `/cc-grok-bot-register` on **desktop**. Mobile may show fewer/`no` `/` hints (unverified claim across
   all clients — treat as observed difference, not universal); typing the id or NL phrasing still works.

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
| Bot `Read` may **block** `$SAND_DATA/.superskill/...` | Use the authorized Shell tool to read that exact canonical path (a filesystem existence check is not proof of a successful read); do NOT switch recipe paths to `~/.agents/skills` merely because an entry exists — it may be stale/foreign; Shell can always read `.superskill` if permitted |
| Mobile may lack `/` autocomplete | Discovery gap only; NL / full `/id` text still reaches the Bot |

## Inputs

Optional user args (free text):

- `--plugin <id>` — only consume `register/<id>.json` (e.g. `sp`, `cc`, `kk`)
- `--dry-run` — list what would be registered; no `update_state` writes
- `--self-only` — register only `cc-grok-bot-register` (bootstrap aid)
- No args — consume **all** `register/*.json` handoffs

Flags **intersect**: `--plugin cc --self-only` selects only self within the cc handoff. Self-first is an
ordering rule, never a filter bypass: the self id must already belong to the selected eligible set. An
empty selection (no handoffs, or a filter that matches nothing) is an explicit no-op — say so and name
the reinstall step instead of pretending success. Missing/unknown/non-flag arguments produce actionable
usage guidance (list the four forms above), not a guess. Register self first **only when self belongs to
the selected set**; the remaining ids are processed once each in stable id order.

## Procedure

### 0. Announce

Tell the user you are consuming superskill grok-bot registration handoffs into
the slash registry (and whether dry-run).

### 1. Resolve Sand root

1. If `SAND_DATA` is set: it is authoritative. If `$SAND_DATA/workflows` does
   not exist, **stop with an explicit error** (name the variable, the missing
   path, and the repair step) — never silently fall back to a different root.
2. Else pick the first that works: `~/sand-data` if `workflows` exists; then
   `~/agent-data` if it resolves to the same tree (symlink) and `workflows` exists.  

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

Expected top-level shape (schemaVersion must equal exactly `1` — unsupported versions are reported,
not attempted):

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
      "resources": { "relative/path.txt": "file content" }
    }
  ]
}
```

Skip files that are not objects, carry the wrong `target` or `mode`, break the nonempty id/name/
identity/description/body requirements, use an unsafe (non-single-segment) id or a resource path that
escapes the recipe directory, cite a `dataRoot` that normalizes to a different Sand root than the one
you resolved, or a workflow folder whose ownership marker is missing, malformed, foreign, or drifted.
Report every skip with its reason and continue with independent valid records.

If a skill id appears in multiple valid handoffs: compare origin (plugin/source) and payload;
byte-equivalent duplicates may be coalesced; a contradictory duplicate (different plugin, source or
content) is a **conflict** with **zero writes for that id** — never apply a silent last-file-wins,
and never let sorted order assign ownership. Foreign or drifted workflow folders are reported,
not overwritten.

### 3. Self-first ordering

Partition records:

1. **Self** — `id == cc-grok-bot-register` when it belongs to the selected eligible set (from a valid
   handoff record only; synthesizing from another plugin's handoff must never widen a `--plugin` filter)  
2. **Others** — everything else, stable sort by `id`

Always process **self first** when self is selected, so later desktop sessions can use
`/cc-grok-bot-register` once the first run succeeds.

If this skill’s current, owned, drift-free workflow folder exists (marker validates ownership and source
identity) but is not in any handoff, optionally synthesize a record **for self only**:

- `id` / `name` / `description`: from this file’s frontmatter (exact description, no truncation)  
- `body` and `mode`/`recipePath`: preserved from the installed recipe this Bot can actually read; the
  body must cite the real recipe file it instructs future runs to follow (**never** a pointer to the
  registry row itself, which a preserving write would overwrite)

Otherwise do not synthesize: report self missing and instruct re-installing the cc plugin for grok-bot.

### 4. Build the upsert payload per skill

For each record:

1. **Require** `id`, non-empty `description`, and a non-empty body (handoff
   `body` or synthesized).  
2. **Require** `$WORKFLOWS/<id>/` to exist (and ideally `SKILL.md`) with a superskill-owned, current
   ownership marker. If missing, mark **skipped_missing_workflow** — do not call delete; tell the
   user to re-install that plugin for grok-bot.  
3. **Recipe path selection (never use file existence alone as identity):**  
   - **Default: the existing Bot canonical tree from the handoff.** Keep handoff `recipePath` when the
     runtime can read it; if `Read` denies the hidden `.superskill` path, use the **authorized Shell
     tool** to read that exact path, and only mark the entry **unsupported** when neither tool is
     actually readable (a filesystem existence check is not proof of a successful read).  
   - An entry under `$AGENTS_SKILLS/<id>/` may be stale, foreign-dialect, or a different source —
     **do not prefer it merely because the file exists**; it is deliberately ignored for recipe
     selection (the canonical tree preserves arguments/resources and source identity).  
   - **Full materialize:** the body must keep the complete real recipe, custom frontmatter and
     resources — NEVER replace it with a body pointing back at `$WORKFLOWS/<id>/SKILL.md`, including
     symlink or relative aliases, because a preserving host write overwrites that same file. If the
     host body field cannot preserve recipe content, mark **unsupported** and leave the original
     files intact.  
4. Final body template **only for bridge records whose body cites the canonical recipe** (never a
   blanket rewrite of full-mode bodies):

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
- `description`: record description **unchanged** — no silent truncation or metadata stripping without a
  documented host limit and a preserving policy; if the host rejects it, report the failure and keep the
  handoff's exact text  
- `body`: payload body from step 4  

Rules:

- **One attempt per id** per run.  
- On success → `ok` (an acknowledged registration write — not proof of picker visibility or execution).  
- On failure → `failed` with short reason; **continue** with the rest; never retry indefinitely in this run.  
- Never `action: delete`, never delete/recreate, never delete workflow folders.  
- Never invent a new id without a workflow folder; an on-disk id absent from the host registry is eligible
  only after the id, name and body identity checks above; if host upsert-on-existing-folder behavior is
  unknown to this host, report **pending/unverified-registry-behavior** instead of guessing.

### 6. Verify (lightweight)

After live registration, keep the evidence tiers distinct:

1. **Acknowledged writes** — the only thing `ok` proves.
2. **Enablement** — still pending/unknown; the operator may need to enable
   the skill/plugin per Bot (Settings > Plugins > Yours); this skill does not auto-enable other Bots.
3. **Picker visibility** — unverified from inside the Bot; ask
   the human to type `/` on **desktop** and confirm ids appear.  
4. **Invocation** — observed only when a run actually executes the skill.

Remind: **mobile** may show no `/` hints (unverified blanket claim — describe observed differences
conditionally); typed `/id` or NL phrasing still reaches the Bot per current official docs.

Do not claim you can see their picker UI.

### 7. Final report

Send a short summary:

| Metric | Value |
|--------|-------|
| Handoff files | N |
| Raw records | N |
| Unique selected ids | N |
| Coalesced duplicates | N |
| ok | N |
| failed | N |
| skipped_missing_workflow | N |
| conflict | N |
| invalid/unsupported | N |
| dry-run | yes/no |

Include each non-success id (or malformed file) and its reason. Every selected unique id ends with exactly
one disposition; `ok` counts acknowledged writes only (never readiness, enablement or visibility).

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
| Read fails on `.superskill/...` | Use the authorized Shell tool to read that exact canonical path; if neither Read nor Shell can read it, mark the id unsupported and report — never rewrite bodies to `~/.agents/skills` |
| User only uses mobile | Complete registration anyway; tell them to verify on desktop `/` or invoke by typed `/id` / NL |

## Idempotency

Re-running after install/update is encouraged. Same ids refresh description/body
in the host registry. Safe to run after every `superskill install`/`update` that
touches grok-bot.

## Implementation notes for superskill packagers

- Ship this file as skill id **`cc-grok-bot-register`** alongside other `cc-*`
  skills so it lands in `workflows/` on grok-bot install.  
- Include it in the grok-bot handoff JSON like any other skill.  
- Keep the handoff's Bot-owned canonical paths in `body` / `recipePath` — do
  not rewrite them to shared skills trees.  
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
