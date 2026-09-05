---
description: Evolve a main-agent config from evidence
argument-hint: "<name> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Magent Evolve

Wraps **cc:cc-magents** skill.

Run the skill's `evolve` operation. Pass `$ARGUMENTS` unchanged and retain the
request's scope and authorization. Preserve the requested action mode:
analysis and proposal review do not become apply or rollback; the skill owns
evidence gates, anchor provenance, and verification.

```text
Skill(skill="cc:cc-magents", args="evolve $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed
`cc-magents` skill and follow its workflow. Use the equivalent CLI for the
deterministic lane:

```text
superskill magent evolve $ARGUMENTS
```

Return the delegated result and surface failures without presenting a proposal
or score as proof that an applied change is safe.
