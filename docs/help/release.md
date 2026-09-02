# Release checklist

What ships, what gates it, and what a human still has to look at before `npm publish`.

## The published surface

`apps/cli/package.json` `files` decides what reaches npm:

| Entry | Origin | Notes |
|-------|--------|-------|
| `dist/` | `bun build --target bun` | The CLI itself |
| `rubrics/` | copy of `packages/core/src/rubrics` | Build artifact |
| `README.md` | copy of repo root | Build artifact |
| `plugins/` | copy of repo-root `plugins/` | **Published content** — `tests/` pruned during staging |
| `.claude-plugin/` | copy of repo-root `.claude-plugin/` | Marketplace manifest; makes the package root a valid Claude Code marketplace |
| `magents/` | copy of repo-root `magents/` | **Published content** |

`plugins/`, `.claude-plugin/`, and `magents/` are **build-time copies** — they live at the monorepo
root, but npm packs only paths under `apps/cli/`. All three destinations are gitignored
(`.gitignore:159-161`); never hand-edit `apps/cli/{plugins,.claude-plugin,magents}`.

## Lifecycle scripts — which runs when

| Script | `npm pack` | `npm publish` | Does |
|--------|:---------:|:-------------:|------|
| `prepublishOnly` | ✗ | ✓ | `check-publish-manifest` — the publish gate |
| `prepack` | ✓ | ✓ | `build:bundle` + README copy — stages the published content |

Staging lives in `prepack` precisely because `prepublishOnly` **never runs on `npm pack`**. When
staging lived in `prepublishOnly`, `npm pack` packed whatever stale copies happened to sit in
`apps/cli/` — or nothing at all, silently, when they were absent.

## Checklist

1. **Publish-surface content review — the one that needs human judgment.**
   Read what `plugins/**` and `magents/**` actually contain. They ship verbatim to every user of
   `bun add -g @gobing-ai/superskill`. Check for:
   - **Personal data** — real names, personal email, phone, home city, social profiles, employer
     history. Operator-profile files (`magents/*/USER.md`) are written as *private* config and are
     the most common offender.
   - **Repo-foreign content** — instructions describing a different project or domain that drifted
     in from another workspace.
   - **Credentials or internal hostnames** of any kind.

   Nothing here is mechanically checkable; this step is why the checklist exists.

2. **Version sync** — *guarded.* `check-publish-manifest` fails the publish when
   `.claude-plugin/marketplace.json` plugin versions differ from `apps/cli/package.json`. To bump:
   `bun scripts/builder.ts bump-ver <version>` (writes package + marketplace + `plugin.json`, then
   commits and tags).

3. **Gates green** — `bun run lint`, `bun run test`, `bun run build`, `bun run spur-check`.

4. **Verify the real artifact.** Use `npm publish --dry-run`, not `npm pack` alone: only the publish
   path runs the `prepublishOnly` gate. To inspect contents, extract the tarball into a temp dir and
   read it there — never inspect the repo tree and never a `bun link` symlink, both of which report
   success for the wrong reason.

5. **Post-release smoke** (manual, cannot be a merge gate — it needs a published package):
   `bun add -g @gobing-ai/superskill`, then from an unrelated empty directory run
   `superskill install cc --magent <name> --dry-run` and confirm the plugin root resolves with no
   `--marketplace` flag. Then run `superskill update --check` against that install and confirm the
   notification path reports `up to date` (or a single stale row if you installed an older package).

## Release path

CI publishes via `.github/workflows/publish.yml`:
`npm publish --workspace apps/cli --provenance --access public` (npm Trusted Publishing / OIDC).
Because it is `npm publish`, both `prepublishOnly` and `prepack` run, in that order.
