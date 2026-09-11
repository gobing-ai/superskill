# Installation

## Canonical Landing Page

`README.md` is the designated universal landing entry point for superskill. This document (`docs/help/installation.md`) serves as the in-depth operational guide for CLI installation, development workflows, and cross-host plugin distribution.

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3.14 (runtime + package manager + test runner)
- [proto](https://moonrepo.dev/proto) (optional — pins tool versions via `.prototools`)

## Option A — Consumer install (npm or bun)

For users who want to run the CLI globally:

```bash
# via npm
npm i -g @gobing-ai/superskill

# or via bun
bun add -g @gobing-ai/superskill

which superskill   # → ~/.bun/bin/superskill or npm bin on your PATH
superskill --version
```

The published package bundles the prebuilt binary (`dist/index.js`), the bundled `cc` plugin, default templates, and rubric YAMLs. No source checkout or build step required.

## Distributing plugins & agent content

Once the CLI is installed, distribute the bundled `cc` plugin or main-agent configs across your installed coding agents:

```bash
# Distribute cc plugin to all standard configured targets
superskill install cc

# Distribute cc plugin plus the team-stark-children main-agent config
superskill install cc --magent team-stark-children

# Preview changes without writing to disk
superskill install cc --dry-run --verbose
```

For full flag documentation and target engine details, see [`cmd_install.md`](./cmd_install.md) and [`entity_locations.md`](./entity_locations.md).

For the native Claude Code marketplace flow (`claude plugin marketplace add` / `claude plugin install`), see the [Native cc Marketplace Pilot](./native_cc_marketplace_pilot.md).

## Option B — Build and install from source

For contributors or local development:

```bash
git clone <repo-url> superskill
cd superskill

# (optional) install pinned tool versions
proto use

# install dependencies
bun install

# build the standalone binary
bun run build          # emits apps/cli/dist/index.js

# register the global `superskill` binary on PATH
cd apps/cli && bun link
which superskill       # → ~/.bun/bin/superskill
```

## Verify the install

```bash
superskill --help
```

Expected output lists the six commands: `install`, `agent`, `skill`, `command`, `hook`, `magent`.

## Development workflow

```bash
bun run dev        # watch mode — runs the CLI from source
bun run lint       # biome check + typecheck (the gate)
bun run test       # bun:test with coverage
bun run build      # compile to standalone binary
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `command not found: superskill` after `bun link` | Ensure `~/.bun/bin` is on your `$PATH` |
| `Cannot find module 'rulesync'` | Run `bun install` from the repo root |
| `bun: command not found` | Install Bun ≥ 1.3.14 from [bun.sh](https://bun.sh/) |
| TypeScript errors on `bun run dev` | Run `bun run autofix` (format + typecheck) |
