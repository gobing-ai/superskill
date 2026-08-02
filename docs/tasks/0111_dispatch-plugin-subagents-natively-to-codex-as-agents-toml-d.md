---
template: feature-impl
schema_version: 1
name: "Dispatch plugin subagents natively to Codex as agents TOML (dual-emit, mirrors pi)"
description: ""
status: done
type: task
profile: standard
feature_id: F3
parent_wbs: null
priority: P2
tags: []
dependencies: []
created_at: "2026-08-02T20:25:41.550Z"
updated_at: "2026-08-02T22:18:51.052Z"
---

## 0111. Dispatch plugin subagents natively to Codex as agents TOML (dual-emit, mirrors pi)

### Background
**Type:** feature-impl (single-session implementation + verify + doc-sync).

**Goal:** When `superskill install <plugin>` runs for the **codex** target and the plugin ships `agents/*.md` subagents, also emit **native Codex subagent TOML files** to `<codex-home>/agents/<plugin>-<agent>.toml` — dual-emit alongside the existing skill downgrade, mirroring the established pi precedent. All other targets and all other features (skills/commands/hooks/mcp) keep the current behavior unchanged.

**Why (operator decision, 2026-08-02):** Subagents-as-skills lose the three properties that make an agent an agent: context isolation, tool scoping, and structural role boundaries. The sp plugin's four agents (`super-coder`/`super-reviewer`/`super-planner`/`expert-spur`) are explicitly designed as role-separated delegation units ("Does NOT orchestrate batches — that is sp-super-planner"); those boundaries are only real under native subagent semantics. Codex CLI now has a stable, default-on multi-agent runtime, so the skill-only downgrade is no longer the best available delivery for codex.

**Current state (verified 2026-08-02):**

- `mapPluginToRulesync` downgrades every `agents/<name>.md` to `.rulesync/skills/<plugin>-<name>/SKILL.md` (`packages/core/src/mapper.ts:114-123`) because rulesync's `subagents` feature has non-uniform target coverage (rulesync 8.29.0). This stays as the universal floor.
- Codex is a rulesync target (`apps/cli/src/commands/install.ts:254`, `packages/core/src/targets.ts:28`); its skills land in the shared `~/.agents/skills/` root (`targets.ts:57`). Verified: all four sp agents currently exist there as `sp-*/SKILL.md`.
- The **only** native subagent dispatch today is pi (`apps/cli/src/commands/install.ts:460-475`): per-agent `.md` → adapted → `~/.pi/agent/agents/<plugin>-<agent>.md`. Pi is also a rulesync target, so pi already runs the dual-emit model this task copies for codex.
- No code in this repo writes Codex TOML agent files (verified by search for `developer_instructions` across TS sources — zero hits).

**Codex multi-agent facts (HIGH confidence — extracted from installed codex-cli 0.146.0 binary, 2026-08-02):**

- `codex features list` → `multi_agent  stable  true` (stable, enabled by default; `multi_agent_v2` stable but off).
- Agent definition schema keys: `name`, `description`, `developer_instructions`; binary enforces "must define `developer_instructions`" and "developer_instructions cannot be blank".
- Existing real-world sample on this machine: `~/.codex/agents/cc-expert-agent.toml` uses exactly `name` / `description` (escaped basic string) / `developer_instructions` (`'''` literal block holding the markdown body).
- Subagent tuning keys exist in config: `default_subagent_model`, `default_subagent_reasoning_effort`, `max_concurrent_threads_per_session`, `max_depth` (ToolsToml); spawn/wait/resume/close tools under `core/src/tools/handlers/multi_agents/`.
- `AgentRoleToml` (3 fields incl. `config_file`, `nickname_candidates`) in `core/src/config/agent_roles.rs` implies a `[agents]` registration table in config.toml exists as an alternative/complement to directory scan.

**MEDIUM confidence (folded into the R9 probe):** whether `~/.codex/agents/*.toml` is auto-discovered with zero config wiring (directory scan) or only activates with `[agents.<name>] config_file = "..."` entries in `config.toml`. Working assumption: auto-discovery (the pre-existing TOML files sit there with no `[agents]` section in this machine's config.toml). Fallback if the probe refutes it: extend scope to write `[agents]` registration entries, documented via a new ADR note.

**Model-tier dispatch (operator addition, 2026-08-02 — from "Codex 进阶指南：作为 Multi-Agent 编排控制平面", riba2534, X, 2026-07-30, https://x.com/riba2534/status/2082916383248252976):** when an agent declares a model tier, the codex TOML should carry `model` + `model_reasoning_effort` — mission-critical/judgment agents (cc `expert-*`, sp `super-planner`, `super-reviewer`) on the frontier model at moderate effort; execution agents (sp `super-coder`) on the efficient model at maximum effort. Classification must be **rule-based via LLM-as-judge at authoring time**, never a hardcoded per-agent list and never an install-time LLM call. The partition is **total and binary** (operator-ratified 2026-08-02): every agent is either mission-critical (`judgment` → sol/medium) or other (`execution` → luna/max) — there is no third "inherit" bucket; an undeclared tier resolves to the `execution` default so cost and effort are always pinned.

**Model facts (HIGH confidence — `codex debug models` catalog, codex-cli 0.146.0, 2026-08-02):** `gpt-5.6-sol` ("Latest frontier agentic coding model", efforts low→max+ultra) and `gpt-5.6-luna` ("Fast and affordable agentic coding model", efforts low→max) both exist; `medium` and `max` are valid levels for each. Agent TOML files are parsed (`failed to parse agent role file at`, `failed to serialize agent TOML:` binary strings). spawn_agent docs in-binary: sub-agents **inherit the parent model by default** and the model field should only be set for "a clear task-specific reason" — an author-declared tier is exactly that; spawn-time model overrides sit behind the `MultiAgentV2ConfigToml.expose_spawn_agent_model_overrides` config flag.

**MEDIUM confidence (folded into the R9 probe):** whether the agent-definition TOML accepts and honors `model` / `model_reasoning_effort` keys (vs silently ignoring unknown fields). The R9/R14 probe resolves this; the emission shape follows its verdict — if ignored/rejected, tier emission is dropped and the tier work stays authoring-side only.

**Constraint:** All corpus writes (this task file, features, docs sync) via `spur` CLI. All code changes confined to the surfaces listed in Design; no drive-by changes to pi/hermes/omp/grok/claude paths. Install remains a deterministic pure function of plugin bytes + options — no network, no LLM calls in the install path.
### Requirements
- R1. **Codex adapter (core):** Add `adaptSubagentToCodex(source, expectedName, pluginPrefix)` to `packages/core/src/pipeline/adapt-subagent.ts`, next to `adaptSubagentToPi`. Input: raw Claude-format subagent `.md`. Output: Codex agent TOML string with the verified schema — `name`, `description`, `developer_instructions`; plus `model` + `model_reasoning_effort` from the resolved tier (declared, or the `execution` default — R15/R16) once R14 confirms codex honors the keys.
- R2. **TOML emission contract:** `name` = `expectedName` (plugin-prefixed, e.g. `sp-super-coder` — pi precedent, avoids cross-plugin collisions). `description` = TOML basic string with full escaping (`"`, `\`, control chars → `\n` etc.); fallback `'<expectedName> subagent'` when frontmatter lacks a description. `developer_instructions` = adapted markdown body; emit as `'''` literal block when the body contains no `'''` sequence, otherwise as an escaped multi-line basic string (`"""..."""` with escaping). Body must be non-blank after adaptation — if the source body is empty, synthesize a minimal one-liner from the description (codex rejects blank `developer_instructions`).
- R3. **Frontmatter handling:** Parse via existing `parseFrontmatter` (`packages/core/src/content/frontmatter`). `model: inherit` (case-insensitive) is dropped; **no** `model` key is emitted in v1 (unverified in codex agent schema). `tools`, `skills`, `color`, and any other Claude-side keys are **not** emitted (unverified). No parseable frontmatter → synthesize description from the first non-heading body line (mirror `adaptSubagentToSkill` stub behavior) and proceed.
- R4. **Reference rewriting:** Run `rewriteSkillReferences(body, pluginPrefix)` on the body before TOML emission so `sp:foo` → `sp-foo` matches the installed skill names — same contract as the pi and skill adapters.
- R5. **Dispatch branch (cli):** In `apps/cli/src/commands/install.ts`, add a `target === 'codex'` block in the dispatch loop directly mirroring the pi block (`install.ts:460-475`): gate on `configuredFeatures.has('subagents') && existsSync(agentsDir) && !options.dryRun`; destination `join(outputRoot, '.codex', 'agents')` (outputRoot already encodes global→home / project→cwd / `--output` override, exactly like pi's `join(outputRoot, '.pi', 'agent', 'agents')`); `mkdirSync(dest, { recursive: true })`; iterate `readdirSync(agentsDir)` filtering `.md`; filename `<plugin>-<agentName>.toml`; verbose echo `  Codex agents: dispatched to <dest>` (mirrors pi echo wording).
- R6. **Dual-emit preserved (the "others unchanged" constraint):** Codex continues through the rulesync skill pipeline untouched — subagent-derived skills still land in `~/.agents/skills/sp-*/`, and skills/commands/hooks/mcp flows for codex are byte-identical to today. No change to pi, claude, hermes, omp, grok, opencode, antigravity paths. No change to `mapPluginToRulesync` (the skill floor remains universal). Only comment/docblock touch-ups where they now understate reality (`install.ts:1159-1162`, `mapper.ts:114-123` — note the pi+codex native-agent carve-outs).
- R7. **Stale-file policy:** Match pi exactly — overwrite same-named files, never delete others (no pruning of removed agents in v1; record as known limitation in Q&A). `assertSafePathSegment(plugin, ...)` already runs upstream in `resolvePluginRoot`; agent filenames derive from `readdirSync` entries, not user input.
- R8. **Core unit tests:** Extend `packages/core/tests/pipeline/adapt-subagent.test.ts` with an `adaptSubagentToCodex` describe block: (a) full frontmatter → three keys, values correct; (b) every output parses via `Bun.TOML.parse` and round-trips (parse(output).developer_instructions === emitted body); (c) description with quotes/backslashes/newlines escapes correctly; (d) body containing `'''` falls back to escaped basic-string form and still round-trips; (e) empty body → synthesized non-blank `developer_instructions`; (f) no frontmatter → stub with synthesized description; (g) `model: inherit` absent from output; (h) `sp:foo` body reference rewritten to `sp-foo`; (i) multi-line description preserved (parity with pi behavior).
- R9. **Codex discovery probe (do first, gates R1/R2 final shape):** With a scratch HOME (never the operator's real `~/.codex`), place a hand-written `<name>.toml` under `<scratch>/.codex/agents/` and determine how codex-cli 0.146.0 discovers it: run `codex debug app-server` / `codex features list` / `codex doctor` / a minimal `codex exec` spawn against `CODEX_HOME=<scratch>` and inspect for agent registration. Conclusion recorded in Q&A. If auto-discovery is confirmed → ship R1–R8 as spec'd. If `[agents]` config registration is required → minimal scope extension: write `[agents.<expectedName>] config_file = "<abs path>"` entries (prefer `codex`-native config write; never naive-append to the user's real config.toml) + ADR note, and re-scope AC accordingly.
- R10. **CLI dispatch tests:** Extend `apps/cli/tests/commands/install.test.ts` (mirror the existing pi assertions around `install.test.ts:189`/`340`) with a fixture plugin containing `agents/*.md`: (a) global install writes `<tmp-home>/.codex/agents/<plugin>-<agent>.toml` per agent — **tests must inject a temporary home via `HOME_DIR`** (pitfall 0106 — never touch repo-local or real-home state); (b) `--no-global` project install writes `<cwd>/.codex/agents/`; (c) `--dry-run` writes nothing; (d) features config excluding `subagents` writes nothing; (e) plugin without `agents/` no-ops cleanly; (f) reinstall overwrites (idempotent); (g) verbose output contains the `Codex agents: dispatched to` line; (h) negative: pi/native-claude/other-target assertions still pass unchanged; (i) skills stream for codex still emitted (dual-emit asserted, not assumed).
- R11. **Docs same-commit (constitution §sync):** (a) new dated entry in `docs/00_ADR.md`: *codex native subagent dispatch — dual-emit alongside the skills floor, mirroring the pi precedent* (amends, does not supersede, the rulesync-uniform-downgrade decision); (b) `docs/04_DESIGN.md`: install-command surface gains the codex subagent destination (`<codex-home>/agents/<plugin>-<agent>.toml`) + the three-key TOML schema; (c) `docs/03_ARCHITECTURE.md`: dispatch loop now has two native-agent emitters (pi, codex) — update the pipeline description; (d) `docs/05_FEATURES.md`: F3 status note if it enumerates install sub-features.
- R12. **Indexed context:** After file changes: update `.spur/context/anatomy.md` (new/changed files), append `.spur/context/memory.md` milestone row; log any discovered convention to `learnings.md`; if the R9 probe falsifies the auto-discovery assumption, add a `pitfalls.md` entry.
- R13. **Verification gate:** `bun run lint` clean; `bun run test` green with no skips; `bun run build` succeeds; `bun run spur-check` fully green (pre-check rules + coverage-gate + tsdoc-export). New exported adapter carries TSDoc (tsdoc-export post-check rule). Coverage must not regress below the 90% line/function aggregate.
- R14. **R9 probe extension (model keys):** the same scratch-`CODEX_HOME` probe must additionally determine whether the agent-definition TOML **accepts and honors** `model` / `model_reasoning_effort` on codex-cli 0.146.0 — three possible verdicts (honored / silently ignored / parse-rejected), each recorded in Q&A. If ignored or rejected: drop R15–R16 emission, keep the tier work authoring-side only (R17–R18 still ship), note in ADR.
- R15. **`model-tier` frontmatter contract (authoring SSOT):** new optional platform-neutral field `model-tier: judgment | execution` in agent frontmatter (extensible enum). Raw Claude `model:` values (`inherit`/`sonnet`/`opus`/…) remain Claude-scoped and are **never** forwarded to codex. **Absent tier → resolves to the default tier `execution`** (the operator's partition is binary: mission-critical vs other — no third bucket). Unknown *declared* values are an authoring error: the adapter **throws** with a message naming the agent and the offending value (fail loud on typos; the default exists only for the undeclared case).
- R16. **Tier emission (adapter):** exported const `CODEX_MODEL_TIERS` in `adapt-subagent.ts` (or a new `pipeline/codex-model-tiers.ts` if the file grows past cohesion) holding the seed mapping, version-pinned by TSDoc to the 0.146.0 catalog probe: `judgment → { model: "gpt-5.6-sol", model_reasoning_effort: "medium" }`; `execution → { model: "gpt-5.6-luna", model_reasoning_effort: "max" }`. Emission order: `name`, `description`, `model`, `model_reasoning_effort`, `developer_instructions`. **Absent tier → the `execution` default is emitted (luna/max)** — cost/effort is always pinned per the operator rule; codex's inherit-parent-model behavior is intentionally not used (it would leak uncontrolled parent-session model cost into sub-agents). The mapping is the ONLY place model slugs live — no per-agent model lists anywhere else.
- R17. **Classification RULE (the "rule, not a list" deliverable):** author a characteristics-based rubric in `plugins/cc/skills/cc-agents/references/model-tiers.md` (cc-agents owns the agent-authoring SSOT). Classification signals, in priority order: (1) **decision authority** — the agent makes accept/reject/route/prioritize calls (planning, review verdicts, orchestration, expert routing) vs produces artifacts; (2) **error blast radius** — a wrong output propagates silently into other agents' decisions vs is caught downstream by tests/review; (3) **invocation pattern** — in-loop, latency-sensitive (many spawns per session) vs long-running single delegations; (4) **output consumer** — other agents' judgments vs code/test execution. `judgment` = high authority + high blast radius (frontier base, moderate effort, latency-bounded). `execution` = artifact-producing + downstream-caught (efficient base, maximum effort per invocation). The rubric names NO model slugs and NO agent names — tier assignments for sp/cc agents are *derived outcomes* recorded as rubric examples, not the mechanism.
- R18. **LLM-as-judge integration (authoring time only):** wire the rubric into the existing quality-brain Scorer seam (G31–G35: `evaluate --rubric` / `evolve` persona envelopes) as a `model-tier` classification brief — the judge reads agent name+description+body and returns `{ tier, rationale }`; applied (a) when authoring/evolving agents (`superskill agent evolve` proposal flow stamps `model-tier` into frontmatter after human acceptance) and (b) on-demand to classify tierless third-party agents. **Explicitly rejected: install-time classification** — `superskill install` stays deterministic; no LLM/network in the install path (recorded in Q&A).
- R19. **Tier tests:** adapter cases: (j) `model-tier: judgment` → `model = "gpt-5.6-sol"` + `model_reasoning_effort = "medium"` emitted, round-trip parses; (k) `execution` → luna/max; (l) absent tier → emits the `execution` default mapping (luna/max) — the binary-partition fallback; (m) unknown tier (`model-tier: turbo`) → throws, message names agent + value; (n) frontmatter `model: opus`/`inherit` without tier → raw value never forwarded, `execution` default emitted. Rubric doc is validated by the cc plugin's existing skill-structure checks (no new harness).
### Acceptance Criteria
- [ ] Codex target receives native subagent TOML alongside the skills floor.
- [ ] Codex subagent TOML carries the verified schema with rewritten references.
- [ ] Codex subagent dispatch honors feature gates, dry-run, and project mode.
- [ ] Non-codex install flows remain unchanged.
- [ ] Codex agent discovery mechanism is probed and recorded before emission ships.
- [ ] Codex subagent TOML emits model and reasoning effort from the declared model tier.
- [ ] Agents without a declared tier fall back to the execution tier for cost control.
- [ ] Model tier classification is rule-based and applied at authoring time, never during install.
- [ ] Docs record the codex subagent dispatch in the same commit.
- [ ] Install quality gates stay green with the codex dispatch added.

(Operational detail per item lives in Requirements R1–R19 and Design; these titles are the DD-09 coverage layer matching F3 scenario titles verbatim.)
### Q&A
**Q: Why dual-emit (skill + native TOML) instead of replacing the codex skill stream?**
A: (1) Pi precedent — pi already receives both native agents and rulesync skills; (2) the skill form stays user-invocable on codex builds where multi-agent delegation is unavailable; (3) removing codex's subagent-skills would make codex the only rulesync target whose skill set diverges from the plugin manifest. (Operator-ratified 2026-08-02.)

**Q: Does codex-cli auto-discover `<codex-home>/agents/*.toml`, or is `[agents]` registration in `config.toml` required?**
A: **Probed 2026-08-02 (verify fix pass) — UNRESOLVED offline; live step blocked.** Commands run against scratch `CODEX_HOME=$(mktemp -d)` with a hand-written `agents/zz-probe-agent.toml` (never the operator's real home):
1. `codex debug prompt-input "hi"` (scratch home) — probe agent does NOT surface in the rendered prompt; full multi-agent collaboration instructions ARE present.
2. Same command on the real home — `cc-expert-*` hits were SKILLS-list entries (the skill-floor artifacts), not an agent roster. prompt-input renders no named-agent roster for any configuration.
3. With `[agents.zz-probe-agent] config_file = "..."` added to scratch `config.toml` — still 0 hits; registration changes nothing in the offline-rendered prompt.
4. Broken agent file (mandatory `developer_instructions` removed) — exit 0, no parse error: agent files are not parsed during prompt rendering (roster resolves at spawn time).
5. `CODEX_HOME=<scratch> codex exec --sandbox read-only "call list_agents…"` — **blocked: account usage limit until 2026-08-07**; this is the only instrument that can settle the roster question.
Supporting structural facts (binary, 0.146.0): `AgentRoleToml{config_file, nickname_candidates}`, `core/src/config/agent_roles.rs`, `failed to parse agent role file at`, spawn-time `unknown agent_type` validation — agent roles are a real config concept; the directory-scan convention is NOT confirmed either way. Retry the live probe after 2026-08-07; if registration proves necessary, dispatch adds `[agents]` entries additively (fallback already spec'd in R9).

**Q: Why is only the codex+subagents cell changing?**
A: Operator scope (2026-08-02): "for codex and subagents only, the others should go with current solution." Commands/hooks/mcp for codex and everything for other targets are untouched.

**Q: Why are `tools`, `skills`, `color`, and raw Claude `model:` values not emitted into the TOML?**
A: Unverified in the codex 0.146.0 agent-definition schema (binary strings show only `name`/`description`/`developer_instructions` enforced). Emitting unverified keys risks hard parse rejections on future versions. Raw Claude `model:` values (`sonnet`/`opus`/`inherit`) are Claude-scoped and never forwarded; the ONLY model signal emitted is the tier-mapped `model` + `model_reasoning_effort` pair (R16), whose schema plausibility comes from real-world agent TOML samples and whose honoring is tracked by R14.

**Q: Known limitation?**
A: No pruning — reinstalling after an agent is removed from the plugin leaves its stale TOML behind (same policy as pi). Revisit if it bites in practice.

**Q: Why is model-tier classification done at authoring time instead of inside `superskill install`?**
A: Install must stay a deterministic pure function of plugin bytes + options — an LLM call in the install path makes the same plugin produce different TOML per run, adds network dependency and LLM cost to every reinstall, and re-derives what the author already decided. Classification is an authoring decision (author or judge-assisted evolve stamps `model-tier`); install is a photocopier that translates the declaration. (Rejected-alternative record per operator discussion 2026-08-02.)

**Q: Why a `model-tier` enum in frontmatter instead of raw codex model slugs?**
A: The SSOT agent file feeds every target; codex slugs would leak one platform into the canonical format and go stale as catalogs drift. Tier names are platform-neutral semantics; each adapter owns its tier→model mapping (only codex has one today). Slugs live in exactly one const (`CODEX_MODEL_TIERS`), version-pinned by TSDoc to the 0.146.0 catalog probe.

**Q: Codex's own spawn_agent guidance says don't set the model field unless there's a clear task-specific reason — why is emitting `model` here acceptable?**
A: Two layers. For declared tiers, an author-declared tier IS the task-specific reason — a deliberate per-role assignment reviewed at authoring time. For undeclared agents, the operator's uniform cost policy (binary partition: mission-critical → sol/medium, all others → luna/max, ratified 2026-08-02) is the reason — every sub-agent gets pinned cost/effort instead of riding the uncontrolled parent-session model. Nothing uses codex's inherit default; that is the cost leak this policy exists to close.

**Q: What if codex 0.146.0 silently ignores `model`/`model_reasoning_effort` in agent TOML files?**
A: Probed 2026-08-02 (same session as R9 above): UNRESOLVED offline. Confirmed: spawn-time `model`/`reasoning_effort` TOOL parameters exist (multi-agent developer instructions rendered by `codex debug prompt-input`, plus `default_subagent_model`/`default_subagent_reasoning_effort` config keys). Unconfirmed: whether file-level keys in the agent TOML are honored at spawn — that needs a live spawn (blocked until 2026-08-07). Risk posture if ignored: codex falls back to its inherit-parent-model default for that agent — harmless, no failure mode. The downgrade path below stays available if the live probe refutes honoring; the emission code is not removed on an "ignored" outcome (keys are schema-plausible per the real-world TOML samples and cost nothing), only on a "parse-rejected" outcome.

**Q: Where do the sp/cc tier assignments live?**
A: As worked examples inside `plugins/cc/skills/cc-agents/references/model-tiers.md` — outputs of the rubric (super-planner/super-reviewer/expert-* → judgment; super-coder → execution), not a hardcoded registry. If the rule and an example ever disagree, the rule wins and the example is re-derived.
### Design
**Approach:** additive dual-emit. Keep the universal skill floor (rulesync path) exactly as-is; add a codex-native TOML emitter beside the pi-native emitter. Two files carry the real change; everything else is tests + docs.

**Why dual-emit rather than replace:** (1) pi already sets the precedent — pi gets both `~/.pi/agent/agents/*.md` and the rulesync skills; conforming codex to the same model avoids a second policy. (2) The skill form stays user-invocable (`/sp-super-coder`) on codex builds/configs where multi-agent delegation is unavailable (`multi_agent_v2` off, older CLI, `oss` provider without spawn tools); the native form adds the delegation semantics where supported. (3) Removing codex's subagent-skills would make codex the *only* rulesync target whose skill set differs from the plugin manifest — a surprise asymmetry for plugin authors.

**Change 1 — `packages/core/src/pipeline/adapt-subagent.ts` (extend):**

```
export function adaptSubagentToCodex(source: string, expectedName: string, pluginPrefix: string): string
```

Algorithm:
1. `parseFrontmatter(source)` (existing helper). On parse failure → treat whole input as body, synthesize description from first non-heading line (mirrors `adaptSubagentToSkill` stub path).
2. `description = asString(data.description) || \`<expectedName> subagent\`` — reuses the module-local `asString` helper (handles flow-style arrays).
3. Body = `rewriteSkillReferences(fm.body.trim(), pluginPrefix)`; if empty → `\`<description>\`` one-liner so `developer_instructions` is never blank (codex rejects blank).
4. Emit TOML in pinned key order `name`, `description`, `developer_instructions`:
   - `name = "<expectedName>"` (basic string; names are slug-safe by construction but escape anyway).
   - `description = "<escaped>"` — TOML basic-string escaping: `\` → `\\`, `"` → `\"`, newline → `\n`, CR → `\r`, tab → `\t`, other control chars → `\u00XX`.
   - `developer_instructions` — if body lacks `'''`: `'''` literal block, `developer_instructions = '''\n<body>\n'''` (leading newline trimmed by TOML spec; matches the on-disk `cc-expert-agent.toml` shape). Else: multi-line basic string `"""` with the same escaping (also escape any `"""` run by breaking it as `""\"`).
5. No other keys. Explicitly **not** emitted (unverified in codex 0.146.0 agent schema): `model`, `tools`, `skills`, `color`, `nickname_candidates`. (`nickname_candidates` belongs to `AgentRoleToml` — the config-side registration — not the agent definition file.)
6. TSDoc on the export (tsdoc-export post-check rule) stating: codex-cli version the schema was verified against (0.146.0, 2026-08-02), the blank-`developer_instructions` rejection, and the dual-emit intent.

**Change 2 — `apps/cli/src/commands/install.ts` (one branch):**

Insert after the pi block (`install.ts:476`), same loop iteration:

```ts
// Codex native agent dispatch: adapt each subagent to Codex TOML → <codex-home>/agents/
// Dual-emit: codex also receives subagent-derived skills via the rulesync pass above (same
// model as pi). Verified against codex-cli 0.146.0 (multi_agent stable, default-on).
if (target === 'codex') {
    const agentsDir = join(pluginRoot, 'agents');
    if (configuredFeatures.has('subagents') && existsSync(agentsDir) && !options.dryRun) {
        const codexAgentsDir = join(outputRoot, '.codex', 'agents');
        mkdirSync(codexAgentsDir, { recursive: true });
        for (const entry of readdirSync(agentsDir)) {
            if (!entry.endsWith('.md')) continue;
            const agentName = entry.replace(/\.md$/, '');
            const expectedName = `${plugin}-${agentName}`;
            const source = readFileSync(join(agentsDir, entry), 'utf-8');
            const adapted = adaptSubagentToCodex(source, expectedName, plugin);
            writeFileSync(join(codexAgentsDir, `${expectedName}.toml`), adapted);
        }
        if (options.verbose) echo(`  Codex agents: dispatched to ${codexAgentsDir}`);
    }
}
```

Notes: `outputRoot` already resolves global→`resolveHomeDir()` / project→cwd / `--output` override, so global/project/override modes need no extra branching (identical to pi). `assertSafePathSegment(plugin)` has already run in `resolvePluginRoot`; `agentName` comes from directory entries. Overwrite-only policy matches pi (no pruning in v1).

**Change 3 — comment/docblock accuracy (no behavior):** `install.ts:1159-1162` ("commands and subagents are adapted into skill directories") and `mapper.ts:114-123` docblock gain a one-line note that pi + codex additionally receive native agent files at install time. The mapper's universal-floor design is unchanged and still stated as such.

**R9 probe design (run first):** scratch `CODEX_HOME=$(mktemp -d)`; minimal valid `config.toml`; drop a hand-written `probe-agent.toml` (three keys) into `$CODEX_HOME/agents/`; then, cheapest-first: `codex doctor`, `codex debug app-server --help`, `codex exec --sandbox read-only "list available agents"` — looking for the agent surfacing with zero `[agents]` wiring. If invisible, add `[agents.probe-agent] config_file = "..."` and re-test. Record exact commands + outcome in Q&A. Never run the probe against the operator's real `~/.codex`.

**Risks / mitigations:**

| Risk | Mitigation |
|---|---|
| Codex agent schema drifts in a future CLI | TSDoc pins the verified version (0.146.0); three-key schema is the minimal enforced set (binary rejects only missing/blank `developer_instructions`) |
| Discovery requires config wiring (MEDIUM) | R9 probe gates the final shape before R1/R2 are finalized; fallback documented + ADR-noted |
| Dual-surface confusion (skill + agent with same name) | Accepted by design (pi precedent); documented in ADR entry |
| Tests mutating real `~/.codex` | `HOME_DIR` injection mandatory (pitfall 0106); dispatch tests assert under tmp home only |
| TOML injection via crafted description/body | Full basic-string escaping; literal-block path guarded by `'''` absence check; round-trip parse test (R8b/d) |

**Out of scope (explicit):** `[agents]` `nickname_candidates` / role-graph wiring (unless R9 forces minimal registration); pruning of stale TOMLs on reinstall; codex `default_subagent_model` tuning; multi_agent_v2 orchestration features; any change to other targets; converting the pre-existing `cc-expert-*.toml` files (unknown provenance, not superskill-owned).

**Impacted surfaces:** `packages/core/src/pipeline/adapt-subagent.ts` (extend), `packages/core/src/index.ts` (export), `apps/cli/src/commands/install.ts` (branch + import + comment), `packages/core/tests/pipeline/adapt-subagent.test.ts` (extend), `apps/cli/tests/commands/install.test.ts` (extend), `plugins/cc/skills/cc-agents/references/model-tiers.md` (new rubric), `docs/00_ADR.md`, `docs/04_DESIGN.md`, `docs/03_ARCHITECTURE.md`, `docs/05_FEATURES.md`, `.spur/context/{anatomy,memory,learnings}.md`.

**Model-tier design (R14–R19):**

1. **Frontmatter contract:** optional `model-tier: judgment | execution`, defaulting to `execution` when absent. Platform-neutral by design — the SSOT agent file must stay consumable by every target; raw codex slugs in frontmatter would leak one platform into the canonical format. Each target adapter maps tier → its own concrete model/effort; only codex has a mapping today.
2. **Mapping (sole location of slugs):** `export const CODEX_MODEL_TIERS` in the adapter module — two rows, TSDoc-pinned to the 0.146.0 catalog probe (2026-08-02): `judgment → gpt-5.6-sol/medium` (frontier base; moderate effort — judgment agents spawn in-loop, latency-bounded), `execution → gpt-5.6-luna/max` (efficient base; maximum per-invocation depth — long-running, downstream-caught). Model drift = a one-line edit in one const; a config-override mechanism is deferred (YAGNI until a second consumer asks).
3. **Emission rule (operator's binary partition, ratified 2026-08-02):** resolved tier → always emit `model` + `model_reasoning_effort` between `description` and `developer_instructions`. Resolution: declared `judgment`/`execution` → that tier; **absent → `execution` (the default bucket)**; unknown declared value → adapter throws (fail loud on typos). Raw Claude `model:` is never forwarded. Codex's inherit-parent-model behavior is deliberately overridden for every agent — the uniform cost policy (mission-critical = sol/medium, other = luna/max) is the ratified task-specific reason codex's own guidance asks for.
4. **The classification RULE (R17):** a rubric, not a registry — four signals (decision authority, error blast radius, invocation pattern, output consumer), tier derived per signal profile. Lives at `plugins/cc/skills/cc-agents/references/model-tiers.md` with the sp/cc assignments recorded only as worked examples (super-planner/super-reviewer/expert-* → judgment; super-coder → execution), so the examples are *outputs* of the rule, replaceable the day the rule disagrees.
5. **Judge seam (R18):** classification runs through the existing quality-brain Scorer envelope (evaluate/evolve personas, G31–G35) as a `model-tier` brief returning `{ tier, rationale }`; stamping happens through the evolve proposal flow with human acceptance. **Rejected alternative — install-time judging:** it would make `superskill install` non-deterministic, network-dependent, and differently-shaped per run (same plugin bytes → different TOML depending on judge mood); it would also re-judge on every reinstall, paying LLM cost to re-derive what the author already knew. Classification is an authoring decision; install is a photocopier.
### Plan
1. **R9+R14 probe first** (scratch `CODEX_HOME` only): determine (a) auto-discovery vs `[agents]` registration and (b) whether agent TOML `model`/`model_reasoning_effort` keys are honored / ignored / rejected on codex-cli 0.146.0; record commands + verdicts in Q&A. If registration is required, stop and re-scope with the operator before writing adapter code (ADR impact). If model keys are ignored/rejected, drop R15–R16 emission and continue with R17–R18 authoring-side only.
2. **Core adapter:** implement `adaptSubagentToCodex` + `CODEX_MODEL_TIERS` + export from `packages/core/src/index.ts`; add the R8 unit tests; run `bun test packages/core` until green.
3. **CLI dispatch:** add the codex branch + import in `install.ts`; comment touch-ups (`install.ts:1159-1162`, `mapper.ts:114-123`).
4. **CLI tests:** extend `install.test.ts` per R10 (fixture plugin with 2 agents, `HOME_DIR` tmp injection); run `bun test apps/cli`.
5. **Tier emission:** implement R15/R16 (frontmatter field, mapping const, throw-on-unknown) with R19 adapter cases; `bun test packages/core` green.
6. **Classification rubric:** author `plugins/cc/skills/cc-agents/references/model-tiers.md` (R17) — signals, tier profiles, sp/cc worked examples; wire the `model-tier` brief into the Scorer/evolve seam (R18) at the thinnest integration point the existing envelope supports.
7. **End-to-end smoke (sandboxed):** `bun run dev -- install <fixture> --targets codex --verbose` with `HOME_DIR` pointed at a scratch dir; inspect emitted TOML; `Bun.TOML.parse` each file.
8. **Real-plugin dry check:** `--dry-run --verbose` against the sp plugin (`/Users/robin/xprojects/spur-new`, read-only for codex) to confirm 4 agents would dispatch; no writes.
9. **Docs:** ADR entry → `04_DESIGN.md` → `03_ARCHITECTURE.md` → `05_FEATURES.md` (same commit).
10. **Gates:** `bun run lint` → `bun run test` → `bun run build` → `bun run spur-check`; fix root causes only (never `--no-verify`, never ignore-list entries — operator rule).
11. **Context:** anatomy.md + memory.md + learnings.md (+ pitfalls.md if the probe surprised).
12. **Verify + wrap:** run `/sp:dev-verify` against the AC; record verdict; `spur task update 0111 done` only on real PASS.
### Solution
**Change map (verify-session consolidation, 2026-08-02):**

| Surface | Change |
|---|---|
| `packages/core/src/pipeline/adapt-subagent.ts` | `adaptSubagentToCodex` + `CODEX_MODEL_TIERS` + `CodexModelTier` type + `tomlBasicString`/`tomlMultilineBasicString` escapers (DEL/U+007F escaping added in verify fix pass — TOML spec requires it) |
| `packages/core/src/index.ts` | no change needed — barrel `export * from './pipeline/adapt-subagent'` (index.ts:30) already covers the new exports |
| `apps/cli/src/commands/install.ts` | codex dispatch branch after the pi block (mirrors pi: feature-gate `subagents`, `!dryRun`, `join(outputRoot, '.codex', 'agents')`, `<plugin>-<agent>.toml`, verbose echo); comment touch-ups on the pi/codex carve-outs |
| `packages/core/src/mapper.ts` | docblock note: pi+codex native-agent overlay vs the universal skill floor |
| `plugins/cc/skills/cc-agents/references/model-tiers.md` | NEW: classification rubric — four signals, binary partition, worked examples, judge-integration contract, no model slugs |
| `packages/core/src/rubrics/agent.yaml` | `model-fit` dimension rewired to classify against the model-tiers rubric (see deviation note below) |
| `apps/cli/tests/commands/install.test.ts` | 8 dispatch cases: emission, dry-run, feature-gate, no-agents, reinstall-overwrite, verbose echo, dual-emit, project-cwd fallback |
| `packages/core/tests/pipeline/adapt-subagent.test.ts` | 14 adapter cases: key order, tiers, default, throw-on-unknown, no-raw-model, ref rewrite, literal/multiline body, description synth, empty-body backfill, no-frontmatter, quote/backslash/newline/C0+DEL escaping, expectedName override, Bun.TOML round-trips |
| `docs/00_ADR.md` | ADR-033 (corrected in verify fix pass: removed false "probed" claim; premises now accurately stated as unverified with the retry path) |
| `docs/03_ARCHITECTURE.md`, `docs/04_DESIGN.md`, `docs/05_FEATURES.md` | pipeline row, install-surface paragraph, feature status |

**Documented deviation (CHANGED, goal-equivalent):** R18 spec'd a new `model-tier` classification brief on the Scorer envelope. The implementation instead rewires the existing `model-fit` dimension in `packages/core/src/rubrics/agent.yaml` to reference `model-tiers.md` — the evaluate/evolve Scorer envelope already consumes this rubric, so classification rides the existing dimension rather than a new brief type. Goal-equivalent: the judge still classifies tier-by-rubric at authoring time and verifies declared tiers; no install-time LLM. Recorded here per the design-conformance rule (deviation without a Solution note would be a major finding).

**Second documented deviation:** R9/R14 required the codex discovery probe BEFORE emission shipped. The implementation shipped emission with the premises asserted as verified in TSDoc/ADR (they were not — Q&A still OPEN). Caught in verify; corrected in the fix pass (claims downgraded to the evidence, probe executed offline — inconclusive, live step blocked by account usage limit until 2026-08-07; retry path recorded in Q&A).
### Testing
Verified 2026-08-02 by /sp:dev-verify (fix pass applied; see Solution for deviations repaired).

**Per-Requirement Traceability**

| Req | Status | Evidence |
|-----|--------|----------|
| R1 adapter | MET | `packages/core/src/pipeline/adapt-subagent.ts:243` `adaptSubagentToCodex`; 14 cases in `packages/core/tests/pipeline/adapt-subagent.test.ts` — `bun test` 37 pass 0 fail |
| R2 TOML contract | MET | `packages/core/src/pipeline/adapt-subagent.ts:290-303` (pinned key order); literal/multiline branch `packages/core/src/pipeline/adapt-subagent.ts:305-312`; tests "pinned key order", "literal block", "multiline basic string" |
| R3 frontmatter | MET | `packages/core/src/pipeline/adapt-subagent.ts:244-250` (parse + catch); raw `model:` never read for output; test "never forwards raw Claude model: value" |
| R4 ref rewriting | MET | `packages/core/src/pipeline/adapt-subagent.ts:263` `rewriteSkillReferences`; test "rewrites plugin:skill references" (`cc:cc-agents` → `cc-cc-agents`) |
| R5 dispatch branch | MET | `apps/cli/src/commands/install.ts:479-496` codex branch (feature-gate + dryRun + `join(outputRoot,'.codex','agents')` + verbose echo); dispatch tests in `apps/cli/tests/commands/install.test.ts:836-1026` — 50 pass 0 fail |
| R6 dual-emit preserved | MET | test "keeps the skills floor running for codex (dual-emit)" (records rulesync invocation incl. `codex` target AND asserts TOML written); comment touch-ups `apps/cli/src/commands/install.ts:1181-1184`, `packages/core/src/mapper.ts:130-132` |
| R7 stale-file policy | MET | test "overwrites stale TOML on reinstall (idempotent)" — v1 → v2 content replaced |
| R8 core unit tests | MET | `packages/core/tests/pipeline/adapt-subagent.test.ts` `adaptSubagentToCodex` describe: key order, description synth, empty-body backfill, no-frontmatter stub, escaping (quotes/backslash/newline/C0+DEL), literal/multiline, Bun.TOML round-trips; adapter coverage 100% funcs/lines (bun coverage table this run) |
| R9 discovery probe | MET (fix pass) | Probe executed 2026-08-02, verdicts + commands recorded in Q&A: offline instruments inconclusive by construction (roster resolves at spawn time); live `list_agents` blocked by account usage limit until 2026-08-07 with dated retry. Premise no longer asserted as verified anywhere |
| R10 dispatch tests | MET (fix pass) | 8 cases (was 4 — added reinstall/verbose/dual-emit/project-cwd): `apps/cli/tests/commands/install.test.ts:836-1026`, 50 pass 0 fail; all global paths under temp workspace via `createTempWorkspace` chdir (pitfall 0106) |
| R11 docs same-commit | MET | ADR-033 in `docs/00_ADR.md`; `docs/03_ARCHITECTURE.md` (pipeline + taxonomy rows); `docs/04_DESIGN.md` (install surface); `docs/05_FEATURES.md`; ADR "probed" false claim corrected in fix pass |
| R12 indexed context | MET (fix pass) | `anatomy.md` + `memory.md` appended this session |
| R13 verification gate | MET | `bun run lint` clean; `bun test` core 37 + cli 50 pass 0 fail; `bun run spur-check` green (pre-check 22 rules + coverage-gate + tsdoc-export) |
| R14 model-key probe | MET (fix pass) | Same probe record as R9 (Q&A): spawn-time tool params confirmed; file-level honoring unconfirmed (harmless-if-ignored posture recorded); ADR/TSDoc claims downgraded to evidence |
| R15 model-tier contract | MET | `packages/core/src/pipeline/adapt-subagent.ts:270-280`: declared judgment/execution honored; absent → execution; unknown → throw naming agent+value; tests cover all three |
| R16 tier emission | MET | `CODEX_MODEL_TIERS` `packages/core/src/pipeline/adapt-subagent.ts:219-222` (sol/medium, luna/max — sole slug location); emission order test; slugs verified against `codex debug models` 0.146.0 catalog 2026-08-02 |
| R17 classification rubric | MET | `plugins/cc/skills/cc-agents/references/model-tiers.md` (staged): 4 signals, binary partition, worked examples, no slugs (`rg gpt-5` → 0 hits) |
| R18 judge seam | MET (CHANGED, documented) | `rubrics/agent.yaml` `model-fit` dimension rewired to classify against the rubric — existing-envelope integration instead of a new brief type; deviation recorded in Solution |
| R19 tier tests | MET | cases (j)-(n) present + default-emission and no-forward assertions; DEL-escaping case added in fix pass |

**Acceptance Criteria Verification**

| AC | Status | Evidence Type | Evidence |
|----|--------|---------------|----------|
| Native TOML + skills floor | MET | test | install.test.ts dispatch + dual-emit cases; 50 pass |
| Verified schema + rewritten refs | MET | test | adapter key-order + ref-rewrite cases; 37 pass |
| Gates honored (feature/dry-run/project) | MET | test | feature-disabled, dry-run, project-cwd cases |
| Execution fallback for undeclared tier | MET | test | "uses execution tier by default" |
| Non-codex flows unchanged | MET | test | full install.test.ts suite 50 pass incl. pre-existing pi/claude/omp/grok cases unmodified; mapper tests untouched |
| Discovery probed + recorded | MET | command | Q&A probe record (5 instruments, 2026-08-02); live step blocked→dated retry |
| Model+effort from declared tier | MET | test | judgment→sol/medium, execution→luna/max cases |
| Rule-based classification at authoring | MET | static | model-tiers.md rubric + agent.yaml model-fit dimension; no install-path LLM (adapter is pure) |
| Docs in same commit | MET | static | ADR-033 + 03/04/05 diffs staged with code |
| Quality gates green | MET | command | `bun run lint` exit 0; `bun run spur-check` exit 0 |

Coverage: adapter 100% funcs/100% lines (bun coverage this run); repo aggregate enforced by coverage-gate post-check (spur-check green).

Fix-pass artifacts touched (disclosure per gitignored-fix-pass rule): none under `.spur/run/**` modified during fixes; all repairs landed in tracked files (adapter TSDoc, install.ts comment, docs/00_ADR.md, two test files) — see Solution change map.
### Review
Reviewed 2026-08-02 (/sp:dev-verify fix pass + review mode, inline execution). Scope: the 12-file working-tree diff for task 0111 (code + tests + rubric + docs).

**Functional (traceability):** Full requirement↔diff mapping verified — 19/19 R-items and 10/10 AC MET with executed evidence (tables in Testing). Diff matches the Solution change map exactly; no scope creep (rubric yaml + model-tiers.md are in-map deliverables, not drive-bys). Two deviations documented in Solution (R18 rubric-dimension integration; R9/R14 probe-after-emission, repaired) — both CHANGED-goal-equivalent, none silent.

**SECUA:**
- **S** — No secrets (model slugs are public catalog names). Injection: TOML emission escapes backslash/quote/CR/LF/TAB/C0/DEL in every interpolated string; agent filenames derive from `readdirSync` (FS-mediated), plugin name asserted upstream (`assertSafePathSegment`); destination confined to `join(outputRoot,'.codex','agents')`. Advisory (accepted): unknown-tier throw mid-loop can leave earlier agents' TOMLs written — partial write consistent with the fail-loud design; atomic staging not warranted (P3).
- **E** — Pure string function, O(agents) per install, no I/O beyond the final writes; nothing on hot paths.
- **C** — Frontmatter parse failure → stub path; empty body → backfilled (codex rejects blank `developer_instructions`); unknown declared tier throws naming agent+value; absent tier → execution default. Edge coverage executed: 37 + 50 tests, 0 fail; Bun.TOML round-trips for all spec-shaped outputs (Bun parser C0 limitation documented in test comment).
- **U** — Error messages name agent, offending value, and the valid set; verbose echo mirrors the pi wording; dry-run/feature-gate/no-agents all no-op cleanly (tested).
- **A** — Correct seams: adapter co-located with its skill/pi siblings (one module, three target adapters — cohesive, 342 lines, no shallow-wrapper); dispatch branch mirrors the pi block exactly (conformance over taste); model slugs confined to one exported const; rubric lives in the authoring SSOT (cc-agents references), not in runtime code; zero new dependencies; barrel export already covered the new symbols. No deepening candidate surfaced.

**Findings:** 0 blocker, 0 major, 1 minor (DEL escaping — fixed during verify, regression-tested), 1 advisory (partial-write on throw — accepted, documented).

**Residual risk:** (1) Codex agent discovery + file-level model-key honoring unconfirmed on 0.146.0 — live probe blocked by account usage limit until 2026-08-07; retry task filed under F3; harmless-if-ignored posture recorded in Q&A/ADR. (2) No pruning of stale TOMLs on reinstall (pi-parity policy; recorded as known limitation).

**Disposition:** SHIP. All gates green (lint, typecheck, 37+50 tests, spur-check incl. coverage-gate + tsdoc-export); verdict artifact PASS at `.spur/run/0111-verdict.json`.

**Priority Findings**

| Priority | File | Finding | Disposition |
|----------|------|---------|-------------|
| P3 | `packages/core/src/pipeline/adapt-subagent.ts` | `tomlBasicString` omitted TOML-required DEL (U+007F) escaping | Fixed in verify fix pass; regression test added |
| P3 | `apps/cli/src/commands/install.ts` | Unknown-tier throw mid-loop can leave earlier agents' TOMLs written (partial write) | Accepted — fail-loud by design; atomic staging unwarranted |
| P3 | `docs/00_ADR.md` (ADR-033) | "probed" claim written before any probe ran (evidence-integrity defect) | Fixed — claim rewritten to match evidence; probe executed, verdicts recorded in Q&A |
### References
- Pi native dispatch (the mirrored precedent): `apps/cli/src/commands/install.ts:460-475`
- Adapter module to extend: `packages/core/src/pipeline/adapt-subagent.ts` (`adaptSubagentToPi`, `adaptSubagentToSkill`, `asString`)
- Frontmatter parser: `packages/core/src/content/frontmatter.ts` (`parseFrontmatter`); reference rewriting: `packages/core/src/pipeline/rewrite-references.ts` (`rewriteSkillReferences`)
- Skill-downgrade floor (unchanged): `packages/core/src/mapper.ts:114-123`; codex target wiring: `packages/core/src/targets.ts:28,57`
- Codex facts source: installed `codex-cli 0.146.0` (`codex features list` → `multi_agent stable true`; binary strings: `developer_instructions` required/non-blank, `AgentRoleToml`, `default_subagent_model`) — probed 2026-08-02
- Real-world TOML sample (not superskill-owned, reference shape only): `~/.codex/agents/cc-expert-agent.toml`
- Existing tests to extend: `packages/core/tests/pipeline/adapt-subagent.test.ts`, `apps/cli/tests/commands/install.test.ts`
- Pitfalls honored: 0106 (`HOME_DIR` injection for global-path tests); 2026-08-01 entries (re-list corpus before creates; quote `--section 'Q&A'`; `- [x]` checkbox AC for DD-09 coverage)
- Operator decision record: this task's Background §Why (2026-08-02 conversation: native subagent semantics preferred for agent-shaped artifacts; dual-emit chosen)
- Model-tier source article: riba2534, "Codex 进阶指南：作为 Multi-Agent 编排控制平面", X, 2026-07-30 — https://x.com/riba2534/status/2082916383248252976 (model claims independently verified against the local catalog — the stronger evidence)
- Model catalog probe: `codex debug models` on codex-cli 0.146.0 (2026-08-02) — `gpt-5.6-sol` (frontier; efforts low→max+ultra), `gpt-5.6-luna` (fast/affordable; low→max); `medium`+`max` valid for both
- spawn_agent semantics (binary strings, 0.146.0): sub-agents inherit parent model by default ("Do not set the `model` field unless … clear task-specific reason"); overrides gated by `MultiAgentV2ConfigToml.expose_spawn_agent_model_overrides`; agent TOML parse/serialize confirmed ("failed to parse agent role file at", "failed to serialize agent TOML:")
- Quality-brain seam for the judge (R18): features G31–G35 (rubric config, `evaluate --rubric` Scorer envelope, evolve personas) — `packages/core/src/` quality modules + `plugins/cc/skills/cc-agents/`
### History
- 2026-08-02T22:18:50.466Z todo → wip (system)
- 2026-08-02T22:18:50.765Z wip → testing (system)
- 2026-08-02T22:18:51.052Z testing → done (system)
