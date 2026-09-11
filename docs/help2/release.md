# Release process

What ships in the published package, which gates a release passes, and how updates reach an
installed CLI.

## What the package contains

The published npm package (`@gobing-ai/superskill`) is staged from the monorepo at pack time:

| Content | Role |
|---------|------|
| CLI bundle | The `superskill` binary itself |
| Rubrics | Package-default rubric YAMLs used by `evaluate --rubric` |
| `plugins/` | The bundled plugin content — shipped verbatim to every user |
| `.claude-plugin/` | Marketplace manifest, making the package root a valid Claude Code marketplace |
| `magents/` | The main-agent configuration packages |
| `README.md` | Landing documentation |

`plugins/`, `.claude-plugin/`, and `magents/` are build-time copies of the repo-root content —
they are what `superskill install cc` self-locates for a zero-clone install
(see [bundled plugins](./bundled-plugins.md)).

## Which gates run, and when

npm lifecycle scripts decide what runs on pack vs publish:

| Script | Runs on | Does |
|--------|---------|------|
| `prepack` | `npm pack` and `npm publish` | Builds the bundle and stages the published content |
| `prepublishOnly` | `npm publish` only | Runs the publish-manifest check — the gate |

The publish-manifest check fails the publish when marketplace plugin versions disagree with the CLI
package version, so the plugin content and the CLI always ship in lockstep.

Before publishing, the full project gate must be green: lint, typecheck, tests, and build. CI
publishes with npm provenance and public access, which runs both lifecycle scripts in order.

## How updates reach you

```bash
superskill update --check        # report stale installed plugins, write nothing
superskill update                # check all known candidates and re-install stale ones
superskill update cc             # check one plugin
superskill skill update          # refresh installed skills from their source repositories
superskill skill list            # see what is installed, and from where
```

`update` compares each install's recorded provenance manifest (written at install time with content
hashes) against the marketplace, and re-installs what drifted. See
[install](./install.md) for the flags `update` shares with the installer (`--targets`,
`--marketplace`, `--no-global`).

## Post-release smoke test

Anyone can verify a release in one minute, from an unrelated empty directory:

```bash
bun add -g @gobing-ai/superskill
superskill install cc --dry-run          # resolves the bundled plugin with no --marketplace flag
superskill update --check                # reports up to date
```

If the dry run needs a marketplace locator to resolve the bundled plugin, the package staging
regressed — file an issue.

<!-- Provenance (invisible)
Generated: 2026-09-11 via the kk-itc-generating three-reference merge.
References: live superskill CLI --help output (authoritative; snapshots: _root.txt, update.txt,
verbs/skill_update.txt, verbs/skill_list.txt) > docs/help carry-over (accuracy) > DeepWiki TOC
(structure signal only).
Verified: every command, verb, and flag above matches the live snapshots.
-->
