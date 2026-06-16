---
name: Template system + scaffold operation + content-IO foundation
description: Built-in templates, template resolution, scaffold operation, and the shared content-IO primitives (frontmatter parse/edit, content-name resolution, file hashing, change-apply) consumed by F009–F013.
status: Planned
created_at: 2026-06-16T00:00:00.000Z
updated_at: 2026-06-16T00:00:00.000Z
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

- [ ] **R1** — `content/frontmatter.ts`: `parseFrontmatter(content)` splits `---`-delimited YAML block and returns `{ data: Record<string, unknown>, body: string, raw: string }`. Throws `FrontmatterError` on missing/malformed frontmatter.
- [ ] **R2** — `content/frontmatter.ts`: `applyFrontmatterChange(content, mutate)` round-trips via `yaml.parseDocument` so comments and key order survive serialization.
- [ ] **R3** — `content/identity.ts`: `resolveContentName(path)` strips directory and `.md`; special-case `SKILL.md` → parent directory name. Returns the canonical `content_name` used by store, queries, and proposal paths.
- [ ] **R4** — `content/identity.ts`: `resolveContentPath(type, name, opts?)` converts name→file path. Looks in cwd, then target-specific locations. If `name` is already a path to an existing file, returns it unchanged.
- [ ] **R5** — `content/hash.ts`: `hashContent(filePath)` returns SHA-256 hex digest of file bytes using `Bun.CryptoHasher`. Single source of `file_hash` for evaluation records.
- [ ] **R6** — `content/edit.ts`: `type Change = { kind: 'frontmatter', key, value } | { kind: 'text', current: string, proposed: string }`. `applyChange(content, change)` — the one mutation primitive shared by refine (F012) and evolve (F013). Frontmatter changes route through `applyFrontmatterChange`; text changes locate the nearest match of `current` and replace with `proposed`.
- [ ] **R7** — `content/paths.ts`: `getDataRoot(opts?)` returns `<projectRoot>` when given; else `<cwd>` if `<cwd>/.superskill/` exists; else `os.homedir()`. Single store/proposals location rule per ADR-013.
- [ ] **R8** — `content/paths.ts`: `getDBPath(opts?)` → `<dataRoot>/.superskill/evaluations.db`, `getProposalsDir(opts?)` → `<dataRoot>/.superskill/proposals/`.
- [ ] **R9** — 5 default templates exist at `apps/cli/src/templates/<type>/default.md`: skill, command, agent, hook, magent. Each has valid YAML frontmatter with `<!-- NAME -->` and `<!-- DESCRIPTION -->` placeholders, plus a body with `<!-- BODY -->` (or type-specific placeholder like `<!-- TODO: skill body -->`).
- [ ] **R10** — `operations/scaffold.ts`: `scaffold(type, name, opts)` creates new content files from resolved templates. Returns `Promise<string>` (created file path).
- [ ] **R11** — Template resolution: `~/.superskill/templates/<type>/default.md` → `<pkg>/templates/<type>/default.md`. Built-in default.md always exists; resolution never falls through.
- [ ] **R12** — Variable substitution: replaces `<!-- NAME -->`, `<!-- DESCRIPTION -->`, `<!-- TARGET -->`, `<!-- BODY -->` with provided values or sensible defaults (name→`<!-- NAME -->`, description→`<!-- DESCRIPTION -->`, target→`<!-- TARGET -->`, body→`<!-- BODY -->`; if no explicit body_var, `<!-- BODY -->` stays as-is).
- [ ] **R13** — Output: writes to `path.join(opts.output ?? process.cwd(), name + '.md')`. Returns the resolved created path.
- [ ] **R14** — Overwrite guard: if target file exists and `opts.force` is not true, throws error with message `<path> already exists — pass --force to overwrite` for the CLI to handle as exit 2.
- [ ] **R15** — Add `"yaml": "^2.9.0"` to `apps/cli/package.json` dependencies. Add `"templates"` to `apps/cli/package.json` `"files"` array so templates ship with the npm package.
- [ ] **R16** — All Phase 2 commands write user output through `process.stdout.write` (directly or via the `echo` helper from Phase 1), never `console.log`, matching the Phase 1 testing convention.

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



### Testing



### Artifacts

| Type | Path | Agent | Date |
| ---- | ---- | ----- | ---- |

### References

- Design doc: `docs/design/design-doc-phase2.md` §5 (template system), §9 (shared foundation), §10 (storage conventions)
- Feature file: `docs/features/F007-template-scaffold.md`
- ADR-012: yaml package for frontmatter round-tripping
- ADR-013: data root resolution rule
- Phase 1 output convention: `process.stdout.write` over `console.log`

### P1 — Blockers
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P2 — Warnings
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P3 — Info
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|

### P4 — Suggestions
| # | Title | Dimension | Location | Recommendation |
|---|-------|-----------|----------|----------------|
