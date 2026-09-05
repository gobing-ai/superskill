---
description: Evaluate a main-agent config
argument-hint: "<nameOrPath> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Magent Evaluate

Wraps **cc:cc-magents** skill.

Run the skill's `evaluate` operation. Pass `$ARGUMENTS` unchanged and retain
the request's scope and authorization. Evaluation is review-only for the config
and emitted targets. Persist evaluation data only when requested; never edit the
configuration through evaluation.

```text
Skill(skill="cc:cc-magents", args="evaluate $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed
`cc-magents` skill and follow its workflow. Use the equivalent CLI for the
deterministic lane; its score or exit status does not replace semantic review:

```text
superskill magent evaluate $ARGUMENTS
```

Return heuristic signals separately from semantic findings and surface failures
without treating a passing score as proof of correctness.
