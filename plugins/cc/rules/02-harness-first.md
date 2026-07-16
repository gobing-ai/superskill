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

## Forbidden without override

- Direct Write/Edit on `docs/tasks/` or feature corpus files — use `spur task` / `spur feature` with `--section --from-file`.
- Claiming “done” without `spur task check` / verify PASS when the project uses the pipeline.
- Inventing CLI flags from memory — use `spur <noun> --help` or `sp:spur-cli`.
- Maintaining parallel TODO.md that drifts from the WBS.

## Fallback

Native Read/Edit/Bash (or platform equivalents) only when the harness does not cover the operation.
