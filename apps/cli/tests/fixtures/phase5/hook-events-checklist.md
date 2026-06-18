# Hook Events Validation Checklist (Design §1.1)

> Validation pass — not a discovery pass. Confirms rulesync's `HookEvent` → native event
> mapping is lossless for the four ✅ targets, and that the rulesync API accepts `hooks`
> in `generate({ features })`. Source: `vendors/rulesync/src/types/hooks.ts`. Verified 2026-06-18.

## ✅ Targets — event-name fidelity

### codex (rulesync target: `codexcli`)

| Canonical event | Native (PascalCase) | Source |
|-----------------|---------------------|--------|
| `sessionStart` | `SessionStart` | `CANONICAL_TO_CODEXCLI_EVENT_NAMES:571` |
| `preToolUse` | `PreToolUse` | `:572` |
| `postToolUse` | `PostToolUse` | `:573` |
| `beforeSubmitPrompt` | `UserPromptSubmit` | `:574` |
| `stop` | `Stop` | `:575` |
| `permissionRequest` | `PermissionRequest` | `:576` |
| `subagentStart` | `SubagentStart` | `:577` |
| `subagentStop` | `SubagentStop` | `:578` |
| `preCompact` | `PreCompact` | `:579` |

Supported events: `CODEXCLI_HOOK_EVENTS` (9 events, `hooks.ts:241-251`). All 9 have 1:1 native mappings. **No lossy mapping.**

### opencode (rulesync target: `opencode`)

| Canonical event | Native (dot-notation) | Source |
|-----------------|----------------------|--------|
| `sessionStart` | `session.created` | `CANONICAL_TO_OPENCODE_EVENT_NAMES:483` |
| `preToolUse` | `tool.execute.before` | `:484` |
| `postToolUse` | `tool.execute.after` | `:485` |
| `stop` | `session.idle` | `:486` |
| `afterFileEdit` | `file.edited` | `:487` |
| `afterShellExecution` | `command.executed` | `:488` |
| `permissionRequest` | `permission.asked` | `:489` |

Supported events: `OPENCODE_HOOK_EVENTS` (7 events, `hooks.ts:128-136`). All 7 have 1:1 native mappings. **No lossy mapping.**

### antigravity-cli / antigravity-ide (rulesync target: `antigravity-cli` / `antigravity-ide`)

| Canonical event | Native (PascalCase) | Source |
|-----------------|---------------------|--------|
| `preToolUse` | `PreToolUse` | `CANONICAL_TO_ANTIGRAVITY_EVENT_NAMES:408` |
| `postToolUse` | `PostToolUse` | `:409` |
| `preModelInvocation` | `PreInvocation` | `:410` |
| `postModelInvocation` | `PostInvocation` | `:411` |
| `stop` | `Stop` | `:412` |

Supported events: `ANTIGRAVITY_HOOK_EVENTS` (5 events, `hooks.ts:295-301`). All 5 have 1:1 native mappings. **No lossy mapping.**

## rulesync API shape

- `generate({ features: [...] })` accepts `'hooks'` in the features array — confirmed at `rulesync.ts:60-69`
- `install.ts:130` lists `'hooks'` in `rulesyncFeatures`
- `install.ts:151` forwards `rulesyncFeatures` to `runRulesyncImpl` → `generate()`
- `GenerateResult` includes `hooksCount: number` and `hooksPaths: string[]` — confirmed at `rulesync.ts:51-52` (early return) and returned by `rulesyncGenerate`

## Conclusion

No redesign needed. All four ✅ targets have lossless event-name mappings. The rulesync API already accepts and returns hook data. The only defect was in install reporting (task 0034), now fixed.
