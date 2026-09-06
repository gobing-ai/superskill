# Output Patterns

Match the requested deliverable and its consumer. Use a strict template when a parser or project
contract needs one; otherwise use the shortest form that makes the outcome and evidence clear.

## Choose the output

| Need | Suitable form |
|---|---|
| Review | Findings by severity, each with location, evidence, consequence, and correction |
| Code or file change | Resulting artifact/diff, relevant paths, verification, remaining limits |
| Machine consumption | The actual schema, validated by its consumer or existing validator |
| Decision | Recommendation and the relevant tradeoffs; a small table when comparison helps |
| Blocked operation | What was attempted, exact failure, useful partial result, and next step |
| Progress update | What changed or was learned and what the next check will resolve |

Avoid empty success templates, ceremonial headings, and an automatic list of follow-up tasks.
Respect the user's language, output constraints, and level of expertise.

## Strict templates

Use an existing schema or template as the source of truth. Keep literals and required field names
exact, distinguish missing values from empty values, and validate the produced artifact. Do not
invent a schema in a skill when the application already owns it.

When a Markdown example itself contains code fences, use a longer outer fence so it remains valid:

````markdown
Result: the report uses the verified input schema.

```json
{"records": 3}
```

Verification: the schema check passed for this illustrative fixture.
````

This is a formatting example, not evidence that a real report was generated.

## Findings and evidence

For each material finding, name where it occurs, what supports it, and why it matters. Separate
observed failures from plausible concerns. Return no findings when justified; do not manufacture
issues to populate severity headings.

Link to real files and primary sources using the host's supported format. Label unrun commands,
illustrative outputs, skipped checks, and uncertain facts. Do not include secrets in evidence.

## Completion and failures

Report the actual operation outcome. An exit code, static grade, or "success" string may not prove
that the requested state exists. Name the meaningful verification and its scope; avoid saying
"all platforms passed" when only a source validator ran.

For a failure, preserve the diagnostic information needed to act, with sensitive data redacted.
State whether the target changed, was restored, or remains partially updated. Do not recommend
repeating an action blindly when it may have already produced an external effect.

Native rendering varies; check only the format features the task needs. Do not impose unsupported
rules such as requiring plain text for every host in a product family.
