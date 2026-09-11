# Spec: superskill Discovery Channel (host marketplaces → thin MCP gateway)

| Field | Value |
|-------|--------|
| Status | Phase 1 Verified Pilot (Native CC Marketplace) · MCP Gateway Deferred (Task 0131) |
| Date | 2026-09-08 (Updated: 2026-09-10) |
| Package(s) | `@gobing-ai/superskill` (CLI/library); proposed `@gobing-ai/superskill-mcp` deferred |
| Pilot & Evidence | [`docs/help/native_cc_marketplace_pilot.md`](help/native_cc_marketplace_pilot.md) |
| Canonical Landing | [`README.md`](../README.md) & [`docs/help/installation.md`](help/installation.md) |
| Sibling spec | [`superskill_grok_bot_target_SPEC.md`](./superskill_grok_bot_target_SPEC.md) — content install target for Grok Bot `/` catalog (**separate**; do not merge) |
| Product | `@gobing-ai/superskill` distributes Claude-style plugins (`cc`, `sp`, `kk`, …) across coding agents |

---

> **Phase 1 Pilot Status (2026-09-10, Task 0131):**
> 1. **Native Marketplace Route Verified**: The native Claude Code marketplace route (`.claude-plugin/marketplace.json`, `cc@superskill`) has been verified end-to-end (discovery, install, invocation, idempotent reinstall). See [`docs/help/native_cc_marketplace_pilot.md`](help/native_cc_marketplace_pilot.md).
> 2. **Canonical Landing Reconciled**: Reconciled [`README.md`](../README.md) (universal entry) and [`docs/help/installation.md`](help/installation.md) (operational guide) into a unified landing path with zero conflicting install instructions.
> 3. **MCP Gateway Deferred**: Proposed Phase 2 `@gobing-ai/superskill-mcp` gateway is **deferred** and is **not a prerequisite** for plugin distribution. Trigger conditions for activation: (a) host marketplace requiring connector-only catalog without plugin support, (b) remote/managed hub execution without local CLI, or (c) demonstrated operator demand for in-chat MCP installer calls.


`superskill` already solves **content install**: the same (or degraded) skills/commands/subagents land in each host’s native skill surface via per-host writers. Discovery remains fragmented.

| Surface | What operators see today | Gap for superskill |
|---------|--------------------------|--------------------|
| **Bot Marketplace** (Cursor / Grok Bot connectors) | MCP **connectors** — find & enable tools | Connectors ≠ skill content. Listing superskill only as a connector does not install `cc`/`sp`/`kk` into `/` catalogs. |
| **Codex** | `/plugins` + **marketplace sources** | Prefer marketplace add of an installer/discovery entry, not renaming plugins into “connectors.” |
| **Grok Build CLI** | `grok` marketplace | Needs a marketplace entry that points at superskill install, distinct from target id `grok` / `grok-bot`. |
| **CLI-only discoverability** | `npx @gobing-ai/superskill …` | Works, but invisible inside host GUIs/marketplaces. |

**Core tension:** Goal 1 is same/similar UX across agents via **content install**. Goal 2 is easier find/install via **host marketplaces**. Goal 2 must be a **thin discovery channel** — not renaming content to connectors, and not making “connector” a core superskill domain object.

---

## 2. Goals

1. **Discoverable installer** — Operators can find superskill from Cursor/Grok Bot marketplace listings, Codex marketplace sources, and Grok Build CLI marketplace, then install plugins into the correct host skill surfaces.
2. **Thin gateway** — Ship an MCP server (`superskill-mcp`) that wraps the existing CLI/library; marketplaces list the gateway; writers still place skills.
3. **Same content path** — Discovery never replaces writers. After find/install, behavior matches `superskill install <plugin> --targets …`.
4. **Honest surfaces** — Marketplace copy and MCP tool results state clearly: connector/MCP finds the installer; skills still require host writers (especially `grok-bot` for Bot `/` catalog).
5. **Companion UX enhancements** — Gateway surfaces (does not own) stable ids, surface matrix, invoke cheat-sheet, ownership markers, and parity notes that live in the CLI.
6. **Universal landing doc** — One canonical doc URL/path that every marketplace entry can deep-link for “what this is / how to install content.”

---

## 3. Non-goals

- Making **connector** a first-class superskill domain object or renaming plugins (`cc`, `sp`, `kk`) to connectors.
- Replacing per-host writers with MCP-only skill injection.
- Unifying Bot Marketplace (connectors) with skill catalogs (`workflows/`, `~/.agents/skills`, etc.).
- Full Claude Code marketplace UX inside every host.
- Teaching hosts to auto-load each other’s skill roots.
- Merging this spec into the grok-bot target spec (sibling remains authoritative for `grok-bot` writer behavior).
- Shipping host-specific marketplace UIs or forking Codex/`grok` marketplace servers.

---

## 4. Definitions

| Term | Meaning |
|------|---------|
| **Content install** | Resolving a Claude-style plugin and writing skills/commands/subagents (with host-specific degradation) into that host’s skill surface via a **writer**. |
| **Discovery channel** | Thin path from host marketplaces → gateway MCP → CLI/library so operators can **find** and **invoke** install without renaming content. |
| **Gateway** | MCP server (`superskill-mcp`) that exposes a small tool set wrapping CLI operations; listed in host marketplaces as a connector/MCP entry. |
| **Host marketplace** | Host UI/catalog for finding extensions: Bot Marketplace (connectors), Codex marketplace sources / `/plugins`, Grok Build CLI `grok` marketplace. |
| **Plugin marketplace source** | Codex- (and similar) configured source locator that resolves installer/discovery metadata — **not** the skill files themselves. |
| **Writer** | Per-host adapter that places content (e.g. Codex, Pi, `grok`, **`grok-bot`**, Cursor skills roots). |
| **Installer** | CLI/library entrypoint (`superskill install` / shared API) that gateway tools call. |

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Host marketplaces                                                │
│  • Cursor / Grok Bot Marketplace (connector listing)             │
│  • Codex marketplace sources + /plugins                          │
│  • Grok Build CLI (grok) marketplace                             │
│  • Universal landing doc (deep link from all of the above)       │
└─────────────────────────────┬───────────────────────────────────┘
                              │ discover / enable / open
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ superskill-gateway MCP  (@gobing-ai/superskill-mcp)              │
│  tools: doctor | list_targets | list_plugins | install |         │
│         update | open                                            │
│  thin wrap → spawn/call CLI or shared library                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ superskill CLI / library  (@gobing-ai/superskill)                │
│  resolve plugin • degrade entities • companion UX metadata       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Per-host writers                                                 │
│  codex | pi | grok | grok-bot | cursor | …                       │
│  → native skill surfaces (NOT “connectors as content”)           │
└─────────────────────────────────────────────────────────────────┘
```

**Package split**

| Package | Role |
|---------|------|
| `@gobing-ai/superskill` | CLI + shared library + writers + companion UX data |
| `@gobing-ai/superskill-mcp` | Thin MCP gateway; depends on / invokes superskill; marketplace-facing manifest |

---

## 6. Invariant

> **Marketplaces discover the installer; writers place skills.**

Discovery (marketplace listing, MCP connector enablement, marketplace source add) never substitutes for content install. Enabling the gateway connector does **not** populate Bot `/` or Codex plugin skills by itself.

---

## 7. Cross-agent UX enhancements (companion list)

These live in the **CLI/library** (source of truth). The **gateway surfaces** them via tools/docs (`list_targets`, `open`, install summaries) but does not invent a parallel catalog.

| Enhancement | Purpose | Gateway surfacing |
|-------------|---------|-------------------|
| **Stable ids** | Flat, host-safe skill/command ids (`sp-dev-run`, `cc-anti-hallucination`, …) | Shown in `list_plugins` / install result |
| **Surface matrix** | Which entity types land on which targets (skill / degraded command / skip) | `doctor` + landing doc; `open` matrix section |
| **grok-bot target** | Writer for Sand `$SAND_DATA/workflows/` (see sibling spec) | `list_targets` includes `grok-bot`; install accepts it |
| **Invoke cheat-sheet** | Per-host how to invoke (`/cc-skill-add` on Bot vs `/cc:skill-add` elsewhere) | `open` + post-install message |
| **Ownership markers** | Clear “managed by superskill” markers / metadata where hosts allow | Install/update/prune honesty in tool output |
| **Honest parity** | Document intentional gaps (hooks skip, MCP-from-plugin skip, etc.) | `doctor` warnings; never claim full Claude parity |

---

## 8. Discovery design

### 8.1 Package split

- **`superskill`**: all content logic, writers, degradation, companion UX.
- **`superskill-mcp`**: MCP stdio (and optional SSE later) server; thin argv/API wrapper; marketplace README + manifest snippets.
- Do **not** embed writer logic in the MCP package beyond calling the shared seam (§11).

### 8.2 MCP tools v1

| Tool | Behavior |
|------|----------|
| `doctor` | Environment + target detection + honest parity / missing writers; return machine-readable + human summary |
| `list_targets` | Enumerate AgentName / target ids (`codex`, `pi`, `grok`, `grok-bot`, …) with detected paths |
| `list_plugins` | Known/resolvable plugins (`cc`, `sp`, `kk`, …) + marketplace locator hints |
| `install` | Args: plugin, targets[], optional marketplace locator, magent, verbose, dry-run → call shared install |
| `update` | Refresh installed content for selected targets/plugins |
| `open` | Return/open universal landing doc URL or bundled markdown (cheat-sheet, matrix, security notes) |

Tool results must restate the invariant when relevant: **connector enabled ≠ skills installed**.

### 8.3 Cursor / Grok Bot listing

- List **superskill-mcp** as a Bot Marketplace **connector** (MCP server).
- Listing copy: “Find and install Claude-style plugins into your agents’ skill catalogs via superskill.”
- Explicit disclaimer: enabling this connector does **not** write Bot `/` skills; run `install` with target `grok-bot` (writer) per sibling spec.
- Bot connector helps **find the installer**; skills still need the **`grok-bot` writer** for the `/` catalog.

### 8.4 Codex marketplace add

- Prefer **marketplace sources** (Codex `/plugins` + configured plugin marketplace source) pointing at superskill discovery/installer metadata.
- Source entry describes how to run install / enable gateway; does not publish each skill as a fake connector.
- Codex remains free to use native plugin UX; superskill writers still own cross-host placement.

### 8.5 Grok marketplace add (`grok` Build CLI)

- Add a **grok marketplace** entry for superskill installer/discovery.
- Keep target ids distinct: marketplace entry ≠ install target `grok` ≠ install target `grok-bot`.

### 8.6 Universal landing doc

- Single canonical markdown/URL referenced by every host listing and by MCP `open`.
- Contents: invariant, install examples per host, surface matrix summary, link to sibling `grok-bot` spec, security/trust notes, cheat-sheet.
- Host marketplace blurbs stay short; deep detail lives here.

---

## 9. UX promise table

| Promise | Operator experience | Non-promise |
|---------|---------------------|-------------|
| Find installer in host marketplace | Connector / source / marketplace entry visible | That entry is not the skill pack itself |
| One install verb | MCP `install` ≡ CLI `superskill install` | Host-native “Install connector” alone installs skills |
| Same content across agents | Writers place analogous skills where possible | Bit-identical paths or slash dialects |
| Honest Bot path | Gateway + `grok-bot` writer documented together | Bot Marketplace connector fills `/` catalog |
| Doctor tells truth | Missing `SAND_DATA`, unsupported entities warned | Silent skip as success |
| Update/prune | Gateway `update` delegates to CLI | Marketplace “update connector” updates skills |


## 10. Shared library API seam

Gateway and CLI share one programmatic seam (library export or stable subprocess contract). Minimum surface:

```text
doctor(): DoctorReport
listTargets(): TargetInfo[]
listPlugins(opts?): PluginInfo[]
install(opts: {
  plugin: string
  targets: string[]
  marketplace?: string
  magent?: string
  verbose?: boolean
  dryRun?: boolean
}): InstallResult
update(opts: { plugins?: string[]; targets?: string[] }): UpdateResult
openLanding(): { pathOrUrl: string; markdown?: string }
```

Rules:

- MCP tools map 1:1 to this seam; no divergent business logic in `superskill-mcp`.
- CLI remains the debugging/scripting path; gateway is convenience for GUI hosts.
- Version the seam; gateway declares compatible `superskill` peer range.

---

## 11. Security

- **Trust boundary**: marketplace listing is unsigned discovery; install still pulls plugin content from configured locators — validate checksums/signatures when CLI already does; do not weaken for MCP.
- **No credential harvesting**: gateway tools must not read host session cookies, Bot tokens, or unrelated secrets to help install.
- **Least privilege**: MCP server runs with user permissions; document that install writes only documented skill roots.
- **Dry-run default for risky hosts**: encourage `dryRun` in GUI confirmations before first write to `$SAND_DATA/workflows`.
- **Supply chain**: publish `superskill-mcp` with pinned/semver dependency on `@gobing-ai/superskill`; avoid bundling opaque plugin payloads inside the MCP package.
- **Prompt injection**: treat marketplace/plugin README text as untrusted when echoing into agent context; prefer structured tool results.
- **Ownership markers**: only modify trees superskill owns; refuse to overwrite managed/read-only Bot skills (`managed-skills/`).

---

## 12. Testing

| Layer | Cases |
|-------|-------|
| Unit | Seam mapping; tool arg validation; disclaimer strings present on install-without-targets |
| Gateway integration | MCP tool list schema; install dry-run; doctor on missing targets |
| CLI parity | Same fixture plugin → identical file plan via CLI vs MCP `install` |
| Marketplace fixtures | Manifest snippets for Cursor/Bot connector, Codex source JSON, grok marketplace entry validate against schemas if available |
| Sibling coupling | `list_targets` includes `grok-bot`; install `--targets grok-bot` delegates to writer covered by sibling acceptance tests |
| Regression | Enabling connector alone does not create `workflows/*` entries |
| Docs | `open` returns landing doc containing invariant + cheat-sheet anchors |

---

## 13. Acceptance criteria

1. Standalone packages documented: CLI vs `superskill-mcp`; connector is **not** a core domain object.
2. MCP v1 tools (`doctor`, `list_targets`, `list_plugins`, `install`, `update`, `open`) implemented against shared seam.
3. Cursor/Grok Bot marketplace listing copy includes find-installer framing + explicit “skills need writer / `grok-bot`” disclaimer.
4. Codex path documented as **marketplace source** add (preferred), not skill→connector rename.
5. Grok Build CLI marketplace entry documented; ids `grok` vs `grok-bot` not conflated.
6. Universal landing doc exists and is reachable via `open` and all listings.
7. Invariant verified by test: marketplace enable ≠ skill files written.
8. Companion UX list (§7) surfaced from CLI data, not duplicated ad hoc in MCP.
9. Sibling grok-bot writer remains the only path that fills Bot `/` catalog.
10. Security section behaviors respected (no credential reads; managed-skills untouched).

---

## 14. Phases

| Phase | Scope | Status |
|-------|-------|--------|
| **1 — Seam + landing + pilot** | Universal landing doc (`README.md` + `installation.md`); native `cc` marketplace pilot verified (`docs/help/native_cc_marketplace_pilot.md`) | ✅ Complete (Task 0131) |
| **2 — Gateway MCP** | Ship `@gobing-ai/superskill-mcp` with v1 tools; parity tests CLI ↔ MCP | 💤 Deferred (trigger-gated) |
| **3 — Host listings** | Cursor/Grok Bot connector listing; Codex marketplace source; grok marketplace entry; disclaimers | ⏳ Planned |
| **4 — Polish** | Doctor richness; cheat-sheet/`open` UX; dry-run confirmations; versioning/compat matrix; optional SSE transport | ⏳ Planned |

---


## 15. Open questions

1. Package name: superskill-mcp vs gobing-gateway vs connector display name only?
2. MCP inside @gobing-ai/superskill (superskill mcp) or separate package?
3. Aggregate gobing-ai/marketplace repo vs three separate marketplace add lines?
4. Auto-select detected targets vs always require explicit targets?
5. Who owns Cursor Marketplace submission for Gobing?

---

## 16. Relationship to sibling spec

Sibling superskill_grok_bot_target_SPEC.md = how content lands on Grok Bot workflows.
This spec = how users find superskill/plugins and trigger install across hosts.
Ship independently; Bot / catalog still needs the sibling writer.

---

## 17. One-line invariant

Marketplaces discover the installer; superskill writers place the skills. Never confuse connectors with skill catalogs.
