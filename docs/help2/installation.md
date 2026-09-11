# Installation

Two ways to get the `superskill` CLI: install the published package (consumers), or build from
source (contributors). Both land a `superskill` binary on your `PATH`.

## Prerequisites

- **Consumers:** npm (Node.js) or Bun — used only to install; the package ships a prebuilt bundle.
- **Contributors:** [Bun](https://bun.sh/) ≥ 1.3.14 (runtime, package manager, test runner).
  [proto](https://moonrepo.dev/proto) is optional and pins tool versions via `.prototools`.

## Option A — install the published package

```bash
# via npm
npm i -g @gobing-ai/superskill

# or via bun
bun add -g @gobing-ai/superskill

which superskill   # → your npm global bin or ~/.bun/bin/superskill
superskill --version
```

The published package bundles the prebuilt CLI, the bundled `cc` plugin, the default templates, and
the rubric YAMLs. No clone, no build step.

Distribute content right away:

```bash
superskill install cc                              # bundled plugin, all configured targets
superskill install cc --magent team-stark-children # plus a main-agent config
superskill install cc --dry-run --verbose          # preview first
```

See [install](./install.md) for the full flag reference and the
[bundled plugins](./bundled-plugins.md) page for what ships inside the package.

## Option B — build from source

```bash
git clone <repo-url> superskill
cd superskill

proto use          # optional: install pinned tool versions
bun install

bun run build      # emits the standalone bundle
cd apps/cli && bun link
which superskill   # → ~/.bun/bin/superskill
```

## Verify the install

```bash
superskill --help
```

You should see the command list: `install`, `update`, `doctor`, `agent`, `skill`, `command`, `hook`,
`magent`, `script`. Then confirm the quality store location exists on first write:

```bash
superskill skill scaffold hello --description "First skill"
superskill skill evaluate hello --save   # persists to ~/.superskill/evaluations.db
```

## Stay current

- `superskill update --check` — reports stale installed plugins without writing files.
- `superskill update [plugin]` — re-installs stale marketplace plugins.
- `superskill skill update` — refreshes installed skills from their source repositories.

See the [release process](./release.md) for how versions are gated before they reach npm.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `command not found: superskill` after `bun link` | Ensure `~/.bun/bin` is on your `PATH`. |
| `Cannot find module` errors running from source | Run `bun install` from the repo root. |
| `bun: command not found` | Install Bun ≥ 1.3.14 from [bun.sh](https://bun.sh/). |
| Install fails resolving a plugin | Check the marketplace locator: an existing local path is treated as local; `owner/repo` that does not exist locally is treated as GitHub shorthand. See [install](./install.md#marketplace-locators). |
| TypeScript errors during development | Run the formatter/typecheck autofix the repo provides, then rebuild. |

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: _root.txt, install.txt,
update.txt, skill.txt, verbs/skill_add.txt, verbs/skill_update.txt, verbs/skill_scaffold.txt,
verbs/skill_evaluate.txt) > docs/help carry-over (accuracy) > DeepWiki TOC (structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
