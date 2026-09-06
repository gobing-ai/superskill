---
description: Refine a skill and its supporting files
argument-hint: "<nameOrPath> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Skill Refine

Wraps **cc:cc-skills** skill.

Run the skill's `refine` operation. Pass `$ARGUMENTS` unchanged and retain the request's
scope, context, and authorization. Preserve the requested scope and caller contracts. A requested dry run applies no edits;
CLI auto-fixes do not replace the skill's semantic refinement.

```text
Skill(skill="cc:cc-skills", args="refine $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed `cc-skills` skill and
follow its workflow. Use the equivalent CLI for the deterministic lane; CLI output does not
replace semantic review:

```text
superskill skill refine $ARGUMENTS
```

Return the delegated result and exact failures, including relevant verification and limitations.
