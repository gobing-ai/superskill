# Non-Hook Enforcement Guide

Use this guide when the target coding platform does not support hook execution.

## Goal

Apply the same anti-hallucination verification rules without relying on a `Stop` hook.

The reusable adapter for this mode is:

```bash
superskill script run cc validate-response
```

It validates a final answer using the same `verifyAntiHallucinationProtocol` logic as `ah_guard.ts`.
The dispatcher deep-imports the engine from `plugins/cc/scripts/anti-hallucination/` at CLI build
time, so the command works from any cwd on any target with `superskill` on PATH — no script files
are installed. (Direct `bun` invocation of the source path works only from a source checkout.)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Validation passed |
| 1 | Validation failed |

These are **validation-CLI semantics, not the hook block signal** — hook adapters block with
exit 2 + reason on stderr (see `guard-implementation.md`). Do not wire `validate_response.ts`
into `hooks.json`; a host would treat its exit 1 as a non-blocking error. Wire `superskill hook run cc anti-hallucination` instead.

## Input Modes

The validator accepts response text in either of these forms:

1. `RESPONSE_TEXT` environment variable
2. `STDIN`

## Usage Patterns

### Host-Side Validation

Validate a final answer produced by a non-hook agent workflow:

```bash
export RESPONSE_TEXT="According to the official documentation at https://api.example.com, the method is getUser(id: string): User. **Confidence**: HIGH. Source: https://api.example.com/docs"
superskill script run cc validate-response
```

### Pipe Final Output Through the Validator

```bash
printf '%s\n' "$FINAL_ANSWER" | superskill script run cc validate-response
```

### Cross-Agent Enforcement (Spur Workflow — Phase 4, pending)

The previous per-agent launcher scripts (`run_with_validation.ts`, `run_codex_with_validation.ts`,
etc.) are being redeveloped as a single `spur workflow` + `spur agent` solution. One workflow YAML,
parameterized by an agent variable, will cover codex/openclaw/opencode/pi — replacing the 6
hand-rolled launcher scripts.

**Target invocation (when Phase 4 lands):**

```bash
spur workflow run anti-hallucination.yaml --vars '{"agent":"codex"}'
```

The workflow runs the target agent via `agent.run`, captures the answer, validates it via
`response.validate` (engine from `plugins/cc/scripts/anti-hallucination/`), and branches:
ok → return; fail → retry or deny.

**Until Phase 4 lands**, validate captured answer text with `superskill script run cc validate-response`, or apply
the reviewer workflow pattern below.

### Reviewer Workflow Pattern

If you cannot wrap the CLI directly, use a review step:

1. Draft the answer
2. Validate the draft with `superskill script run cc validate-response`
3. If validation fails, revise and re-run validation
4. Only publish when validation passes

### Structured Output Pattern

When the host platform can enforce schemas, require fields like:

```json
{
  "answer": "...",
  "sources": ["..."],
  "confidence": "HIGH",
  "verification_steps": ["ref_search_documentation ..."]
}
```

The host can then serialize the final `answer` block and validate it with `superskill script run cc validate-response` before display.

## Design Rule

Do not duplicate verification rules across platforms. Keep:

- `ah_guard.ts` for hook-based platforms (engine in `plugins/cc/scripts/anti-hallucination/`, invoked via `superskill hook run cc anti-hallucination`)
- `validate_response.ts` for direct answer validation (invoked via `superskill script run cc validate-response`)
- `spur workflow run anti-hallucination.yaml` for cross-agent enforcement (Phase 4, pending)
- `SKILL.md` as the shared protocol and policy source

## See Also

- `../SKILL.md`
- `guard-implementation.md`
- `tool-usage-guide.md`
