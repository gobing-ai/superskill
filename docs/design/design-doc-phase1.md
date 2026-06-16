# Phase 1 Design — `superskill install`

## Goal

Two deliverables:

1. **Project scaffold** — running, gates green, config and taxonomy ready.
2. **`superskill install`** — install a Claude Code plugin's skills, commands, subagents, hooks, and MCP config to specified coding agents.

## 1. Project initialization

### 1.1 What's already done

| Item | State |
|------|-------|
| Bun + TypeScript + Biome workspace scaffold | ✅ |
| `apps/cli/` Commander entry + `packages/utils/` shared lib | ✅ |
| `bun run autofix && bun run spur-check` green (21 rules) | ✅ |
| All `ts-base` references removed | ✅ |
| Documentation 00–05 per constitution | ✅ |

### 1.2 What's left for scaffold readiness

| Item | Action |
|------|--------|
| `Target` taxonomy | Define the `Target` enum in `src/targets.ts` |
| Config schema | `superskill.jsonc` zod schema in `src/config.ts` |
| Test structure | Stub tests for the install command (TDD) |

### 1.3 Target taxonomy

```typescript
// src/targets.ts
export const TARGETS = [
  'claude',            // Claude Code — plugin marketplace (not rulesync)
  'codex',             // Codex CLI → rulesync target: codexcli
  'pi',                // Pi → rulesync target: pi
  'omp',               // omp (pi variant) → same format as pi, ~/.omp/ paths
  'opencode',          // OpenCode → rulesync target: opencode
  'antigravity-cli',   // Antigravity 2.0 CLI (agy) → rulesync target: antigravity-cli
  'antigravity-ide',   // Antigravity 2.0 IDE → rulesync target: antigravity-ide
  'hermes',            // Hermes Agent — custom target, ~/.hermes/skills/
] as const;

export type Target = (typeof TARGETS)[number];

export const TARGET_TO_RULESYNC: Partial<Record<Target, string>> = {
  codex: 'codexcli',
  pi: 'pi',
  omp: 'pi',              // omp uses pi's format
  opencode: 'opencode',
  'antigravity-cli': 'antigravity-cli',
  'antigravity-ide': 'antigravity-ide',
  // hermes: not in rulesync yet — custom handling
};
```

### 1.4 Config schema (`superskill.jsonc`)

```typescript
// src/config.ts
import { z } from 'zod';

export const configSchema = z.object({
  version: z.literal(1),
  plugins: z.array(z.object({
    name: z.string(),
    path: z.string(),
  })),
  targets: z.array(z.enum(TARGETS)),
  features: z.array(z.enum(['skills', 'commands', 'subagents', 'hooks', 'mcp'])).default([
    'skills', 'commands', 'subagents', 'hooks', 'mcp',
  ]),
});

export type SuperskillConfig = z.infer<typeof configSchema>;
```

The `features` set is a verified subset of rulesync's `ALL_FEATURES` (`rules, ignore, mcp, subagents, commands, skills, hooks, permissions`).

### 1.5 Target → agent-name bridge (for slash translation)

`translateSlashCommand` from `@gobing-ai/ts-ai-runner` takes an `AgentName`, whose set is **disjoint** from superskill's `Target` on the four Phase 1 additions (ADR-009 amendment). Bridge them:

```typescript
// src/targets.ts
import type { AgentName } from '@gobing-ai/ts-ai-runner';

export const TARGET_TO_AGENT_NAME: Record<Target, AgentName> = {
  claude: 'claude',
  codex: 'codex',
  pi: 'pi',
  omp: 'pi',                  // omp speaks Pi's slash dialect
  opencode: 'opencode',
  'antigravity-cli': 'antigravity',   // default branch → /plugin-command
  'antigravity-ide': 'antigravity',
  hermes: 'opencode',         // any non-claude/codex/pi → default /plugin-command
};
```

`translateSlashCommand`'s `default` branch already yields `/plugin-command` for non-claude/codex/pi agents, so the exact `AgentName` chosen for the four "other" targets is irrelevant as long as it is not `claude`/`codex`/`pi`.

Example:
```jsonc
{
  "version": 1,
  "plugins": [
    { "name": "rd3", "path": "./plugins/rd3" }
  ],
  "targets": ["codex", "pi", "opencode", "antigravity-cli"],
  // features: defaults to all
}
```

### 1.6 Marketplace manifest resolver (ADR-011)

Plugin roots are resolved from a Claude Code `.claude-plugin/marketplace.json`. Schema (verified against Claude Code docs + `cc-agents/.claude-plugin/marketplace.json`):

```typescript
// src/marketplace.ts
import { z } from 'zod';

const pluginEntrySchema = z.object({
  name: z.string(),
  // Phase 1: string relative-path source only. Object sources rejected at resolve time.
  source: z.union([z.string(), z.object({ source: z.string() }).passthrough()]),
}).passthrough();

export const marketplaceSchema = z.object({
  name: z.string(),
  owner: z.object({ name: z.string(), email: z.string().optional() }).optional(),
  metadata: z.object({ pluginRoot: z.string().optional() }).passthrough().optional(),
  plugins: z.array(pluginEntrySchema),
}).passthrough();

// resolvePlugin(marketplacePath | undefined, pluginName)
//   → { pluginRoot: string }  (absolute), or throws with a precise message
```

Resolution rules (mirror 03 §Plugin resolution + invariant 7):
- Marketplace root = `dirname(dirname(marketplacePath))` when the path ends in `.claude-plugin/marketplace.json`; if a directory is passed, append `.claude-plugin/marketplace.json`.
- `pluginRoot = join(marketplaceRoot, metadata.pluginRoot ?? '', source)`; relative `source` must start `./`.
- Reject object `source`, `../`-escapes, and unknown plugin names with distinct exit-1 messages.

## 2. `superskill install` command

### 2.1 CLI interface

```
superskill install <plugin> [options]

Arguments:
  plugin                Plugin name (required) — resolved via marketplace manifest (§0)

Options:
  --marketplace <path>  Path to a .claude-plugin/marketplace.json (or its dir).
                        Default: .claude-plugin/marketplace.json in CWD, else
                        fall back to plugins/<name>/ scan. (ADR-011)
  --targets <list>      Comma-separated target agents (default: all configured)
  --global              Install to user-level global directories (default: true)
  --dry-run             Preview what would be written without touching filesystem
  --verbose             Print each file copy and transformation step
```

Examples:
```bash
superskill install rd3                                          # marketplace in CWD, all configured targets
superskill install rd3 --targets pi,codex                       # specific targets
superskill install rd3 --marketplace ~/projects/cc-agents       # resolve from another repo's marketplace
superskill install rd3 --targets all --dry-run                  # preview
superskill install wt --global false                            # project-level install
```

### 2.2 Data flow

```
Plugin source                      Canonical                              Target output
─────────────                      ─────────                              ─────────────
plugins/rd3/                       .rulesync/skills/                      ~/.agents/skills/
├── skills/        ──mapper──►      ├── rd3-code-review-common/           ├── rd3-code-review-common/SKILL.md
│   └── code-review-common.md       │   └── SKILL.md                     └── rd3-tdd-workflow/SKILL.md
├── commands/      ──mapper──►     .rulesync/commands/
│   └── dev-run.md                  └── rd3-dev-run.md                   ~/.pi/agent/agents/
├── agents/        ──mapper──►     .rulesync/subagents/                   └── rd3-super-coder.md
│   └── super-coder.md              └── rd3-super-coder.md
├── hooks.json     ──mapper──►     .rulesync/hooks.json                  ~/.codex/skills/
└── mcp.json       ──mapper──►     .rulesync/mcp.json                    └── rd3-code-review-common/SKILL.md
                          │
                    rulesync.generate({
                      targets: [codexcli, pi, opencode, ...],
                      features: [skills, commands, subagents, hooks, mcp],
                    })
                          │
                   ConversionPipeline
                          │
                   Copy to target dirs
```

### 2.3 Step-by-step flow

```
superskill install rd3 --targets pi,codex
```

**Step 0 — Resolve plugin via marketplace manifest (ADR-011)**
- Locate the manifest: `--marketplace <path>` → else `.claude-plugin/marketplace.json` in CWD → else fall back to the `plugins/rd3/` scan.
- Parse `marketplace.json`; find the entry where `plugins[].name === 'rd3'`.
- Plugin root = `source` (prefixed by `metadata.pluginRoot` if `source` is bare), resolved **relative to the marketplace root** = the dir containing `.claude-plugin/` (NOT `.claude-plugin/` itself). E.g. `cc-agents/.claude-plugin/marketplace.json` + `"source": "./plugins/rd3"` → `cc-agents/plugins/rd3`.
- **Phase 1: string relative-path `source` only.** An object `source` (`github`/`url`/`git-subdir`/`npm`) → exit 1 "remote sources not yet supported" (deferred, 01). A `source` with `../` escaping the marketplace root → exit 1.
- Validate `<pluginRoot>/plugin.json` exists.
- If `rd3` is also listed in `superskill.jsonc` `plugins`, that path takes precedence over the marketplace scan (explicit local override).

See §0.1 for the resolver shape.

**Step 1 — Map plugin → `.rulesync/` canonical layout**
- Copy each `skills/*.md` → `.rulesync/skills/rd3-<name>/SKILL.md`
- Copy each `commands/*.md` → `.rulesync/commands/rd3-<name>.md`
- Copy each `agents/*.md` → `.rulesync/subagents/rd3-<name>.md`
- Copy `hooks.json` → `.rulesync/hooks.json` (merges if multiple plugins)
- Copy `mcp.json` → `.rulesync/mcp.json` (merges if multiple plugins)
- Plugin prefix (`rd3-`) is preserved in the canonical name

**Step 2 — Translate slash-command syntax**
- For commands: `/rd3:dev-run` (Claude) → `$rd3-dev-run` (Codex), `/skill:rd3-dev-run` (Pi/omp)
- For subagents: `rd3-super-coder` → same (Skills 2.0 format is universal)
- Use `@gobing-ai/ts-ai-runner` `translateSlashCommand()` for slash dialect
- Use regex for colon→hyphen in prose: `rd3:foo` → `rd3-foo`

**Step 3 — run rulesync.generate()**
```
rulesync dependencies → apps/cli/package.json: {"rulesync": "^8.28.1"}
```
```typescript
import { generate } from 'rulesync';
import os from 'node:os';

await generate({
  targets: ['codexcli', 'pi'],    // mapped from --targets codex,pi
  features: ['skills', 'commands', 'subagents', 'hooks', 'mcp'],
  inputRoot: '.rulesync',         // where the canonical source lives
  outputRoots: [global ? os.homedir() : process.cwd()],  // REQUIRED — see ADR-010
  global,                         // swaps the relative subdir per target
  delete: false,                  // keep canonical source after generation
  dryRun,
  verbose,
});
```

**ADR-010 — output root is superskill's job.** rulesync writes to `<outputRoot>/<relativeDirPath>` and **never resolves `~`**. Its `global` flag only changes the relative subdir (e.g. Pi `.pi/skills` → `.pi/agent/skills`). Omitting `outputRoots` writes to `process.cwd()`, so a "global" install would land in the current directory. Always pass `outputRoots: [os.homedir()]` for global installs.

**Step 4 — Post-process the two targets rulesync can't write (ADR-010)**

rulesync resolves and writes every supported target's path itself in Step 3. Only two targets need superskill to write them, because they are absent from rulesync's `ToolTarget` set:

- **omp** — copy generated Pi output to omp's tree (`~/.omp/agent/skills/` global, `.omp/agent/skills/` project). omp shares Pi's format.
- **hermes** — copy generated skills to `~/.hermes/skills/` (global) or `.hermes/skills/` (project).

Pi subagent conversion (Skills 2.0 → Pi native agent YAML) runs as a ConversionPipeline stage in Step 2/F003, not here.

**Step 5 — Resolved paths (reference only — rulesync owns supported targets)**

The table below shows where content lands. For every rulesync-supported target these paths are produced by `generate()` given `outputRoots=[~]`; superskill does **not** reimplement them (ADR-010). Verified against `rulesync@8.28.1` constants.

| Target | Global path (rulesync-resolved) | Project path | Owner |
|--------|---------------------------------|--------------|-------|
| `claude` | plugin marketplace | plugin marketplace | superskill (`claude plugin install`) |
| `codex` | `~/.agents/skills/` (`$CODEX_HOME`) | `.agents/skills/` | rulesync |
| `pi` | `~/.pi/agent/skills/` | `.pi/skills/` | rulesync |
| `omp` | `~/.omp/agent/skills/` | `.omp/agent/skills/` | **superskill copy** |
| `opencode` | `~/.agents/skills/` | `.agents/skills/` | rulesync |
| `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | `.agents/skills/` | rulesync |
| `antigravity-ide` | `~/.gemini/config/skills/` | `.agents/skills/` | rulesync |
| `hermes` | `~/.hermes/skills/` | `.hermes/skills/` | **superskill copy** |

**Claude Code special case**: When `claude` is in targets, call the Claude Code CLI to update the plugin marketplace:
```
claude plugin install rd3@local --path plugins/rd3
```
This is not a rulesync operation — Claude Code reads directly from the plugin directory.

### 2.4 Conversion rules (carried from cc-agents/scripts)

| Rule | Applies to | Source → Result |
|------|-----------|-----------------|
| Slash dialect | commands | `/rd3:dev-run` → `$rd3-dev-run` (Codex), `/skill:rd3-dev-run` (Pi/omp), `/rd3-dev-run` (others). Via `translateSlashCommand(TARGET_TO_AGENT_NAME[target], …)` — omp bridges to `pi` (§1.5). Verified against ts-ai-runner@0.3.19. |
| Colon→hyphen | all prose | `rd3:dev-run` → `rd3-dev-run` |
| @-file stripping | Codex only | `@AGENTS.md` → removed (Codex doesn't support @-file imports) |
| Frontmatter name inject | commands, subagents | Commands/subagents without `name:` in frontmatter get it injected |
| Pi subagent format | Pi subagents | Skills 2.0 YAML → Pi native agent YAML (tools: CSV, model: inherit→empty) |

### 2.5 Directory layout in the code

```
apps/cli/src/
├── cli.ts                    # Commander entry: registers `install` (remove the scaffold `add`)
├── index.ts                  # #!/usr/bin/env bun entry
├── commands/
│   └── install.ts            # install command implementation
├── targets.ts                # Target enum, TARGET_TO_RULESYNC, TARGET_TO_AGENT_NAME
├── config.ts                 # superskill.jsonc zod schema + loader
├── marketplace.ts            # .claude-plugin/marketplace.json parser + resolvePlugin (ADR-011)
├── mapper.ts                 # Plugin → .rulesync/ canonical layout
├── pipeline/
│   ├── convert.ts            # ConversionPipeline
│   ├── rewrite-colons.ts     # rd3:foo → rd3-foo
│   └── pi-subagent.ts        # Skills 2.0 → Pi native YAML
└── rulesync.ts               # Thin wrapper around rulesync.generate()
```

`list.ts`, `doctor.ts`, `init.ts` are **deferred** (PRD §Deferred — "after Phase 1 install is stable"); they are not part of Phase 1 and must not be scaffolded yet. The existing `cli.ts` still registers a demo `add` command from the scaffold — F004 replaces it with `install`. The `commands/` directory placement matches 03 §Module boundaries.

### 2.6 Acceptance criteria

```
# Happy path
superskill install rd3 --targets pi,codex --dry-run
# → Lists files that would be written without touching disk

superskill install rd3 --targets pi,codex --global
# → Pi skills land in:    ~/.pi/agent/skills/rd3-code-review-common/SKILL.md
#                         ~/.pi/agent/skills/rd3-tdd-workflow/SKILL.md
# → Codex skills land in: ~/.agents/skills/rd3-*/SKILL.md  (under $CODEX_HOME)
# → Pi subagents in Pi native agent format (per ConversionPipeline)
# → all paths resolved by rulesync given outputRoots=[~] (ADR-010); exit 0

# Idempotency
superskill install rd3 --targets pi,codex   # second run
# → Same output, no errors, exit 0

# Error handling
superskill install nonexistent --targets pi
# → "Plugin 'nonexistent' not found" → exit 1
```
## 3. Dependencies to add

```jsonc
// apps/cli/package.json
{
  "rulesync": "^8.28.1",            // already present
  "@gobing-ai/ts-ai-runner": "^0.3.19"  // NOT yet a dependency — add it
}
```

`rulesync@^8.28.1` is already declared. `@gobing-ai/ts-ai-runner` is **not** in `apps/cli/package.json` yet (only `@gobing-ai/ts-utils` is) — F003 must add it. Use the published version `^0.3.19` (ts-libs is a sibling repo consumed via the registry / `bun link` per ADR-007/009, not a superskill workspace member — `workspace:*` would not resolve).
