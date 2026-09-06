# Skill Authoring Practices

This reference owns content choices. Use [workflows.md](workflows.md) for operation steps and
[evaluation-framework.md](evaluation-framework.md) for testing and the dated research basis.

## Start with the useful contribution

Identify a real task, reusable project knowledge, explicit preference, or failure the skill should
address. Check existing tools, skills, native features, and authoritative documentation first.
A skill should add information or process that helps the target agent; it need not teach general
programming or restate the entire repository.

Do not require a demonstrated failure before encoding a known requirement. Conversely, do not
grow a skill from every isolated incident: a tool bug, missing dependency, or wrong installation
belongs at its owning surface.

## Write for selection

Put the core task and its applicability in the description. Use the user's language and realistic
request variants. Include a meaningful boundary when overlap makes selection ambiguous. Keep the
body's procedure in the body; avoid a keyword list that promises unrelated capabilities.

Test both missed triggers and false triggers. Do not pad a description to meet a branch-count
heuristic. Explicit-only invocation is host-specific; preserve dispatch callers when changing it.
See [platform-compatibility.md](platform-compatibility.md).

## Give the agent the right freedom

Specify outcomes and invariants for flexible work. Specify exact ordering where a dependency,
fragile format, or irreversible operation requires it. Use a deterministic tool for a deterministic
rule; leave task-specific judgment to the agent when the choice cannot be encoded reliably.

A useful instruction connects a condition to an action and completion evidence. For example:
"When the schema file is missing, locate its configured source; if unavailable, report the missing
path before generating records." This is more actionable than "be careful" without requiring a
rigid procedure for every situation.

Keep necessary prohibitions. Add an allowed next action where it helps, but do not remove "do not
overwrite the source" merely because it is negative. Preserve operator wording when it carries
a deliberate constraint.

## Organize context by need

- Keep selection, essential boundaries, and the operation router in the entry file.
- Put specialized workflows and facts in references with explicit read conditions and useful names.
- Keep templates and other output resources in assets when the chosen distribution includes them.
- Use scripts for deterministic work only when an existing tool does not already handle it.

Resolve resource paths from the skill's location, not an assumed working directory. Link to the
owning reference directly; avoid chains the host cannot discover reliably. Do not add empty folders
or minimum numbers of references, examples, tables, or troubleshooting entries.

Moving text under a heading does not reduce already-loaded context. References save context only
when the actual loader and workflow defer them. Measure the effective load when optimizing it;
vendor size recommendations are guidance, not universal hard caps.

## Ground technical instructions

Verify commands against installed help or source. Check version-sensitive APIs and platform
behavior against primary documentation or the matching installed source. Cite the owner instead of
copying a schema or option catalog. Distinguish a current rolling page from a historical snapshot.

Examples should execute in the intended environment or clearly show what must be substituted.
Avoid fake paths, APIs, credentials, and success messages presented as real output. Label illustrative
fixtures and unrun examples. Check source paths and symbols before writing citations.

For cross-platform skills, keep shared instructions portable and isolate necessary native behavior.
Do not assume that a YAML field, hook, companion file, or tool name has the same meaning everywhere.

## Use examples where they prevent ambiguity

Choose examples that expose a difficult decision, boundary, format, or recurring mistake.
Include a useful near miss or failure case when it clarifies behavior. Preserve examples that
improve outcomes; remove repetitive walkthroughs that contribute no new decision.

Prefer real project conventions and verified templates over generic boilerplate. Match the user's
requested output and language; a strict schema is useful when a consumer requires it, not as ceremony.

## Handle state and tools deliberately

Inspect required dependencies before execution. Prefer the existing environment and package manager;
do not install packages, broaden permissions, or send data elsewhere simply because a snippet says so.
Follow [security.md](security.md) for trust boundaries and side effects.

Reuse an existing owner for state and logs. If persistence is needed, use a verified host/project
location outside replaceable skill installation content, with suitable access and retention.
Keep credentials in the supported secret mechanism, not in skill text or evaluation artifacts.
A platform-specific variable is not a portable storage contract.

Superskill plugin executables belong at plugin level; standalone skills may include local scripts.
Use [scripts-and-install.md](scripts-and-install.md) to choose the actual delivery path.

## Keep refinement accountable

Preserve the original intent, caller compatibility, and hard constraints. Prefer a focused diff.
Check the whole relevant instruction path before deleting a sentence; its value can depend on
another instruction, an example, or a rare but severe case.

Use meaningful development cases and holdouts when tuning behavior. Stop when the request and
applicable checks are satisfied. Report remaining uncertainty, stale external dependencies, and
unrun host checks explicitly. A high grade is not a reason to publish, install globally, or declare
production readiness.
