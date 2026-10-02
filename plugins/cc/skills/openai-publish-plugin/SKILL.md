---
name: openai-publish-plugin
description: >-
  Prepare an existing plugin for the OpenAI directory, upload a draft, resolve
  submission checks, guide personal legal attestations, and publish an approved
  release. Use for OpenAI marketplace publication, submission ZIPs, reviewer
  access issues, or release-status checks for skills-only or MCP plugins.
---

# Publish a plugin to OpenAI

Carry the authorized release through preparation, upload, review, and publication.
Use the project's identity, build system, and publisher facts. Report the saved
portal state at every handoff; a successful upload does not establish publication.

## 1. Establish the release

- Read project instructions, the plugin manifest, build configuration, and git
  status. Identify the source directory, internal name, display name, version,
  target host, and prerequisites. Preserve unrelated changes.
- Check the current official [submission guide](https://developers.openai.com/plugins/deploy/submission)
  and [package guide](https://developers.openai.com/plugins/build/plugins).
  For a Claude Code source, also check the
  [conversion guide](https://developers.openai.com/plugins/guides/submit-claude-plugin).
  Portal fields, eligibility, formats, and release rules can change.
- Reuse publisher, country availability, commerce, and contact choices already
  confirmed in this session. Ask only for missing facts. Gobing AI uses
  `support@gobing.ai` publicly; other publishers supply their own contact.
- If `plugin-creator:prepare-plugin-submission` is available, follow it for
  general submission requirements. Otherwise use the official guides directly.
  This skill supplies the project and browser handoff; it needs no extra plugin.

## 2. Identify what runs

- A skills-only plugin does not need an invented MCP server. If the plugin
  actually uses remote tools, document its real endpoint, authentication, and
  reviewer access using the current MCP requirements.
- For a local CLI, disclose installation, supported versions, permissions, and
  required environment variables. Exercise the documented path in a clean
  environment where feasible; never claim ChatGPT can execute a local CLI
  because Codex can. Do not silently remove essential functionality to qualify.
- If the current conversion guide directs plugins whose core behavior requires
  local execution, arbitrary filesystem access, hardware, or offline operation
  to contact OpenAI, follow that eligibility route before submission. Another
  plugin reaching review is not proof of eligibility for this one.

## 3. Prepare the package and listing

Read [release preparation](references/release-preparation.md) before changing metadata.

1. Draft truthful listing text, prerequisites, publisher details, and URLs.
   Verify the deployed product, support, privacy, and terms pages against the
   actual product. Follow the website's existing translations when editing it.
   Establish collection, processors, retention, and deletion facts with the owner;
   describe future telemetry as planned unless it is already enabled.
2. Inspect every exported skill, reference, resource, and helper dependency.
   Preserve source host bindings; ensure the submitted package contains the
   resources its instructions need and contains no secrets or private artifacts.
3. Use the project's existing build and packaging command. Rebuild the intended
   version, overwrite its generated ZIP if that is the build contract, and inspect
   the archive inventory and manifest. Record its exact path and version.
4. Run relevant project gates and the actual reviewer path. For MCP plugins,
   prepare the current required test cases and demo access, and run saved tests
   against the submitted connection. Do not invent successful results or add
   MCP-only fields to a skills-only submission merely to fill a template.

Offline preparation can proceed without browser access. Keep unknown facts
explicitly unresolved instead of fabricating values in a submission JSON.

## 4. Upload and verify checks

Read [browser and portal operations](references/browser-and-portal.md) on this branch.

- Confirm the signed-in organization, verified publisher, existing plugin, version,
  and current state. A full replacement upload can clear fields or reset review
  work; inspect its effects before acting. Never cancel an existing review merely
  to update a draft unless that action is authorized.
- Upload only within the user's authorized scope. Verify the imported identity,
  version, skills, icons, URLs, country targeting, and commerce settings in the
  saved portal. Inspect the saved package if it materially differs from the source.
- Run required checks, including saved MCP connection tests when applicable.
  A public URL returning HTTP 200 locally does not clear a portal access warning.
  Investigate the remaining warning and report evidence, uncertainty, and its
  effect on submission. Do not suppress it or keep resetting the draft to retry.

## 5. Legal attestations, review, and publication

- The authorized publisher personally reads and completes legal attestations.
  Never check those boxes or accept legal terms on their behalf. Provide the exact
  current portal URL, policy links, unresolved facts, and actions they must perform.
  Attestations for a previous plugin or version do not establish this release's facts.
- After the user submits, read the saved review state. Report **In review** only
  when the portal confirms it. Submission means the submission work is complete;
  approval and public availability remain pending.
- During review, wait for the result or respond to reviewer feedback within the
  authorized scope. Preserve the submitted version unless a replacement or
  cancellation is requested or already authorized.
- When approved, confirm the version, availability, and authorization to publish.
  Complete the authorized publication step and read back the resulting state.
  Verify the public listing when accessible. Do not promise immediate search
  ranking, promotion, or availability in every host.

## Completion report

Return the actual plugin name and version, ZIP path, portal URL, completed checks,
remaining warnings, and saved state: **prepared**, **draft uploaded**, **in review**,
**approved**, or **published**. Name the next action and its owner. If browser
verification is unavailable, say which state came from the user and remains unverified.

Examples:

- “Publish Spur”: inspect Spur's own package, CLI prerequisites, and eligibility;
  use its identity and policy coverage instead of copying Superskill's submission.
- “Publish knowledge-kit”: determine whether it is skills-only or uses a remote
  authenticated service before preparing reviewer credentials or MCP test cases.
- “I submitted; are we done?”: verify review and publication separately.

Before releasing changes to this skill, review the
[scenario checks](references/scenario-checks.md).
