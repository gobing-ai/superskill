---
name: Template system + scaffold operation + content-IO foundation
description: Built-in templates, template resolution, scaffold operation, and the shared content-IO primitives (frontmatter parse/edit, content-name resolution, file hashing, change-apply) consumed by F009–F013.
status: Done
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T18:17:37.988Z
folder: docs/tasks
type: task
feature-id: F007
priority: high
estimated_hours: 6
tags: ["foundation","templates","scaffold","content-io"]
impl_progress:
    planning: pending
    design: pending
    implementation: pending
    review: pending
    testing: pending
---

## 0007. Template system + scaffold operation + content-IO foundation

### Background

Every Phase 2 command creates, reads, or mutates agent content files (skill, command, agent, hook, magent). Five operations and five quality evaluators all need to parse frontmatter, derive a canonical content name, hash files, and (for refine/evolve) apply structured mutations. Implementing those primitives per-operation would produce divergent parsers across features built in parallel. The solution is a shared `content/` foundation owned by F007, consumed by F009–F013.

The scaffold operation generates new content files from Markdown templates with `<!-- VARIABLE -->` HTML-comment placeholders for name, description, target, and body. Templates ship at `apps/cli/src/templates/<type>/default.md` and users can override them at `~/.superskill/templates/<type>/default.md`. Resolution order: user template → built-in template → built-in default.md. Scaffold is the content-generation foundation — every Phase 2 command creates content through this system.

Design references: design doc §5 (template system), §9 (shared foundation).

### Requirements

- [x] **R1** — `parseFrontmatter` splits `---` block, returns `{data,body,raw}`, throws `FrontmatterError` → **MET** | `content/frontmatter.ts:30`, `tests/content/frontmatter.test.ts`
- [x] **R2** — `applyFrontmatterChange` round-trips via `yaml.parseDocument`, preserves comments + key order → **MET** | `content/frontmatter.ts:67`, `frontmatter.test.ts:52,72`
- [x] **R3** — `resolveContentName` strips dir/`.md`; `SKILL.md` → parent dir → **MET** | `content/identity.ts:22`, `identity.test.ts`
- [x] **R4** — `resolveContentPath` name→path; existing path returned unchanged → **MET** | `content/identity.ts:47`, `identity.test.ts`
- [x] **R5** — `hashContent` SHA-256 hex via `Bun.CryptoHasher` → **MET** | `content/hash.ts:10`, `hash.test.ts`
- [x] **R6** — `Change` type + `applyChange` (frontmatter round-trip / body text replace) → **MET** | `content/edit.ts:23`, `edit.test.ts` (body-scoping hardened this pass)
- [x] **R7** — `getDataRoot` per ADR-013 (projectRoot → cwd/.superskill → homedir) → **MET** | `content/paths.ts:20`, `paths.test.ts`
- [x] **R8** — `getDBPath`, `getProposalsDir` → **MET** | `content/paths.ts:35,44`, `paths.test.ts`
- [x] **R9** — 5 default templates with valid YAML frontmatter + placeholders → **MET** | `src/templates/<type>/default.md`
- [x] **R10** — `scaffold(type,name,opts)` returns `Promise<string>` → **MET** | `operations/scaffold.ts:76`
- [x] **R11** — resolution user → built-in, never falls through → **MET** | `scaffold.ts:53`, `scaffold.test.ts:111` (user-override test)
- [x] **R12** — substitutes NAME/DESCRIPTION/TARGET/BODY → **MET** | `scaffold.ts:33`
- [x] **R13** — writes `output ?? cwd()` + `name.md`, returns path → **MET** | `scaffold.ts:90`
- [x] **R14** — overwrite guard throws `already exists — pass --force` → **MET** | `scaffold.ts:94`, `scaffold.test.ts:85`
- [x] **R15** — `yaml@^2.9.0` dep + `"templates"` in `files` → **MET** | `apps/cli/package.json:28,10`
- [x] **R16** — Phase 2 commands use `process.stdout.write` → **MET (N/A to this task)** | library modules are output-agnostic; convention binds the command layer (F009+)

**Traceability:** 16/16 MET · 0 unmet · 0 partial · no scope drift (all 11 new + 1 modified files map to requirements).


### Q&A

Q: Why `yaml` (external) instead of `bun:sqlite` for frontmatter?
A: Phase 1's `pipeline/frontmatter.ts` is a regex injector for distribution-only transforms — it cannot read frontmatter as a typed object. `validate` needs field-type checks; `refine`/`evolve` need parse→mutate→serialize with comment preservation via `parseDocument`. The `yaml` package (`^2.9.0`) is already resolved transitively via rulesync; making it a direct dependency is ADR-012.

Q: Why `content/edit.ts` instead of per-operation mutation logic?
A: Both refine (F012) and evolve (F013) mutate content files. A single `applyChange` primitive prevents two divergent implementations. `frontmatter` kind changes round-trip through `applyFrontmatterChange` (preserving comments/key-order); `text` kind changes do a nearest-match replace of `current` with `proposed`.

Q: How does `resolveContentName` handle `SKILL.md`?
A: `SKILL.md` at the root of a skill directory → the parent directory name is the skill name. All other `.md` files → strip directory and `.md` extension. This matches the cc-skills convention.

Q: What happens if frontmatter is missing or unparseable?
A: `parseFrontmatter` throws `FrontmatterError`. Callers in `validate` (F010) and `evaluate` (F009) catch it and convert to a validation finding with severity `'error'`. Scaffold always produces valid frontmatter so it never encounters this.

Q: How does `applyChange` for `kind: 'text'` handle ambiguous matches?
A: Locate the first occurrence of `current` in the body (case-sensitive, whitespace-trimmed). If not found, throw. This is intentionally simple — refine/evolve produce exact `current` strings from the evaluated content. No fuzzy matching.

Q: Why `process.stdout.write` instead of `console.log`?
A: Phase 1 testing convention: tests spy on `process.stdout.write` to capture command output. Using that consistently across all Phase 2 commands keeps test patterns uniform.

### Design

**Content-IO foundation** (`apps/cli/src/content/`):

| Module | Exports | Contract |
|--------|---------|----------|
| `frontmatter.ts` | `parseFrontmatter(content)` | Splits `---` block; `data` = `yaml.parse(raw)`, `body` = text after closing `---`, `raw` = original frontmatter text. Throws `FrontmatterError`. |
| `frontmatter.ts` | `applyFrontmatterChange(content, mutate)` | Round-trips via `yaml.parseDocument`; `mutate` receives a `yaml.Document`. |
| `identity.ts` | `resolveContentName(path)` | Strips directory + `.md`; `SKILL.md` → parent dir name. |
| `identity.ts` | `resolveContentPath(type, name, opts?)` | Name → file path; cwd→target-specific; existing path returned unchanged. |
| `hash.ts` | `hashContent(filePath)` | SHA-256 hex via `Bun.CryptoHasher`. |
| `edit.ts` | `Change` (type), `applyChange(content, change)` | Frontmatter round-trip edit or text locate+replace. |
| `paths.ts` | `getDataRoot(opts?)`, `getDBPath(opts?)`, `getProposalsDir(opts?)` | Data-root rule per ADR-013. |

**Template files** (`apps/cli/src/templates/<type>/default.md`):

- **Skill template**: frontmatter `{ name: '<!-- NAME -->', description: '<!-- DESCRIPTION -->' }`, body: `# <!-- NAME -->` heading + `<!-- TODO: skill body -->`.
- **Command template**: frontmatter `{ name, description, arguments: [], target: '<!-- TARGET -->' }`, body: usage examples stub + `<!-- TODO: command body -->`.
- **Agent template**: frontmatter `{ name, description, tools: [], model: 'sonnet', agentType: 'task' }`, body: `<!-- TODO: agent system prompt and configuration -->`. Use the agent-relative model alias (`sonnet` / `opus` / `haiku` / `inherit`) in the template default — **not** a dated full model ID like `claude-sonnet-4-20250514` (those go stale; the subagent frontmatter convention accepts the short alias). The validate `model` check (F010) must accept these aliases.
- **Hook template**: frontmatter `{ name, description, event: 'PreToolUse', enabled: true }`, body: `<!-- TODO: hook script or matcher -->`.
- **Magent template**: frontmatter `{ name, description, platforms: ['claude'] }`, body: four section stubs: IDENTITY, SOUL, AGENTS, USER.

**Template resolution** — `resolveTemplate(type)`:

```
userPath  = path.join(os.homedir(), '.superskill', 'templates', type, 'default.md')
pkgPath   = path.join(import.meta.dir, '..', 'templates', type, 'default.md')
return existsSync(userPath) ? readFileSync(userPath, 'utf-8') : readFileSync(pkgPath, 'utf-8')
```

**Variable substitution** — `substituteVars(template, vars)`:
Replace `<!-- NAME -->` → `vars.name`, `<!-- DESCRIPTION -->` → `vars.description ?? ''`, `<!-- TARGET -->` → `vars.target ?? 'claude'`, `<!-- BODY -->` → `vars.body ?? ''`. Simple string replacement; trim whitespace around placeholder before inserting.

**`scaffold(type, name, opts)` function**:
```typescript
async function scaffold(
    type: 'skill' | 'command' | 'agent' | 'hook' | 'magent',
    name: string,
    opts: { description?: string; target?: string; output?: string; force?: boolean },
): Promise<string> {
    const template = resolveTemplate(type);
    const content = substituteVars(template, {
        name,
        description: opts.description ?? '',
        target: opts.target ?? 'claude',
        body: '',
    });
    const outDir = opts.output ?? process.cwd();
    await fs.mkdir(outDir, { recursive: true });
    const filePath = path.join(outDir, name + '.md');
    if (existsSync(filePath) && !opts.force) {
        throw new Error(`${filePath} already exists — pass --force to overwrite`);
    }
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
}
```

**Template shipping**: `.md` files under `apps/cli/src/templates/` need to be accessible at runtime. For dev mode (Bun), `readFileSync` from `src/templates/` works. For production builds, add a build step that copies `templates/` into the output directory. The `package.json` `"files"` array must include `"templates"` to ship with the npm package. Add `readFileSync`-based resolution with `import.meta.dir` for dev and `import.meta.dir`-relative (or process-relative) for production.

### Solution

**New files** (11):

| Path | Purpose |
|------|---------|
| `apps/cli/src/content/frontmatter.ts` | `parseFrontmatter`, `applyFrontmatterChange`, `FrontmatterError` |
| `apps/cli/src/content/identity.ts` | `resolveContentName`, `resolveContentPath` |
| `apps/cli/src/content/hash.ts` | `hashContent` |
| `apps/cli/src/content/edit.ts` | `Change` type, `applyChange` |
| `apps/cli/src/content/paths.ts` | `getDataRoot`, `getDBPath`, `getProposalsDir` |
| `apps/cli/src/templates/skill/default.md` | Skill template with YAML frontmatter + body placeholder |
| `apps/cli/src/templates/command/default.md` | Command template with YAML frontmatter + body placeholder |
| `apps/cli/src/templates/agent/default.md` | Agent template with YAML frontmatter + body placeholder |
| `apps/cli/src/templates/hook/default.md` | Hook template with YAML frontmatter + body placeholder |
| `apps/cli/src/templates/magent/default.md` | Magent template with 4-section body placeholder |
| `apps/cli/src/operations/scaffold.ts` | `scaffold()`, `resolveTemplate()`, `substituteVars()` |

**Modified files** (1):
- `apps/cli/package.json` — add `"yaml": "^2.9.0"` to dependencies, add `"templates"` to `"files"`.

**Key types**:
```typescript
// content/edit.ts
type Change =
    | { kind: 'frontmatter'; key: string; value: unknown }
    | { kind: 'text'; current: string; proposed: string };

// content/frontmatter.ts
class FrontmatterError extends Error {
    constructor(message: string, cause?: unknown);
}
interface ParsedFrontmatter {
    data: Record<string, unknown>;
    body: string;
    raw: string;
}

// content/paths.ts
interface PathOptions {
    projectRoot?: string;
}

// operations/scaffold.ts
type ContentType = 'skill' | 'command' | 'agent' | 'hook' | 'magent';
interface ScaffoldOptions {
    description?: string;
    target?: string;
    output?: string;
    force?: boolean;
}
```

**Edge cases**:
- `parseFrontmatter` on empty string → throws `FrontmatterError`.
- `parseFrontmatter` on content with no `---` opener → throws.
- `parseFrontmatter` on content with `---` opener but no closer → throws.
- `applyFrontmatterChange` on content without frontmatter → wraps body in new `---` block.
- `resolveContentName('/a/b/SKILL.md')` → `'b'` (parent dir).
- `resolveContentName('/a/b/foo.md')` → `'foo'`.
- `resolveContentName('/a/b/foo')` → `'foo'` (no extension, still strips dir).
- `hashContent` on non-existent file → throws ENOENT.
- `applyChange` for `kind: 'text'` when `current` not found → throws.
- `scaffold` with empty name → writes `.md` file (empty name = empty filename; let the filesystem reject it).
- `scaffold` type validation: only the 5 known types accepted; unknown type throws.

### Plan

1. Add `"yaml": "^2.9.0"` to `apps/cli/package.json` dependencies.
2. Create `apps/cli/src/content/frontmatter.ts` — parseFrontmatter, applyFrontmatterChange, FrontmatterError.
3. Create `apps/cli/src/content/identity.ts` — resolveContentName, resolveContentPath.
4. Create `apps/cli/src/content/hash.ts` — hashContent using Bun.CryptoHasher.
5. Create `apps/cli/src/content/edit.ts` — Change type, applyChange.
6. Create `apps/cli/src/content/paths.ts` — getDataRoot, getDBPath, getProposalsDir.
7. Create `apps/cli/src/templates/` directory with 5 type subdirectories.
8. Write 5 `default.md` template files with YAML frontmatter and `<!-- VARIABLE -->` placeholders.
9. Create `apps/cli/src/operations/scaffold.ts` — scaffold, resolveTemplate, substituteVars.
10. Add `"templates"` to `apps/cli/package.json` `"files"` array.
11. Run `bun run lint` and verify typecheck passes.
12. Verify templates are readable at runtime in both dev and production contexts.

### Review

## Review — 2026-06-16 (dev-verify --force --fix all)

**Status:** 2 findings (both P3, both fixed)
**Scope:** content/{frontmatter,identity,hash,edit,paths,types}.ts, operations/scaffold.ts, 5 templates, package.json
**Mode:** verify (Phase 7 SECU + Phase 8 traceability)
**Channel:** current (inline)
**Gate:** `bun run lint` → pass · `bun run test` → 162 pass / 0 fail (99.44% funcs, 98.49% lines)
**Verdict:** PASS

### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
| 1 | Frontmatter closer matched any `\n---` prefix, not a bare delimiter line | Correctness | content/frontmatter.ts:35 | FIXED — closer now requires `\n---` followed by newline or EOS, so body lines like `---draft` are not mistaken for the delimiter |
| 2 | `applyChange` text search scanned full content incl. frontmatter, contradicting R6/JSDoc ("body") | Correctness | content/edit.ts:31 | FIXED — text match now scoped to body via `parseFrontmatter`; falls back to whole-content when no frontmatter |

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

**Fix-pass 2026-06-16:** 2 fixed, 0 failed, 0 skipped. Gate + full suite green after both fixes.


### Testing

- **Command:** `bun run test`
- **Executed:** 2026-06-16
- **Scope:** All new content/ modules (frontmatter, identity, hash, edit, paths) + operations/scaffold + template verification
- **Coverage:** 99.44% funcs, 98.49% lines (all new modules at 100% funcs; scaffold 95.83% lines — production path `resolveTemplate` fallback unreachable in test env)
- **Evidence:** 6 new test files created:
  - `apps/cli/tests/content/frontmatter.test.ts` — 14 tests covering parse/apply/error
  - `apps/cli/tests/content/identity.test.ts` — 10 tests covering name/path resolution
  - `apps/cli/tests/content/hash.test.ts` — 4 tests covering hashing and error
  - `apps/cli/tests/content/edit.test.ts` — 7 tests covering frontmatter+text changes
  - `apps/cli/tests/content/paths.test.ts` — 4 tests covering data root resolution
  - `apps/cli/tests/operations/scaffold.test.ts` — 9 tests covering all 5 types, substitution, overwrite guard, user override
- **Next action:** None — all gates pass.


### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design doc: `docs/design/design-doc-phase2.md` §5 (template system), §9 (shared foundation), §10 (storage conventions)
- Feature file: `docs/features/F007-template-scaffold.md`
- ADR-012: yaml package for frontmatter round-tripping
- ADR-013: data root resolution rule
- Phase 1 output convention: `process.stdout.write` over `console.log`
