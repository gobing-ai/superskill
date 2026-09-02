# Harness-first (spur + superskill)

When `spur` and/or `superskill` are on `PATH`, use them **before** native tools for lifecycle work.

## Must use harness for

| Work | Command family |
| --- | --- |
| Tasks / WBS | `spur task` |
| Features | `spur feature` |
| Constraint rules | `spur rule` |
| Workflows / pipelines | `spur workflow` |
| Agent run / doctor | `spur agent` |
| History | `spur history` |
| Main-agent configs | `superskill magent` |
| Skills / agents / commands / hooks | `superskill skill` / `agent` / `command` / `hook` |
| Multi-target install | `superskill install` |

Use `spur rule validate` / `spur rule run` for gates; `spur workflow validate` / `spur workflow run` /
`spur workflow continue` for pipelines; `spur agent run` / `spur agent doctor` for agent execution; and
`spur history import` / `spur history analyze` instead of manual JSONL inspection. Main-agent lifecycle
uses `superskill magent scaffold` / `superskill magent validate` / `superskill magent evaluate` /
`superskill magent refine` / `superskill magent evolve` rather than hand-copying configs.

## Forbidden without override

- Direct Write/Edit on `docs/tasks/` or feature corpus files — use `spur task` / `spur feature` with `--section --from-file`.
- Claiming “done” without `spur task check` / verify PASS when the project uses the pipeline.
- Inventing CLI flags from memory — use `spur <noun> --help` or `sp:spur-cli`.
- Maintaining parallel TODO.md that drifts from the WBS.

## Live nouns (spur 0.3.71+)

`task`, `feature`, `rule`, `workflow`, `agent`, `history`, `message`, `projects`, `self`,
`team`, `builder`. Project scaffold and status are `spur self init` / `spur self status` —
bare `status` / `init` are not top-level verbs. Plugin scripts run via `superskill script`.

## Numbered documentation

`docs/99_PROJECT_CONSTITUTION.md` owns process; lower-numbered docs win content conflicts, so fix the
authority before derived docs. Record structural decisions in `00_ADR.md` before diverging, scope in
`01_PRD.md`, phase in `02_ROADMAP.md`, mechanisms in `03_ARCHITECTURE.md`, surface changes in
`04_DESIGN.md` in the same commit, and status in `05_FEATURES.md`.

## Fallback

When the harness does not cover an operation, use purpose-built native tools first and shell only if no dedicated tool fits.
