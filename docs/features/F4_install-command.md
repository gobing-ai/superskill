---
schema_version: 1
id: F4
name: superskill install command + marketplace registration
status: active
priority: P1
tags:
  - install
  - marketplace
created_at: "2026-06-16T00:00:00.000Z"
updated_at: "2026-07-17T02:30:00.000Z"
---

## F4. superskill install command + marketplace registration

Host-CLI install dispatch (`superskill install`) including Layer A marketplace
registration (`--marketplace-source directory|github`). Hand-authored companion
notes also live in `F004-install-command.md` (legacy feature-tree slug).

### Tasks

- 0073 — OMP native install targets
- 0078 — Grok native install
- 0086 — GitHub marketplace registration (directory → github)

### Acceptance Criteria

- Install resolves plugins via marketplace and dispatches per target.
- Claude/Grok/OMP can register marketplaces as directory path or github slug.
- Operator migration runbook ships for directory → github without breaking plugin IDs.
