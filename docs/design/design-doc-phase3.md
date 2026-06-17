# Phase 3 Design — Plugin Adaptation & Script Consolidation

> **Scope guard.** Phase 3 is *cleanup and consolidation only*: rename the `rd3` namespace
> to `cc`, repoint the plugin's skills / subagents / slash commands at the first-class
> `superskill` CLI, delete the obsolete embedded code, and fix the broken `hooks.json`.
> The non-deterministic evaluation methodology (LLM-in-the-loop scoring, Spur orchestration,
> adversarial / tournament evolution) is **deferred to Phase 4** — see [§7](#7-deferred-to-phase-4).

## Goal

Convert the `plugins/cc/` plugin from a self-contained bundle of embedded scripts into a thin
plugin that delegates every lifecycle operation to the global `superskill` CLI built in Phases 1–2.

Concretely:

1. Rename all `rd3` references to `cc` (the plugin's registered name in
   [marketplace.json](file:///Users/robin/xprojects/superskill/.claude-plugin/marketplace.json)).
2. Rewrite the five `SKILL.md` files, five expert subagents, and the surviving slash commands to
   invoke `superskill <type> <op>` instead of `bun scripts/*.ts`.
3. Delete the embedded `scripts/`, `templates/`, script-coupled `references/`, and embedded `tests/`
   whose behavior now lives in the CLI; delete the slash commands that map to no CLI verb.
4. Fix `plugins/cc/hooks/hooks.json`, which currently references non-existent skills.

**Exit criteria** are concrete and checkable — see [§6](#6-verification--exit-criteria).

---

## 0. Ground Truth (verified against the codebase, 2026-06-17)

These facts shaped the plan and supersede the prior draft's assumptions.

| Fact | Evidence |
|------|----------|
| The CLI's **only** per-type verbs are `scaffold`, `validate`, `evaluate`, `refine`, `evolve`. | `apps/cli/src/commands/agent.ts:156–186` (identical surface for command/skill/hook/magent) |
| There is **no** `add`, `adapt`, `emit`, `package`, or `migrate` CLI verb. | `rg "'add'|'adapt'|'emit'|'package'|'migrate'" apps/cli/src/commands/*.ts` → no hits |
| The 25 slash commands are named `*-add`, `*-adapt`, `*-evaluate`, `*-evolve`, `*-refine` (+ `hook-*`, `skill-migrate`, `skill-package`). They do **not** match CLI verb names 1:1. | `ls plugins/cc/commands/` |
| `superskill` is **not on PATH**; `apps/cli/package.json` `bin` points at `dist/index.js`. | `which superskill` → not found |
| `plugins/cc/hooks/hooks.json` references `skills/indexed-context`, `skills/tasks`, `skills/anti-hallucination` — **none exist** in `plugins/cc/`. | `find plugins/cc -type d -name indexed-context` → empty |
| `cc-hooks` has **no `scripts/*.ts`** — its logic is bash (`emitters/*.sh`, `scripts/*.sh`), `schema/*.{json,yaml}`, and `.bats` tests. | `ls plugins/cc/skills/cc-hooks/` |
| ~123 files under `plugins/cc/` contain the string `rd3`. | `rg -l rd3 plugins/cc \| wc -l` |

### Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Scope = cleanup only.** §5 of the prior draft (Spur / adversarial evolution) moves to a Phase 4 design doc. | Keeps Phase 3 shippable and consistent with the current deterministic CLI. |
| D2 | **Invocation = global `superskill` binary.** Skills/agents call **bare `superskill <type> <op>`** (no path, no `bun run`). The binary resolves on PATH via: **dev** — `bun run build` then `bun link` from `apps/cli`; **consumers** — `npm i -g @gobing-ai/superskill` (the published package; v0.1.3 is live). Both expose the `superskill` bin name. | Cleanest UX; matches the existing publish flow; satisfies the "no embedded execution" invariant for consumers. |
| D3 | **Orphaned capabilities (adapt/emit/package/migrate/schema/adapters) are deleted now,** with Phase 4+ follow-ups filed to port them into the CLI or fold into `superskill install`. | Phase 3 stays a clean consolidation; gaps are tracked, not silently lost. |
| D4 | **Namespace = keep skill directory names.** Refs become `cc:cc-agents` (not `cc:agents`); skill dirs stay `cc-agents/` etc. | Minimal file moves; rename is a string substitution, not a directory restructure. |

---

## 1. Namespace Migration (`rd3` → `cc`)

A global string migration across the ~123 affected files. Skill **directory names stay** as
`cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents` (D4); only references change.

### 1.1 Reference classes to migrate

| Reference class | Old form | New form | Where it appears |
|-----------------|----------|----------|------------------|
| Skill invocation | `rd3:cc-agents` | `cc:cc-agents` | SKILL.md, expert agents, command bodies |
| Slash-command callouts | `/rd3:agent-add` | `/cc:agent-add` *(see §3 for verb mapping)* | command examples, agent routing tables |
| Repo path references | `plugins/rd3/skills/...` | `plugins/cc/skills/...` | `expert-agent.md:35,60`, command bodies |
| Companion config | `metadata.openclaw`, `agents/openai.yaml` | renamed/aligned values | every skill dir |
| `SKILL.md` `metadata` | `author: cc-agents`, `platforms:` | unchanged dir name; values aligned | frontmatter |

> [!IMPORTANT]
> **Invariant — Namespace consistency.** After migration, `rg "rd3" plugins/cc/` returns **zero**
> hits. No `/rd3:` or `rd3:cc-` reference may survive in any user-facing prompt or command.

### 1.2 Companion config files (`metadata.openclaw`, `agents/openai.yaml`)

Every skill ships these for non-Claude platforms. They embed the skill description/version. Phase 3
**renames their `rd3`-bearing values** in lockstep with the rest of the migration. (Whether
cross-platform companion generation should instead move into `superskill install` is a Phase 4
question — see §7.)

---

## 2. Command-Surface Consolidation

The embedded scripts are replaced by the global `superskill` binary. Mapping reflects the **actual**
CLI flags (verified in `apps/cli/src/commands/agent.ts` and `operations/evolve.ts`).

| Obsolete local invocation | Replaced by `superskill` | Notes |
|---------------------------|--------------------------|-------|
| `bun scripts/scaffold.ts <name> --path <dir> --template <tier>` | `superskill <type> scaffold <name> --output <dir>` | CLI has no `--template` tier flag; tier selection is a body/template concern. |
| `bun scripts/validate.ts <path>` | `superskill <type> validate <nameOrPath>` | `--strict`, `--json`, `--target` available. |
| `bun scripts/evaluate.ts <path> --scope <scope>` | `superskill <type> evaluate <nameOrPath> --save` | ⚠ **Behavior change, not a rename.** `--scope` (depth) has no CLI equivalent; `--save` controls persistence. |
| `bun scripts/refine.ts <path> --eval` | `superskill <type> refine <nameOrPath> --auto --save` | `--auto` skips interactive prompts. |
| `bun scripts/evolve.ts <path> --propose` | `superskill <type> evolve <name> --propose-only` | verified `evolve.ts:585`. |
| `bun scripts/evolve.ts <path> --apply <id>` | `superskill <type> evolve <name> --accept <id>` | verified `evolve.ts:541`. |

### 2.1 Capabilities with **no** CLI replacement (deleted per D3)

These embedded behaviors are removed in Phase 3 and tracked as Phase 4+ follow-ups (§7):

| Removed capability | Lived in | Phase 4 disposition |
|--------------------|----------|---------------------|
| Cross-platform `adapt` + adapters | `cc-{agents,commands,skills}/scripts/adapt.ts`, `scripts/adapters/` | Fold into `superskill install` conversion pipeline. |
| Hook multi-platform `emit` | `cc-hooks/emitters/*.sh`, `scripts/emit-*.sh` | Port to a `superskill hook emit` verb or `install` dispatch. |
| Abstract-hook schema + linting | `cc-hooks/schema/*`, `scripts/hook-linter.sh` | Port schema into CLI `hook validate`. |
| Skill `package` | `cc-skills/scripts/package.ts` | Port to a `superskill skill package` verb. |
| Skill `migrate`/merge | `cc-skills/scripts/skill-migrate.ts` | Port to a `superskill skill migrate` verb. |

---

## 3. Slash-Command Disposition (all 25)

Each command file gets one of three dispositions. There is **no `add`/`adapt` CLI verb**, so
`*-add` rewrites to `scaffold` and `*-adapt` is deleted.

### 3.1 Rewrite to a CLI verb (17 commands)

| Command file | `superskill` verb invoked |
|--------------|---------------------------|
| `agent-add`, `command-add`, `magent-add`, `skill-add` | `<type> scaffold` |
| `agent-evaluate`, `command-evaluate`, `magent-evaluate`, `skill-evaluate` | `<type> evaluate` |
| `agent-refine`, `command-refine`, `magent-refine`, `skill-refine` | `<type> refine` |
| `agent-evolve`, `command-evolve`, `magent-evolve`, `skill-evolve` | `<type> evolve` |
| `hook-validate` | `hook validate` |

> Each rewritten command keeps its current file name (and therefore its `/cc:agent-add` slash
> spelling) — only the body delegates to `superskill`. Renaming files to verb names
> (`agent-scaffold`) is **out of scope**; flagged as an optional Phase 4 ergonomics pass.

### 3.2 Delete — no CLI verb (8 commands)

`agent-adapt`, `command-adapt`, `magent-adapt`, `hook-emit`, `hook-list`, `hook-setup`,
`skill-migrate`, `skill-package`.

> [!NOTE]
> Deleting these removes user-facing entry points to capabilities the CLI does not yet have (D3).
> Phase 4 follow-ups (§7) restore them once the CLI gains the corresponding verbs.

### 3.3 Known gap (documented, not fixed here)

`agent`, `command`, `magent`, `skill` have **no `*-validate` slash command** today (only
`hook-validate` exists), even though the CLI supports `validate` for all five types.

> [!NOTE]
> **`hook-validate` is transitional.** Phase 3 keeps it (it's one of the 17 rewrites, §3.1). Phase 4
> **P4-D3 deletes it** — `validate` is hidden behind evaluate/refine/evolve as an internal gate, with
> **no `*-validate` slash command** for any type. So do not treat the 17/8 split as the steady state:
> after Phase 4 the surface is **16 commands** (`hook-validate` removed), no `*-validate` added. Phase 3
> does not add the four missing `*-validate` commands — that earlier "small Phase 4 enhancement" framing
> is **superseded by P4-D3** (hide, don't add).

---

## 4. Refactoring Plan

### 4.1 Skill instructions (`SKILL.md` × 5)

Rewrite the Quick Start, Operations, and Operation Workflow sections to invoke
`superskill <type> <op>` (D2). Remove the `scripts/*.ts` references and the
"Hybrid Workflow Architecture / scripts" framing. Drop the `adapt`/`package`/`migrate` operation
rows (deleted per D3).

Affected: `cc-agents`, `cc-skills`, `cc-commands`, `cc-hooks`, `cc-magents` `SKILL.md`.

### 4.2 Expert subagents (`agents/expert-*.md` × 5)

Update prompt instructions, the **Skill Invocation** table, operation-routing tables, and
`skills:` frontmatter to reference `cc:cc-<type>` and `superskill <type> <op>`. Fix hardcoded
`plugins/rd3/skills/...` paths (`expert-agent.md:35,60` and siblings). Remove routing rows for
deleted operations.

Affected: `expert-agent`, `expert-skill`, `expert-command`, `expert-hook`, `expert-magent`.

### 4.3 Slash commands (`commands/*.md`)

Apply §3 dispositions: rewrite 17 to delegate to `superskill`, delete 8.

### 4.4 Fix `hooks/hooks.json` (Critical)

The current file wires three SessionStart/PreToolUse/Stop hooks to `${CLAUDE_PLUGIN_ROOT}/skills/{indexed-context,tasks,anti-hallucination}/...` — **none of which exist in `plugins/cc/`**.
Installing the plugin breaks the session lifecycle.

**Decision needed at implementation time** (the design records both acceptable resolutions):
- **(a) Strip** the dangling hook entries, leaving an empty/minimal `hooks.json`. Simplest; zero runtime risk.
- **(b) Re-point** to skills that actually ship (or vendor the three skills into `plugins/cc/`).

Phase 3 ships **(a)** unless those three skills are deliberately added to the plugin.

---

## 5. Deletion & Cleanup

Once §4 refactors land and reference no deleted path, remove the embedded code. **Applies to all
five skills**, not just `cc-agents`.

### 5.1 Directories to delete (per skill, where present)

- `plugins/cc/skills/<skill>/scripts/` (incl. `adapters/`, `commands/`)
- `plugins/cc/skills/<skill>/templates/`
- `plugins/cc/skills/<skill>/tests/` — these test the deleted scripts; they are dead after removal.
- `plugins/cc/skills/cc-hooks/{emitters,schema}/` — bash/JSON-schema machinery with no CLI home (D3).

### 5.2 Files / references to delete

- `plugins/cc/skills/<skill>/references/scripts-usage.md` (and any reference that documents the
  removed scripts/operations).
- `references/` link lines inside `SKILL.md` pointing at removed files.
- The 8 orphaned command files (§3.2).

> [!IMPORTANT]
> **Ordering invariant.** Delete embedded code **only after** §4 rewrites no longer reference it.
> Run `rg "scripts/" plugins/cc/` and `rg "bun .*\.ts" plugins/cc/` → both must be empty before
> deletion is considered complete.

---

## 6. Verification & Exit Criteria

All must hold before Phase 3 is "done":

1. `rg "rd3" plugins/cc/` → **zero** hits (Invariant: namespace consistency).
2. `rg "bun .*scripts/.*\.ts" plugins/cc/` → **zero** hits (Invariant: no embedded execution).
3. `find plugins/cc -type d \( -name scripts -o -name templates -o -name tests -o -name emitters -o -name schema \)` → empty.
4. `plugins/cc/hooks/hooks.json` references only skills that exist (or is minimal/empty); a fresh
   session start does not fail a hook.
5. The 8 orphaned command files are gone; the 17 survivors delegate to `superskill <type> <op>`.
6. The global `superskill` binary resolves on PATH (D2): `bun run build` then `bun link` (dev) is
   exercised — `which superskill` resolves and bare `superskill agent validate <file>` runs against a
   sample. The `superskill` bin name is confirmed (`apps/cli/package.json:21` → `dist/index.js`);
   consumer install is `npm i -g @gobing-ai/superskill`.
7. Root verification gate passes: `bun run lint`, `bun run test`, `bun run build`,
   `git status` shows only intentional changes.

---

## 7. Deferred to Phase 4

Captured so nothing is lost; **not** built in Phase 3.

1. **Non-deterministic quality layer** — LLM-in-the-loop scoring, versioned/upgradeable rubric
   config, the "machinery vs. brain" split (prior draft §5.1–5.2).
2. **Spur / Spur-agent orchestration** for multi-step evolution workflows (prior draft §5.3).
3. **Adversarial & anti-loop safeguards** — skeptic/refuter persona, tournament selection,
   immutable goal anchoring, double-loop gate (prior draft §5.4).
4. **Restore deleted capabilities as CLI verbs** (D3): `adapt`→`install` pipeline, `hook emit`,
   `hook` schema/lint, `skill package`, `skill migrate`.
5. **Slash-command ergonomics** — optionally rename `*-add` files to `*-scaffold`. (NOTE: the original
   "add `*-validate` for agent/command/magent/skill" idea is **dropped** — Phase 4 P4-D3 *hides*
   `validate` behind evaluate/refine/evolve and removes `hook-validate`; no `*-validate` commands ship.)
6. **Companion-config strategy** — decide whether `metadata.openclaw` / `agents/openai.yaml`
   should be generated by `superskill install` rather than hand-maintained per skill.

---

## 8. Invariants

1. **Namespace consistency.** The plugin namespace prefix is globally `cc`; no `/rd3:` or `rd3:cc-`
   reference survives in user-facing prompts or commands.
2. **Binary dependency.** Plugin commands invoke the global `superskill` CLI (D2), never localized
   build scripts.
3. **No embedded code execution.** No script-runner files, templates, or schemas are bundled inside
   `plugins/cc/`; capability lives in the CLI.
4. **Deletion ordering.** Embedded code is deleted only after all refactors stop referencing it
   (§5 ordering invariant).
5. **Capability parity is tracked, not assumed.** Any embedded behavior deleted without a CLI
   equivalent has a corresponding Phase 4 follow-up (§7).
