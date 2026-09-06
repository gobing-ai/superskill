---
description: Evaluate a skill's instructions and evidence
argument-hint: "<nameOrPath> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Skill Evaluate

Wraps **cc:cc-skills** skill.

Run the skill's `evaluate` operation. Pass `$ARGUMENTS` unchanged and retain the request's
scope, context, and authorization. Keep the target unchanged. Preserve requested persistence options and distinguish static scores,
semantic findings, native host checks, and observed behavior.

```text
Skill(skill="cc:cc-skills", args="evaluate $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed `cc-skills` skill and
follow its workflow. Use the equivalent CLI for the deterministic lane; CLI output does not
replace semantic review:

```text
superskill skill evaluate $ARGUMENTS
```

Return the delegated result and exact failures, including relevant verification and limitations.
