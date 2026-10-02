# Release preparation

Use the current official guides linked from `SKILL.md` as the schema authority.
This checklist captures operational checks without freezing the portal's schema.

## Identity and metadata

- Portable `plugin.json`, native `.codex-plugin/plugin.json`, and skill companion
  `agents/openai.yaml` serve different purposes. Inspect the format actually
  exported by the build before changing it; do not copy one schema into another.
- Verify internal name, display name, version, verified publisher, description,
  prerequisites, license, icons, and repository against the project and live rules.
  Changing a display name is not permission to rename the plugin internally.
- For portable listing metadata, verify current `extensions.com.openai` fields
  against the official guide. Do not put all review/publication fields into
  `interface` merely because listing text lives there.
- Preserve source configuration and valid saved bindings. Do not invent platform
  app IDs or copy another plugin's identifiers. Review generated public copies.

## Public URLs and privacy facts

- Prepare product, support, privacy, and terms URLs. The current requirements differ
  between skills-only and MCP plugins; resolve the portal's actual findings.
- Open pages without authentication; inspect their body, redirect chain, publisher,
  product coverage, contact method, and accessibility. A status code alone cannot
  prove a privacy policy is present or relevant.
- Establish actual data collection, third parties, retention, deletion route, and
  responsibility for support records. Policy text does not implement retention
  automation or tracking consent. Report implementation gaps separately.
- Gobing AI's existing `https://gobing.ai/privacy`, `https://gobing.ai/terms`, and
  `https://gobing.ai/#contact` are candidates for its products. Verify their deployed
  contents cover the target release rather than assuming company-wide coverage.

## Archive and reviewer evidence

- Use the project's existing build. Inspect the ZIP root layout, manifest version,
  exported skills, references, assets, and any instructions requiring external CLI
  helpers. Avoid shipping dependencies, private files, or runtime caches by accident.
- Check supported icon formats, dimensions, and size limits in live documentation.
  Do not reject SVG solely because an older template required PNG.
- For Superskill, `bun run build` generates
  `dist/superskill-codex-plugin-<version>.zip` from `plugins/cc` and replaces the same
  version's generated archive. Its builder includes every skill automatically.
  Use another project's own build contract when publishing that project.
- For MCP plugins, supply the current required positive/negative cases, stable
  demo access, tool annotations, and authentication details. Keep credentials in
  the portal's intended secure fields. Run tests against the saved connection.
- For skills-only plugins, verify skill loading and documented prerequisites;
  do not fabricate MCP cases or claim local execution was exercised when it was not.

## Review and publication fields

- Confirm country targeting and commerce for this product. Empty country lists or
  omitted fields have schema-specific meanings; verify them before uploading.
- Draft release notes from actual changes. Follow current translation behavior
  instead of assuming uploaded translations immediately appear in the directory.
- Full replacement uploads may reset saved review work and legal attestations.
  Inspect field preservation and clearing behavior before replacing a release.
- A generated `chatgpt-app-submission.json` is draft input. Validate it against the
  current importer and leave unsupported or unknown fields unresolved. Uploading
  it does not certify legal facts, approval, or publication.
