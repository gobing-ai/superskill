# Skill Lifecycle Quick Reference

The skill owns the workflow; live leaf help owns exact options.

| Request | Start here |
|---|---|
| Create | `superskill skill scaffold <name> --help` |
| Check structure | `superskill skill validate <nameOrPath> --json` |
| Review without editing | `superskill skill evaluate <nameOrPath> --json` plus semantic review |
| Preview fixes | `superskill skill refine <nameOrPath> --dry-run` |
| Apply eligible structural fixes | `superskill skill refine <nameOrPath> --auto` |
| Analyze history / proposals | `superskill skill evolve <name> --help` |
| Package | `superskill skill package <name> --help`; check destination and omitted resources |
| Merge sources | `superskill skill migrate --help`; the last positional is the destination |
| Install an existing skill | `superskill skill add --help`; this is not scaffolding |

Read [workflows.md](workflows.md) before using mutations or scoring/proposal seams.

- Preserve task intent, applicable instructions, existing authorization, and caller compatibility.
- Check structural findings, semantic correctness, native loading, and observed behavior separately.
- Use the actual runtime and primary sources for version-sensitive claims.
- Keep one owner for each fact; load relevant references only when needed.
- Report meaningful verification and uncertainty. A score alone does not establish improvement.

Specialized guidance: [evaluation](evaluation-framework.md),
[platform compatibility](platform-compatibility.md), [security](security.md),
and [script delivery](scripts-and-install.md).
