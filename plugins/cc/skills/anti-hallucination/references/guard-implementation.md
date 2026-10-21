# Guard Implementation Guide

Confidence: MEDIUM — every claim here carries an in-repo line anchor; upstream sources were not re-verified in this pass.

Integration guide for the anti-hallucination guard script with Claude Code hooks.

## Overview

The `ah_guard.ts` script applies a heuristic check to responses before allowing a Stop event. It
blocks exactly one shape:

```
block ⇔ externalClaim(text) ∧ ¬textEvidence(text) ∧ ¬turnToolEvidence(currentTurn)
```

- **External claim**: the `requiresExternalVerification` heuristic — a strong claim (URL, version
  cue, "according to …") or an external-artifact word (`api`, `library`, `framework`, `sdk`,
  `package`, `endpoint`, `documentation`) coupled in the same sentence to what that thing
  does/has/requires.
- **Text evidence**: a recognizable citation or engineering-evidence marker in the reply — it does
  not verify the source.
- **Turn tool evidence**: a `WebFetch`/`WebSearch` call, or a tool under `mcp__ref__`,
  `mcp__grep__` or `mcp__brave-search__`, in the **current turn** of a Claude Code transcript. A
  tool name merely mentioned in the text is a claim, not evidence.

Confidence labels (`Confidence: HIGH|MEDIUM|LOW`) and uncertainty phrases are recommended prose, but
they are **not** decision inputs: neither can block on its own, and neither rescues an unevidenced
claim. `hasConfidenceLevel`, `hasRedFlags` and `hasToolUsageEvidence` stay exported for docs and
skills that describe those conventions.

A passing result means that response patterns matched. It does not prove that every claim is
supported, that a citation is relevant or current, or that the answer is true. The host remains
responsible for permissions, source access, and any consequential review.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Always. Allow omits `decision`; deny emits `decision:"block"` with a reason. The JSON decision is the Stop signal. |

Never use exit 1 or 2 to deny this Stop hook. Claude Code treats exit 1 as a non-blocking error and
discards canonical decision JSON at exit 2.

## Output Format

The guard writes the canonical Claude Stop JSON to stdout:

```json
{}
{"decision":"block","reason":"[anti-hallucination/v1] Uncited external claim. Reply only with its source (URL or path:line) or \"UNVERIFIED: <claim>\" — max 3 lines, no acknowledgement."}
```

`block` carries only `decision` + `reason` (Codex rejects `hookSpecificOutput` on Stop); `deny`
retains the `AfterAgent` envelope. The reason is the exported `BLOCK_REASON_V1`, so a host can match
`HOOK_FEEDBACK_TAG` (`[anti-hallucination/v1]`) instead of parsing prose.

## Hook Configuration

This is what the plugin ships in `plugins/cc/hooks/hooks.json`:

```json
{
  "minCliVersion": "0.2.19",
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "superskill hook run cc anti-hallucination",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

The command is a **portable PATH command**, not a plugin-root script path
(`bun ${CLAUDE_PLUGIN_ROOT}/scripts/...`): it resolves on every target with `superskill` on PATH,
and the dispatcher (`apps/cli/src/commands/hook-run.ts`) routes `cc/anti-hallucination` to the guard
engine. If the dispatcher is missing, this check cannot run; the host's command-error policy applies. `minCliVersion`
gates install so an older CLI cannot register a hook whose runtime contract (stdin payload
resolution + canonical exit-0 decision output) it does not implement.

Where the active host lacks applicable blocking-hook support, validate a captured answer with the
staged `node "$(superskill script path cc anti-hallucination/validate_response.mjs)"` twin (the
standard form; see `non-hook-enforcement.md`). `superskill script run cc validate-response` is also
available as the optional registry form. Discover host capabilities instead of assuming every
version or extension has the same hook semantics.

## Input Channels

Resolved by `resolveStopContext` — first non-empty channel wins:

| Channel | Payload | Sent by |
|---------|---------|---------|
| `ARGUMENTS` env var | JSON with `messages` array and optionally `last_message` | legacy/test harnesses |
| stdin | Claude Code Stop payload: `{"transcript_path": "...", "stop_hook_active": false, ...}` — the last textual assistant message **and** the current turn's tool calls are read from the transcript JSONL (one read, `TRANSCRIPT_TAIL_BYTES` cap); `stop_hook_active: true` allows immediately (block-loop guard) | Claude Code |
| stdin | omp `agent_end` event: `{"type": "agent_end", "messages": [...]}` | omp generated hook modules |

Unreadable input (invalid JSON, missing transcript) always resolves to **allow** — the guard fails
open by design. `ARGUMENTS`, `messages` and `last_message` payloads carry no transcript, so they
yield `turnTools: []` and are judged on text evidence alone. Codex rollout transcripts, Pi
`llmMessages`, omp `messages` and Gemini get `[]` for the same reason.

## Verification Rules

### Short Internal Messages (< 50 chars)
Short internal notes such as "Done" bypass verification only when the external-claim heuristic is
false. A short external claim still runs the protocol; length alone does not allow it.

### Internal Discussion
Messages that don't require external verification (no APIs, libraries, facts) are allowed.

### External Verification Signal
The current heuristic treats the following as signals that a message may require external verification:
- API mentions
- Library references
- **Version references** — only when a version cue is present: a `v`-prefix (`v2.0`), a version word (`version 2.0`, `release 1.4`, `semver 1.2.3`), or a 3-part semver (`1.2.3`). Bare 2-part decimals like `94.87` are NOT version claims — they are metrics, percentages, ratios, durations. *(0079)* (`plugins/cc/scripts/anti-hallucination/ah_guard.ts:379`)
- Documentation links
- Factual claims

When a signal is present, the guard requires **either** evidence form:

1. A recognizable citation or engineering-evidence marker — `[Source: …]`, `Source: …`, a `Sources:`
   list, a URL, **and (0079) engineering evidence** such as `file:line` anchors (`ah_guard.ts:288`),
   exit-code lines (`exit 0`), or pasted test-result lines (`1626 pass / 0 fail`). A bare fenced
   code block alone is not credited, and neither is a bare filename without `:line` — that is the
   0079 false-negative the anchor exists to close. This presence check does not establish support
   for every claim.
2. A verification tool call in the current turn — `WebFetch`, `WebSearch`, or a tool under
   `VERIFICATION_TOOL_PREFIXES` (`mcp__ref__`, `mcp__grep__`, `mcp__brave-search__`). The turn is
   bounded by the last real user prompt; tool calls from earlier turns do not count, and an
   `Agent`/`Task` call is credited only when its `subagent_type` is `web-fetch`.

A confidence label is no longer a requirement, and a missing label is no longer a reason to block.

**Why metrics no longer trip the guard (0079):** a metrics-dense verification verdict (`Coverage: func 94.87%, line 100.00%`, `1626 pass / 0 fail`, `exit 0`) used to be blocked because the broad `/\bv?\d+\.\d+\b/` regex read every decimal as a version. The cue-gated regex now requires a version cue, so evidence-dense turns pass instead of being false-positively blocked.

Claude Code delivers the hook payload on **stdin** (`$ARGUMENTS` is a slash-command substitution, not a hook channel). The Stop payload carries `transcript_path` rather than inline messages, so the guard reads the transcript JSONL to find the last textual assistant message.

## Testing

Run the test suite:

```bash
bun test plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts
```

## Customization

### Adding Red Flag Patterns

`RED_FLAG_PATTERNS` is exported through `hasRedFlags` for documentation and skills that describe
uncertainty phrasing, but nothing in the decision path reads it. Edit it in `ah_guard.ts` only to
change what that helper reports:

```typescript
const RED_FLAG_PATTERNS = [
  /I (?:think|believe|recall) (?:that|the)?/gi,
  /(?:It|This) (?:should|might|may|could)/gi,
  /Probably|Likely|Possibly/gi,
  /(?:As far as|If I) (?:know|recall)/gi,
  // Add your own patterns here
  /I(?:'m|'am) not sure/gi,
];
```

### Adjusting Verification Threshold

Very short *internal* notes (`"Done"`, `"LGTM"`) skip the protocol when
`requiresExternalVerification` is false. Short **external** claims still require evidence — the
length floor is not a smuggle path. Adjust the floor in `verifyAntiHallucinationProtocol`:

```typescript
// Empty → allow. Length < 50 *and* no external claim → allow.
// Short external claims (e.g. "The API returns a list.") still verify.
if (!text || text.trim().length === 0) { /* allow */ }
if (text.trim().length < 50 && !needsVerification) {  // Change 50 to your threshold
if (hasSourceCitations(text) || hasTurnToolEvidence(turnTools)) { /* allow */ }
```
