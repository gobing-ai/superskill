---
description: Review skill evolution evidence and manage proposals
argument-hint: "<name> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Skill Evolve

Wraps **cc:cc-skills** skill.

Run the skill's `evolve` operation. Pass `$ARGUMENTS` unchanged and retain the request's
scope, context, and authorization. Preserve the requested analysis, proposal, apply, or rollback boundary. Use the skill's evidence
and gate guidance; a proposal or score cannot expand authorization.

```text
Skill(skill="cc:cc-skills", args="evolve $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed `cc-skills` skill and
follow its workflow. Use the equivalent CLI for the deterministic lane; CLI output does not
replace semantic review:

```text
superskill skill evolve $ARGUMENTS
```

Return the delegated result and exact failures, including relevant verification and limitations.
