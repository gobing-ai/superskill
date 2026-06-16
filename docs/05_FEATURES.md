---
doc: 05_FEATURES
owns: STATUS — feature decomposition + state (✅ done / 🔶 partial / ⏳ planned / 💤 deferred)
authority: derived
version: 3.0.0
derived_from: [01_PRD, 02_ROADMAP]
owner: Robin Min
updated_at: 2026-06-16
read_before: finding a feature's state; edit when a feature's status changes
edit_rules: 99 §6.6
sync: [T4]
---

# Features

Status legend: ✅ done · 🔶 partial · ⏳ planned · 💤 deferred

## Phase 1: Distribution — `superskill install`

Design: [design-doc-phase1.md](design/design-doc-phase1.md)

### Foundation

| Feature | Status | Acceptance |
|---------|--------|------------|
| Project scaffold | ✅ | `bun run autofix && bun run spur-check` exits 0 |
| Biome + TypeScript gates | ✅ | `biome check .` clean; `tsc --noEmit` clean |
| bun:test suite | ✅ | 6 tests, 100% coverage |
| Spur rule catalog | ✅ | 21 rules pass (19 pre-check + 2 post-check) |
| Remove ts-base artifacts | ✅ | No `ts-base` in configs, lockfile, commands |
| Documentation 00–05 | ✅ | All docs per constitution §4 |

### CLI & config

| Feature | Status | Acceptance |
|---------|--------|------------|
| Target taxonomy | ⏳ | `Target` enum covers 8 agents; maps to rulesync and ai-runner |
| Config schema | ⏳ | `superskill.jsonc` parsed with zod |
| Commander entry | ⏳ | `install`, `list`, `doctor`, `init` subcommands parse correctly |

### Core install pipeline

| Feature | Status | Acceptance |
|---------|--------|------------|
| Plugin mapper | ⏳ | `plugins/<name>/` → `.rulesync/` canonical layout |
| rulesync integration | ⏳ | `rulesync.generate()` via programmatic API |
| Conversion pipeline | ⏳ | Colon refs, slash dialect, frontmatter normalization |
| Feature dispatch | ⏳ | Skills, commands, subagents, hooks, MCP all dispatched |
| Claude Code marketplace | ⏳ | `claude plugin install` for `claude` target |

### Target agents

| Feature | Status | Acceptance |
|---------|--------|------------|
| Claude Code | ⏳ | Plugin marketplace (not rulesync) |
| Codex | ⏳ | `$plugin-command` dialect; shared `~/.agents/skills/` |
| Pi | ⏳ | `/skill:plugin-command` dialect; Pi native subagent format |
| omp | ⏳ | Same format as Pi; `~/.omp/` paths |
| OpenCode | ⏳ | `~/.agents/skills/` |
| antigravity-cli | ⏳ | `~/.gemini/antigravity-cli/skills/` |
| antigravity-ide | ⏳ | `~/.gemini/config/skills/` |
| Hermes | ⏳ | `~/.hermes/skills/` |
| Gemini CLI | 💤 | Removed — Google retiring June 2026 |
| Old Antigravity | 💤 | Replaced by antigravity-cli + antigravity-ide |

### Supporting commands

| Feature | Status | Acceptance |
|---------|--------|------------|
| `superskill list` | ⏳ | Targets with install status, features, plugins |
| `superskill doctor` | ⏳ | Agent detection + path/permission validation |
| `superskill init` | ⏳ | Scaffolds `superskill.jsonc` |

### Verification

| Feature | Status | Acceptance |
|---------|--------|------------|
| E2E install | ⏳ | `superskill install rd3 --targets all` produces correct output |
| Dry-run | ⏳ | `--dry-run` previews without writing |
| Idempotency | ⏳ | Second run produces identical output |
| Error handling | ⏳ | Missing plugin → exit 1 with message |
| Test coverage | ⏳ | ≥90% line + function |

---

## Phase 2: Authoring + quality

Design: [design-doc-phase2.md](design/design-doc-phase2.md)

### Commands

| Feature | Origin skill | Status | Acceptance |
|---------|-------------|--------|------------|
| `superskill agent` | `cc-agents` | ⏳ | scaffold, validate, evaluate, refine, evolve subagents |
| `superskill skill` | `cc-skills` | ⏳ | scaffold, validate, evaluate, refine, evolve skills |
| `superskill command` | `cc-commands` | ⏳ | scaffold, validate, evaluate, refine, evolve slash commands |
| `superskill hook` | `cc-hooks` | ⏳ | scaffold, validate, evaluate, refine, evolve hooks |
| `superskill magent` | `cc-magents` | ⏳ | scaffold, validate, evaluate, refine, evolve magents |

### Operations (shared across all five commands)

| Feature | Status | Acceptance |
|---------|--------|------------|
| `scaffold` | ⏳ | Generates from template; user templates override built-in |
| `validate` | ⏳ | Structural + schema check; JSON findings output |
| `evaluate` | ⏳ | Quality scoring across type-specific dimensions; `--save` persists |
| `refine` | ⏳ | Evaluate → fix (auto-apply or interactive); score delta shown |
| `evolve` | ⏳ | Analyze history → draft proposal → accept/reject → apply → verify |

### Infrastructure

| Feature | Status | Acceptance |
|---------|--------|------------|
| Data store | ⏳ | SQLite `evaluations` + `proposals` tables at `~/.superskill/` |
| Quality dimensions | ⏳ | 5 dimensions per content type (25 total) |
| Template system | ⏳ | Shipped with npm package; overridable at `~/.superskill/templates/` |
| Closed evolve loop | ⏳ | Accepted proposal → verification evaluation → score delta recorded |
