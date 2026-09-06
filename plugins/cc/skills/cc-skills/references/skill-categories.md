# Skill Categories

Use categories to identify the user's problem, not to fill a catalog quota. A requested skill may
span categories; an empty category is not evidence that another skill needs to be built.

| User purpose | Useful content | Example |
|---|---|---|
| Library and API reference | Verified versions, project conventions, meaningful edge cases | Explain correct use of an internal SDK. |
| Product verification | Observable outcomes, fixtures, state assertions | Exercise a signup flow in the test environment. |
| Data fetching and analysis | Source/schema ownership, query patterns, interpretation limits | Compare cohorts using the canonical event definitions. |
| Business process automation | Inputs, output contract, authorized integration steps | Draft a weekly report from available project records. |
| Scaffolding and templates | Existing templates and the decisions needed to fill them | Generate a handler matching the repository conventions. |
| Code quality and review | Criteria, evidence, severity, relevant deterministic checks | Review a change against its requirements and project policy. |
| CI/CD and deployment | Actual commands, rollout checks, recovery, authorization scope | Prepare and execute an authorized release. |
| Runbooks | Symptom-to-evidence routing and bounded recovery | Trace a failing request across relevant logs. |
| Infrastructure operations | Resource identity, blast radius, state checks | Identify unused resources and perform authorized cleanup. |

Choose the content type that fits: technique for steps, pattern for decisions, reference for lookup.
Do not add a video, hook, external notification, persistent log, or subagent merely because a
category example mentions one.

For deployment and maintenance, preserve the distinction between inspecting, preparing, and
performing side effects. For data work, verify schemas and access without embedding credentials.
For verification, inspect actual state; a plausible final report is not evidence of success.

Existing code, templates, docs, or native tools may already solve the problem. Use
[best-practices.md](best-practices.md) to decide what belongs in a skill and
[skill-patterns.md](skill-patterns.md) to choose a workflow.
