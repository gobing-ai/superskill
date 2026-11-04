---
name: grok-bot-probe
description: >-
  Read-only host capability probe producing one receipt for `superskill doctor
  --targets grok-bot`. Triggers: "probe this Bot host", "capture host
  capabilities", "produce the grok-bot receipt", "run cc-grok-bot-probe".
  Never installs, registers or networks anything.
---

# Grok Bot host capability probe (read-only)

## Purpose

`superskill doctor` on the operator side only reads a receipt file — it cannot
see this host. Your job: run the eight probes below and write **exactly one**
JSON receipt at

```
<dataRoot>/.superskill/grok-bot/probe/receipt.json
```

(default `<dataRoot>` = `$SAND_DATA` when it is a real directory, else
`~/sand-data`, else `~/agent-data`; the operator may give you an absolute
receipt path instead).

Every capability gets one honest status. This receipt is how feature decisions
acquire evidence; a guess or an inference here poisons everything downstream.

## Status rules (exact)

- `observed` — you exercised or read the capability successfully in this run.
- `absent` — you looked for it and confirmed it is missing.
- `unverified` — you could not determine it (tool missing, permission denied,
  surface not exposed). **Never** upgrade `unverified` by inference from a
  neighbouring capability, and never synthesize an entry for an id you did not
  probe.

## Bootstrap

No `/` command exists for this skill. A human starts it by pasting, e.g.:

> Read and follow `$SAND_DATA/workflows/cc-grok-bot-probe/SKILL.md`
> (or the path I give you) and produce the grok-bot receipt.

## The eight probes

| id | Permitted read-only action | Status guidance |
| --- | --- | --- |
| `host-os-arch` | Run `uname -s -m` (or the platform equivalent). | value = `<os>-<arch>`. unverified if Shell is not permitted. |
| `host-home` | Run `echo $HOME`. | value = the user's home directory path only. Never list or read its contents. |
| `sand-env` | Run `[ -n "$SAND_DATA" ] && echo set || echo unset`. | `absent` when unset; value = the **variable name** `SAND_DATA` only — never its value. |
| `sand-roots` | Check which of `$SAND_DATA`, `~/sand-data`, `~/agent-data` exist as directories. | value = array of the names exist, e.g. `["~/sand-data"]`. `absent` when none exists. |
| `skill-save` | Inspect which host tool would persist a skill file (your own tool surface). | value = the tool name only when you can name it from an actual invocation surface; otherwise `unverified`. Do not write to test it. |
| `plugin-install` | Look for a documented personal-install route you can see from inside this host. | value = short route description when concretely observable; `absent` only when the host confirms no such surface; otherwise `unverified`. |
| `runtime-persistence` | Check whether files you did **not** create this run — authored by a previous session — are still readable. | `absent` only when the host confirms it wipes session files; otherwise `unverified`. Do not write files to test persistence. |
| `mcp-command` | Check whether the host exposes an MCP command or MCP tool surface. | value = the command/tool name when observed; otherwise `unverified`. |

Record an `evidence` string (≤200 chars) per probe: the command you ran or the
source you read. Evidence is a citation, not output.

## Sanitization (mandatory)

- Environment **names** only — never `$VAR` values.
- Paths limited to the user's home directory and the Sand root; use `~/...`
  shorthand for anything under `$HOME`.
- No token, cookie, key, session or credential material in any field, ever.
- Truncate every `value`/`evidence` string to 200 characters before writing.

## Write rule (single file)

1. Run the probes; never write anything except the receipt.
2. Create only the receipt file's parent directory if missing, then write the
   JSON below. Delete nothing; keep other files untouched.
3. No install or registration of anything, no `update_state` writes, no network
   access of any kind.

```json
{
  "schemaVersion": 1,
  "kind": "superskill.grok-bot.probe",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "capabilities": [
    { "id": "<the eight ids from the table above, each exactly once>", "status": "observed | absent | unverified", "value": "<string | string[] | null>", "evidence": "<string | null>" }
  ]
}
```

(Include all eight ids even when unverified; use your real UTC ISO-8601
`generatedAt`, never the placeholder.)

## Self-check

After writing, re-read the file and confirm it parses as JSON, `kind` is
`superskill.grok-bot.probe`, `schemaVersion` is `1`, and all eight ids appear
exactly once. If the re-read fails, rewrite once; if it fails again, stop and
report the failure — do not leave a partial receipt behind.

## Closing report

Tell the human: the receipt path, the one-line status of each of the eight
capabilities, and which entries stayed `unverified` and why. Nothing else.

## Non-goals

- Do not install, register, enable or update any skill, plugin or record.
- Do not write, modify or delete any file other than the single receipt.
- Do not perform any network action; the probe is fully local and read-only.
- Do not invent, infer or fabricate capability results — `unverified` counts.
- Do not echo secrets, environment values or file contents into the receipt.
