# Reference harness-aware main agents

Gold-master main-agent configs produced for task **0080** / **0084**.
Each file is derived from `packages/core/src/templates/magent/default.md`,
then condensed and **platform-padded** for one primary target family.

| File | Primary platform | Install name |
| --- | --- | --- |
| `claude-code.md` | Claude Code | Copy/symlink as `CLAUDE.md` |
| `codex.md` | Codex | `AGENTS.md` |
| `pi.md` | Pi | `AGENTS.md` / `CLAUDE.md` |
| `omp.md` | Omp | Merged manifests |
| `openclaw.md` | OpenClaw | `AGENTS.md` + `IDENTITY.md` |
| `hermes.md` | Hermes | Repo context + SOUL.md |
| `grok.md` | Grok Build | `AGENTS.md` / `CLAUDE.md` |

## Dogfood

```bash
superskill magent validate plugins/cc/skills/cc-magents/references/main-agents/claude-code.md
superskill magent evaluate plugins/cc/skills/cc-magents/references/main-agents/claude-code.md
superskill magent refine plugins/cc/skills/cc-magents/references/main-agents/claude-code.md --dry-run
```

## Migration from older patterns

1. Replace free-form `TODO.md` work tracking with `spur task`.
2. Prefer `superskill magent scaffold` over hand-copied AGENTS.md from other repos.
3. Keep harness tables; strip platform rows you do not run.
4. Never rely on `cc:` skill deep links after multi-target install.
