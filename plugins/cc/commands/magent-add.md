---
description: Scaffold a main-agent config seed
argument-hint: "<name> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Magent Add

Wraps **cc:cc-magents** skill.

Run the skill's `scaffold` operation. Pass `$ARGUMENTS` unchanged and retain the
request's scope and authorization. The skill inspects project facts, emits the
requested seed, and owns the follow-up validation. Treat `--force` as an
authorized replacement only after inspecting the existing file; do not ask for
a second approval when the current request already authorizes replacement.

```text
Skill(skill="cc:cc-magents", args="scaffold $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed
`cc-magents` skill and follow its workflow. Use the equivalent CLI only for the
deterministic steps:

```text
superskill magent scaffold $ARGUMENTS
```

Return the delegated result and surface failures without claiming that a seed
is a verified configuration.
