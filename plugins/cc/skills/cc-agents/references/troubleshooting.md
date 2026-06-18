# Examples Reference

## Scaffold Examples

### Minimal Agent

```bash
superskill agent scaffold code-reviewer --output ./agents
```

Creates a minimal agent (~30 lines) with basic structure.

### Standard Agent

```bash
superskill agent scaffold backend-architect --output ./agents --description "Design backend systems"
```

Creates a standard agent (~80 lines) with persona, process, rules sections.

### Specialist Agent

```bash
superskill agent scaffold fullstack-expert --output ./agents
```

Creates a specialist agent (~250 lines) with full 8-section anatomy.

## Validate Examples

### Basic Validation

```bash
superskill agent validate ./agents/my-agent.md
```

Checks frontmatter, required fields, YAML syntax.

### With Platform

```bash
superskill agent validate ./agents/my-agent.md --target claude
```

Validates against Claude Code constraints.

## Evaluate Examples

### Full Evaluation

```bash
superskill agent evaluate ./agents/my-agent.md --save
```

Scores across all 10 dimensions with full report.

### With Weight Profile

```bash
superskill agent evaluate ./agents/my-agent.md --save
```

Uses specialist weight profile (emphasizes body quality).

### JSON Output

```bash
superskill agent evaluate ./agents/my-agent.md --json
```

Machine-readable output.

## Refine Examples

### Best Practice Fixes

```bash
superskill agent refine ./agents/my-agent.md --auto --save
```

Applies deterministic fixes:
- Remove TODO markers
- Fix second-person language
- Fix Windows paths

### With Migration

Runs rd2→cc migration + best practices + LLM refine.

### Dry Run

```bash
superskill agent refine ./agents/my-agent.md --auto --save
```

Shows changes without writing.

## Adapt Examples

### Single Platform

Generates Gemini CLI format.

### All Platforms

Generates all 6 platform formats.

### With Preview

Shows loss detection warnings.

## End-to-End Pipeline

```bash
# 1. Scaffold
superskill agent scaffold my-agent --output ./agents

# 2. Validate
superskill agent validate ./agents/my-agent.md

# 3. Evaluate
superskill agent evaluate ./agents/my-agent.md --save

# 4. Refine (if needed)
superskill agent refine ./agents/my-agent.md --auto --save

```

## Sample Output

After running adapt with `--platform all`:

```
agents/
├── my-agent.md              # Claude Code format (source)
├── .gemini/
│   └── agents/
│       └── my-agent.md      # Gemini CLI format
├── my-agent.opencode.md     # OpenCode format
├── my-agent.codex.toml      # Codex TOML config
├── my-agent.openclaw.json   # OpenClaw JSON config
└── my-agent.antigravity.md # Antigravity advisory
```
