# A Small Skill Creation Example

This example illustrates the content decisions after scaffolding. The actual operation steps and
template resolver are in [workflows.md](workflows.md#scaffold--add); do not maintain a second CLI
flag catalog here.

## Scenario

A project repeatedly needs a CSV summary with its own column meanings and output format.
The agent can already read CSV, but needs the project's schema and reporting conventions.

Before creating a skill, check whether the existing report tool or reference already covers this.
If a skill is still useful, identify the real schema owner, representative input, expected result,
and destination. The names below are illustrative; substitute verified project resources.

```sh
superskill skill scaffold csv-summary --output ./skills --template technique --description "Summarize project CSV exports using the verified column schema. Use when preparing a report from those exports."
```

Inspect the generated seed and replace its generic sections. A small entry could look like this:

````markdown
---
name: csv-summary
description: Summarize project CSV exports using the verified column schema. Use when preparing a report from those exports.
---

# CSV Summary

1. Read the requested CSV and the project's current schema. Resolve the schema from project
   configuration; if it is unavailable, identify the missing source before interpreting columns.
2. Check required columns, types, and missing values. Report incompatible records instead of
   silently dropping them or inventing values.
3. Produce the requested summary in the project's report format. Keep source data unchanged.
4. Check totals against the input and state any excluded records and assumptions.
````

The author must resolve what "project configuration" and "report format" mean in the real project.
Point to their authoritative files or include necessary references with explicit loading conditions;
do not ship those phrases as unresolved placeholders.

## Choose resources deliberately

Use a reference for schema interpretation that is not already available from an authoritative file.
Use an asset only when the output needs a template and the distribution includes it.
Reuse the existing parser/report tool before adding a script.

For standalone skills, local scripts are allowed by the shared format. For superskill plugin skills,
follow [scripts-and-install.md](scripts-and-install.md). Scaffolding does not create these resources
or generate native companions automatically.

## Check the contribution

Validate the entry and references, then compare representative results with and without the skill
when the target runtime is available. Include a normal export, a missing required column, and a
near-miss request involving unrelated CSV data.

Check totals and treatment of missing values against the project contract. Test discovery separately
from explicit loading. Use [evaluation-framework.md](evaluation-framework.md) for comparisons,
holdouts, and limits. If only structure was checked, call it a structurally checked seed rather than
a proven improvement.
