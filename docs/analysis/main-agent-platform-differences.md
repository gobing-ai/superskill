# Main Agent Platform Differences (Verified Primary Research)

**Status:** Fresh primary synthesis. 2026-07-14.  
**Sources (primary, no unverified prior summary):**  
- vendors/agent-skills/{AGENTS.md,CLAUDE.md,docs/}  
- vendors/pi/{AGENTS.md, packages/agent/src/harness/system-prompt.ts, ...}  
- vendors/oh-my-pi/ (omp) — docs/tools/*.md, docs/system-prompt-customization.md, packages/coding-agent  
- vendors/openclaw/{AGENTS.md, docs/AGENTS.md, docs/agent-runtime-architecture.md, docs/tools/}  
- vendors/hermes-agent/AGENTS.md + skill/tool structure  
- superskill: plugins/cc/skills/cc-magents/{SKILL.md,references/platform-compatibility.md}, packages/core/src/quality/magent.ts, apps/cli/templates/magent/default.md, docs/03_ARCHITECTURE.md, pipeline/*, targets.ts (inferred from architecture + cerebrum)  
- .spur/context/learnings.md (target taxonomy, install facts, 2026-06/07 entries; formerly .wolf/cerebrum.md)  

**Verification note on referenced file:** `docs/about_main_agent.md` was added by operator (2026-07-14) from prior project. Full content read + cross-checked against vendors/ (agent-skills, pi, oh-my-pi/omp, openclaw, hermes-agent) + superskill `quality/magent.ts`, pipeline adapters, and omp system-prompt docs. See dedicated verification section below. This analysis remains the primary-sourced SSOT.

## Purpose (from query)
Support design of a multi-coding-agent harness ("universal external interface + customized internal implementation" via padding/traits). Requires deep understanding of declarative main-agent definitions (AGENTS.md / CLAUDE.md / equivalents) **and** imperative built-in tool surfaces so adapters can exploit native strengths without lowest-common-denominator.

## Main-Agent Config Philosophy (Declarative Layer)

| Platform     | Primary File(s)                          | Style / Structure Highlights                                                                 | Modularity / Precedence                          | Notes from sources |
|--------------|------------------------------------------|----------------------------------------------------------------------------------------------|--------------------------------------------------|--------------------|
| Claude Code | CLAUDE.md (or AGENTS.md via symlink)    | Sectioned governance (Project/Stack, Commands/Tools, Verification, Conventions, Safety [CRITICAL], Docs/Routing, Tone). Often IDENTITY/SOUL/RULES split in broader ecosystem. | Single file or .claude/ (agents/, commands/, skills/, hooks/). Frontmatter for some metadata. | agent-skills vendor + superskill magent rubric + default template. |
| pi          | AGENTS.md (repo)                        | Strict dev-process rules (conversational style, full-file reads before edit, no `any`, top-level imports, git discipline for concurrent sessions, release lockstep, test command rules). | Single authoritative AGENTS.md; scoped sub-guides referenced. | vendors/pi/AGENTS.md. Not end-user "persona" but the contract for agents working in pi source. |
| omp (oh-my-pi) | AGENTS.md + heavy docs/ (system-prompt-customization, skills/, tools/) | System prompt customization is first-class. Rich native tool docs. Rulebook / compaction / context-files. | Modular docs + skills authoring + system-prompt injection points. | vendors/oh-my-pi/docs/ + scripts/rewrite-system-prompt.* |
| OpenClaw    | AGENTS.md (root + ui/ + scoped)         | "Telegraph style". Hard policy + routing only. Owner boundaries, evidence maps for reviews, Codex sibling gate, SQLite-only state, plugin-agnostic core. ClawSweeper policy. | Root AGENTS.md + many scoped AGENTS.md/CLAUDE.md per subtree. New AGENTS.md requires sibling CLAUDE.md symlink. | vendors/openclaw/AGENTS.md + docs/AGENTS.md. Extremely rigorous. |
| Hermes      | AGENTS.md                               | Gateway + multi-channel (WhatsApp/Telegram/etc) + skill bundles. Python runtime contracts. | Bundles + gateway hooks + skills/.              | vendors/hermes-agent/ |
| Others (codex, antigravity-cli, opencode, gemini-cli, cursor, copilot, windsurf, aider, cline, zed, amp) | Varies: .github/copilot-instructions.md, .cursor/rules/*.mdc, .windsurf/rules, opencode.json, .clinerules, .aider.conf.yml, etc. | Capability matrix declares native locations, discovery, import/modularity, rule activation. | See cc-magents platform-compat (thin header; real data in targets + install mapper). | superskill cc-magents + cerebrum 0044/0045/0072/0073/0078. |

**Common governance sections** (from magent quality scorer): Project/Stack, Commands/Tools, Verification/Gates, Conventions/Style/Boundaries, Safety/Security/[CRITICAL], Docs/Reference/Routing. Tone & conciseness signals also scored.

**Default template** (apps/cli/templates/magent/default.md) is intentionally aligned to the 5-dimension scorer (completeness via those sections, platform-coverage, conciseness 1k-8k, tone, safety).

## Native Built-in Tool Surfaces (Imperative Layer)

Core overlap exists but surfaces, schemas, result shapes, and injection models differ.

**Universal-ish core (good candidates for external iface):**
- File: read / write / edit / glob / grep (or ast-grep)
- Shell / exec: bash / terminal / pty
- Search: web_search / ask / browse
- Task / sub-agent delegation (Task tool, skill tool, todo, job)
- MCP / extension loading

**Differentiation (padding required):**

- **Claude Code**: Explicit allow-listing (tools frontmatter or permissionMode), Task for sub-agents, rich PreToolUse/Stop/UserPromptSubmit hooks (STDIN JSON, exit 2 = block), MCP servers, WebFetch-like in some, edit is structured. Strong sandbox + transcript access in hooks.
- **pi**: Harness-driven (`formatSkillsForSystemPrompt` emits `<available_skills>` XML). Skills have `disableModelInvocation`. Compaction, session, provider routing. Tool calling normalized via ai package. Natives for some ops. Strong test harness with faux providers.
- **omp (oh-my-pi)**: Very rich documented tool surface (docs/tools/{read,write,edit,bash,browser,glob,grep,ast-grep,lsp,task,todo,web_search,memory,checkpoint,tts,generate_image,...}). Native Rust crates (pi-shell, pi-uu-grep, etc) for performance. System prompt customization + rulebook + ttsr injection. MCP + extensions. Compaction and context-files first-class. "robomp" runtime.
- **OpenClaw**: Plugin SDK + gateway protocol (ACP mentions), tool-call-repair, extensive skills/ (many SKILL.md), channels (telegram, discord, whatsapp), memory host, media, LSP, browser. Strong on live verification + Crabbox/Parallels for cross-OS proof. Agent runtime architecture docs.
- **Hermes**: Python tool_executor + toolsets + registries (browser, image, transcription, web_search, tts). Skill bundles. Gateway for multi-messenger. acp_adapter. Emphasis on credential scoping, rate limiting, compression.
- **Codex / antigravity / others**: Fragmented (per compatibility notes). Often inherit OpenAI/Anthropic tool calling but with provider-specific quirks (thinking, cache, image tools). Antigravity has IDE vs CLI variants.

**Translation pain points already visible in superskill:**
- Colon refs (`plugin:skill`) → hyphen or native (`plugin-skill`); scoped rewrite in pipeline/rewrite-references.ts + pi-tools.ts.
- Tool name normalization (pi-tools.ts).
- Frontmatter adaptation + skill existence filtering for Pi subagents.
- Hook event name mapping (Claude Pascal vs canonical lowercase; see cerebrum + content/hook-events.ts).
- Output roots / global vs project mode leakage fixes (0045).

## Similarities (Leverage for Universal Interface)
- All have some notion of "main instructions" that shape the whole session.
- All benefit from explicit governance sections (safety, verification, conventions, tools).
- Tool calling + result return is the common execution primitive.
- Skill / persona / command layering appears in multiple (agent-skills explicitly; others via bundles/plugins).
- Need for compaction / context management at scale.
- Hook / lifecycle points for guards (anti-hallucination, approval, logging).

## Differences Requiring Padding / Traits
1. **Prompt composition contract**: wholesale file vs injected blocks (XML skills) vs rule directories vs merged with built-in SOUL.
2. **Tool declaration + invocation**: allow-list + permission vs always-available harness vs SDK registration; name mangling; arg/result shape; streaming vs blocking.
3. **Sub-task / delegation model**: Task tool, native skill tool, todo + job, swarm, sub-process.
4. **Hook / event surface + blocking semantics**: Claude exit-code block + transcript; others vary (some non-blocking only).
5. **Modularity & precedence**: single file, dir-of-rules, JSON, runtime bundles.
6. **Verification / proof expectations**: some demand live/Crabbox/telegram proof; others accept synthetic.
7. **State / memory model**: SQLite canonical (OpenClaw), mnemosyne / compaction (omp/pi), transcript (Claude hooks).
8. **Install / distribution**: superskill already maps most via rulesync + targeted copies; magents are more authoring-time today.

## Harness Design Implications (Padding / Traits)
A good abstraction provides:
- **Capability matrix** (already started in cc-magents) → declare per-platform what is native vs emulated (lossy).
- **Main agent renderer** per target: takes canonical "governance + tools manifest" + user content → platform-native file(s) or prompt fragment.
- **Tool adapter traits**: normalize name, schema (JSON schema vs XML), execution (sync result vs stream), error shape.
- **Hook adapter**: map events + blocking contract.
- **Evidence / proof seam**: optional live harness for platforms that require it (OpenClaw style).
- Avoid over-abstraction: exploit native (e.g. omp Rust natives, OpenClaw channels, pi compaction) rather than emulate everything.

Current superskill is strongest at **content lifecycle** (scaffold/validate/evaluate/refine/evolve + install distribution for skills etc). The "harness" layer for runtime universal interface is largely future work (the query context).

## Recommended Way Forward (Wayfind Output)
1. **Harden the definitions first** (as user noted was intentionally skipped): 
   - Improve `apps/cli/templates/magent/` tiers (general, claude-code, pi, omp, openclaw, hermes, ...).
   - Make default.md + per-platform overrides pass the 5-dimension scorer at high confidence.
   - Add platform-specific sections (e.g. "Native Tools to Prefer", "Hook Patterns", "Compaction Contract").
2. **Make the capability matrix executable** (expand the thin platform-compatibility.md or move truth to code + generated doc).
3. **Extract adapter seams** from existing pipeline (pi-tools, rewrite, hook-events, omp-hooks) into a reusable "target-adapter" module.
4. **Dogfood**: use the hardened magents on superskill itself for multiple targets; run via available agents (Claude, pi, grok, openclaw where possible).
5. **Seed spur feature / tasks** for the harness (if this is the spur context) or equivalent in superskill roadmap. Use the differences table above as requirements input.

**Next concrete actions (surgical):**
- Create or update authoritative doc under docs/ (this analysis lives here; link from 03/04/05 as needed).
- Run `superskill magent evaluate` + refine on existing main-agent examples in vendors/ and templates/ to baseline.
- Identify 2-3 highest-ROI platforms for first hardened templates (Claude Code + omp + pi recommended by tool richness + current support).

**Confidence:** HIGH on observed differences (direct file reads); MEDIUM on exhaustive tool parity (full matrices would require running each runtime with identical probes); LOW on unlisted platforms without vendors/official docs.

All claims cite the listed primary sources. No blending of conflicting patterns; platform-native strengths are called out rather than averaged.

---

## Verification of `docs/about_main_agent.md` (added 2026-07-14)

**Method:** Full file read + targeted cross-check vs:
- Direct vendor sources (agent-skills/, pi/, oh-my-pi/, openclaw/, hermes-agent/)
- `quality/magent.ts` (MAGENT_SECTIONS + 5 dimensions)
- omp `docs/system-prompt-customization.md` + `docs/tools/read.md`
- pi `packages/agent/src/harness/system-prompt.ts`
- superskill pipeline adapters + cerebrum install facts
- Own prior primary synthesis in this doc

**Overall Assessment:** B+ (strong, useful synthesis for the exact use case — harness padding design). Substantial accurate detail, especially on tool surfaces. Not production-ready as-is; contains some interpretive claims and minor inaccuracies that must be hardened before heavy reliance.

**Strengths (verified or strongly corroborated):**
- Dual-prompting hierarchy (Workspace Manifest vs System/Cognitive) is a clean framing that matches real patterns.
- Omp (Oh My Pi) section: Excellent. Internal URL schemes (`pr://`, `skill://`, `agent://`, `issue://` etc.), ast_* tools, brush-shell bash, CoW isolation, dynamic tool search, stream correction rules — directly match `docs/tools/read.md` and system-prompt-customization.md.
- Pi section: `<available_skills>` XML injection, core 4 tools + extension model, lack of built-in sandbox, SYSTEM.md / APPEND_SYSTEM.md discovery — byte-level match to `harness/system-prompt.ts` and related.
- Grok Build: Preference for `read_file`/`search_replace` over raw shell, `spawn_subagent` variants (general/explore/plan), Plan Mode approval, AGENTS.md/CLAUDE.md compatibility, `<system-reminder>` injection — aligns with known Grok integration (see cerebrum 0078) and our own system-reminder conventions.
- OpenClaw & Hermes: High-level architecture (ACP/gateway, multi-sandbox, skills bundles, channels) correct.
- Tool surface coverage for the 9 agents is the best single artifact we have for "what native tools actually exist."
- Harness synthesis section (unified discovery, standardized gating, dynamic `search_tools`) directly supports the "padding/traits" goal.

**Issues / Areas Requiring Caution (do not cite without qualification):**
- Some Claude Code tool names ("Artifact", "Monitor", "CronCreate", "EnterWorktree", exact "LSP" as core native) appear approximate or version-specific; primary agent-skills vendor emphasizes skills/personas/commands + hooks more than this exact list.
- Exact ingestion/precedence rules for several agents (e.g. "upward crawl" for Pi vs omp's documented "no ancestor walk-up"; Antigravity centralized registry) are plausible but not 100% primary-verified in our vendor copies.
- "Omp packs 32 native tools" — directionally correct (docs/tools/ lists ~25+ plus internals) but the number is not confirmed in the sources read.
- Codex, Antigravity (agy), OpenCode, and some Grok details rely more on synthesis than direct vendor trees we have locally. Confidence lower here.
- Does not reference or align with superskill's own `magent` quality model (governance sections, conciseness 1k-8k, tone signals, platform-coverage scoring, safety density). The file is stronger on "tool surfaces" than on the governance structure our evaluate/refine/evolve expect.
- Markdown table in the source has line-break artifacts that hurt readability.
- No inline citations to source files (e.g. `vendors/oh-my-pi/...:42`). This makes future drift harder to detect.
- Some security/sandbox descriptions are high-level correct but may gloss kernel vs container distinctions that matter for harness.

**Recommendation for use in this project:**
- **Safe to reference (with attribution):** Omp, Pi, and Grok Build tool + prompt sections; general dual-hierarchy framing; the harness synthesis ideas.
- **Treat as hypothesis / needs spot-check:** Exact tool lists and discovery order for Codex/Antigravity/OpenCode/Claude edge cases.
- **Do not adopt wholesale:** The document is an excellent *starting artifact* for the wayfind. Merge its tool tables into our primary analysis. Then harden the content (add governance alignment, citations, fix table) so it can become the canonical `docs/about_main_agent.md`.
- Next: Run `superskill magent evaluate docs/about_main_agent.md --rubric apps/cli/rubrics/magent.yaml` (or equivalent) as an empirical gate. Use findings to drive a refine pass on this file.

**Action taken:** Anatomy.md entry added. This analysis updated with verification. The added file is now part of the research baseline but flagged for hardening.

**Updated wayfind status:** With the file verified, we have a richer (but still cross-checked) source of tool surface detail to feed harness trait design. Primary differences remain as documented above; the new file strengthens the "imperative layer" column. Proceed to options refinement or dev-plan seeding.