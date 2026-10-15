// Fixture hook command for the generated Pi extension tests: records the payload and the
// superskill env it got, then answers per argv mode. Spawned (never imported), so coverage never
// instruments it.
import { appendFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'silent';
const input = await new Response(Bun.stdin.stream()).text();
const dir = process.env.FIXTURE_DIR;
if (dir) {
    const record = {
        payload: JSON.parse(input),
        host: process.env.SUPERSKILL_HOOK_HOST,
        event: process.env.SUPERSKILL_HOOK_EVENT,
        cwd: process.cwd(),
    };
    appendFileSync(`${dir}/calls.jsonl`, `${JSON.stringify(record)}\n`);
}
const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
if (mode === 'deny') say({ decision: 'deny', reason: 'nope' });
if (mode === 'deny-bare') say({ decision: 'deny' });
if (mode === 'ask') say({ decision: 'ask', reason: 'sure?' });
if (mode === 'ask-bare') say({ decision: 'ask' });
if (mode === 'block') say({ decision: 'block', reason: 'keep going' });
if (mode === 'allow') say({ decision: 'allow' });
if (mode === 'claude-ask') {
    say({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
        systemMessage: 'legacy ask',
    });
}
if (mode === 'claude-rewrite') {
    say({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', updatedInput: {} } });
}
if (mode === 'text') process.stdout.write('plain text\n');
if (mode === 'null') process.stdout.write('null\n');
if (mode === 'exit2') {
    process.stderr.write('blocked by exit code\n');
    process.exit(2);
}
if (mode === 'exit2-silent') process.exit(2);
if (mode === 'crash') {
    say({ decision: 'deny', reason: 'ignored' });
    process.exit(3);
}
if (mode === 'sleep') await Bun.sleep(5000);
process.exit(0);
