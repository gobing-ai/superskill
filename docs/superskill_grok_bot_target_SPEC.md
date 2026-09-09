# Spec: superskill target `grok-bot` (Grok Bot / Sand host)

| Field | Value |
|-------|--------|
| Status | Draft for implementation |
| Package | `@gobing-ai/superskill` (current published baseline: 0.3.21) |
| Authoring context | Derived from live Grok Bot host behavior (2026-09-08) + existing Pi-style degradation |
| Related products | **Grok Bot** (chat GUI / Sand data root) ≠ **Grok Build CLI** (`grok` binary, target id `grok`) |

---

## 1. Problem

`superskill install` already distributes Claude Code–style plugins (`cc`, `sp`, `kk`, …) to many coding agents. **Grok Bot** (the desktop/chat assistant host) is not a supported install target today.

Operators who already use plugins on Codex, Pi, Claude Code, and Grok Build CLI cannot enable the same skill/command/subagent surface inside **Grok Bot chat** (`/` skill catalog) without hand-copying files.

### Critical distinction

| Id / product | What it is | Where plugins live today |
|--------------|------------|---------------------------|
| `grok` | **Grok Build CLI** (`grok` TUI/headless) | Native: `~/.grok/installed-plugins/` |
| **`grok-bot` (new)** | **Grok Bot** chat host (Sand) | Skills catalog: `$SAND_DATA/workflows/<id>/SKILL.md` |

These must remain **separate** AgentName / `--targets` values. Reusing `grok` for Bot will break Build CLI installs and confuse docs.

---

## 2. Goals

1. Add install target **`grok-bot`** so:

`superskill install <plugin> --targets grok-bot [--marketplace <locator>] [--magent <name>] [--verbose]`

installs the plugin’s skills (and degraded commands/subagents) into the Grok Bot skill catalog.

2. Reuse the **Pi-style degradation** model: slash commands and subagents become **special skills** with stable ids and slight syntax differences — one `/` surface in Grok Bot GUI.

3. Document entity locations, detection of `$SAND_DATA`, dry-run paths, update/prune behavior, and doctor checks.

4. Keep Codex/Pi/`~/.agents/skills` / native `grok` behavior unchanged unless explicitly targeted.

---

## 3. Non-goals (v1)

- Full Claude Code plugin marketplace UX inside Grok Bot (`sand-data/plugins` MCP/official-catalog cache is **not** the Bot skill catalog).
- Native `/plugin:command` slash dialect in Grok Bot chat.
- Claude-style persistent subagent directories or hook runners on Grok Bot.
- Teaching Grok Bot to auto-load `~/.agents/skills` (it does **not** today).
- MCP/connector install via superskill (Cursor connectors are a separate path).
- Unifying target ids `grok` and `grok-bot`.

---

## 4. Host facts (authoritative for this target)

Observed on the Grok Bot machine:

| Item | Path / behavior |
|------|-----------------|
| Data root | `$SAND_DATA` defaulting to `$HOME/sand-data` (example: `/home/box/sand-data`) |
| Symlink | `$HOME/agent-data` → `$HOME/sand-data` (same tree) |
| **Skill catalog (GUI `/`)** | `$SAND_DATA/workflows/<skill-id>/SKILL.md` |
| Managed (read-only) skills | `$SAND_DATA/managed-skills/` — **do not write** |
| Claude marketplace cache | `$SAND_DATA/plugins/` — **not** the skill install destination for v1 |
| `plugin-skills` cache | `$SAND_DATA/plugin-skills/cache.json` — may list remote plugin skills; **empty / not a write API** for superskill v1 |
| Laptop | User’s laptop does **not** contain `~/sand-data`; install for Bot must run **on the Bot host** (or against an explicitly configured remote/mounted `SAND_DATA`) |

### Skill file contract (Grok Bot)

Frontmatter must include `name` and **required** `description` (when-to-use line for `/` discovery), then markdown body. Optional Cursor-only frontmatter keys may be preserved.

---

## 5. Entity mapping

Mirror Pi: **everything user-invocable becomes a skill** under `workflows/`.

| Plugin entity | `grok-bot` v1 mapping | Notes |
|---------------|----------------------|--------|
| Skills | Write/update `$SAND_DATA/workflows/<id>/SKILL.md` (+ optional `references/` if full materialize) | Prefer stable flat ids: `sp-dev-run`, `kk-topic`, `cc-anti-hallucination`, … |
| Slash commands | Degrade → skills (same as Pi/rulesync command→skill adaptation) | Ids like `cc-skill-add`; invoke via `/cc-skill-add` not `/cc:skill-add` |
| Subagents | Degrade → skills (playbook / specialist skill), same family as Pi adaptation | No CreateAgent auto-provision in v1 |
| Hooks | **Skip** + verbose warning | No Bot hook install surface |
| Magent | **Skip or optional note** in verbose log | `$HOME/AGENTS.md` is not Bot’s skill catalog |
| MCP from plugin | **Skip** + warning | Cursor connectors separately |
| Scripts | **Skip** shared-root stage in v1 | |

### Syntax difference (operator-facing)

| Elsewhere | On Grok Bot |
|-----------|-------------|
| `/cc:skill-add` / plugin slash | `/cc-skill-add` (skill id) |
| Native subagent spawn | Invoke degraded skill via `/` |
| Pi `Skill(skill=\"…\")` in bodies | Keep as docs; bridge says read on-disk recipe |

---

## 6. Target detection and configuration

### Env / resolution order for data root

1. `SAND_DATA` if set and directory exists (or creatable)
2. Else `$HOME/sand-data` if it exists
3. Else `$HOME/agent-data` if it exists and looks like Sand (contains `workflows/` or `managed-skills/`)
4. Else: target unavailable — clear error that laptop home is not sufficient; run on Bot host or set `SAND_DATA`

### Target registration

- Add `grok-bot` to `--targets`, help, and docs.
- `all` includes `grok-bot` **only when** detection succeeds; otherwise omit with verbose note.
- Doctor: show `grok-bot` with `available` and resolved `SAND_DATA`.

---

## 7. Write strategy (default: thin bridge)

Plugins remain SSOT. Default: thin bridge SKILL.md in `workflows/` that instructs the Bot to read the canonical on-disk skill.

**Path:** `$SAND_DATA/workflows/<id>/SKILL.md`

Bridge body must: (1) require reading `<canonical>/SKILL.md` + relatives, (2) follow that recipe, (3) adapt tools only when needed and say so, (4) treat `/` invocation as entry point and pass args.

**Canonical path priority:** (1) `$HOME/.agents/skills/<id>/` if present, (2) else plugin-tree path from this install, (3) do not prefer `~/.grok/installed-plugins` for Bot bridges.

Optional `--materialize full` copies full SKILL.md + references into workflows.

### Ownership marker

`$SAND_DATA/workflows/<id>/.superskill-origin.json` with plugin, marketplace, mode (`bridge`|`full`), canonical path, superskillVersion, installedAt.

`--prune` only removes workflows that have this marker (or equivalent) for the plugin id set.

---

## 8. Install pipeline integration

1. Resolve plugin — unchanged.
2. Map to `.rulesync` layout — unchanged.
3. Existing engines (Claude, grok native, rulesync…) — unchanged.
4. **New:** if `grok-bot` in targets and SAND_DATA resolved: build flat skill id set (skills ∪ degraded commands ∪ degraded subagents); ensure canonical files exist; write bridges/materialize under `workflows/`.
5. Skip magent/hooks/MCP for grok-bot with warnings.
6. Summary: `grok-bot: N skills at $SAND_DATA/workflows`.

If bridges point at `~/.agents/skills`, materialize that shared root before or during the grok-bot writer.

---

## 9. CLI examples

On the Grok Bot host:

```bash
superskill install cc --targets grok-bot --magent team-stark-children --verbose
superskill install sp --marketplace /path/to/@gobing-ai/spur --targets grok-bot --verbose
superskill install kk --marketplace /path/to/@gobing-ai/knowledge-kit --targets grok-bot
superskill install cc --targets grok-bot --dry-run --verbose
superskill update cc --targets grok-bot
```

Docs: update `entity_locations.md` and README; call out **`grok` ≠ `grok-bot`**.

---

## 10. Testing

- Missing SAND_DATA + targets grok-bot only → actionable failure
- Mixed targets → other targets still install; grok-bot policy documented
- Dry-run → no writes
- Re-install idempotent; prune only owned ids
- Never write without description; never touch `managed-skills/`
- No dependency on `claude` or `grok` CLIs for this target

---

## 11. Acceptance criteria

- [ ] `--targets grok-bot` implemented and documented
- [ ] Skills + degraded commands + degraded subagents under `$SAND_DATA/workflows/` with valid frontmatter
- [ ] Grok Bot GUI `/` lists them after install on Bot host
- [ ] `grok` Build CLI target unchanged
- [ ] Pi-equivalent degradation + syntax table documented
- [ ] Clear error on laptop without SAND_DATA
- [ ] entity_locations + README updated

---

## 12. Phases

- **A** Target enum + SAND_DATA resolution + dry-run thin bridges (skills-only)
- **B** Command/subagent degrade parity with Pi adapters
- **C** update / prune / origin markers / doctor
- **D** Docs + dogfood cc/sp/kk on Bot host

---

## 13. Open questions

1. Always emit `~/.agents/skills` as canonical, or allow plugin-path bridges?
2. Should `all` auto-include grok-bot when SAND_DATA exists?
3. Magent: ignore vs Bot skill vs AGENTS.md only when `grok` also targeted?
4. Permanent model = workflows-only, or later `$SAND_DATA/plugins` Claude parity?

---

## 14. Reference: validated manual bridge

Thin bridges already proven under `sand-data/workflows/` for a curated set (`sp-dev-*`, `sp-brainstorm`, `sp-code-review`, `sp-super-coder`, `kk-*`, `cc-anti-hallucination`) pointing at `~/.agents/skills/<id>/SKILL.md`. Automate that shape.

---

## 15. Invariant

**Grok Bot enablement = files under `$SAND_DATA/workflows/`, not `~/.agents/` alone and not `~/.grok/installed-plugins/`.**
