# Verification before “done”

All must hold:

1. Lint + typecheck + tests green for the project’s gate (`bun run check`, `spur-check`, etc.).
2. No tests skipped or commented out to pass.
3. `git status` shows only intentional changes.
4. If a harness task was used: verify **PASS** with evidence — not self-report.
5. Uncertainty and partial work stated explicitly (fail loud).

Never use `--no-verify` or new suppressions to force green without operator approval.
