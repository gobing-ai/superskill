# Guard Implementation Guide

Integration guide for the anti-hallucination guard script with Claude Code hooks.

## Overview

The `ah_guard.ts` script enforces the anti-hallucination protocol by analyzing responses before allowing a Stop event. It checks for:

- **Source citations**: Verification that claims are backed by cited sources
- **Confidence levels**: Explicit HIGH/MEDIUM/LOW confidence scoring
- **Tool usage evidence**: Proof that verification tools were used
- **Red flags**: Uncertainty phrases that indicate unverified claims

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Allow stop (protocol followed) |
| 2 | Deny stop (universal cross-agent block signal; the reason is also written to stderr). Claude Code treats exit 1 as a *non-blocking* error, so 1 can never block a Stop. |

## Output Format

The guard writes the canonical Claude Stop JSON to stdout:

```json
{"hookSpecificOutput":{"hookEventName":"Stop"}}
{"decision":"block","reason":"Add verification for: source citations for API/library claims, confidence level (HIGH/MEDIUM/LOW)","hookSpecificOutput":{"hookEventName":"Stop"}}
```

## Hook Configuration

Add to your `.claude/hooks/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bun ${CLAUDE_PLUGIN_ROOT}/scripts/anti-hallucination/ah_guard.ts",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

For platforms without hooks, use `validate_response.ts` instead. See `non-hook-enforcement.md`.

## Input Channels

Resolved by `resolveStopContext` — first non-empty channel wins:

| Channel | Payload | Sent by |
|---------|---------|---------|
| `ARGUMENTS` env var | JSON with `messages` array and optionally `last_message` | legacy/test harnesses |
| stdin | Claude Code Stop payload: `{"transcript_path": "...", "stop_hook_active": false, ...}` — the last textual assistant message is read from the transcript JSONL; `stop_hook_active: true` allows immediately (block-loop guard) | Claude Code |
| stdin | omp `agent_end` event: `{"type": "agent_end", "messages": [...]}` | omp generated hook modules |

Unreadable input (invalid JSON, missing transcript) always resolves to **allow** — the guard fails open by design.

## Verification Rules

### Short Messages (< 50 chars)
Short messages like "Done" or "Let me think about that" are allowed without verification.

### Internal Discussion
Messages that don't require external verification (no APIs, libraries, facts) are allowed.

### External Verification Required
When a message contains:
- API mentions
- Library references
- Version numbers
- Documentation links
- Factual claims

The guard requires BOTH:
1. Source citations for all claims
2. Confidence level (HIGH/MEDIUM/LOW)

AND EITHER:
- Tool usage evidence (showing verification was performed)
- No red flag phrases

Claude Code delivers the hook payload on **stdin** (`$ARGUMENTS` is a slash-command substitution, not a hook channel). The Stop payload carries `transcript_path` rather than inline messages, so the guard reads the transcript JSONL to find the last textual assistant message.

## Testing

Run the test suite:

```bash
bun test plugins/cc/scripts/anti-hallucination/tests/ah_guard.test.ts
```

## Customization

### Adding Red Flag Patterns

Edit `SOURCE_PATTERNS`, `CONFIDENCE_PATTERNS`, `TOOL_PATTERNS`, or `RED_FLAG_PATTERNS` in `ah_guard.ts`:

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

Modify the minimum message length check in `verifyAntiHallucinationProtocol`:

```typescript
if (!text || text.trim().length < 50) {  // Change 50 to your threshold
```
