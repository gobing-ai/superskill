# Tool Usage Guide

Concrete examples for selecting verification tools in anti-hallucination workflows.

## Priority Order

Use the most authoritative source available:

1. `ref_search_documentation` for official product and library docs
2. `ref_read_url` for a specific official documentation page
3. `searchCode` for public GitHub code examples when docs are not enough
4. `WebSearch` for recent changes, releases, or news
5. `Read` or `Grep` for local repository facts

If your platform exposes MCP-prefixed tool ids, the common mappings are:

- `mcp__ref__ref_search_documentation` -> `ref_search_documentation`
- `mcp__ref__ref_read_url` -> `ref_read_url`
- `mcp__grep__searchCode` -> `searchCode`

## Example 1: API Documentation

**Task**: Verify how to configure Axios interceptors

```bash
# Search the official docs first
ref_search_documentation "axios interceptors official documentation"

# Then read the exact documentation page
ref_read_url "https://axios-http.com/docs/interceptors"
```

Why this works:

- Official docs are the primary source for signatures and supported behavior.
- `ref_search_documentation` narrows quickly to authoritative pages.
- `ref_read_url` gives you the exact page you can cite.

## Example 2: Public Code Examples

**Task**: Find real-world usage of a React hook pattern

```bash
# Search public GitHub code examples
searchCode "useDeferredValue(" language=TypeScript path=src
```

Why this works:

- `searchCode` finds implementation examples outside your local repo.
- Language and path filters reduce noise.
- It complements docs when you need usage patterns, not just API text.

## Example 3: Framework Syntax Verification

**Task**: Verify FastAPI path parameter syntax

```bash
ref_search_documentation "FastAPI path parameters official documentation"
ref_read_url "https://fastapi.tiangolo.com/tutorial/path-params/"
```

Why this works:

- The framework docs are the canonical source.
- The search step finds the right page.
- The read step gives you a concrete citation target.

## Example 4: Recent Changes

**Task**: Check what changed in Python 3.13 recently

```bash
WebSearch "Python 3.13 what's new 2025 official"
ref_search_documentation "Python 3.13 what's new official documentation"
```

Why this works:

- Very recent changes may appear in announcements before they are easy to find in indexed docs.
- `WebSearch` helps orient you to timing and release notes.
- `ref_search_documentation` then confirms the official documentation source.

## Example 5: Local Codebase Facts

**Task**: Verify whether a symbol exists in the current repository

```bash
rg -n "useDeferredValue" plugins/cc
```

Why this works:

- Local codebase questions do not require external search.
- `rg` is the fastest option for literal or regex reconnaissance in this repo.
- Cite the local file path instead of an external source when the claim is repo-local.

## Common Mistakes

| Mistake | Problem | Better choice |
|---------|---------|---------------|
| Starting with `WebSearch` for API docs | Often returns tutorials or stale posts | `ref_search_documentation` |
| Using only memory for library behavior | Unverifiable and error-prone | Search docs first |
| Using only local grep for external APIs | Tells you local usage, not official behavior | `ref_search_documentation` or `searchCode` |
| Giving claims without citations | Reviewer cannot verify the statement | Cite the page or file directly |
| Omitting version context | Behavior may differ across releases | Include the version in search and response |

## Quick Decision Guide

```text
Need official API or library behavior?
  -> ref_search_documentation

Need to read a specific doc page?
  -> ref_read_url

Need public implementation examples?
  -> searchCode

Need recent announcements or release context?
  -> WebSearch

Need facts about this repository only?
  -> Read / Grep / rg
```

## Response Checklist

Before finalizing an externally sourced answer:

- Include at least one source citation
- Include a confidence level
- Mention the version when it matters
- Prefer official docs over secondary sources
- State uncertainty explicitly if you cannot verify a claim

## See Also

- `../SKILL.md`
- `guard-implementation.md`
- `prompt-patterns.md`
- `anti-hallucination-research.md`
