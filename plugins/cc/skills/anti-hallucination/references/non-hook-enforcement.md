# Non-Hook Enforcement Guide

Use this guide when the target coding platform does not support hook execution.

## Goal

Apply the same anti-hallucination verification rules without relying on a `Stop` hook.

The **standard** adapter for this mode resolves the staged validator entrypoint and runs it on a
portable runner. `superskill install cc` (task 0090) stages
`plugins/cc/scripts/anti-hallucination/validate_response.*` under the target's scripts root
(`~/.agents/scripts/cc/anti-hallucination/…` on rulesync targets; the full plugin tree on native
targets — claude/omp/grok). Entrypoint Contract v1 (task 0089) names the portable recipe:

```bash
# Standard — resolve the staged portable entrypoint, then run via its shebang runner
"$(superskill script path cc anti-hallucination/validate_response.js)"
```

Contract target: a Node-runnable `.js` (or `.mjs`) twin with a portable shebang so every install
host with Node on PATH can execute it — no Bun required. It validates a final answer using the same
`verifyAntiHallucinationProtocol` logic as `ah_guard.ts`.

> **Current repo state (interim).** The source tree still ships only
> `plugins/cc/scripts/anti-hallucination/validate_response.ts` (`#!/usr/bin/env bun`). Staging is
> byte-for-byte, so `script path …/validate_response.js` fails closed (exit 2) until a portable
> `.js` twin is added. **Until that twin ships, use the optional registry form below** for a working
> install-target invocation. The path recipe above remains the dual-contract **standard** authors
> must document and ship toward.

**Optional (binary registry).** If your target has the `superskill` CLI with the `cc/validate-response`
runner registered (`apps/cli/src/commands/script-run.ts`), the one-liner form still works — and is
the **working** install-target form until the portable `.js` twin lands:

```bash
# Optional — run the absorbed registry entry (no FS path needed; requires CLI ≥ 0.3.x)
# Working today on install targets without a .js twin
superskill script run cc validate-response
```

Both forms share the same engine, the same exit codes, and the same input modes. Prefer the **path**
form once the portable entrypoint is staged; prefer `script run` when you need a working invocation
today or want to stay inside the CLI with no staged files.

> **Dev-repo only.** Invoking the source `.ts` file directly via Bun from a repo checkout
> (the file lives under `plugins/cc/scripts/anti-hallucination/`) works **only from a source
> checkout** and is not an install-target form — the path is repo-relative and Bun is not a required
> target runtime. Use it for local debugging, never as the primary skill-doc recipe.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Validation passed |
| 1 | Validation failed |

These are **validation-CLI semantics, not the hook block signal** — hook adapters block with
exit 2 + reason on stderr (see `guard-implementation.md`). Do not wire `validate_response.ts`
into `hooks.json`; a host would treat its exit 1 as a non-blocking error. Wire
`superskill hook run cc anti-hallucination` instead.

## Input Modes

The validator accepts response text in either of these forms (both bind to the **entrypoint**,
whether invoked via the staged path or `script run`):

1. `RESPONSE_TEXT` environment variable
2. `STDIN`

## Usage Patterns

### Host-Side Validation

Validate a final answer produced by a non-hook agent workflow. Standard form (path):

```bash
export RESPONSE_TEXT="According to the official documentation at https://api.example.com, the method is getUser(id: string): User. **Confidence**: HIGH. Source: https://api.example.com/docs"
"$(superskill script path cc anti-hallucination/validate_response.js)"
```

Optional one-liner (binary registry):

```bash
superskill script run cc validate-response
```

### Pipe Final Output Through the Validator

Standard form (path):

```bash
printf '%s\n' "$FINAL_ANSWER" | "$(superskill script path cc anti-hallucination/validate_response.js)"
```

Optional one-liner (binary registry):

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

The workflow runs the target agent via `agent.run`, captures the answer, validates it via the staged
entrypoint (`validate_response.*` resolved through `superskill script path cc anti-hallucination/…`),
and branches: ok → return; fail → retry or deny.

**Until Phase 4 lands**, validate captured answer text with the path form
(`"$(superskill script path cc anti-hallucination/validate_response.js)"`) or the optional
`superskill script run cc validate-response`, or apply the reviewer workflow pattern below.

### Reviewer Workflow Pattern

If you cannot wrap the CLI directly, use a review step:

1. Draft the answer
2. Validate the draft with `"$(superskill script path cc anti-hallucination/validate_response.js)"`
   (or `superskill script run cc validate-response`)
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
`"$(superskill script path cc anti-hallucination/validate_response.js)"` (or
`superskill script run cc validate-response`) before display.

## Design Rule

Do not duplicate verification rules across platforms. Keep:

- `ah_guard.ts` for hook-based platforms (engine in `plugins/cc/scripts/anti-hallucination/`, invoked via `superskill hook run cc anti-hallucination`)
- `validate_response.*` for direct answer validation — **standard**: staged path resolved via `superskill script path cc anti-hallucination/validate_response.js`; **optional**: `superskill script run cc validate-response`
- `spur workflow run anti-hallucination.yaml` for cross-agent enforcement (Phase 4, pending)
- `SKILL.md` as the shared protocol and policy source

## See Also

- `../SKILL.md`
- `guard-implementation.md`
- `tool-usage-guide.md`
