# Verification before completion

- Derive commands from project instructions/manifests. Run focused checks during iteration,
  then the project's required lint, typecheck, tests, build and harness gates on the final change.
- Never skip tests, weaken assertions, bypass hooks or add suppressions just to force green.
- Review the diff against the request. Check changed user-visible flows and relevant edges;
  browser-check UI changes when possible and explicitly report any untested paths.
- Preserve the starting Git changes; identify the changes attributable to this task.
- If a harness task was used, record verification PASS with evidence through that harness.
- Distinguish checks passed, failed and unavailable, including pre-existing failures.
  Never claim an unrun check passed or mark unfinished work done.
- Report outcomes with file references, verification and limitations. A quality score or
  self-report is not evidence that the requested behavior works.
