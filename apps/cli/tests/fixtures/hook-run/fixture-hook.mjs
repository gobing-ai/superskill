// Fixture hook script for hook-run tests: records its stdin and the superskill env it got,
// then behaves per FIXTURE_MODE. Spawned (never imported), so coverage never instruments it.
const input = await Bun.stdin.text();
const dir = process.env.FIXTURE_DIR;
if (dir) {
    await Bun.write(`${dir}/stdin`, input);
    await Bun.write(
        `${dir}/env`,
        JSON.stringify({
            root: process.env.SUPERSKILL_PLUGIN_ROOT,
            id: process.env.SUPERSKILL_HOOK_ID,
            host: process.env.SUPERSKILL_HOOK_HOST,
            event: process.env.SUPERSKILL_HOOK_EVENT,
            profile: process.env.SUPERSKILL_HOOK_PROFILE,
        }),
    );
}
const mode = process.env.FIXTURE_MODE ?? 'silent';
const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
if (mode === 'deny') say({ decision: 'deny', reason: 'nope' });
if (mode === 'ask') say({ decision: 'ask', reason: 'sure?' });
if (mode === 'allow') say({ decision: 'allow' });
if (mode === 'block') say({ decision: 'block', reason: 'inbox' });
if (mode === 'claude-deny')
    say({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
        systemMessage: 'legacy deny',
    });
if (mode === 'claude-ask')
    say({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: 'legacy ask',
        },
    });
if (mode === 'claude-allow') say({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
if (mode === 'text') process.stdout.write('plain text\n');
if (mode === 'warn') process.stderr.write('a warning\n');
if (mode === 'exit2') {
    process.stderr.write('blocked by exit code');
    process.exit(2);
}
if (mode === 'crash') {
    process.stderr.write('boom');
    process.exit(3);
}
if (mode === 'sleep') await Bun.sleep(5000);
process.exit(0);
