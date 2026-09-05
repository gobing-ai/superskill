# Non-Hook Enforcement Guide

Use this guide when the target coding platform does not support hook execution.

## Goal

Apply the same anti-hallucination verification rules without relying on a `Stop` hook.
The validator checks response patterns, not source truth or actual tool execution. Keep its result
separate from the evidence supporting the answer; never invent citations to obtain a pass.

The **standard** form is the staged path — the portable `.mjs` twin is staged at install time under
the agents scripts root and resolved via `script path` (ADR-023: path invocation is the invocation
standard for skill docs and other non-hook callers):

```bash
# Standard — resolve the staged portable entrypoint, run under Node
node "$(superskill script path cc anti-hallucination/validate_response.mjs)"
```

The twin (`plugins/cc/scripts/anti-hallucination/validate_response.mjs`) is generated from the `.ts`
source by `bun run build:scripts` / `superskill script convert cc anti-hallucination/validate_response.ts`;
regenerate it when `validate_response.ts` or `ah_guard.ts` changes.

**Optional (registry).** `cc/validate-response` is additionally compiled into the `superskill` CLI
(deep-imported at build time; `apps/cli/src/commands/script-run.ts`), so it runs the same
`verifyAntiHallucinationProtocol` engine with no filesystem path, no staging, no separate runtime:

```bash
# Optional — absorbed registry entry (no FS path needed; reads RESPONSE_TEXT or stdin)
superskill script run cc validate-response
```

Both forms share the same engine, exit codes, and input modes.

> **Dev-repo only.** Invoking the source `.ts` file directly via Bun from a repo checkout
> (the file lives under `plugins/cc/scripts/anti-hallucination/`) works **only from a source
> checkout** and is not an install-target form — the path is repo-relative. Use it for local
> debugging, never as the primary skill-doc recipe.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Validation passed |
| 1 | Validation failed |

These are **validation-CLI semantics, not the hook block signal** — the hook adapter emits
canonical `decision:"block"` JSON and exits 0 (see `guard-implementation.md`). Do not wire
`validate_response.ts` into `hooks.json`; a host would treat its exit 1 as a non-blocking error.
Wire `superskill hook run cc anti-hallucination` instead.

## Input Modes

The validator accepts response text in either of these forms (both bind to the **entrypoint**,
whether invoked via the staged path or `script run`):

1. `RESPONSE_TEXT` environment variable
2. `STDIN`

## Usage Patterns

### Host-Side Validation

Validate a final answer produced by a non-hook agent workflow. Standard form (staged path):

```bash
export RESPONSE_TEXT="According to the official documentation at https://api.example.com, the method is getUser(id: string): User. **Confidence**: HIGH. Source: https://api.example.com/docs"
node "$(superskill script path cc anti-hallucination/validate_response.mjs)"
```

Optional form (registry):

```bash
superskill script run cc validate-response
```

### Pipe Final Output Through the Validator

Standard form (staged path):

```bash
printf '%s\n' "$FINAL_ANSWER" | node "$(superskill script path cc anti-hallucination/validate_response.mjs)"
```

Optional form (registry):

```bash
printf '%s\n' "$FINAL_ANSWER" | superskill script run cc validate-response
```

### Cross-Agent Validation

This package ships the validator, not a cross-agent workflow YAML. Use the project's existing
answer-capture mechanism with the staged path or optional registry form above. Check the current
host's capabilities; do not assume a hook can block output or that a proposed workflow exists.

### Reviewer Workflow Pattern

If you cannot wrap the CLI directly, use a review step:

1. Draft the answer
2. Validate the draft with `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"`
   (or the optional `superskill script run cc validate-response`)
3. If validation fails, inspect the reason and correct unsupported claims or missing evidence;
   keep honest uncertainty even when a heuristic rejects it
4. Inspect the underlying sources and report the result within the authorized task scope;
   a validator pass does not authorize publication or prove factuality

### Structured Output Pattern

When the host platform can enforce schemas, require fields like:

```json
{
  "answer": "...",
  "sources": ["..."],
  "confidence": "HIGH",
  "verification_steps": ["host-native official documentation search ..."]
}
```

The current validator reads answer text, not the structured schema. Include the actual source,
confidence and verification fields in the text submitted for validation; passing only `answer`
would discard the evidence fields. Use
`node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` (or the optional
`superskill script run cc validate-response`) for the text check. Schema validity is a separate check.

## Design Rule

Do not duplicate verification rules across platforms. Keep:

- `ah_guard.ts` for hook-based platforms (engine in `plugins/cc/scripts/anti-hallucination/`, invoked via `superskill hook run cc anti-hallucination`)
- `validate_response.*` for direct answer validation — **standard**: staged path `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"`; **optional**: `superskill script run cc validate-response`
- The project's existing answer-capture mechanism for cross-agent validation, when available
- `SKILL.md` as the shared protocol and policy source

## See Also

- `../SKILL.md`
- `guard-implementation.md`
- `tool-usage-guide.md`
