---
schema_version: 1
name: Register cc_* CLI MCP tools via plugins/cc/mcp-tools.yaml
status: todo
template: feature-impl
created_at: 2026-11-24T05:37:32.317Z
updated_at: "2026-11-27T23:39:24.491Z"

feature_id: H22
ac_altitude: task-local
ac_numbering: task-local
priority: P2
estimate_hours: 4
---

## 0165. Register cc_* CLI MCP tools via plugins/cc/mcp-tools.yaml

### Background

Expose `superskill` (`cc`) CLI capabilities as `cc_*` MCP tools through Spur's embedded MCP server (`spur-new` Task `1447` / Feature `B91`), so coding agents and the Spur gateway root `/mcp` can invoke `superskill` list/validate/evaluate checks and dry-run install previews without shelling out.

`superskill` has an empty `.spur/workflows/` directory and exposes its capabilities as TypeScript CLI commands (`apps/cli/src/commands/{skill,agent,command,hook,magent,install}.ts`), so it uses Spur's declarative `plugins/<ns>/mcp-tools.yaml` manifest contract rather than workflow YAMLs. The namespace `cc` resolves from `plugins/cc/plugin.json` (`"name": "cc"`).

**Cross-repo dependency (resolved 2026-11-27):** `spur-new` Task `1447` is `done` (`fc315c9fc`, merged `fb9ba17d3`; `1445`/`1446` landed earlier). The installed global `spur` 0.4.49 ships the loader (its bundle carries `schemas/mcp-tools.schema.json`). Implementation is no longer blocked; only AC4 needs a running MCP-enabled serve.

**Refine corrections (2026-11-23)**

1. **Schema fields.** R1 named `inputSchema` and `shell: false` as manifest keys. Upstream, 1447 R1 freezes a strict Zod schema with `schema_version`, `tools[].{name, description, annotations, params, command, args, output, timeoutMs}`, and it rejects unknown keys. A manifest with `inputSchema` or `shell` would be refused whole as `invalid-manifest`. Resolution: R1 now uses the 1447 keys. The input schema is derived from `params`, and no-shell execution is a property of the dispatcher, not a manifest key.
2. **`list` verbs.** R1 listed `list` for agent/command/hook/magent. Only `superskill skill list` exists (`superskill <noun> --help`, CLI 0.3.46; `apps/cli/src/commands/skill.ts`). Resolution: `list` is exposed for `skill` only.
3. **`doctor` dropped.** `superskill doctor` inspects only `--targets grok-bot` (`apps/cli/src/commands/doctor.ts:76-86`). It prints its JSON report to **stdout** and exits 1 whenever the target is unavailable (`doctor.ts:91-98`), which is its main diagnostic case. 1447 R3 turns any non-zero exit into a tool error that carries only the stderr tail, so the report would be discarded exactly when it matters. Resolution: removed from scope (see Q&A). Re-add once the CLI or upstream preserves stdout on a non-zero exit.
4. **`validate` failure semantics** (partly superseded by correction 11). A failing `validate --json` writes `{"valid":false,"findings":[…]}` to **stderr** and exits 1 (probed 2026-11-23: missing `description` → exit 1, empty stdout). Under 1447 R3 that becomes an MCP tool error whose message carries the findings JSON (last 2000 chars of stderr). A passing validate exits 0 with JSON on stdout. Resolution: this is accepted as the contract, with no CLI change. The AC asserts both paths.
5. **`install --dry-run` is not read-only.** `install` has no `--json` (text only). A dry-run still resolves remote marketplaces into a local cache and builds a staging tree (`apps/cli/src/commands/install.ts:1504-1507`, marketplace cache `:520-540`). Resolution: exposed as `cc_install_preview` with `--dry-run` fixed in `command`, `output: text`, and annotations `readOnlyHint: false, destructiveHint: false, idempotentHint: true`. It is not declared read-only.
6. **R3 verification surface.** R3 said `spur workflow validate` would report manifest issues. 1447 correction 8 says it does not: manifest issues surface only through `McpDispatcher.catalog().exposureIssues` / Integrations status. Resolution: R3 is verified through `tools/list` + `tools/call` and the Integrations exposure issues.
7. **Command form.** Design said `bun run apps/cli/src/index.ts`. The manifest is project-local (loaded only when Spur serves this repo, `cwd = project root`), so it runs the source CLI, `["bun", "apps/cli/src/index.ts", …]`, and dogfoods the current tree rather than the PATH binary (0.3.46 ≠ repo 0.3.47).
8. **Environment.** On 2026-11-23, `bun apps/cli/src/index.ts --help` fails (`Cannot find package 'is-plain-obj'` under `apps/cli/node_modules/@gobing-ai/ts-runtime/node_modules/execa`). Resolution: Plan step 0 runs `bun install` and confirms the source CLI boots.
9. **Title.** "Register cc_* CLI MCP tools" still fits. `doctor` was dropped (correction 3), and the title never named it.

**Refine corrections (2026-11-27, against spur-new `main` @ `f5f691c4d`)**

10. **Contract landed unchanged.** The 1447 schema is in `spur-new/packages/app/src/services/mcp-manifest-tools.ts:28-77` (strict Zod; `output` default `text`; `timeoutMs` 1000–120000, default 30000), mirrored by `apps/cli/schemas/mcp-tools.schema.json`. The fragment rules are in `:125-176`. `buildManifestArgv` (`:353-425`) appends fragments in `params` declaration order and refuses non-enum strings that start with `-`. Execution is in `apps/server/src/modules/mcp/index.ts:273-321`: no shell, `cwd` = project root, `authEnv` blanked. A non-zero exit becomes an error carrying the last 2000 stderr chars. A `json` tool returns `JSON.parse(stdout)`, and unparseable stdout is an error. The frozen Design already matches. Note that `install_preview` sits at the 120000 ms ceiling.
11. **A passing `validate --json` writes to stderr, not stdout (blocker for R1 as frozen).** Probed 2026-11-27: all five `<noun> validate --json <fixture>` calls exit 0 with **empty stdout** and `{"valid":true,"findings":[]}` on stderr. Root cause: `if (output !== 'Valid') echoError(...)` at `apps/cli/src/commands/skill.ts:77`, `agent.ts:56`, `command.ts:56`, `hook.ts:133`, `magent.ts:56`. With `--json` the output is a JSON string, never `'Valid'`, so it always goes to stderr. Under 1447 every passing `cc_<noun>_validate` would fail with "returned invalid JSON". Correction 4's claim that a pass writes JSON to stdout was wrong. Resolution: new **R5**, a narrow CLI fix that branches on the result's validity instead of the rendered text. Valid results go to stdout and invalid results stay on stderr with exit 1. The text-mode output is unchanged, and so is the failure path that 1447 surfaces as a tool error. The "no CLI behavior change" exclusion is narrowed to this one stream fix.
12. **Serve surface.** There is no `spur serve`. The commands are `spur self serve` (project) and `spur self serve --gateway` (root `/mcp`). MCP is off by default (`server.mcp.enabled` / `SPUR_MCP_ENABLED`). It needs `server.mcp.authEnv` (or `allowUnauthenticated`), see `spur-new/docs/design/embedded-mcp-server.md` §2, and superskill's `.spur/config.yaml` has no `server.mcp` block. The gateway lists manifest tools straight from disk but forwards `tools/call` to the project serve (`spur-new/packages/app/src/services/project-gateway.ts:807-835,869-930`). AC4 therefore needs the project serve running with MCP enabled, and superskill registered in `spur projects` (it is).
13. **Fixtures re-probed 2026-11-27 (CLI 0.3.47).** The source CLI boots, so correction 8 is resolved. Every `<noun> evaluate --json` exits 0 with JSON on stdout. Every `<noun> validate --json` exits 0 (stream per correction 11). `skill list --json` exits 0 with JSON. `install --dry-run cc --marketplace . --no-global` exits 0 and prints `[DRY-RUN]`. PATH `superskill` is now 0.3.47, the same as the repo, so correction 7's version-drift argument is moot. The source-CLI decision stands on dogfooding alone.
14. **Reference manifest upstream.** `spur-new/plugins/sp/mcp-tools.yaml` (`sp_plugin_smoke`) is the only in-tree example. It uses block-style `annotations` and `output: text`.

### Requirements

- [ ] R1. Add `plugins/cc/mcp-tools.yaml` conforming to the 1447 manifest contract (`schema_version: 1`; each tool has `name` matching `^[a-z][a-z0-9_]{0,47}$`, `description`, all three `annotations` booleans, `params`, a fixed `command` argv, one `args` fragment per param, `output`, `timeoutMs`; no other keys). It declares exactly these 12 tools, exposed as `cc_<name>`:
  - `skill_list`;
  - `<noun>_validate` and `<noun>_evaluate` for each noun in `skill`, `agent`, `command`, `hook`, `magent`;
  - `install_preview`.
- [ ] R2. Safety boundary.
  - The list, validate and evaluate tools declare `readOnlyHint: true, destructiveHint: false, idempotentHint: true` and never pass a persisting flag (`--save`, `--ingest`, `--rubric`, `--history`).
  - `install_preview` fixes `--dry-run` in `command` and declares `readOnlyHint: false, destructiveHint: false, idempotentHint: true` (it can populate the marketplace cache).
  - No manifest tool invokes `install` without `--dry-run`, `update`, `add`, `remove`, `scaffold`, `refine`, `evolve`, `package`, `migrate`, `hook run`, `hook emit` or `doctor`.
- [ ] R3. A repo-local test (`plugins/cc/tests/mcp-tools.test.ts`) locks R1/R2 and executes every tool's argv against the source CLI, so manifest drift from the CLI surface fails `bun run test` without needing Spur.
- [ ] R4. With `spur` ≥ 0.4.49 (contains 1447): the MCP-enabled project serve for this repo (`spur self serve`) and the gateway root `/mcp` (`spur self serve --gateway`) list all 12 `cc_*` tools with zero exposure issues (`invalid-manifest`, `builtin-collision`, `duplicate`). A `tools/call` of `cc_skill_validate` returns the JSON report on success and a tool error carrying the findings JSON on failure.
- [ ] R5. `<noun> validate` for `skill`, `agent`, `command`, `hook` and `magent` writes a **valid** result to stdout and an invalid result to stderr, in both text and `--json` modes, by branching on the validation result instead of the rendered string (correction 11). Exit codes and output content are unchanged.

**Out of scope:** `doctor` (correction 3); any CLI behavior change other than R5, including exit codes or `--json` on `install`; mutating verbs (R2 list); workflow-backed tools; upstream loader work (spur-new 1447, done); a JSON Schema copy of the manifest schema (owned upstream: `apps/cli/schemas/mcp-tools.schema.json` in spur-new).

### Acceptance Criteria

```gherkin
Scenario: AC1 — the manifest declares exactly the 12 cc tools in the 1447 shape (req: R1)
  Given `plugins/cc/mcp-tools.yaml` parsed with `Bun.YAML.parse`
  When the test inspects it
  Then `schema_version` is 1, and the tool names are exactly the 12 names in R1
  And every tool has only the keys name, description, annotations, params, command, args, output and timeoutMs, with all three annotation booleans present and timeoutMs within 1000..120000
  And every param has an `args` fragment: a string/number fragment contains exactly one element equal to "{value}", a boolean fragment contains none, and no element embeds "{value}" inside a larger string
  And every `command` starts with ["bun", "apps/cli/src/index.ts"]
  And the `target` enum equals `TARGETS` in `packages/core/src/targets.ts`
  # plugins/cc/tests/mcp-tools.test.ts

Scenario: AC2 — read-only tools carry no persisting flag and install is pinned to dry-run (req: R2)
  Given the parsed manifest
  When the test inspects annotations, `command` and `args`
  Then every tool except `install_preview` is `readOnlyHint: true, destructiveHint: false, idempotentHint: true`, and no command or fragment contains --save, --ingest, --rubric or --history
  And `install_preview` has `--dry-run` in `command` and `readOnlyHint: false`
  And no tool's command invokes a verb from the R2 exclusion list
  # plugins/cc/tests/mcp-tools.test.ts

Scenario: AC3 — every tool's argv runs against the source CLI with the declared output (req: R3)
  Given each tool's argv built as `command` + fragments for sample args (the per-noun fixtures frozen in Design; install_preview: plugin `cc`, marketplace `.`, project true)
  When the test spawns it with `Bun.spawn` (no shell) from the repo root
  Then each `output: json` tool, including all five `<noun>_validate`, exits 0 with stdout that parses as JSON, and `install_preview` exits 0 with `[DRY-RUN]` in stdout
  And `skill_validate` on a fixture missing `description` exits 1 with empty stdout and `"valid":false` JSON on stderr (the error path 1447 surfaces as a tool error)
  # plugins/cc/tests/mcp-tools.test.ts

Scenario: AC4 — Spur serves the cc tools with no exposure issues (req: R4)
  Given spur ≥ 0.4.49, superskill registered in `spur projects`, and `spur self serve` running for this repo with `SPUR_MCP_ENABLED=true` and `SPUR_MCP_AUTH_ENV` naming a set token variable, plus `spur self serve --gateway`
  When `tools/list` and `tools/call cc_skill_validate` (passing and failing fixture) run on the project `/mcp` and on gateway root `/mcp`
  Then all 12 `cc_*` names are listed with typed input schemas, the catalog exposure issues are empty, the passing call returns the validate JSON, and the failing call is a tool error whose text carries the findings JSON
  # manual E2E; JSON-RPC transcript saved to .spur/run/0165-mcp-e2e.json and cited in Testing

Scenario: AC5 — validate routes its result stream by validity (req: R5)
  Given a valid and an invalid fixture for each of skill, agent, command, hook and magent
  When `<noun> validate` runs with and without `--json`
  Then a valid result is written to stdout with empty stderr and exit 0, and an invalid result is written to stderr with empty stdout and exit 1
  # apps/cli/tests (existing validate command suites, extended)
```

### Q&A

<!-- CLOSED decisions from refinement: what was chosen and why, what was deferred and on what
     condition. Not a parking lot for open questions — an unanswered question here means the task
     is not ready to hand off. Keep empty if none. -->

#### Q&A entry — 2026-11-24T05:44:51.824Z

- **Q: Expose `doctor`?** Decided: no. It exits 1 with its report on stdout whenever grok-bot is unavailable (`apps/cli/src/commands/doctor.ts:91-98`), and 1447 R3 keeps only the stderr tail on a non-zero exit. Revisit when either side preserves stdout on failure.
- **Q: Source CLI or PATH `superskill`?** Decided: source (`bun apps/cli/src/index.ts`). The manifest is only loaded for this repo, so dogfooding the tree beats a possibly stale global binary.
- **Q: Is `install --dry-run` read-only?** Decided: no. It can fetch and cache marketplaces, so it is `readOnlyHint: false` but non-destructive and idempotent.
- **Q: `list` for agent/command/hook/magent?** Decided: not exposed. Those verbs do not exist, and adding them is CLI scope, not manifest scope.
- **Q: Verify before 1447 lands?** Decided: AC1–AC3 run in `bun run test` now. AC4 is the post-1447 live E2E, and it blocks `done`, not implementation.

#### Q&A entry — 2026-11-27

- **Q: Fix the `validate --json` stream in the CLI, or declare validate tools `output: text`?** Decided: fix the CLI (R5). With `output: text`, 1447 returns `{stdout: ""}` for a pass, which tells the caller nothing. The bug is that the stream is chosen by comparing the rendered string to `'Valid'`, and that comparison is always false in JSON mode. The fix is one condition in five files, and the failure path stays on stderr as 1447 expects.
- **Q: Is implementation still gated on 1447?** Decided: no. 1447 is `done` and installed `spur` 0.4.49 ships it. AC4 still runs last because it needs a live MCP-enabled serve.

### Design

#### Frozen contract (`plugins/cc/mcp-tools.yaml`)

```yaml
schema_version: 1
tools:
  - name: skill_list
    description: List installed skills as a JSON envelope.
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    params:
      global: { type: boolean, description: List user-level global skills instead of project-level }
    command: [bun, apps/cli/src/index.ts, skill, list, --json]
    args: { global: ["--global"] }
    output: json
    timeoutMs: 30000

  # Repeat for <noun> in skill, agent, command, hook, magent (10 entries):
  - name: <noun>_validate
    description: Validate a <noun> definition; a failing result is returned as a tool error carrying the findings JSON.
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    params:
      path:   { type: string, required: true, description: <noun> name or path }
      target: { type: string, enum: [claude, codex, pi, omp, opencode, antigravity-cli, antigravity-ide, hermes, grok], description: Target agent platform (CLI default claude) }
      strict: { type: boolean, description: Enable all optional checks }
    command: [bun, apps/cli/src/index.ts, <noun>, validate, --json]
    args: { path: ["{value}"], target: ["--target", "{value}"], strict: ["--strict"] }
    output: json
    timeoutMs: 30000
  - name: <noun>_evaluate
    description: Score <noun> quality (no persistence).
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    params: { path: <as validate>, target: <as validate> }
    command: [bun, apps/cli/src/index.ts, <noun>, evaluate, --json]
    args: { path: ["{value}"], target: ["--target", "{value}"] }
    output: json
    timeoutMs: 60000

  - name: install_preview
    description: Preview a plugin install (dry-run; writes no install targets, may cache a marketplace).
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
    params:
      plugin:      { type: string, required: true, description: Plugin name }
      marketplace: { type: string, description: Marketplace path, GitHub URL or owner/repo }
      targets:     { type: string, description: Comma-separated target agents }
      project:     { type: boolean, description: Preview project-level instead of user-level install }
    command: [bun, apps/cli/src/index.ts, install, --dry-run]
    args: { plugin: ["{value}"], marketplace: ["--marketplace", "{value}"], targets: ["--targets", "{value}"], project: ["--no-global"] }
    output: text
    timeoutMs: 120000
```

The `<noun>` entries are written out literally (YAML has no templating). The `target` enum mirrors `TARGETS` (`packages/core/src/targets.ts:5-15`). The AC1 test asserts parity so a new target fails the test.

#### Behavior inherited from 1447 (landed; verified 2026-11-27 against `spur-new` `mcp-manifest-tools.ts` + `apps/server/src/modules/mcp/index.ts:273-321`)

- Exposed name `cc_<name>`. `inputSchema` is derived from `params` (`additionalProperties: false`, `required[]`).
- Argv = `command` + supplied/defaulted fragments in `params` declaration order, so the positional `path` lands after the fixed flags. Commander accepts that order.
- Free-form string values starting with `-` are refused before spawn (enum params exempt), so `path` cannot inject options.
- No shell, `cwd` = project root, MCP auth env var blanked. Non-zero exit → tool error with the last 2000 stderr chars. `json` → `JSON.parse(stdout)`; empty or invalid stdout → tool error (why R5 is required). Stdout > 1 MiB → tool error. String args > 1024 chars are refused.
- At the gateway, `tools/list` reads the manifest from disk; `tools/call` is forwarded to the project serve, which must be running with MCP enabled.

#### Test (`plugins/cc/tests/mcp-tools.test.ts`, new)

- Parse with `Bun.YAML.parse` (Bun 1.4.3 built-in, no new dependency).
- Static assertions: AC1 + AC2, including `target` enum parity with `TARGETS`. Import `TARGETS` by relative path, the same pattern as `structure.test.ts:4-6` (`plugins/cc` is not a workspace).
- Execution (AC3): a local `buildArgv(tool, args)` that mirrors 1447's fragment rule (≈10 lines, test-only), plus `Bun.spawn` from the repo root.
- Fixtures, each probed 2026-11-23 (CLI 0.3.46) and re-probed 2026-11-27 (CLI 0.3.47) to exit 0 for both validate and evaluate:
  - skill: `plugins/cc/skills/cc-skills`
  - agent: `plugins/cc/agents/expert-agent.md`
  - command: `plugins/cc/commands/agent-add.md`
  - hook: `apps/cli/tests/fixtures/phase2/valid-hook.md` (`plugins/cc/hooks/hooks.json` is **not** a valid `hook validate` input, because it has no frontmatter → exit 1)
  - magent: `plugins/cc/magents/team-stark-children`
  - install_preview: `{plugin: "cc", marketplace: ".", project: true}`, which writes nothing to the tree (`git status` was unchanged after the probe)
  - failing validate: a temp-dir `SKILL.md` without `description`

#### Validate stream fix (R5)

In each of `apps/cli/src/commands/{skill.ts:77,agent.ts:56,command.ts:56,hook.ts:133,magent.ts:56}`, replace the string check with one on the validation result:

```ts
// before: if (output !== 'Valid') echoError(output); else echo(output);
// JSON-mode output is never the literal 'Valid', so a pass went to stderr (correction 11).
const code = exitFor(result);
if (code === 0) echo(output);
else echoError(output);
return code;
```

Branch on `exitFor` (`apps/cli/src/commands/helpers.ts:142-146`) so the stream and the exit code cannot disagree: exit 0 goes to stdout, exit 1 (invalid) and exit 2 (`_file` unreadable) go to stderr. Before you edit, `rg` the existing validate tests for assertions that read a passing `--json` result from stderr, and move those assertions to stdout. Do not add a new helper for five identical lines.

#### Anti-patterns

- No `inputSchema`, `shell`, or other non-1447 key (refused whole).
- No `{value}` embedded in a larger element (`--target={value}`).
- No persisting or mutating flag on a read-only tool. Never declare `install_preview` read-only.
- No CLI changes beyond R5 and no packaging changes. `scripts/build-plugin-zip.ts:27` zips only `plugin.json`, `assets`, `skills` and `README.md`, so the manifest stays repo-local by construction.
- Do not edit spur-new from this task.

#### Docs

`docs/04_DESIGN.md` owns the surface: add one subsection, "MCP tools manifest (`plugins/cc/mcp-tools.yaml`)", that lists the 12 tools and links to the 1447 contract. Also note the R5 stream rule (valid → stdout, invalid → stderr) where the validate output is documented. Same commit (AGENTS.md sync rule).

**Concurrency (2026-11-27):** `docs/04_DESIGN.md`, `packages/core/src/operations/dsh-mcp-patch.ts` and the pi-hooks test files have uncommitted changes from other work (task 1470 area). Commit or stash those first, or stage only this task's hunks.

### Plan

0. Preconditions:
   - Start from a tree clean of other tasks' changes (see Design → Concurrency).
   - The source CLI boots (`bun apps/cli/src/index.ts --help`, verified 2026-11-27). Run `bun install` only if that regresses.
   - Steps 1–4 do not need Spur. Step 5 needs `spur` ≥ 0.4.49 (1447 `done`, verified 2026-11-27).
1. (R1–R3, R5) Write `plugins/cc/tests/mcp-tools.test.ts` covering AC1–AC3, and extend the validate command tests for AC5. All of them fail: the manifest is absent and a passing `validate --json` writes to stderr.
2. (R5) Apply the validate stream fix in the five command files (Design → Validate stream fix). Run the validate suites until green.
3. (R1, R2) Author `plugins/cc/mcp-tools.yaml` per the Design contract, all 12 entries written out. Validate it once, ad hoc, against `spur-new/apps/cli/schemas/mcp-tools.schema.json`. Run `bun test plugins/cc/tests/mcp-tools.test.ts` until green.
4. Docs: add the `docs/04_DESIGN.md` subsection and the R5 note. Gate: `bun run lint`, `bun run spur-check`, `bun run build`.
5. (R4) Live E2E (AC4):
   - `SPUR_MCP_ENABLED=true SPUR_MCP_AUTH_ENV=<VAR> spur self serve --no-open` in this repo, with `<VAR>` exported;
   - `spur self serve --gateway --no-open` (or the installed gateway LaunchAgent);
   - `tools/list` and `tools/call cc_skill_validate` (pass and fail fixtures) on the project `/mcp` and the gateway `/mcp`;
   - confirm empty exposure issues (`tools/list` count plus the Board Integrations → MCP tab);
   - save the transcript to `.spur/run/0165-mcp-e2e.json` and cite it in Testing.

### Solution

<!-- Filled during implementation: file:line change map and concise rationale. -->

### Testing

<!-- Filled during verification: commands run, outcomes, coverage claim or N/A. -->

### Review

<!-- Filled during review: P1-P4 findings, residual risk, and final disposition. -->

### References

- Upstream contract and loader (spur-new Task `1447`, `done`; commit `fc315c9fc`):
  - task: `/Users/robin/xprojects/spur-new/docs/tasks5/1447_downstream-mcp-tool-registration-manifest-mcp-tools-yaml-and.md`
  - schema: `packages/app/src/services/mcp-manifest-tools.ts:28-77`, `apps/cli/schemas/mcp-tools.schema.json`
  - fragment rule: `mcp-manifest-tools.ts:125-176`; argv builder: `:353-425`
  - execution: `apps/server/src/modules/mcp/index.ts:273-321`
  - gateway list/forward: `packages/app/src/services/project-gateway.ts:807-835,869-930`
  - surface doc: `docs/design/embedded-mcp-server.md` §2 (config) and "Manifest tools (task 1447)"
  - example manifest: `plugins/sp/mcp-tools.yaml`
- Plugin manifest: `plugins/cc/plugin.json` (`name: "cc"`, the only `plugins/*/plugin.json`, so the namespace resolves to `cc`)
- CLI commands: `apps/cli/src/commands/{skill,agent,command,hook,magent,install,doctor}.ts`; validate stream bug at `skill.ts:77`, `agent.ts:56`, `command.ts:56`, `hook.ts:133`, `magent.ts:56`; targets `packages/core/src/targets.ts:5-15`
- Packaging allowlist: `scripts/build-plugin-zip.ts:27`
- Test pattern: `plugins/cc/tests/structure.test.ts`
- Concurrency (2026-11-27): single worktree on `main`. Uncommitted unrelated changes are listed in Design → Concurrency.

### History

- 2026-11-24T05:44:59.883Z backlog → todo (system)
- 2026-11-24T05:49:24.943Z feature_id J → H22 (system)

