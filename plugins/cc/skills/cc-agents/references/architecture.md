# Architecture Reference

## System Overview

The cc-agents skill implements a **bidirectional pipeline** for subagent definition management:

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│ Platform Format │────▶│     UAM      │────▶│ Platform    │
│   (Parse)      │     │ (Universal)  │     │ (Generate)  │
└─────────────────┘     └──────────────┘     └─────────────┘
```

## Core Components

### 1. Types (types.ts)

Defines all data structures:
- `UniversalAgent` - 22-field internal superset
- Per-platform frontmatter interfaces
- Evaluation types (dimensions, weights, grades)
- Adapter interfaces

### 2. Utils (utils.ts)

Shared parsing and generation utilities:
- `parseFrontmatter()` / `serializeFrontmatter()`
- `parseAgent()` / `readAgent()`
- `analyzeBody()` - detects 8-section anatomy
- `detectTemplateTier()` - minimal/standard/specialist
- `detectWeightProfile()` - thin-wrapper/specialist

### 3. Platform Adapters (adapters/)

Each adapter implements:
- `parse(input, filePath)` → UAM
- `validate(agent)` → errors/warnings
- `generate(agent, context)` → platform format
- `detectFeatures(agent)` → string[]

Adapter list:
- `claude.ts` - Claude Code agents
- `gemini.ts` - Gemini CLI agents
- `opencode.ts` - OpenCode agents
- `codex.ts` - Codex TOML config
- `openclaw.ts` - OpenClaw JSON
- `antigravity.ts` - Advisory docs

### 4. Pipeline Scripts

| Script | Purpose |
|--------|---------|
| `scaffold.ts` | Create from template |
| `validate.ts` | Structure validation |
| `evaluate.ts` | Quality scoring |
| `refine.ts` | Auto-fix + LLM |
| `adapt.ts` | Cross-platform |

## Design Decisions

### Why Bidirectional Adapters?

Unlike skills (export-only), agents can be imported from any platform:
- Parse FROM: Claude, Gemini, OpenCode, Codex, OpenClaw
- Generate TO: All 6 platforms

This requires a **parse()** method in each adapter.

### Why 3 Templates?

- **minimal**: Quick prototyping, simple agents
- **standard**: Most production agents (recommended)
- **specialist**: Complex domain experts with full 8-section

### Why 2 Weight Profiles?

- **thin-wrapper**: Agents that delegate to skills need high delegation score
- **specialist**: Domain experts need high body quality score
