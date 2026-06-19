# Installation

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.3.14 (runtime + package manager + test runner)
- [proto](https://moonrepo.dev/proto) (optional — pins tool versions via `.prototools`)

## Option A — Consumer install (npm)

For users who only want to run the CLI:

```bash
npm i -g @gobing-ai/superskill
which superskill   # → somewhere on your PATH
superskill --version
```

The published package bundles the prebuilt binary (`dist/index.js`), default templates, and rubric YAMLs. No source checkout or build step required.

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
