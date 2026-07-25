---
template: feature-impl
schema_version: 1
name: "superskill skill add: install skills-ecosystem repos with lock-file interop"
description: ""
status: done
type: task
profile: standard
feature_id: B
parent_wbs: null
priority: P1
tags: []
dependencies: []
created_at: "2026-07-24T22:54:47.271Z"
updated_at: "2026-07-25T21:47:24.320Z"
---

## 0097. superskill skill add: install skills-ecosystem repos with lock-file interop

### Background
**Problem.** The vercel-labs `skills` CLI (`npx skills add owner/repo`, v1.5.20, vendored at `vendors/skills/`) has become the de-facto distribution channel for loose `SKILL.md` skills — GitHub-shorthand sources, ~74 supported agents, a canonical `~/.agents/skills` store, and two lock files. `superskill` cannot consume these repos: `superskill install` only resolves **plugins** (marketplace.json + skills/commands/agents/hooks/magents), so a repo like `oil-oil/beautify-github-readme` (plain SKILL.md, no plugin manifest) is unreachable.

**Surface decision (brainstorm 2026-07-24).** Four options were weighed:

| Option | Verdict |
|---|---|
| A. Extend `superskill install <source>` with source detection | Rejected — ambiguous arg (plugin name vs GitHub slug), two contracts under one verb, `--no-global` semantics clash |
| **B. `superskill skill add/list/remove/update` under the existing `skill` noun group** | **Chosen** — matches the noun-group CLI architecture, zero collision with plugin `install`, direct mental mapping from `npx skills add`, non-breaking |
| C. Top-level `superskill add` | Rejected — breaks noun-group convention; `add` is meaningless without the noun |
| D. Shell out to `npx skills` | Rejected — runtime dep on Node ≥22.20 + npx network fetch, no lock/test control, and their global lock auto-wipes on version skew (hostile to shared state) |

**Emission decision (operator, 2026-07-24).** A canonical `.agents/skills` copy alone only works for agents that read that directory; agents that don't would silently get nothing. Installation therefore follows the same per-target emission model as `superskill install`, in three tiers:

1. **Universal agents** (read `.agents/skills` natively: codex, pi, omp, ~20 in the vendor table) → canonical copy only, no link.
2. **Symlink-capable non-universal agents** (claude, opencode, antigravity-cli/ide, …) → symlink from the agent's native skills dir to the canonical copy. This is the vendor's own model, so `npx skills` interop is preserved byte-for-byte.
3. **Translation-required agents** (no symlink support or divergent skill format — hermes/grok class, Windows junctions) → transformed copy via a per-target adapter that **reuses the `superskill install` emission machinery** (`prepareTargetRulesyncInput` / `transformRulesyncMarkdown` / `rewriteSkillReferences` class). No second translation convention is invented.

Result: identical UX for every supported agent regardless of whether the skill arrives via `superskill install` (plugin) or `superskill skill add` (loose ecosystem skill).

**Implementation decision.** Port (not depend on) the near-pure modules from `vendors/skills/src/` into `packages/core` — the npm package ships no exports map, couples commands to `@clack/prompts`/telemetry, and captures cwd/HOME at module load. MIT-licensed; add attribution notice. Modules to port: `source-parser.ts`, `sanitize.ts`, `frontmatter.ts`, `skills.ts` (discovery), `installer.ts` (path/symlink logic), `local-lock.ts` + `skill-lock.ts` (schemas), `agents.ts` (agent path/detection data).

**Interop contract (byte-for-byte).** Matching these makes both CLIs see each other's installs:
- Canonical store `<cwd|~>/.agents/skills/<sanitizeName(name)>` as the single source of truth; tier-2 symlinks and tier-3 translated copies are emission-layer artifacts derived from it.
- Project lock `./skills-lock.json` v1: sorted, timestamp-free entries `{ source, sourceUrl?, ref?, sourceType, skillPath?, computedHash }`, `computedHash` = SHA-256 over sorted (relpath+content) of the **canonical** folder.
- Global lock `~/.agents/.skill-lock.json` (or `$XDG_STATE_HOME/skills/`) v3: `{ source, sourceType, sourceUrl, ref?, skillPath?, skillFolderHash, installedAt, updatedAt }`, `skillFolderHash` = GitHub tree SHA of the **canonical** folder.
- **Hash invariant:** locks never hash a translated copy — change detection (`update`) and vendor round-trip both depend on hashing the untranslated source of truth.
- `sanitizeName` semantics: lowercase, `[^a-z0-9._]+`→`-`, strip leading/trailing dots/hyphens, 255 cap, fallback `unnamed-skill` — install dir names and lock-key matching depend on it.
- Source grammar: `owner/repo[/subpath][@skill][#ref]`, `github:`/`gitlab:` prefixes, GitHub `/tree/<ref>/<subpath>` URLs, GitLab `/-/tree/`, `git@`/ssh/http(s) git URLs, local paths, GHE via `GH_HOST`. Note: `owner/repo@x` is a **skill filter**, not a ref; refs are `#fragments`.
### Requirements
- R1. **Core module** `packages/core/src/skills-ecosystem/`: ported source parser, sanitizer (names + terminal escapes), YAML-only frontmatter parser, SKILL.md discovery (priority dirs: root, `skills/`, `skills/.curated|/.experimental|/.system/`, 26 agent dirs, plugin manifests; depth-5 recursive fallback skipping `node_modules/.git/dist/build/__pycache__`), installer (canonical copy + symlink/copy modes), both lock read/writers, and the agent path table. Attribution notice for the vendored MIT source.
- R2. **Fetch**: GitHub blob/Trees-API fast path (clone-free install + tree-SHA folder hash) and `git clone --depth 1 [--branch ref]` fallback with transport hardening (`GIT_ALLOW_PROTOCOL=https:http:ssh:git:file`, reject `ext::`, `GIT_TERMINAL_PROMPT=0`, LFS smudge off, 300s timeout, https→`gh`→ssh auth fallback).
- R3. **CLI verbs** under `apps/cli` `skill` group: `superskill skill add <source> [--skill <name...>] [--agent <targets...>] [-g|--global] [--copy] [-y|--yes] [--list] [--dry-run] [--json]` (resolve → fetch → discover → install → emit per target → write both locks; project scope default, `-g` for user-level; non-interactive by default); `superskill skill list [-g] [--json]`; `superskill skill remove <name...> [-g] [-y]` (lock-key-wins resolution; removes canonical dir, tier-2 symlinks, AND tier-3 translated copies); `superskill skill update [name...] [-g] [-y]` (hash-based change detection on the canonical copy; reinstall re-runs per-target emission).
- R4. **Three-tier per-target emission** bridging superskill `Target` (9 agents) to the vendor agent table:
  - Tier 1 universal (codex, pi, omp → `.agents/skills`): canonical copy only.
  - Tier 2 symlink (claude → `.claude/skills`, opencode → `.config/opencode/skills`, antigravity-cli → `.gemini/antigravity-cli/skills`, antigravity-ide → `.gemini/config/skills`, …): symlink to canonical copy; symlink failure → fallback copy (vendor behavior).
  - Tier 3 translate (hermes, grok, and any target lacking symlink support or reading a divergent format): transformed copy emitted through a per-target adapter that reuses the `superskill install` emission pipeline (markdown transforms, skill-reference rewriting). Translation is minimal — SKILL.md is already the portable standard; do not translate where a symlink suffices.
  - Default agent set = detected installed agents; `--agent` overrides.
- R5. **Hash invariant**: both locks hash only the canonical untranslated folder (`computedHash` SHA-256 / `skillFolderHash` GitHub tree SHA). Translated copies are never hashed, never recorded as lock state.
- R6. **Security parity**: `sanitizeSubpath` (`..` rejection) + `isSubpathSafe`, `sanitizeName` + `isPathSafe` on all write targets (canonical, symlink, translated), terminal-escape stripping on untrusted frontmatter before printing, YAML-only frontmatter (no gray-matter JS engine), never install onto/inside the source dir (`pathsOverlap`).
- R7. **Out of scope (defer)**: `skill use` (ephemeral prompt), `skill find` (search), well-known URL providers, `experimental_sync`, Eve subagents, telemetry, interactive multiselect prompts.
### Acceptance Criteria
```gherkin
Feature: superskill skill add — skills-ecosystem install with per-target emission

  Scenario: Install a GitHub-shorthand skill for all detected agents
    Given a GitHub repo with a discoverable SKILL.md
    When I run "superskill skill add owner/repo -y"
    Then the canonical copy, per-tier emission, and both lock entries are written

  Scenario: Round-trip interop with npx skills
    Given a skill installed by either CLI
    When the other CLI lists, updates, or removes it
    Then both operate on the same canonical path, lock keys, and hashes

  Scenario: Uniform UX across install surfaces
    Given an agent that cannot read ".agents/skills" or follow symlinks
    When I install a loose skill via "superskill skill add"
    Then the agent receives a working translated copy equivalent to a plugin install
```

Verification criteria (mapped to the scenarios above):

1. *(S1)* `superskill skill add oil-oil/beautify-github-readme --dry-run` parses the shorthand, discovers ≥1 SKILL.md, and prints the planned canonical path + per-agent emission (tier 1 direct / tier 2 symlink / tier 3 translated copy) without writing.
2. *(S1)* `superskill skill add vercel-labs/agent-skills --skill web-design-guidelines -g -y` installs to `~/.agents/skills/web-design-guidelines`, emits per detected agent by tier, and writes entries to both `skills-lock.json` (project, when in a project) and `~/.agents/.skill-lock.json` whose schemas validate against the vendor's v1/v3 shapes.
3. *(S1, S3)* **Tier coverage**: given a detected set {codex (tier 1), claude (tier 2), hermes (tier 3)}, one `skill add` produces exactly: one canonical copy, one symlink at `~/.claude/skills/<name>` → canonical, one translated copy in hermes' native skills dir produced by the shared emission pipeline — and the hermes result is functionally equivalent to what `superskill install` delivers for a plugin skill on that target.
4. *(S2)* Interop round-trip: a skill installed by `superskill skill add` is listed and removable by `npx skills list` / `npx skills remove`, and vice versa — same canonical path, same lock keys, same `sanitizeName` output, and removal also cleans up tier-3 translated copies.
5. *(S2)* **Hash invariant**: `skills-lock.json` `computedHash` and `.skill-lock.json` `skillFolderHash` equal the hashes of the canonical untranslated folder even when tier-3 translation rewrote the emitted copy; `skill update` is a no-op when the GitHub tree SHA equals the stored `skillFolderHash` and reinstalls + re-emits all tiers when it differs (mocked Trees API).
6. *(S1)* Source grammar parity tests port the vendor's `source-parser.test.ts` cases (shorthand, `@skill` filter, `#ref` fragments, `github:`/`gitlab:` prefixes, tree URLs, git@, local paths, GHE `GH_HOST`) with identical expected outputs.
7. *(S1)* Security negatives are residual-proof per repo testing rules: traversal (`../` subpath, absolute-escape skill names), terminal-escape injection in frontmatter, `ext::` git transport, and source-dir-overlap each assert rejection with every trigger half present — across all three emission tiers' write targets.
8. `bun run lint`, `bun run test` (coverage ≥90% line/function on new module), `bun run build`, and `bun run spur-check` all pass.
9. `docs/04_DESIGN.md` documents the four new verbs + flags + the three-tier emission model in the same commit (surface owner doc); `docs/00_ADR.md` gains a dated entry for the ecosystem-interop decisions (port-vs-depend, lock-schema parity, noun-group verb placement, three-tier emission reusing the install pipeline).
### Q&A

<!-- Clarifications and decisions made during refinement. Keep empty if none. -->

### Design
**Module layout** (new, no changes to existing seams):
```
packages/core/src/skills-ecosystem/
  source-parser.ts   # parseSource grammar (port of vendors/skills/src/source-parser.ts)
  frontmatter.ts     # YAML-only SKILL.md frontmatter (name+description required strings)
  sanitize.ts        # sanitizeName, terminal-escape stripping
  discovery.ts       # SKILL.md scan: priority dirs + depth-5 fallback + plugin manifests
  installer.ts       # canonical copy, symlink/copy modes, isPathSafe, pathsOverlap
  emit.ts            # three-tier per-target emission: direct | symlink | translated copy
  locks.ts           # skills-lock.json v1 + .skill-lock.json v3 read/write, hashes (canonical only)
  agents.ts          # vendor agent table subset + Target→agent-entry bridge + tier assignment
  fetch.ts           # GitHub Trees/Blob fast path + hardened git clone fallback
```
CLI wiring in `apps/cli/src/commands/skill.ts`: add `add`, `list`, `remove`, `update` verbs to the existing `skill` group; keep them non-interactive (flags only, `--json` envelopes) per the CLI's AI-first posture — no `@clack/prompts` port.

**Three-tier emission (`emit.ts`)** — the heart of the uniform-UX decision:
- Tier assignment is data in `agents.ts` (per target: `direct | symlink | translate`), derived from the vendor table (`skillsDir === '.agents/skills'` → direct) plus an explicit translate list for the hermes/grok class.
- Tier 2 reuses the vendor's symlink semantics verbatim (relative links, `junction` on win32, fallback to copy on failure).
- Tier 3 calls into the **existing** install emission pipeline (`prepareTargetRulesyncInput`, `transformRulesyncMarkdown`, `rewriteSkillReferences` from `packages/core`) treating the discovered skill dir as a minimal one-skill plugin input. No new transform logic is authored here; if a target needs a transform the install pipeline doesn't have, that gap is flagged, not papered over.

**Key design constraints:**
- **Lock files are the interop contract.** Write both locks exactly as the vendor does (project lock sorted + timestamp-free; global lock with installedAt/updatedAt). Never auto-wipe on version mismatch — if the vendor's global lock version exceeds what we understand, leave it untouched and warn (their wipe-on-bump behavior is explicitly not ported).
- **Hash invariant.** Locks hash the canonical untranslated folder only. Translation rewrites content; hashing a translated copy would break `update` change-detection and vendor round-trip.
- **Identity = frontmatter `name`; dir = `sanitizeName(name)`.** Lock keys keep the raw name; all three tiers land at `<targetSkillsDir>/<sanitizeName(name)>`; removal resolves lock-key-wins and sweeps canonical + symlink + translated copies. Mirror exactly or interop breaks for names containing `:` etc.
- **Universal agents.** Tier-1 targets collapse onto one physical canonical copy, consistent with ADR-010's shared `~/.agents/skills` amendment.
- **No git cache.** Clone to `mkdtemp` per run like the vendor; GitHub sources prefer the Trees/Blob API fast path.
- **Attribution.** Ported files carry a header comment referencing `vendors/skills` (MIT); add the license text to the project's third-party notices.
### Plan
**Umbrella task — implements nothing itself.** Decomposed via `spur task batch-create` as one atomic batch; the operator reviewed and confirmed the breakdown beforehand. The original 5-phase plan below is superseded by the child roster (auto-generated at the end of this section).

**Decomposition rubric (parent):** E≈28h (>16h force-decompose), D=5, L=3 (core module, CLI app, docs), C=1, R=2 (writes to `$HOME`, symlinks, lock interop) → decompose. Each child carries its own rubric line in its Background.

**Dependency graph:** 0098 → {0099 ∥ 0100} → 0101 → 0102 → 0103. Frontmatter `dependencies` set via `spur task deps`; 0099 and 0100 may run in parallel once 0098 is done.

**Rejected split alternatives (scope guard):**
- Coarser 3-task split (core port / install engine / CLI+docs) — rejected: 0101's `$HOME` writes + symlink + translation risk earns its own review boundary; 0103's ADR + interop evidence is a different review lens.
- Finer split of 0101 (installer vs tier-3 emit) — rejected: emission tiers share the same write-target invariants (isPathSafe/pathsOverlap) and one sandbox-HOME test fixture; splitting would duplicate the harness.
- 0097 executing phases directly (no children) — rejected by the rubric (E>16h, R=high).

**Completion rule:** this parent is done only when 0098–0103 are all done (or cancelled). Cross-cutting items (docs sync, ADR, anatomy update, spur-check) live inside child 0103, not here.

Superseded phase sketch (kept for provenance): 1) core plumbing 2) state 3) fetch+discovery+install 4) CLI verbs 5) interop verification — now realized as children 0098/0099+0100/0101/0102/0103 respectively.

Reference material (all in-repo): `vendors/skills/src/{source-parser,skills,installer,skill-lock,local-lock,agents,git,sanitize,frontmatter,blob,add,remove,update}.ts`, vendor tests (`source-parser.test.ts`, `sanitize-name.test.ts`, `subpath-traversal.test.ts`, `sanitize-terminal.test.ts`, `skill-matching.test.ts`, `root-level-disk-install.test.ts`, `root-level-lock-hash.test.ts`), `vendors/skills/README.md`, and the brainstorm research report with file:line citations (session of July 2026).

<!-- AUTO-GENERATED by spur task refresh-roster -->
| WBS | Sub-task | Status |
| --- | -------- | ------ |
| 0098 | skills-ecosystem: source parser, sanitizer, and frontmatter ports with vendor parity tests | todo |
| 0099 | skills-ecosystem: agent registry, Target bridge with tier assignment, and dual lock read/writers | todo |
| 0100 | skills-ecosystem: fetch (GitHub Trees/Blob fast path + hardened git clone) and SKILL.md discovery | todo |
| 0101 | skills-ecosystem: installer and three-tier per-target emission reusing the install pipeline | todo |
| 0102 | skills-ecosystem: CLI verbs skill add/list/remove/update with lock writes and dry-run | todo |
| 0103 | skills-ecosystem: npx skills interop round-trip verification and docs sync | todo |
<!-- END AUTO-GENERATED -->
### Solution
Umbrella task delivered via children 0098–0103 (decomposition per rubric E2 D1 L1 C1 R1 = 6). Change map by child:

- 0098: `packages/core/src/skills-ecosystem/source-parser.ts`, `sanitize.ts`, `frontmatter.ts`, `github-host.ts` — vendor-verbatim parity fixtures.
- 0099: `packages/core/src/skills-ecosystem/agents.ts:46` (9-target registry), `locks.ts:86` (dual lock read/writers, version-mismatch preservation).
- 0100: `packages/core/src/skills-ecosystem/fetch.ts` (Trees/Blob fast path + hardened clone), `discovery.ts` (SKILL.md scan).
- 0101: `packages/core/src/skills-ecosystem/installer.ts:207` (canonical install), `emit.ts:62` (three-tier emission + lock-key-wins removal).
- 0102: `packages/core/src/skills-ecosystem/operations.ts:62` (add/list/remove/update domain ops), `apps/cli/src/commands/skill.ts:390` (verb registration).
- 0103: `packages/core/tests/skills-ecosystem/npx-interop.test.ts` (round-trip interop), `docs/00_ADR.md` ADR-028, `docs/04_DESIGN.md` + `docs/05_FEATURES.md` surface sync.
### Testing
Umbrella verification by child roll-up (each child verified and re-audited individually; evidence in the child task files and `.spur/run/*-verdict.json`):

| Req | Status | Evidence |
|-----|--------|----------|
| R1 (core modules) | MET | 0098/0099/0100/0101 done + re-audited; modules under `packages/core/src/skills-ecosystem/` (11 modules) |
| R2 (fetch) | MET | 0100; `fetch.ts` Trees/Blob fast path + hardened clone; fetch.test.ts 100% func coverage |
| R3 (CLI verbs) | MET | 0102 re-audit PASS (`.spur/run/0102-verdict.json`); verbs at `apps/cli/src/commands/skill.ts:390-420` |
| R4 (three-tier emission) | MET | 0101 re-audit; `emit.ts:62` tier matrix tests in `emit.test.ts` |
| R5 (hash invariant) | MET | `locks.ts` canonical-only hash + `isCanonicalSkillPath` guard; vendor-sample round-trips in `locks.test.ts`; ADR-028 §5 |
| R6 (security parity) | MET | sanitize/subpath/terminal-escape vendor-verbatim fixtures (0098); `isPathSafe`/`pathsOverlap` on all write targets (0101) |
| R7 (defer list) | N/A | Explicit deferrals: `skill use`, `skill find`, well-known providers, `experimental_sync`, Eve subagents, telemetry, interactive prompts |

Gate evidence (2026-07-25, task 0103 verify run): `bun run test` full suite green; `bun run spur-check` green (lint + pre-check rules + tests + post-check rules). Round-trip interop proven both directions in `packages/core/tests/skills-ecosystem/npx-interop.test.ts` (4 tests: layout + Local v1/Global v3 schema parity, vendor-fixture vice-versa consumption, byte-shape writer parity).
### Review
| Priority | Finding | Severity | Disposition |
|---|---|---|---|
| P1 | None — umbrella roll-up; per-child reviews recorded in tasks 0098–0103 | Pass | Verified |
| P2 | None — child re-audit findings (0102: lock homeDir, update no-op, list scan, canonical naming, CLI test isolation) were all remediated in their fix passes | Pass | Verified |
| P3 | removeSkills/empty --skill filter succeed silently on unknown names (vendor errors instead) | Minor | Accepted — documented advisory in 0102 Testing §8; output-contract compatible |
| P4 | None | Pass | Verified |
### References
- Vendor source (reference-only, MIT): `vendors/skills/src/source-parser.ts` (source grammar), `skills.ts` (discovery), `installer.ts` (canonical copy + symlink modes + `sanitizeName`), `skill-lock.ts` (global lock v3), `local-lock.ts` (project lock v1), `agents.ts` (~74-agent path/detection table), `git.ts` (transport hardening), `sanitize.ts` (terminal escapes), `frontmatter.ts` (YAML-only parser), `blob.ts` (GitHub Trees fast path), `add.ts`/`remove.ts`/`update.ts` (lock write sites, hash-based update).
- Vendor tests to port as parity fixtures: `vendors/skills/tests/source-parser.test.ts`, `sanitize-name.test.ts`, `subpath-traversal.test.ts`, `sanitize-terminal.test.ts`, `skill-matching.test.ts`, `root-level-disk-install.test.ts`, `root-level-lock-hash.test.ts`.
- `vendors/skills/README.md` — documented source formats, options, symlink-vs-copy semantics.
- Superskill seams touched: `apps/cli/src/commands/skill.ts` (verb registration), `packages/core/src/targets.ts` (Target↔agent bridge input), `docs/04_DESIGN.md` (surface), `docs/00_ADR.md` (new dated entry).
- Brainstorm research report with file:line citations: session 2026-07-24 (`SkillsVendorResearch` scout over `vendors/skills` v1.5.20).
### History
- 2026-07-24T23:58:50.251Z todo → wip (system)
- 2026-07-25T21:47:24.044Z wip → testing (system)
- 2026-07-25T21:47:24.320Z testing → done (system)
