# Platform Compatibility

Shared file format, superskill validation, installation, and native host behavior are separate
contracts. Verify the layers used by the target skill before claiming compatibility.

## Portable core

The [Agent Skills specification](https://agentskills.io/specification) requires a directory with
`SKILL.md`, YAML frontmatter, and a Markdown body. Its portable core uses a nonempty `name`
matching the directory and a description of the task and when to use it. Optional resources include
scripts, references, and assets. The specification defines naming/field limits and recommends
progressive disclosure; its size guidance is not a universal runtime limit.

Keep portable metadata as string key/value pairs. Native extensions may use other shapes;
document their host and check the actual parser rather than assuming every reader handles them.

Superskill plugins add a repository layout rule: executable engines live outside the skill
directory. This does not prohibit scripts in standalone Agent Skills.
See [scripts-and-install.md](scripts-and-install.md).

## Native behavior to verify

| Host or surface | Relevant distinction | Evidence to use |
|---|---|---|
| Claude Code | Invocation visibility, tool pre-approval, argument substitution, forked context, and hooks are native extensions. Explicit-only invocation can break programmatic callers. | [Claude Code skills documentation](https://code.claude.com/docs/en/skills) and the installed version |
| Codex | `agents/openai.yaml` is optional product metadata; it is not an agent executable or an invocation API. Native invocation policy is distinct from Claude frontmatter. | Installed skill-authoring reference and [OpenAI skill documentation](https://developers.openai.com/codex/skills/) |
| OpenClaw | Eligibility and requirements are read using the native skill metadata/config contract. A file named `metadata.openclaw` is not by itself proof of native integration. | [OpenClaw skills documentation](https://docs.openclaw.ai/tools/skills) and installed source/config |
| OpenCode, Gemini CLI, Antigravity, Pi, and other hosts | Discovery roots, project/global precedence, permission controls, tools, and invocation vary. Product families are not interchangeable. | The actual host's installed help/source and official documentation, plus superskill's live target capability output |
| Superskill lifecycle, installer, and packager | Each has its own accepted identifiers and output behavior. A known install target need not support every lifecycle or native feature. | Leaf `--help`, target guidance, and the installed artifact |

Format/host references above were checked on **2026-09-05** and are rolling documentation.
They are not archived proof of every native feature as of August 31. Dated pre-cutoff research
supporting the engineering method lives in [evaluation-framework.md](evaluation-framework.md#research-basis-and-limits).

## Invocation and permissions

Discover the host's available tools and supported skill invocation mechanism. If a native skill
loader is unavailable, read the installed skill and follow its workflow with available tools;
do not invent commands such as a universal `skills invoke` or assume a tool named `Bash`.

For Claude Code, `disable-model-invocation: true` prevents model invocation; `user-invocable`
controls menu visibility. These controls have different purposes. Native `allowed-tools`
pre-approves listed tools under the host's permission system; it is not a restrictive sandbox
allowlist. Keep actual restrictions in the host's enforced permissions.

For Codex, use the native companion policy when needed; the installed authoring reference documents
`policy.allow_implicit_invocation`. Changing a Claude field alone does not establish equivalent
Codex behavior. A small optional UI companion is:

```yaml
interface:
  display_name: "Project Report"
  short_description: "Create reports using the project schema"
```

Do not generate unknown fields or a default prompt with an unverified installed skill name.
Do not translate hooks or discard an unsupported permission field silently; check whether the
lost behavior is essential before claiming a migration works.

## Compatibility checks

1. Identify the actual host/version and requested scope; inspect its discovery roots and duplicate
   names before choosing a destination. Check the installed name after any adapter rewriting.
2. Validate the shared format and superskill-specific constraints. Do not infer native validation
   of hooks, companions, permission settings, or runtime commands from `skill validate`.
3. Inspect source-to-install transformations: frontmatter, names, references, executable delivery,
   symlinks, companions, and any unsupported fields. Preserve source authority and caller intent.
4. In the host, confirm discovery and invocation, resolve a required reference, and exercise the
   relevant tool/permission behavior in an isolated fixture.
5. Report compatibility for the tested configuration. Mark other hosts untested; a shared Markdown
   source does not establish that all hosts loaded or executed it equivalently.

Scaffold writes the entry file; refine does not automatically regenerate native companions.
There is no universal `--platform all` or `--target all` workflow. Packaging can omit required
resources; its precise limits are in [workflows.md](workflows.md#package).

## Adapter ownership

This skill's `adapters/` directory contains guidance, not executable adapters. Source-checkout
owners are `packages/core/src/targets.ts`, `packages/core/src/mapper.ts`, the transformation
modules under `packages/core/src/pipeline/`, and
`packages/core/src/skills-ecosystem/agents.ts` for standalone skill install discovery.
Follow the relevant implementation instead of maintaining a second path/feature matrix here.
