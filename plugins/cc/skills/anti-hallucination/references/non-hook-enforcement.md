# Non-Hook Enforcement Guide

Use this guide when the target coding platform does not support hook execution.

## Goal

Apply the same anti-hallucination verification rules without relying on a `Stop` hook.

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
the staged `validate_response.mjs` entrypoint (or the optional `superskill script run cc validate-response`), and
branches: ok → return; fail → retry or deny. The validator engine is ready; the orchestrating
workflow itself remains pending — blocked on Spur's `agent.run` output-capture (data-threading) gap
(ADR-015), not on this validator. Until that gap closes, validate manually on any agent (including
pi/omp/grok/OpenCode, which have no prevent-stop hook).

**Until Phase 4 lands**, validate captured answer text with the staged path
`node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` (or the optional
`script run` form), or apply the reviewer workflow pattern below.

### Reviewer Workflow Pattern

If you cannot wrap the CLI directly, use a review step:

1. Draft the answer
2. Validate the draft with `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"`
   (or the optional `superskill script run cc validate-response`)
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

The host can then serialize the final `answer` block and validate it with
`node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` (or the optional
`superskill script run cc validate-response`) before display.

## Design Rule

Do not duplicate verification rules across platforms. Keep:

- `ah_guard.ts` for hook-based platforms (engine in `plugins/cc/scripts/anti-hallucination/`, invoked via `superskill hook run cc anti-hallucination`)
- `validate_response.*` for direct answer validation — **standard**: staged path `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"`; **optional**: `superskill script run cc validate-response`
- `spur workflow run anti-hallucination.yaml` for cross-agent enforcement (Phase 4, pending)
- `SKILL.md` as the shared protocol and policy source

## See Also

- `../SKILL.md`
- `guard-implementation.md`
- `tool-usage-guide.md`
