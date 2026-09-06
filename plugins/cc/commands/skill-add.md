---
description: Create a skill from verified requirements
argument-hint: "<name> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Skill Add

Wraps **cc:cc-skills** skill.

Run the skill's `scaffold` operation. Pass `$ARGUMENTS` unchanged and retain the request's
scope, context, and authorization. Scaffold a seed and follow the skill's authoring and verification workflow. Lifecycle add maps
to scaffold; the CLI's skill add operation installs an existing skill.

```text
Skill(skill="cc:cc-skills", args="scaffold $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed `cc-skills` skill and
follow its workflow. Use the equivalent CLI for the deterministic lane; CLI output does not
replace semantic review:

```text
superskill skill scaffold $ARGUMENTS
```

Return the delegated result and exact failures, including relevant verification and limitations.
