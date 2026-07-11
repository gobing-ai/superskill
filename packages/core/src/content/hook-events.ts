/**
 * Single owner of the Claude Code hook-event taxonomy.
 *
 * Two consumers previously kept divergent copies:
 * - `quality/hook.ts` (`KNOWN_HOOK_EVENTS`, 9 entries) used by `validate` to
 *   flag "unknown" events.
 * - `mapper.ts` (`CLAUDE_TO_CANONICAL_EVENT`, 15 entries) used to convert
 *   Claude Code PascalCase event names to rulesync canonical camelCase.
 *
 * The drift shipped a real bug (UserPromptSubmit silent drop, bug-041) and
 * caused `validate` to warn on events the mapper converts fine. Both consumers
 * now import from this module so the set and the mapping cannot diverge.
 */

/** The complete set of Claude Code hook event names (PascalCase). */
export const CLAUDE_HOOK_EVENTS = [
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'PreCompact',
    'Notification',
    'PreModelInvocation',
    'PostModelInvocation',
    'BeforeSubmitPrompt',
    'WorktreeCreate',
    'WorktreeRemove',
    'MessageDisplay',
] as const;

/** Backward-compatible alias — historical name for the event-name set. */
export const KNOWN_HOOK_EVENTS = CLAUDE_HOOK_EVENTS;

/** Claude Code PascalCase → rulesync canonical camelCase event names. */
export const CLAUDE_TO_CANONICAL_EVENT: Record<string, string> = {
    SessionStart: 'sessionStart',
    SessionEnd: 'sessionEnd',
    PreToolUse: 'preToolUse',
    PostToolUse: 'postToolUse',
    PreModelInvocation: 'preModelInvocation',
    PostModelInvocation: 'postModelInvocation',
    BeforeSubmitPrompt: 'beforeSubmitPrompt',
    // Claude Code's native event name for the prompt-submit hook is UserPromptSubmit;
    // rulesync's canonical name for the same event is beforeSubmitPrompt.
    UserPromptSubmit: 'beforeSubmitPrompt',
    Stop: 'stop',
    SubagentStop: 'subagentStop',
    PreCompact: 'preCompact',
    Notification: 'notification',
    WorktreeCreate: 'worktreeCreate',
    WorktreeRemove: 'worktreeRemove',
    MessageDisplay: 'messageDisplay',
};
