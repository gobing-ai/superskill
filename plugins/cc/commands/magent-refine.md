---
description: Refine a main-agent config
argument-hint: "<nameOrPath> [options]"
allowed-tools: ["Skill", "Bash(superskill:*)"]
---

# Magent Refine

Wraps **cc:cc-magents** skill.

Run the skill's `refine` operation. Pass `$ARGUMENTS` unchanged and retain the
request's scope and authorization. Preserve the distinction between
deterministic structural fixes and semantic edits: `--dry-run` writes nothing,
while `--auto` applies only the CLI's eligible fixes. Do not broaden a requested
edit or claim that `--auto` rewrote the body.

```text
Skill(skill="cc:cc-magents", args="refine $ARGUMENTS")
```

If the native `Skill` mechanism is unavailable, read the installed
`cc-magents` skill and follow its workflow. Use the equivalent CLI for the
deterministic lane; CLI output does not replace semantic review:

```text
superskill magent refine $ARGUMENTS
```

Return the delegated result and surface failures without weakening verification
or safety boundaries.
