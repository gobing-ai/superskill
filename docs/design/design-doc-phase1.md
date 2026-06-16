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

## 2. `superskill install` command

### 2.1 CLI interface

```
superskill install <plugin> [options]

Arguments:
  plugin                Plugin name (required) — looks up in plugins/ directory
                        or in superskill.jsonc plugins list

Options:
  --targets <list>      Comma-separated target agents (default: all configured)
  --global              Install to user-level global directories (default: true)
  --dry-run             Preview what would be written without touching filesystem
  --verbose             Print each file copy and transformation step
```

Examples:
```bash
superskill install rd3                                          # all configured targets
superskill install rd3 --targets pi,codex                       # specific targets
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

**Step 0 — Resolve plugin**
- If `rd3` is in `superskill.jsonc` plugins list, use its path
- Otherwise, look in `plugins/rd3/`
- Validate `plugins/rd3/plugin.json` exists

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

await generate({
  targets: ['codexcli', 'pi'],    // mapped from --targets codex,pi
  features: ['skills', 'commands', 'subagents', 'hooks', 'mcp'],
  inputRoot: '.rulesync',
  delete: false,                  // keep canonical source after generation
});
```

**Step 4 — Post-process per-target**
- For Pi subagents: convert from Skills 2.0 → Pi native agent YAML format
- For Hermes: copy generated skills to `~/.hermes/skills/` (rulesync doesn't have hermes target)
- For omp: copy to `~/.omp/agent/skills/` (same format as Pi)

**Step 5 — Copy to target directories**

For each target, resolve the install path:

| Target | Global path | Project path | Note |
|--------|------------|--------------|------|
| `claude` | N/A | plugin marketplace | Handled separately — not rulesync |
| `codex` | `~/.agents/skills/` | `.codex/skills/` | Global uses shared agents dir |
| `pi` | `~/.agents/skills/` | `.pi/agent/skills/` | Global uses shared agents dir; subagents → `~/.pi/agent/agents/` |
| `omp` | `~/.agents/skills/` | `.omp/agent/skills/` | Same format as Pi |
| `opencode` | `~/.agents/skills/` | `.opencode/skills/` | Global uses shared agents dir |
| `antigravity-cli` | `~/.gemini/antigravity-cli/skills/` | `.gemini/antigravity-cli/skills/` | Native path |
| `antigravity-ide` | `~/.gemini/config/skills/` | `.gemini/config/skills/` | Native path |
| `hermes` | `~/.hermes/skills/` | `.hermes/skills/` | Custom target |

**Claude Code special case**: When `claude` is in targets, call the Claude Code CLI to update the plugin marketplace:
```
claude plugin install rd3@local --path plugins/rd3
```
This is not a rulesync operation — Claude Code reads directly from the plugin directory.

### 2.4 Conversion rules (carried from cc-agents/scripts)

| Rule | Applies to | Source → Result |
|------|-----------|-----------------|
| Slash dialect | commands | `/rd3:dev-run` → `$rd3-dev-run` (Codex), `/skill:rd3-dev-run` (Pi/omp), `/rd3-dev-run` (others) |
| Colon→hyphen | all prose | `rd3:dev-run` → `rd3-dev-run` |
| @-file stripping | Codex only | `@AGENTS.md` → removed (Codex doesn't support @-file imports) |
| Frontmatter name inject | commands, subagents | Commands/subagents without `name:` in frontmatter get it injected |
| Pi subagent format | Pi subagents | Skills 2.0 YAML → Pi native agent YAML (tools: CSV, model: inherit→empty) |

### 2.5 Directory layout in the code

```
apps/cli/src/
├── cli.ts                    # Commander entry: install
├── index.ts                  # #!/usr/bin/env bun entry
├── install.ts                # install command implementation
├── list.ts                   # list command — targets, features, plugins
├── doctor.ts                 # doctor command — agent detection + health checks
├── init.ts                   # init command — scaffold superskill.jsonc
├── targets.ts                # Target enum + path resolution table
├── config.ts                 # superskill.jsonc zod schema + loader
├── mapper.ts                 # Plugin → .rulesync/ canonical layout
├── pipeline/
│   ├── convert.ts            # ConversionPipeline
│   ├── rewrite-colons.ts     # rd3:foo → rd3-foo
│   └── pi-subagent.ts        # Skills 2.0 → Pi native YAML
└── rulesync.ts               # Thin wrapper around rulesync.generate()
```

### 2.6 Acceptance criteria

```
# Happy path
superskill install rd3 --targets pi,codex --dry-run
# → Lists files that would be written without touching disk

superskill install rd3 --targets pi,codex
# → Skills land in:
#   ~/.agents/skills/rd3-code-review-common/SKILL.md
#   ~/.agents/skills/rd3-tdd-workflow/SKILL.md
#   ~/.pi/agent/agents/rd3-super-coder.md  (Pi native format)
# → exit 0

# Idempotency
superskill install rd3 --targets pi,codex   # second run
# → Same output, no errors, exit 0

# Error handling
superskill install nonexistent --targets pi
# → "Plugin 'nonexistent' not found" → exit 1
```
## 3. Dependencies to add

```jsonc
// apps/cli/package.json dependencies to add:
{
  "rulesync": "^8.28.1",
  "@gobing-ai/ts-ai-runner": "workspace:*"  // from ts-libs
}
```
