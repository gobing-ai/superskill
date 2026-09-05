# Harness-first (spur + superskill)

Use the available domain CLI for lifecycle data it owns:

| Work | Command family |
| --- | --- |
| Tasks / features | `spur task` / `spur feature` |
| Constraint rules / workflows | `spur rule` / `spur workflow` |
| Agent execution / history | `spur agent` / `spur history` |
| Main-agent configs / skills / agents / commands / hooks | `superskill magent` / `superskill skill` / `superskill agent` / `superskill command` / `superskill hook` |
| Plugin scripts / installation | `superskill script` / `superskill install` |

- Never direct-write task or feature corpus files; use the owning CLI.
- Read the exact leaf command's `--help` for unfamiliar flags and use `--json` where supported.
  Confirm the requested verb exists; a parent's successful help output is not proof.
- For main-agent changes, validate and evaluate through `superskill magent`; inspect assembled
  target content as well. Scores are heuristic signals, not proof of instruction quality.
  Semantic wording edits belong to the invoking agent; structural autofix cannot perform them.
- Use the project's existing task/pipeline policy; do not create a task or parallel TODO tracker
  merely because a harness is installed. If a task is used, record verification evidence through it.
- Discover installed skill names from the live catalog. Do not hard-code another host's slash
  command syntax or assume a skill is a native subagent. Load skills relevant to the task or
  explicitly requested; their instructions remain subordinate to the host hierarchy and request.
  Verify capabilities instead of following stale tool names or unsupported guarantees.
- When a CLI is missing, continue work it does not own and report the unavailable operation;
  do not hand-edit its corpus or invent a substitute command.

## Numbered documentation

When `docs/00`–`05` and `99` exist, follow `99_PROJECT_CONSTITUTION.md` for process and
the lower-numbered owner for content. Read the relevant authority before changing it;
otherwise follow the project's existing documentation structure.
