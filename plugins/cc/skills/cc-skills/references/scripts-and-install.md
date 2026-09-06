# Scripts and the Dual Install Contract

This reference applies to **superskill plugin skills**. Standalone Agent Skills may keep
executables in a local `scripts/` directory. Repository decisions ADR-015 and ADR-023 in
`docs/00_ADR.md` govern plugin layout and invocation; maintainers can consult the checkout's
[script organization guide](../../../../../docs/help/how_to_organize_scripts_for_plugin_development.md).

## Plugin layout

Put reusable engines at `plugins/<plugin>/scripts/<feature>/`. Keep the corresponding plugin
skill directory prose-only: instructions, references, assets, and native metadata.
There is **no class SDK** that an external plugin implements to self-register CLI runners.

```text
plugins/<plugin>/
├── scripts/<feature>/
│   ├── engine.ts
│   ├── engine.mjs
│   └── tests/engine.test.ts
└── skills/<skill>/SKILL.md
```

This example shows a TypeScript source with a portable twin; do not add unused files or a helper
that an existing tool already provides. Keep script tests beside the engine and use the project's
test runner and coverage policy.

`superskill skill validate` reports `field: _layout` when a plugin skill contains a local
`scripts/` or `extensions/` directory. That gate does not execute or audit scripts.
Migrate executable logic deliberately; do not auto-delete a directory containing user work.

## Invocation contract

**Standard — staged path:** the default for non-hook skill instructions is a portable runtime
plus the path resolver. For the existing anti-hallucination validator:

```sh
node "$(superskill script path cc anti-hallucination/validate_response.mjs)"
```

**Optional — binary registry:** an already-registered first-party engine can also use
`superskill script run cc validate-response`. Registry changes are coupled to a CLI release;
this is not the default delivery mechanism for a new helper.

Both forms refer to plugin-owned code. Check the engine's actual input/output contract before
invocation; the command above alone does not supply a response to validate. Do not invent a
`ScriptRunner` class in the plugin tree. Its internal owner is
`apps/cli/src/commands/script-run.ts`.

Use `sh "$(superskill script path <plugin> <feature>/run.sh)"` for a POSIX shell entrypoint.
Quote resolved paths and pass data as data. Repository-relative TypeScript execution and hard-coded
cache paths are not portable install contracts.

## Entrypoint Contract v1

Staged entrypoints must run without Bun: Node `.js`/`.mjs` or POSIX `.sh` with its required
runtime installed. A TypeScript source needs a shipped executable twin.

1. Read `superskill script convert --help` and use
   `superskill script convert <plugin> <feature>/<file>.ts` when conversion is needed.
2. Inspect and run the generated `.mjs` under Node against a meaningful fixture. Conversion is
   not proof that filesystem assumptions, dependencies, or behavior are portable.
3. Keep source and twin synchronized; validate the skill and check its installed resource path.

Do not add a new runtime or package manager to repair a prose-only skill.

## Path resolution and delivery

`apps/cli/src/commands/script-path.ts` owns resolution. It checks the project's
`.agents/scripts/<plugin>/<rel>` before the global `~/.agents/scripts/<plugin>/<rel>`,
unless `--project` or `--global` restricts it. Only a regular file satisfies the lookup.
A missing file exits with an error; it is a setup failure, not successful degraded execution.

The relative argument must stay inside the plugin's scripts tree. Review path handling at the
implementation boundary; a documented path convention is not a sandbox.

Superskill install stages scripts for the targets using shared script roots. Native plugin installs
can receive the complete plugin tree without that shared-root staging. Consequently, a native-only
installation does not automatically make `superskill script path` resolve its scripts.
Check the actual install target and resolver result before documenting successful execution.
Do not replace the repository's standard contract with an invented native path as a silent workaround.

Packaging a skill alone also does not package its plugin engine. The current skill packager's
resource limitations are in [workflows.md](workflows.md#package). Inspect the distributed artifact,
dependencies, and native loading behavior before claiming it is self-contained.

## Hooks are a separate contract

For a host hook, use the bound `cc:cc-hooks` skill and the registered implementation in
`apps/cli/src/commands/hook-run.ts`. Its event payload, decision output, and exit semantics must
match the target host and handler. There is no universal "exit 2 blocks every hook" contract;
for example, a Stop decision can be expressed through JSON with exit 0.

Do not wire a utility validator as a hook just because it returns a nonzero status. Preserve
the existing canonical hook dispatcher and test the actual decision output for the event.

## Review checklist

- The executable has a real purpose and lives at its authoritative plugin owner.
- The portable entrypoint, dependencies, inputs, outputs, and failure behavior are verified.
- Source/twin checks exercise behavior, not merely matching file names.
- The actual installation supplies the engine where the documented resolver can find it.
- The skill's permissions, native invocation, and required references remain intact.

For general execution and authorization boundaries, use [security.md](security.md).
