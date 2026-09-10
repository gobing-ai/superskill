# Patch Spec: grok-bot `/` slash registry (superskill)

| Field | Value |
|-------|--------|
| Status | Ready for implementation |
| Package | `@gobing-ai/superskill` (baseline with `grok-bot` target: **0.3.22+**) |
| Spec type | **Standalone patch** — do not require reading or merging `superskill_grok_bot_target_SPEC.md` |
| Related (optional context only) | Original target SPEC assumed FS → `/` visibility; that assumption is **false** |
| Verified on | Grok Bot host (`$SAND_DATA=/home/box/sand-data`), 2026-09-09 → 2026-09-10 |
| Authoring | Live dogfood: cc / sp / kk install, agent relaunch, `update_state` re-register, user `/` picker check |

---

## 1. Problem

`superskill install … --targets grok-bot` writes skills under:

`$SAND_DATA/workflows/<id>/SKILL.md`

and `superskill doctor --targets grok-bot` reports **OK**.

Operators still **do not** see `sp-` / `cc-` / `kk-` skills in the Grok Bot chat **`/` autocomplete** after install or agent relaunch.

The original `grok-bot` target SPEC treated “files in `workflows/`” as “visible in `/`”. That is incorrect against the live host.

---

## 2. Goals

1. Document the **real** host model (filesystem vs slash registry) as the source of truth for this patch.
2. Specify superskill changes so install/update/doctor/register align with that model.
3. Define a **register** seam the Bot agent can run (`update_state` skill writes) until the host indexes `workflows/` itself.
4. Keep `grok` (Build CLI) and other targets unchanged.
5. Ship acceptance tests and operator messaging that never claim slash-visible from FS alone.

---

## 3. Non-goals

- Fixing the Grok Bot host binary / client (preferred long-term, out of superskill’s control).
- Unifying target ids `grok` and `grok-bot`.
- MCP / connector install.
- Requiring edits to `superskill_grok_bot_target_SPEC.md` (this file is self-contained).

---

## 4. Root cause (verified)

Grok Bot keeps a **host skill registry** that drives the chat `/` picker.

| Layer | What it is | Slash `/`? |
|-------|------------|------------|
| `$SAND_DATA/workflows/<id>/SKILL.md` | On-disk skill files (superskill writes here) | **No** by itself |
| Host skill registry | Entries created/refreshed via Bot `update_state` skill API | **Yes** |
| Agent prompt `agent_skills` | Separate injection surface; may list some workflow paths | Not the user picker |

### Registry API behavior (live)

| `update_state` skill action | Disk (`workflows/`) | `/` registry |
|-----------------------------|---------------------|--------------|
| FS-only superskill write | Create/update SKILL.md (+ `.superskill-origin.json`) | **No change** |
| **write** with existing `id` | Rewrites SKILL.md (preserves extra keys e.g. `canonical:`) | **Refresh / re-register** |
| **write** without `id` (create) | — | **Broken** — error: `name and a non-empty body are both required` even when both are supplied |
| **write** with unknown `id` | — | Rejected — `no skill with id … exists` |
| **delete** `id` | Removes workflow folder | Removes registry entry |

### Ad-hoc proof

1. After superskill 0.3.22 FS install of cc/sp/kk: **112** workflows, doctor OK, `/` showed **none** of them (user confirmed).
2. Re-register curated ids via `update_state` write **with** `id` (e.g. `sp-dev-run`, `kk-topic`, `cc-anti-hallucination`).
3. User confirmed those curated skills **appear in `/`**.
4. Brand-new ids cannot be created into the registry until the host fixes **create** or starts **scanning `workflows/`**.

---

## 5. Corrected host facts

Replace the false invariant “workflows files ⇒ `/` GUI”.

| Item | Correct behavior |
|------|------------------|
| Data root | `$SAND_DATA` (default `$HOME/sand-data`; Bot example `/home/box/sand-data`) |
| Symlink | `$HOME/agent-data` → `$HOME/sand-data` |
| On-disk install root | `$SAND_DATA/workflows/<id>/SKILL.md` (+ optional `$SAND_DATA/.superskill/grok-bot/skills/<id>/` canonical for bridge mode) |
| Slash `/` visibility | Host registry only (today: `update_state` skill write with known `id`) |
| Managed skills | `$SAND_DATA/managed-skills/` — do not write |
| Doctor FS OK | Means files + markers look healthy — **not** slash-visible |

Skill file contract unchanged: YAML frontmatter with `name` + required `description`, then markdown body.

---

## 6. Proper solutions (priority)

### A. Host (preferred, outside superskill)

Make `/` index `$SAND_DATA/workflows/*/SKILL.md` (scan on agent start and/or watch). Then superskill FS install is sufficient.

### B. Host (alternative)

Fix skill **create** and/or expose bulk register so new ids can enter the registry after FS write.

### C. superskill adaptation (this patch — required until A or B)

1. Keep writing `workflows/` (bridge default or `--materialize full`).
2. Add a **register** pipeline that emits payloads for Bot `update_state` skill writes.
3. Never market doctor FS OK as “visible in `/`”.
4. Document the known-id limitation until A/B land.

---

## 7. Superskill patch requirements

### 7.1 Invariant (new)

**grok-bot enablement for `/` = on-disk workflows + host registry registration.**  
FS write alone is incomplete.

### 7.2 Install / update (keep)

- Continue resolving `$SAND_DATA`, writing bridges or full materialize, origin markers, prune owned ids.
- After a successful grok-bot write batch, **print a clear next step**: registry registration required for `/` (point at `superskill register` or the emitted checklist).

### 7.3 New command: `superskill register`

```text
superskill register --targets grok-bot
  [--plugin <id>|--all-installed]
  [--format json|markdown|agent-prompt]
  [--dry-run]
```

**Behavior:**

1. Discover installed grok-bot skills (from `$SAND_DATA/workflows/*/.superskill-origin.json` and/or manifests under `$SAND_DATA/.superskill/`).
2. For each skill id, emit a registration record:

```json
{
  "id": "sp-dev-run",
  "name": "sp-dev-run",
  "description": "<when-to-use from frontmatter>",
  "body": "Read and follow the full skill recipe at `$SAND_DATA/.superskill/grok-bot/skills/sp-dev-run/SKILL.md` (and any `references/` beside it). Adapt tool names to Grok Bot tools when needed. Pass through user arguments."
}
```

3. Formats:
   - **json** — machine-readable list for tooling.
   - **markdown** — operator checklist.
   - **agent-prompt** (default for humans on Bot) — a single pasteable instruction: “For each record, call `update_state` target skill action write with id/name/description/body.”

4. Exit non-zero if no grok-bot skills found when `--targets grok-bot` was requested.

**Body rules:** Prefer absolute canonical path under `$SAND_DATA/.superskill/grok-bot/skills/<id>/SKILL.md` when bridge mode; for `--materialize full`, body may say “follow this workflow’s SKILL.md recipe” or inline a short pointer to the same folder. Do **not** rely on thin stub text alone (“Edit the canonical copy…”) as the registered body — the Bot must be instructed to **read and follow** the recipe.

### 7.4 Optional: `superskill install … --register-checklist`

Flag on install that writes:

`$SAND_DATA/.superskill/grok-bot/register/<plugin>-<timestamp>.json`

and prints the path + agent-prompt summary. Does not call Bot APIs (superskill has no host `update_state` from CLI).

### 7.5 Doctor changes

`superskill doctor --targets grok-bot` must report **two** axes:

| Check | Meaning |
|-------|---------|
| `fs` | workflows + origin markers + SAND_DATA resolve |
| `slash-registry` | **unknown** from CLI unless a future host API exists; until then print **WARN**: “FS OK ≠ visible in `/`. Run `superskill register --targets grok-bot` and have the Bot agent apply update_state writes.” |

Do not print a green “ready for `/`” on FS alone.

### 7.6 Docs / CLI help

- README + entity_locations: `grok` ≠ `grok-bot`; `/` needs registry registration.
- Help text for `install` / `doctor` / new `register`.
- Known limitation box: **create of new registry ids is broken on host**; only ids already present in the Bot registry can be refreshed via `update_state` write with `id`. Full catalogs need host fix A or B.

### 7.7 Bridge pointer quality (small fix)

Improve `renderBridgePointer` (or equivalent) so the on-disk bridge body also says **Read and follow** the canonical SKILL.md (not only “full skill lives at” / “edit the canonical copy”). Aligns disk stubs with register payload semantics.

---

## 8. Bot-agent registration procedure (operator)

Run on the **Bot host** after `superskill install … --targets grok-bot`:

1. `superskill register --targets grok-bot --format agent-prompt`
2. Paste into Grok Bot chat (or ask the agent to run the checklist).
3. Agent executes, for each id that **already exists** in the host registry:

   `update_state` → target `skill`, action `write`, fields `id`, `name`, `description`, `body`

4. Operator types `/` and confirms ids appear.
5. Ids never before registered: expect failure until host create/FS-scan — document, do not spin forever.

### Curated ids proven refreshable (2026-09-10)

`sp-dev-next`, `sp-dev-run`, `sp-dev-plan`, `sp-dev-refine`, `sp-dev-verify`, `sp-dev-gtd`, `sp-dev-gitmsg`, `sp-dev-debug`, `sp-brainstorm`, `sp-code-review`, `sp-super-coder`, `kk-storm-research`, `kk-topic`, `kk-explain-things`, `cc-anti-hallucination`

These are the dogfood set that appeared in `/` after register-via-`update_state`. Treat as the minimum regression pack.

---

## 9. Testing

- Install grok-bot only → files exist; stdout mentions register / slash caveat.
- `register --format json` → one object per owned workflow id; required keys present; description non-empty.
- `register` with empty workflows → non-zero + actionable error.
- Doctor grok-bot → FS section + slash-registry WARN (no false “slash ready”).
- Dry-run register → no writes.
- Re-install idempotent; prune only owned markers.
- Regression: `grok` target install path unchanged.
- Dogfood: after Bot applies register payloads for curated ids, `/` lists them (manual / agent-assisted).

---

## 10. Acceptance criteria

- [ ] This patch SPEC is the implementation brief (no dependency on updating the old target SPEC file).
- [ ] `superskill register --targets grok-bot` exists with json / markdown / agent-prompt.
- [ ] Install/doctor messaging never claims `/` visibility from FS alone.
- [ ] Bridge body instructs Read-and-follow canonical (or full workflow) recipe.
- [ ] Docs state registry model + create limitation.
- [ ] Curated pack can be re-registered via Bot `update_state` and confirmed in `/`.
- [ ] `grok` Build CLI target unchanged.

---

## 11. Phases

| Phase | Work |
|-------|------|
| **P0** | Docs + install/doctor WARN copy (stop lying about `/`) |
| **P1** | `superskill register` + `--register-checklist` on install |
| **P2** | Bridge body Read-and-follow fix |
| **P3** | Tests + dogfood script for curated pack |
| **P4** (optional) | When host ships FS scan or create fix, collapse register to no-op / deprecate WARN |

---

## 12. Out of scope / host asks (track separately)

1. Host: index `workflows/` for `/` (best fix).
2. Host: fix `update_state` skill **create** (currently unusable).
3. Host: bulk register API callable from CLI without a chat agent.

Until those land, superskill’s job is honest FS install + a crisp register seam for the Bot agent.

---

## 13. Invariant (final)

**`$SAND_DATA/workflows/` is necessary. Host registry registration is necessary for `/`. Doctor FS OK is not slash-visible.**

