---
name: grok-bot-register
description: >-
  Recover Grok Bot registration after superskill install/update: validate Sand
  handoffs and use a verified preserving host method, or report pending.
  Triggers: "register grok-bot skills", "consume superskill handoff",
  "slash picker empty after superskill install", "bulk register cc/sp/kk",
  "/cc-grok-bot-register". Separates registration, enablement and observed invocation.
---

# Grok Bot slash registration (post–`superskill install`)

## Purpose

`superskill install <plugin> --targets grok-bot` writes skill files under
`$SAND_DATA/workflows/` and prepares **registration handoffs**, but it does
**not** fill the chat `/` autocomplete by itself.

Filesystem preparation does not establish host registration. Inspect the actual
Bot's available tools, schema and ownership semantics before attempting a write.
The supplied `update_state`, target `skill`, action `write` contract is a hypothesis
until verified on that host. Without a supported preserving method, report pending.

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

3. After registration and any required per-Bot enablement, verify the desktop
   `/` entry and invoke it. Report mobile discovery and typed-id behavior only
   when observed on that client; neither is guaranteed here.

For a plugin-scoped install, pass `--plugin <installed-plugin>` when following
this file. Omit it only when the operator requests all handoffs.

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

## Host capability evidence

| Evidence | Implication |
|------|-------------|
| [Official skills documentation](https://docs.x.ai/grok-bot/skills-routines-and-automations), checked 2026-09-10 | Documents desktop slash references and private-skill enablement under Settings > Plugins > Yours. It does not document the registration tool schema. |
| Supplied `update_state` write/upsert/delete behavior | Unverified until the actual host schema and preserving behavior are established. Never delete as part of recovery regardless of deletion semantics. |
| Hidden-path Read denial | A host-dependent possibility. Try permitted Shell reading of the same canonical file; if neither works, report unsupported. |
| Mobile hints and typed-id invocation | Unverified until observed separately on that client. |

Record host/version, the actual schema, registry identity/readback support and
serialization behavior separately from installing-CLI capability. A Bot-only tool
does not make CLI registration automatic. Do not invent a transport or registry file.

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

1. Match `resolveSandRoot`: a supplied `SAND_DATA` is authoritative. Trim it and
   reject blank, relative, URL/SSH locator, missing or non-directory values.
   Resolve symlinks; reject broken links and roots named `managed-skills`,
   `plugins` or `plugin-skills` after resolution. Never fall back on invalid input.
2. Otherwise select existing `~/sand-data` first (broken/invalid roots are errors),
   then an existing `~/agent-data` directory containing `workflows` or `managed-skills`.
   The latter need not alias `sand-data`. Apply the same real-directory/protected-root checks.
3. Recovery creates no root. If no root resolves, or its workflows are missing,
   report the exact missing path and instruct install on the Bot host.

Set:

- `DATA_ROOT` — Sand root  
- `WORKFLOWS` — `$DATA_ROOT/workflows`  
- `HANDOFF_DIR` — `$DATA_ROOT/.superskill/grok-bot/register`  

If `HANDOFF_DIR` is missing or empty: stop. Tell the user to run
`superskill install <plugin> --targets grok-bot` **on this Bot host** first
(laptop without Sand data cannot register).

### 2. Load handoff files

Read only this root's `$HANDOFF_DIR/*.json`, sorted by basename (or only
`--plugin`, validated as a safe single segment before constructing its path).
Check the real handoff directory and files remain inside this Sand root before reading.

Expected top-level shape (schemaVersion must equal exactly `1` — unsupported versions are reported,
not attempted):

```json
{
  "schemaVersion": 1,
  "target": "grok-bot",
  "plugin": "sp",
  "dataRoot": "/home/box/sand-data",
  "source": { "channel": "marketplace", "locator": "/home/box/plugins/sp" },
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

Validate before any host write:

- Catch malformed JSON per file. Require an object, exact `schemaVersion: 1`,
  `target: grok-bot`, a safe plugin matching the selected filename, source channel
  `bundled` or `marketplace` with nonempty locator, matching real `dataRoot`,
  `materialize: bridge|full` and a `skills` array. Invalid envelopes reject that file.
- Each record requires nonempty string id/name/description/body, mode equal to
  materialize, absolute recipePath, frontmatter object, and resources object with
  string values (arrays are invalid). Reject `.`, `..`, separators and NUL in ids.
  Reject invalid records individually; independent valid records remain eligible.
- Resolve workflow, canonical recipe and resource paths including symlink aliases.
  Require the expected `workflows/<id>/SKILL.md` for full or
  `.superskill/grok-bot/skills/<id>/SKILL.md` for bridge within this root.
  Resources must be relative paths contained beside that recipe, never absolute,
  traversal or symlink escapes, and must match installed bytes.
- Require the actual workflow SKILL.md and valid `.superskill-origin.json`;
  compare schema, target, plugin, source channel/locator, mode and canonicalPath.
  Check SHA-256 hashes of every managed file; bridge also validates canonical
  ownership/hashes. Compare handoff body/metadata/resources to the current recipe,
  not just a current marker: stale handoffs are rejected even when installed hashes match.
  Report missing workflows as skipped_missing_workflow; foreign/drifted entries
  as conflict. Do not reset hashes to disguise drift.

Report every malformed file and rejected id with its reason and continue independent work.

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

If self is absent from valid selected handoffs, report it missing and instruct
reinstalling cc for grok-bot. Do not synthesize a record or widen the plugin filter.

### 4. Build the upsert payload per skill

For each record:

1. Use only records passing every validation in step 2.
2. **Require** `$WORKFLOWS/<id>/SKILL.md` to exist with a superskill-owned, current
   ownership marker. If missing, mark **skipped_missing_workflow** — do not call delete; tell the
   user to re-install that plugin for grok-bot.  
3. **Recipe path selection (never use file existence alone as identity):**  
   - **Default: the existing Bot canonical tree from the handoff.** Keep handoff `recipePath` when the
     runtime can read it; if `Read` denies the hidden `.superskill` path, use the **authorized Shell
     tool** to read that exact path, and only mark the entry **unsupported** when neither tool is
     actually readable (a filesystem existence check is not proof of a successful read).  
   - An entry under `~/.agents/skills/<id>/` may be stale, foreign-dialect, or a different source —
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

5. Preserve the exact name, description, custom frontmatter, invocation restrictions
   and resource files through the verified serializer. A host `body` field is not
   proof that nested YAML or resources survive. If preservation cannot be established,
   report unsupported and leave original files intact.

### 5. Register (or dry-run)

**Dry-run:** print id, plugin, mode, actual recipe path and validation disposition;
no host, workflow or registry writes, including self registration.

**Capability gate:** inspect the live tool schema and supported upsert/serialization
semantics first. Establish registry identity independently of folder existence;
reject foreign registry collisions. Unknown identity or unverified upsert behavior
is pending, even with valid filesystem ownership. Unavailable tools mean zero
attempts and pending/unattempted for eligible ids. No guessed calls.

**Live:** only if this exact schema is verified, use the following supplied contract;
otherwise use a documented preserving equivalent or report unsupported. Call once per id:

- Tool: host state update for skills (`update_state`)  
- `target`: `skill`  
- `action`: `write`  
- `id`: record id  
- `name`: record name  
- `description`: record description **unchanged** — no silent truncation or metadata stripping without a
  documented host limit and a preserving policy; if the host rejects it, report the failure and keep the
  handoff's exact text  
- `body`: payload body from step 4  
- Frontmatter/resources: map through the actual verified host fields/serializer;
  if unsupported, do not write a lossy subset.

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

Report desktop picker and invocation observations separately. Mobile hints and
typed-id behavior remain unverified without a client-specific observation.

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
| pending/unattempted | N |
| attempted (ok + failed calls) | N |
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

Only name the recovery file when installed; otherwise use the scoped handoff prompt
from install output. Dry-run paths are prospective. Doctor keeps slash-registry status
unknown; a missing root gets root-repair guidance. Preserve official per-Bot enablement guidance.

## Failure playbook

| Symptom | Action |
|---------|--------|
| Empty `register/` | Re-run `superskill install … --targets grok-bot` on the Bot host |
| `skipped_missing_workflow` | Re-install that plugin; handoff without workflows cannot upsert |
| All `update_state` fail with “name and body required” on writes **without** id | Bug: you omitted `id` — always pass `id` |
| “no skill with id exists” and no workflow folder | Install did not publish that id — fix install, don’t create empty registry rows |
| Read fails on `.superskill/...` | Use the authorized Shell tool to read that exact canonical path; if neither Read nor Shell can read it, mark the id unsupported and report — never rewrite bodies to `~/.agents/skills` |
| User only uses mobile | Report only observed client behavior; desktop discovery and invocation remain unverified until tested |

## Idempotency

Re-running revalidates current handoffs, filesystem drift and registry identity,
then refreshes the same ids only through verified preserving upserts. A prior success
does not waive checks. Host writes changing managed bytes remain drift for doctor,
reinstall, update and prune; never rehash automatically. Filesystem prune grants no
authority to delete host registry entries. Host side effects are never claimed rolled
back by a filesystem transaction.

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
