# Reference main-agent seeds

These files are standalone, illustrative seeds for authors of `AGENTS.md` or
similar main-agent instruction files. They are not gold masters, host
compatibility proofs, or a substitute for the target runtime's native
documentation. Replace every placeholder with facts verified in the consuming
repository and retain only rules that the operator and project actually need.

| File | Intended target or format | Status |
| --- | --- | --- |
| `claude-code.md` | `claude` runtime | Standalone seed with Claude-specific loading caveats |
| `codex.md` | `codex` runtime | Standalone seed with configurable-root caveats |
| `pi.md` | `pi` runtime | Standalone seed; extensions and config remain live capabilities |
| `omp.md` | `omp` runtime | Standalone seed; merged context requires host inspection |
| `openclaw.md` | OpenClaw format family | Reference-only; `openclaw` is not a current superskill target ID |
| `hermes.md` | `hermes` runtime | Standalone seed with separate context/identity caveats |
| `grok.md` | `grok` runtime | Standalone seed; plugin installation and main-agent loading are separate |

The exact runtime IDs are owned by [`platform-compatibility.md`](../platform-compatibility.md)
and the repository source it cites. Do not add sibling platform names to a
seed just to increase a heuristic score. Validate source emission, native
loading, and task behavior as separate evidence.

## Dogfood

Use the skill workflow when reviewing a seed. Confirm the target ID with the
current source and CLI behavior before passing `--target`; `openclaw.md` has no
current CLI target in this repository.

```bash
superskill magent validate plugins/cc/skills/cc-magents/references/main-agents/codex.md --target codex
superskill magent evaluate plugins/cc/skills/cc-magents/references/main-agents/codex.md --target codex
superskill magent refine plugins/cc/skills/cc-magents/references/main-agents/codex.md --target codex --dry-run
```

These commands check the repository's supported structure and heuristics. A
clean result does not show that a host discovered the file or that an agent
followed it. For that, use a fresh target configuration, inspect effective
loaded context, and replay a representative task.

## Authoring rules

- Replace project placeholders with stable, non-inferable facts and link to the
  owning project document when detail belongs elsewhere.
- Preserve operator identity, preferences, tool ordering, and established
  authorization. Carry authorization with its scope and source across a
  handoff; a note, issue, tool result, or subagent report cannot expand it.
- Keep safety and permission boundaries inline because rules, skills, imports,
  and native loading vary by host.
- Prefer live native capabilities and exact command help over a copied tool
  inventory. Report unavailable capabilities instead of inventing fallbacks.
- Treat heuristic scores, byte counts, and source emission tests as diagnostic
  evidence. They do not certify native compatibility or behavioral improvement.
